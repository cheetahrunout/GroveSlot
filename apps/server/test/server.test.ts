import { beforeEach, describe, expect, it } from 'vitest';
import { PAYLINES } from '@lowrider/shared/config/paylines';
import { createRng } from '@lowrider/shared/engine/rng';
import { FakeCasino } from '../src/fakeCasino';
import { GameError, LowriderGame, betOptions } from '../src/game';
import { Journal } from '../src/journal';
import { cryptoRng } from '../src/rng';

let casino: FakeCasino;
let game: LowriderGame;

beforeEach(() => {
  casino = new FakeCasino(100_000);
  game = new LowriderGame(casino, createRng(7), new Journal(':memory:'));
  game.applyControl(casino.state);
});

const balanceOf = (name = 'player-cj') => casino.balances.get(name)!;

describe('sessions', () => {
  it('swaps the one-time token for a session the browser never sees', async () => {
    const s = await game.openSession('cj');
    expect(s.id).not.toBe(s.casinoSession);
    expect(game.getSession(s.id)).toBe(s);
    expect(game.publicState(s)).not.toHaveProperty('casinoSession');
    expect(JSON.stringify(game.publicState(s))).not.toContain(s.casinoSession);
  });

  it('refuses new players when the game is not live', async () => {
    game.applyControl({ ...casino.state, status: 'last_bets' });
    await expect(game.openSession('cj')).rejects.toMatchObject({ code: 'last_bets' });
  });
});

describe('spins', () => {
  it('debits the bet and credits exactly the settled win through the casino', async () => {
    const s = await game.openSession('cj');
    let expected = balanceOf();
    for (let i = 0; i < 300; i++) {
      const { result, state } = await game.spin(s, 40);
      expected += result.totalWin - 40;
      expect(balanceOf()).toBe(expected);
      expect(state.balance).toEqual({ value: expected, unit: 'cents' });
      expect(result.totalBet).toBe(40);
      expect(result.lineBet * PAYLINES.length).toBe(40);
    }
    // Every round is opened once and settled once.
    expect([...casino.rounds.values()].every((r) => r.win !== null && !r.voided)).toBe(true);
  });

  it('only accepts bets inside the casino limits', async () => {
    const s = await game.openSession('cj');
    game.applyControl({ ...casino.state, limits: { minBetCents: 100, maxBetCents: 200, maxWinCents: 50_000 } });
    expect(betOptions(game.controlState.limits)).toEqual([100, 200]);
    await expect(game.spin(s, 40)).rejects.toMatchObject({ code: 'bad_bet' });
    await expect(game.spin(s, 33)).rejects.toMatchObject({ code: 'bad_bet' });
  });

  it('caps a round at the casino max win', async () => {
    const s = await game.openSession('cj');
    game.applyControl({ ...casino.state, limits: { minBetCents: 20, maxBetCents: 500, maxWinCents: 100 } });
    for (let i = 0; i < 300; i++) expect((await game.spin(s, 20)).result.totalWin).toBeLessThanOrEqual(100);
  });

  it('reports the balance from a 402 and charges nothing', async () => {
    const s = await game.openSession('cj');
    casino.balances.set('player-cj', 10);
    await expect(game.spin(s, 20)).rejects.toMatchObject({ status: 402, balance: { value: 10, unit: 'cents' } });
    expect(balanceOf()).toBe(10);
  });

  it('retries network trouble with the same round id, without double charging', async () => {
    const s = await game.openSession('cj');
    const start = balanceOf();
    casino.failNext = { openRound: 2, settle: 2 };
    const { result } = await game.spin(s, 20);
    expect(casino.rounds.size).toBe(1);
    expect(balanceOf()).toBe(start - 20 + result.totalWin);
  });

  it('voids the round and refunds the bet when the settle never goes through', async () => {
    const s = await game.openSession('cj');
    const start = balanceOf();
    casino.failNext = { settle: 99 };
    await expect(game.spin(s, 20)).rejects.toMatchObject({ code: 'round_voided' });
    expect(balanceOf()).toBe(start);
    expect([...casino.rounds.values()][0].voided).toBe(true);
  });

  it('obeys last_bets, halted and maintenance at once', async () => {
    const s = await game.openSession('cj');
    for (const status of ['last_bets', 'halted', 'maintenance'] as const) {
      game.applyControl({ ...casino.state, status, reason: 'Testing' });
      await expect(game.spin(s, 20)).rejects.toBeInstanceOf(GameError);
    }
    // A halt closes every session.
    expect(game.getSession(s.id)).toBeNull();
  });

  it('sends big wins to the leaderboard with the player session', async () => {
    const s = await game.openSession('cj');
    for (let i = 0; i < 2000 && casino.scores.length === 0; i++) await game.spin(s, 20);
    expect(casino.scores.length).toBeGreaterThan(0);
    expect(casino.scores[0].session).toBe(s.casinoSession);
    expect(casino.scores[0].score).toBeGreaterThanOrEqual(200);
  });
});

describe('Car Chase', () => {
  it('is offered after a win and plays each pick as its own paid round', async () => {
    const s = await game.openSession('cj');
    let r;
    do r = await game.spin(s, 20);
    while (r.result.totalWin === 0 || !r.state.gamble);
    const stake = r.state.gamble!.stake;
    const before = balanceOf();
    const g = await game.gamble(s, 'left');
    expect(balanceOf()).toBe(before - stake + g.stake);
    expect(g.stake).toBe(g.won ? stake * 2 : 0);
    if (!g.won) await expect(game.gamble(s, 'left')).rejects.toMatchObject({ code: 'no_offer' });
  });

  it('can be switched off from the casino settings', async () => {
    const s = await game.openSession('cj');
    game.applyControl({ ...casino.state, settings: { gamble_enabled: false } });
    let r;
    do r = await game.spin(s, 20);
    while (r.result.totalWin === 0);
    expect(r.state.gamble).toBeNull();
  });
});

describe('cryptoRng', () => {
  it('stays in range and is roughly uniform', () => {
    const counts = [0, 0, 0, 0];
    for (let i = 0; i < 40_000; i++) {
      const x = cryptoRng.next();
      expect(x >= 0 && x < 1).toBe(true);
      counts[cryptoRng.int(4)]++;
    }
    for (const c of counts) expect(Math.abs(c / 40_000 - 0.25)).toBeLessThan(0.02);
    expect(cryptoRng.weighted([0, 1, 0])).toBe(1);
  });
});
