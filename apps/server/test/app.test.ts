import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRng } from '@lowrider/shared/engine/rng';
import { buildApp } from '../src/app';
import { FakeCasino } from '../src/fakeCasino';
import { LowriderGame } from '../src/game';
import { Journal } from '../src/journal';

let casino: FakeCasino;
let game: LowriderGame;
let app: FastifyInstance;

async function makeApp(devMode: boolean) {
  casino = new FakeCasino(100_000);
  game = new LowriderGame(casino, createRng(3), new Journal(':memory:'), () => {}, devMode);
  game.applyControl(casino.state);
  casino.events((c) => game.applyControl(c));
  app = await buildApp({ game, casino, version: '1.0.42', devMode, lobbyUrl: 'https://casino.example', secureCookies: !devMode });
}

/** Opens a session with a token and returns the cookie header to reuse. */
async function login(token = 'cj'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/session', payload: { token } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'lowrider_id')!;
  return `lowrider_id=${cookie.value}`;
}

afterEach(async () => app?.close());

describe('production mode', () => {
  beforeEach(() => makeApp(false));

  it('reports health with the build version', async () => {
    const res = await app.inject('/health');
    expect(res.json()).toEqual({ ok: true, version: '1.0.42', status: 'live' });
  });

  it('gives the browser its own secure, HTTP-only cookie and never the casino session', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/session', payload: { token: 'cj' } });
    const cookie = res.cookies.find((c) => c.name === 'lowrider_id')!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    const sessions = [...casino.sessions.keys()];
    expect(res.body).not.toContain(sessions[0]);
    expect(cookie.value).not.toBe(sessions[0]);
  });

  it('refuses play without a session and without a token', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/session', payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/spin', payload: { betCents: 20 } })).statusCode).toBe(401);
  });

  it('validates every request with the shared schemas', async () => {
    const cookie = await login();
    const bad = [{ betCents: '20' }, { betCents: -20 }, { betCents: 20.5 }, { betCents: 20, extra: 1 }, {}];
    for (const payload of bad) {
      const res = await app.inject({ method: 'POST', url: '/api/spin', payload, headers: { cookie } });
      expect(res.statusCode).toBe(400);
    }
    const pick = await app.inject({ method: 'POST', url: '/api/gamble', payload: { pick: 'middle' }, headers: { cookie } });
    expect(pick.statusCode).toBe(400);
  });

  it('plays a spin and ignores forced bonuses outside local play', async () => {
    const cookie = await login();
    let triggered = 0;
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/spin', payload: { betCents: 20, force: 'turfWar' }, headers: { cookie } });
      expect(res.statusCode).toBe(200);
      if (res.json().result.features.turfWar) triggered++;
    }
    expect(triggered).toBeLessThan(5);
  });

  it('has no developer routes', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/dev/control', payload: { status: 'halted' } });
    expect(res.statusCode).toBe(404);
  });

  it('rate-limits game actions', async () => {
    const cookie = await login();
    const codes: number[] = [];
    for (let i = 0; i < 95; i++) {
      codes.push((await app.inject({ method: 'POST', url: '/api/collect', payload: {}, headers: { cookie } })).statusCode);
      codes.push((await app.inject({ method: 'POST', url: '/api/spin', payload: { betCents: 20 }, headers: { cookie } })).statusCode);
    }
    expect(codes).toContain(429);
  });
});

describe('local play', () => {
  beforeEach(() => makeApp(true));

  it('opens a session without a lobby token and allows forced bonuses', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/session', payload: {} });
    expect(res.statusCode).toBe(200);
    const cookie = `lowrider_id=${res.cookies[0].value}`;
    const spin = await app.inject({ method: 'POST', url: '/api/spin', payload: { betCents: 20, force: 'lowriderHop' }, headers: { cookie } });
    expect(spin.json().result.features.lowriderHop).toBeDefined();
  });

  it('switches the stand-in casino state', async () => {
    await app.inject({ method: 'POST', url: '/api/dev/control', payload: { status: 'last_bets', reason: 'Testing' } });
    expect(game.controlState.status).toBe('last_bets');
  });
});

describe('restart recovery', () => {
  it('voids rounds that were left open, refunding the bet', async () => {
    const journal = new Journal(':memory:');
    casino = new FakeCasino(100_000);
    const first = new LowriderGame(casino, createRng(5), journal);
    first.applyControl(casino.state);
    const s = await first.openSession('cj');
    // The casino stops answering after the bet is taken.
    casino.failNext = { settle: 99, voidRound: 99 };
    const voidRound = casino.voidRound.bind(casino);
    casino.voidRound = async (id, reason) => {
      if ((casino.failNext.voidRound ?? 0) > 0) {
        casino.failNext.voidRound!--;
        throw new (await import('../src/casino')).CasinoError(0, { error: 'network' });
      }
      return voidRound(id, reason);
    };
    await expect(first.spin(s, 20)).rejects.toMatchObject({ code: 'round_pending' });
    expect(casino.balances.get('player-cj')).toBe(100_000 - 20);
    expect(journal.unfinishedRounds()).toHaveLength(1);

    // A new server process with the same journal cleans up once the casino answers.
    casino.failNext = {};
    const second = new LowriderGame(casino, createRng(6), journal);
    expect(await second.reconcile()).toBe(1);
    expect(casino.balances.get('player-cj')).toBe(100_000);
    expect(journal.unfinishedRounds()).toHaveLength(0);
  });

  it('keeps Wanted stars across restarts', async () => {
    const journal = new Journal(':memory:');
    journal.saveState('player-cj', { wanted: { stars: 3, lossStreak: 1 } });
    expect(journal.loadState('player-cj')).toEqual({ wanted: { stars: 3, lossStreak: 1 } });
    expect(journal.loadState('nobody').wanted.stars).toBe(0);
  });
});
