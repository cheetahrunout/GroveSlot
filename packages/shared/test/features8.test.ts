import { describe, expect, it } from 'vitest';
import { TURF_WAR, WANTED } from '../src/config/features';
import { SPECIAL_SYMBOLS, type SymbolId } from '../src/config/symbols';
import { applyDriveBy } from '../src/engine/features/driveBy';
import { playTurfWar } from '../src/engine/features/turfWar';
import { INITIAL_WANTED, isGuaranteed, nextWanted } from '../src/engine/features/wanted';
import { createRng } from '../src/engine/rng';
import { INITIAL_STATE, playRound } from '../src/engine/round';
import { simulate } from '../src/engine/stats';

describe('playTurfWar', () => {
  it('takes territories in order, uses backups, and stops at the Ballas or Turf Boss', () => {
    const rng = createRng(6);
    let bosses = 0;
    for (let i = 0; i < 3000; i++) {
      const r = playTurfWar(rng, 20, 'symbols');
      let taken = 0;
      let backups = 0;
      for (const [k, spin] of r.spins.entries()) {
        const slice = TURF_WAR.wheel[spin.slice];
        if (spin.outcome === 'prize') {
          expect(slice.type).toBe('prize');
          expect(spin.territory).toBe(taken++);
          expect(spin.win).toBe((slice as { multiplier: number }).multiplier * 20);
        } else if (spin.outcome === 'backup') {
          backups++;
        } else if (spin.outcome === 'blocked') {
          expect(backups).toBeGreaterThan(0);
          backups--;
        } else {
          expect(backups).toBe(0);
          expect(k).toBe(r.spins.length - 1);
        }
        expect(spin.backups).toBe(backups);
      }
      expect(r.territoriesTaken).toBe(taken);
      if (r.turfBoss) {
        bosses++;
        expect(taken).toBe(TURF_WAR.territories.length);
        expect(r.turfBossWin).toBe(TURF_WAR.turfBossMultiplier * 20);
      }
      expect(r.totalWin).toBe(r.spins.reduce((n, s) => n + s.win, 0) + r.turfBossWin);
    }
    expect(bosses).toBeGreaterThan(0);
  });
});

describe('applyDriveBy', () => {
  it('sprays 1 to 3 wilds onto plain symbols only', () => {
    const rng = createRng(2);
    const grid: SymbolId[][] = [
      ['A', 'SCATTER', 'K'],
      ['WILD', 'Q', 'CASH'],
      ['J', 'TEN', 'BONUS'],
      ['OG', 'TURF', 'A'],
      ['K', 'K', 'K'],
    ];
    for (let i = 0; i < 500; i++) {
      const { grid: out, positions } = applyDriveBy(rng, grid);
      expect(positions.length).toBeGreaterThanOrEqual(1);
      expect(positions.length).toBeLessThanOrEqual(3);
      for (const p of positions) {
        expect(grid[p.reel][p.row]).not.toBe('WILD');
        expect(SPECIAL_SYMBOLS.has(grid[p.reel][p.row])).toBe(false);
        expect(out[p.reel][p.row]).toBe('WILD');
      }
      expect(grid[0][0]).toBe('A'); // input untouched
    }
  });
});

describe('Wanted Level', () => {
  it('adds a star per win, drops one after a losing streak, and resets after the payday', () => {
    let w = INITIAL_WANTED;
    for (let i = 0; i < WANTED.maxStars; i++) w = nextWanted(w, true, 20);
    expect(w.stars).toBe(WANTED.maxStars);
    expect(isGuaranteed(w)).toBe(true);
    expect(nextWanted(w, true, 20)).toEqual(INITIAL_WANTED);

    let v = { stars: 3, lossStreak: 0, bet: 20 };
    for (let i = 0; i < WANTED.lossesPerStar; i++) v = nextWanted(v, false, 20);
    expect(v).toEqual({ stars: 2, lossStreak: 0, bet: 20 });
    expect(nextWanted({ stars: 0, lossStreak: WANTED.lossesPerStar - 1, bet: 0 }, false, 20).stars).toBe(0);
  });

  it('remembers the smallest bet played since the meter was last empty', () => {
    let w = nextWanted(INITIAL_WANTED, true, 100);
    expect(w.bet).toBe(100);
    w = nextWanted(w, true, 20);
    w = nextWanted(w, true, 500);
    expect(w).toMatchObject({ stars: 3, bet: 20 });
    // An empty meter forgets the bet.
    const empty = nextWanted({ stars: 1, lossStreak: WANTED.lossesPerStar - 1, bet: 20 }, false, 500);
    expect(empty).toEqual({ stars: 0, lossStreak: 0, bet: 0 });
    expect(nextWanted(empty, true, 500).bet).toBe(500);
  });

  it('pays a Payday prize from the table at five stars, without re-spinning', () => {
    const rng = createRng(3);
    const state = { ...INITIAL_STATE, wanted: { stars: WANTED.maxStars, lossStreak: 0, bet: 40 } };
    const allowed = new Set<number>(WANTED.payday.map((p) => p.multiplier));
    for (let i = 0; i < 200; i++) {
      const { result, state: next } = playRound(rng, state, 2);
      expect(allowed.has(result.payday / result.totalBet)).toBe(true);
      expect(result.totalWin).toBeGreaterThanOrEqual(result.payday);
      expect(next.wanted).toEqual(INITIAL_WANTED);
    }
  });

  it('pays the Payday on the bet that filled the meter, never on a bigger payday spin (F1)', () => {
    const rng = createRng(8);
    // Filled at € 0,20 (line bet 1), the payday spin played at € 5,00 (line bet 25).
    const state = { ...INITIAL_STATE, wanted: { stars: WANTED.maxStars, lossStreak: 0, bet: 20 } };
    const allowed = new Set<number>(WANTED.payday.map((p) => p.multiplier * 20));
    for (let i = 0; i < 200; i++) expect(allowed.has(playRound(rng, state, 25).result.payday)).toBe(true);
    // A smaller payday spin pays on its own, smaller bet.
    const small = playRound(rng, { ...INITIAL_STATE, wanted: { stars: WANTED.maxStars, lossStreak: 0, bet: 500 } }, 1);
    expect(WANTED.payday.map((p) => p.multiplier * 20)).toContain(small.result.payday);
  });

  it('returns no more to a player who fills the meter small and raises the bet for the payday spin (F1)', () => {
    const honest = simulate(200_000, 2024);
    // Play at € 0,20 and raise to € 5,00 for every payday spin: 201% before the fix.
    const rng = createRng(2024);
    let state = INITIAL_STATE;
    let bet = 0;
    let won = 0;
    let paydays = 0;
    for (let i = 0; i < 200_000; i++) {
      const lineBet = isGuaranteed(state.wanted) ? 25 : 1;
      const out = playRound(rng, state, lineBet);
      state = out.state;
      bet += out.result.totalBet;
      won += out.result.totalWin;
      if (out.result.payday > 0) {
        paydays++;
        expect(out.result.payday).toBeLessThanOrEqual(WANTED.payday[WANTED.payday.length - 1].multiplier * 20);
      }
    }
    expect(paydays).toBeGreaterThan(500);
    expect(won / bet).toBeLessThan(honest.rtp + 0.03);
    expect(won / bet).toBeLessThan(1);
  });

  it('pays no Payday below five stars', () => {
    const rng = createRng(4);
    const state = { ...INITIAL_STATE, wanted: { stars: WANTED.maxStars - 1, lossStreak: 0, bet: 20 } };
    for (let i = 0; i < 200; i++) expect(playRound(rng, state, 1).result.payday).toBe(0);
  });
});

describe('playRound with Drive-By', () => {
  it('pays the grid after the wilds land', () => {
    const { result } = playRound(createRng(4), INITIAL_STATE, 1, { force: 'driveBy' });
    expect(result.driveBy!.length).toBeGreaterThan(0);
    for (const p of result.driveBy!) {
      expect(result.grid[p.reel][p.row]).toBe('WILD');
      expect(result.landed[p.reel][p.row]).not.toBe('WILD');
    }
  });
});
