import { describe, expect, it } from 'vitest';
import { TURF_WAR, WANTED } from '../src/config/features';
import { SPECIAL_SYMBOLS, type SymbolId } from '../src/config/symbols';
import { applyDriveBy } from '../src/engine/features/driveBy';
import { playTurfWar } from '../src/engine/features/turfWar';
import { INITIAL_WANTED, isGuaranteed, nextWanted } from '../src/engine/features/wanted';
import { createRng } from '../src/engine/rng';
import { INITIAL_STATE, playRound } from '../src/engine/round';

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
    for (let i = 0; i < WANTED.maxStars; i++) w = nextWanted(w, true);
    expect(w.stars).toBe(WANTED.maxStars);
    expect(isGuaranteed(w)).toBe(true);
    expect(nextWanted(w, true)).toEqual(INITIAL_WANTED);

    let v = { stars: 3, lossStreak: 0 };
    for (let i = 0; i < WANTED.lossesPerStar; i++) v = nextWanted(v, false);
    expect(v).toEqual({ stars: 2, lossStreak: 0 });
    expect(nextWanted({ stars: 0, lossStreak: WANTED.lossesPerStar - 1 }, false).stars).toBe(0);
  });

  it('pays at least 5× the bet from line wins on the guaranteed spin', () => {
    const rng = createRng(3);
    const state = { ...INITIAL_STATE, wanted: { stars: WANTED.maxStars, lossStreak: 0 } };
    for (let i = 0; i < 50; i++) {
      const { result, state: next } = playRound(rng, state, 2);
      expect(result.guaranteed).toBe(true);
      expect(result.base.totalWin).toBeGreaterThanOrEqual(WANTED.guaranteedMultiplier * result.totalBet);
      expect(Object.keys(result.features)).toEqual([]);
      expect(next.wanted).toEqual(INITIAL_WANTED);
    }
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
