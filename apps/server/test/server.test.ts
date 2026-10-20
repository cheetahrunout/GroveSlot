import { describe, expect, it } from 'vitest';
import { PAYLINES } from '@lowrider/shared/config/paylines';
import { centsToMicro } from '../src/fakeCasino';
import { GameError, betOptions } from '../src/game';
import { cryptoRng } from '../src/rng';
import { flush, setup } from './helpers';

describe('sessions', () => {
  it('swaps the one-time token for a session the browser never sees', async () => {
    const { game } = await setup();
    const s = await game.openSession('cj');
    expect(s.id).not.toBe(s.casinoSession);
    expect(game.getSession(s.id)).toBe(s);
    expect(JSON.stringify(game.publicState(s))).not.toContain(s.casinoSession);
    expect(game.publicState(s).balance).toEqual({ tokensMicro: 700_000_000, valueCents: 105_000 });
  });

  it('refuses new players when the game is not live', async () => {
    const { game, casino } = await setup();
    casino.setState({ status: 'maintenance' });
    await flush();
    await expect(game.openSession('cj')).rejects.toMatchObject({ code: 'maintenance' });
  });

  it('turns a casino 401 into session_closed and forgets the session', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    casino.sessions.clear();
    await expect(game.spin(s, 20)).rejects.toMatchObject({ status: 401, code: 'session_closed' });
    expect(game.getSession(s.id)).toBeNull();
  });
});

describe('heartbeat and control', () => {
  it('heartbeats at once with the version and the player count', async () => {
    const { casino } = await setup();
    expect(casino.heartbeats[0]).toEqual({ version: '1.0.42', players: 0 });
  });

  it('reads the reason players see from the casino', async () => {
    const { game, casino } = await setup();
    casino.setState({ status: 'maintenance', reason: 'New paint job' });
    await flush();
    await flush();
    expect(game.controlState).toMatchObject({ status: 'maintenance', reason: 'New paint job' });
  });
});

describe('spins', () => {
  it('debits the bet and credits exactly the settled win through the casino', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    let expected = casino.wallets.get('player-cj')!;
    for (let i = 0; i < 300; i++) {
      const { result, state } = await game.spin(s, 40);
      expected += centsToMicro(result.totalWin) - centsToMicro(40);
      expect(casino.wallets.get('player-cj')).toBe(expected);
      expect(state.balance?.tokensMicro).toBe(expected);
      expect(result.lineBet * PAYLINES.length).toBe(40);
    }
    // Every round is opened once and settled once.
    expect([...casino.rounds.values()].every((r) => r.round.status === 'settled')).toBe(true);
  });

  it('only accepts bets inside the casino limits', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    casino.setState({ limitsCents: { min: 100, max: 200, maxWin: 50_000 } });
    await flush();
    expect(betOptions(game.controlState.limits)).toEqual([100, 200]);
    await expect(game.spin(s, 40)).rejects.toMatchObject({ code: 'bad_bet' });
    await expect(game.spin(s, 33)).rejects.toMatchObject({ code: 'bad_bet' });
  });

  it('caps a round at the casino max win', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    casino.setState({ limitsCents: { min: 20, max: 500, maxWin: 100 } });
    await flush();
    for (let i = 0; i < 300; i++) expect((await game.spin(s, 20)).result.totalWin).toBeLessThanOrEqual(100);
  });

  it('reports the balance from a 402 and charges nothing', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    casino.wallets.set('player-cj', 1000);
    await expect(game.spin(s, 20)).rejects.toMatchObject({ status: 402, balance: { tokensMicro: 1000 } });
    expect(casino.wallets.get('player-cj')).toBe(1000);
  });

  it('retries network trouble with the same round id, without double charging', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    const start = casino.wallets.get('player-cj')!;
    casino.failNext = { openRound: 2, settle: 2 };
    const { result } = await game.spin(s, 20);
    expect(casino.rounds.size).toBe(1);
    expect(casino.wallets.get('player-cj')).toBe(start - centsToMicro(20) + centsToMicro(result.totalWin));
  });

  it('voids the round and refunds the bet when the settle never goes through', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    const start = casino.wallets.get('player-cj');
    casino.failNext = { settle: 99 };
    await expect(game.spin(s, 20)).rejects.toMatchObject({ code: 'round_voided' });
    expect(casino.wallets.get('player-cj')).toBe(start);
    expect([...casino.rounds.values()][0].round.status).toBe('void');
  });

  it('obeys maintenance and closed at once', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    for (const status of ['maintenance', 'closed'] as const) {
      casino.setState({ status, reason: 'Testing' });
      await flush();
      await expect(game.spin(s, 20)).rejects.toBeInstanceOf(GameError);
    }
    // Closed: the casino refunded everything and closed every session.
    expect(game.getSession(s.id)).toBeNull();
  });

  it('lets a spin in progress finish when maintenance starts', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    const settle = casino.settle.bind(casino);
    casino.settle = async (a) => {
      casino.setState({ status: 'maintenance' });
      return settle(a);
    };
    await expect(game.spin(s, 20)).resolves.toBeDefined();
    expect([...casino.rounds.values()][0].round.status).toBe('settled');
    await flush();
    await expect(game.spin(s, 20)).rejects.toMatchObject({ code: 'maintenance' });
  });

  it('plays exactly as open in demo and tells the page to show the DEMO mark', async () => {
    const { game, casino } = await setup();
    casino.setState({ status: 'demo' });
    await flush();
    const s = await game.openSession('cj');
    const { state } = await game.spin(s, 20);
    expect(state).toMatchObject({ status: 'demo', demo: true });
    expect([...casino.rounds.values()][0].round.status).toBe('settled');
  });

  it('refuses new rounds while the casino is offline', async () => {
    const { game, casino, state } = await setup();
    const s = await game.openSession('cj');
    casino.goOffline(state);
    await flush();
    expect(game.controlState.status).toBe('offline');
    await expect(game.spin(s, 20)).rejects.toMatchObject({ status: 409, code: 'offline' });
    expect(casino.rounds.size).toBe(0);
  });

  it('tells the player the stake came back when the casino refunded a lost round while offline', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    const start = casino.wallets.get('player-cj');
    // The casino refunds between our open and our settle; a losing settle is refused with refunded: true.
    const settle = casino.settle.bind(casino);
    casino.settle = async (a) => {
      casino.refundOpenRounds('offline');
      return settle({ ...a, winCents: 0 });
    };
    await expect(game.spin(s, 20)).rejects.toMatchObject({ status: 409, code: 'refunded' });
    expect(casino.wallets.get('player-cj')).toBe(start);
    expect(game.publicState(s).balance?.tokensMicro).toBe(start);
  });

  it('still pays a late win of at least the stake on a refunded round', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    const start = casino.wallets.get('player-cj')!;
    const settle = casino.settle.bind(casino);
    casino.settle = async (a) => {
      casino.refundOpenRounds('offline');
      return settle({ ...a, winCents: 60 });
    };
    await game.spin(s, 20);
    expect(casino.wallets.get('player-cj')).toBe(start - centsToMicro(20) + centsToMicro(60));
  });

  it('follows balance events from the casino (a top-up, another game)', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    const seen: number[] = [];
    game.onBalance((id, b) => id === s.id && seen.push(b.tokensMicro));
    casino.wallets.set('player-cj', 5_000_000);
    casino.topUp('player-cj', 1_000_000);
    expect(seen.at(-1)).toBe(6_000_000);
    expect(game.publicState(s).balance?.tokensMicro).toBe(6_000_000);
  });

  it('sends big wins to the leaderboard with the player session', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    for (let i = 0; i < 2000 && casino.scores.length === 0; i++) await game.spin(s, 20);
    expect(casino.scores.length).toBeGreaterThan(0);
    expect(casino.scores[0].session).toBe(s.casinoSession);
    expect(casino.scores[0].score).toBeGreaterThanOrEqual(200);
  });

  it('never voids a spin that is still waiting for the casino', async () => {
    const { game, casino, journal } = await setup();
    const s = await game.openSession('cj');
    // The casino is slow to answer the settle, and the 30 s housekeeping runs in between.
    let answer!: () => void;
    let waiting = false;
    const held = new Promise<void>((r) => (answer = r));
    const settle = casino.settle.bind(casino);
    casino.settle = async (a) => {
      waiting = true;
      await held;
      return settle(a);
    };
    const spinning = game.spin(s, 20);
    while (!waiting) await flush();
    expect(journal.unfinishedRounds()).toHaveLength(1);
    expect(await game.reconcile()).toBe(0);
    answer();
    await expect(spinning).resolves.toBeDefined();
    expect([...casino.rounds.values()][0].round.status).toBe('settled');
    expect(casino.calls).not.toContain('voidRound');
    expect(journal.unfinishedRounds()).toHaveLength(0);
  });

  it('drains rounds in flight before a shutdown and refuses new ones', async () => {
    const { game } = await setup();
    const s = await game.openSession('cj');
    const spinning = game.spin(s, 20);
    await game.drain();
    await expect(spinning).resolves.toBeDefined();
    await expect(game.spin(s, 20)).rejects.toMatchObject({ code: 'restarting' });
  });
});

describe('Car Chase', () => {
  it('is offered after a win and plays each pick as its own paid round', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    let r;
    do r = await game.spin(s, 20);
    while (r.result.totalWin === 0 || !r.state.gamble);
    const stake = r.state.gamble!.stake;
    const before = casino.wallets.get('player-cj')!;
    const g = await game.gamble(s, 'left');
    expect(casino.wallets.get('player-cj')).toBe(before - centsToMicro(stake) + centsToMicro(g.stake));
    expect(g.stake).toBe(g.won ? stake * 2 : 0);
    if (!g.won) await expect(game.gamble(s, 'left')).rejects.toMatchObject({ code: 'no_offer' });
  });

  it('can be switched off from the casino settings', async () => {
    const { game, casino } = await setup();
    const s = await game.openSession('cj');
    casino.setState({ settings: { gamble_enabled: false } });
    await flush();
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
