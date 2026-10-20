import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@lowrider/shared/engine/rng';
import { ACTIONS_PER_MINUTE, buildApp } from '../src/app';
import { FakeCasino, centsToMicro } from '../src/fakeCasino';
import { LowriderGame, SEAT_GRACE_MS, startGame } from '../src/game';
import { Journal } from '../src/journal';
import { flush, setup } from './helpers';

let casino: FakeCasino;
let game: LowriderGame;
let app: FastifyInstance;

async function makeApp(devMode: boolean) {
  ({ casino, game } = await setup({ devMode }));
  app = await buildApp({ game, casino, version: '1.0.42', devMode, casinoUrl: devMode ? '' : 'https://casino.example/', slug: 'lowrider' });
}

/** Opens a session with a token and returns the tab's seat header to reuse. */
async function login(token = 'cj'): Promise<Record<string, string>> {
  const res = await app.inject({ method: 'POST', url: '/api/session', payload: { token } });
  expect(res.statusCode).toBe(200);
  return { 'x-lowrider-seat': res.json().seat as string };
}

afterEach(async () => app?.close());

describe('production mode', () => {
  beforeEach(() => makeApp(false));

  it('reports health with the build version', async () => {
    const res = await app.inject('/health');
    expect(res.json()).toEqual({ ok: true, version: '1.0.42', status: 'open' });
  });

  it('gives the tab its own seat, never the casino session, and no cookie the tabs would share (rule 9)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/session', payload: { token: 'cj' } });
    expect(res.cookies).toHaveLength(0);
    const sessions = [...casino.sessions.keys()];
    expect(res.body).not.toContain(sessions[0]);
    expect(res.json().seat).not.toBe(sessions[0]);
    // A cookie from an older release picks no seat.
    const seat = res.json().seat as string;
    expect((await app.inject({ url: '/api/state', headers: { cookie: `lowrider_id=${seat}` } })).json().seat).toBeNull();
  });

  it('keeps a seat per tab: a second seat for the same player leaves the first alone', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/session', payload: { token: 'cj' } });
    const b = await app.inject({ method: 'POST', url: '/api/session', payload: { token: 'cj' } });
    const seatA = a.json().seat as string;
    const seatB = b.json().seat as string;
    expect(seatA).toBeTruthy();
    expect(seatB).toBeTruthy();
    expect(seatA).not.toBe(seatB);
    const state = await app.inject({ url: '/api/state', headers: { 'x-lowrider-seat': seatA } });
    expect(state.json().seat).toBe(seatA);
    const spinA = await app.inject({ method: 'POST', url: '/api/spin', payload: { betCents: 20 }, headers: { 'x-lowrider-seat': seatA } });
    const spinB = await app.inject({ method: 'POST', url: '/api/spin', payload: { betCents: 20 }, headers: { 'x-lowrider-seat': seatB } });
    expect(spinA.statusCode).toBe(200);
    expect(spinB.statusCode).toBe(200);
    const left = await app.inject({ method: 'POST', url: `/api/leave?seat=${encodeURIComponent(seatB)}` });
    expect(left.statusCode).toBe(200);
    // Gone for the grace period: the seat and its casino session are freed; the tab still open stays.
    game.streamOpened(seatA);
    await game.sweepSeats(Date.now() + SEAT_GRACE_MS + 1000);
    expect(casino.sessions.size).toBe(1);
    expect((await app.inject({ url: '/api/state', headers: { 'x-lowrider-seat': seatA } })).json().seat).toBe(seatA);
    expect((await app.inject({ url: '/api/state', headers: { 'x-lowrider-seat': seatB } })).json().seat).toBeNull();
  });

  it('keeps a seat through a reload within the grace period (rule 9)', async () => {
    const tab = await login();
    await app.inject({ method: 'POST', url: `/api/leave?seat=${encodeURIComponent(tab['x-lowrider-seat'])}` });
    expect(await game.sweepSeats(Date.now() + SEAT_GRACE_MS / 2)).toBe(0);
    const back = await app.inject({ method: 'POST', url: '/api/session', payload: {}, headers: tab });
    expect(back.statusCode).toBe(200);
    expect(back.json().seat).toBe(tab['x-lowrider-seat']);
  });

  it('closes the old casino session when a known tab comes back with a new token (rule 9)', async () => {
    const tab = await login();
    const [oldSession] = [...casino.sessions.keys()];
    const res = await app.inject({ method: 'POST', url: '/api/session', payload: { token: 'cj' }, headers: tab });
    expect(res.statusCode).toBe(200);
    expect(res.json().seat).not.toBe(tab['x-lowrider-seat']);
    expect(casino.sessions.has(oldSession)).toBe(false);
    expect(casino.sessions.size).toBe(1);
    expect(game.openCasinoSessions()).toEqual([...casino.sessions.keys()]);
  });

  it('shows the seat limit with the way back to the lobby (rule 9)', async () => {
    casino.seatLimit = 1;
    await login();
    const res = await app.inject({ method: 'POST', url: '/api/session', payload: { token: 'cj' } });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'seat_limit', casinoUrl: 'https://casino.example' });
    expect(res.json().error).toContain('1 Lowrider tabs open');
  });

  it('sends a visitor without a session back through the casino', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/session', payload: {} });
    expect(res.statusCode).toBe(401);
    expect(res.json().playUrl).toBe('https://casino.example/play/lowrider');
    const spin = await app.inject({ method: 'POST', url: '/api/spin', payload: { betCents: 20 } });
    expect(spin.statusCode).toBe(401);
    expect(spin.json().playUrl).toBe('https://casino.example/play/lowrider');
  });

  it('never hands the browser the game key or the casino API', async () => {
    const tab = await login();
    const res = await app.inject({ url: '/api/state', headers: tab });
    expect(res.json()).toMatchObject({ casinoUrl: 'https://casino.example', playUrl: 'https://casino.example/play/lowrider' });
    expect(res.body).not.toMatch(/GAME_KEY|Bearer|session"/);
  });

  it('validates every request with the shared schemas', async () => {
    const tab = await login();
    const bad = [{ betCents: '20' }, { betCents: -20 }, { betCents: 20.5 }, { betCents: 20, extra: 1 }, {}];
    for (const payload of bad) {
      const res = await app.inject({ method: 'POST', url: '/api/spin', payload, headers: tab });
      expect(res.statusCode).toBe(400);
    }
    const pick = await app.inject({ method: 'POST', url: '/api/gamble', payload: { pick: 'middle' }, headers: tab });
    expect(pick.statusCode).toBe(400);
  });

  it('plays a spin and ignores forced bonuses outside local play', async () => {
    const tab = await login();
    let triggered = 0;
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/spin', payload: { betCents: 20, force: 'turfWar' }, headers: tab });
      expect(res.statusCode).toBe(200);
      if (res.json().result.features.turfWar) triggered++;
    }
    expect(triggered).toBeLessThan(5);
  });

  it('has no developer routes', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/dev/control', payload: { status: 'closed' } });
    expect(res.statusCode).toBe(404);
  });

  it('lets turbo auto-spin run flat out and still rate-limits a script', async () => {
    const tab = await login();
    const codes: number[] = [];
    for (let i = 0; i < ACTIONS_PER_MINUTE + 10; i++) {
      codes.push((await app.inject({ method: 'POST', url: '/api/spin', payload: { betCents: 20 }, headers: tab })).statusCode);
    }
    // A minute of turbo auto-spin is about 110 spins (0.55 s a losing spin): every one of them plays.
    expect(ACTIONS_PER_MINUTE).toBeGreaterThan(110);
    expect(codes.slice(0, ACTIONS_PER_MINUTE).every((c) => c === 200)).toBe(true);
    expect(codes.slice(ACTIONS_PER_MINUTE)).toContain(429);
  });
});

describe('local play', () => {
  beforeEach(() => makeApp(true));

  it('opens a session without a lobby token and allows forced bonuses', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/session', payload: {} });
    expect(res.statusCode).toBe(200);
    const tab = { 'x-lowrider-seat': res.json().seat as string };
    const spin = await app.inject({ method: 'POST', url: '/api/spin', payload: { betCents: 20, force: 'lowriderHop' }, headers: tab });
    expect(spin.json().result.features.lowriderHop).toBeDefined();
  });

  it('switches the stand-in casino state', async () => {
    await app.inject({ method: 'POST', url: '/api/dev/control', payload: { status: 'maintenance', reason: 'Testing' } });
    await flush();
    expect(game.controlState.status).toBe('maintenance');
  });
});

describe('restart recovery', () => {
  it('settles a decided win after a restart, never refunding it (rule 11)', async () => {
    const journal = new Journal(':memory:');
    casino = new FakeCasino();
    const first = startGame(casino, { rng: createRng(5), journal, version: 'test' }).game;
    first.backoffMs = () => 1;
    await flush();
    const s = await first.openSession('cj');
    const start = casino.wallets.get('player-cj')!;
    // The casino stops answering after the bet is taken; the server is stopped while it retries.
    casino.failNext = { settle: 1e9 };
    const spinning = first.spin(s, 20).catch((e: unknown) => e);
    while (journal.unfinishedRounds()[0]?.status !== 'decided') await flush();
    await first.drain(10);
    expect(await spinning).toMatchObject({ code: 'round_pending' });
    const [left] = journal.unfinishedRounds();
    expect(left.status).toBe('decided');
    expect(casino.wallets.get('player-cj')).toBe(start - centsToMicro(20));

    // A new server process with the same journal settles the recorded win once the casino answers.
    casino.failNext = {};
    const second: LowriderGame = startGame(casino, { rng: createRng(6), journal, version: 'test' }).game;
    expect(await second.reconcile()).toBe(1);
    expect(casino.rounds.get(left.id)!.round).toMatchObject({ status: 'settled', win_cents: left.winCents });
    expect(casino.wallets.get('player-cj')).toBe(start - centsToMicro(20) + centsToMicro(left.winCents!));
    expect(journal.unfinishedRounds()).toHaveLength(0);
  });

  it('voids rounds that were opened but never decided, refunding the bet', async () => {
    const journal = new Journal(':memory:');
    casino = new FakeCasino();
    const game = startGame(casino, { rng: createRng(5), journal, version: 'test' }).game;
    await flush();
    const s = await game.openSession('cj');
    const start = casino.wallets.get('player-cj')!;
    // A crash between the open and the decision.
    await casino.openRound({ session: s.casinoSession, round: 'crashed', betCents: 20 });
    journal.setRound('crashed', 'spin', 'open');
    expect(casino.wallets.get('player-cj')).toBeLessThan(start);
    expect(await game.reconcile()).toBe(1);
    expect(casino.wallets.get('player-cj')).toBe(start);
    expect(journal.unfinishedRounds()).toHaveLength(0);
  });

  it('keeps the Wanted meter across restarts', async () => {
    const journal = new Journal(':memory:');
    journal.saveState('player-cj', { wanted: { stars: 3, lossStreak: 1, bet: 40 } });
    expect(journal.loadState('player-cj')).toEqual({ wanted: { stars: 3, lossStreak: 1, bet: 40 } });
    expect(journal.loadState('nobody').wanted.stars).toBe(0);
  });

  it('pays a meter saved before the bet was kept on the smallest bet', async () => {
    const journal = new Journal(':memory:');
    journal.saveState('player-old', { wanted: { stars: 5, lossStreak: 0 } } as never);
    expect(journal.loadState('player-old').wanted).toEqual({ stars: 5, lossStreak: 0, bet: 20 });
  });
});
