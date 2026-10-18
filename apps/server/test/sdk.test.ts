import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createRng } from '@lowrider/shared/engine/rng';
import { CasinoError, createCasino } from '../src/casino';
import { startGame } from '../src/game';
import { Journal } from '../src/journal';

/**
 * The real SDK (casino-game.js) over HTTP against a small stub of the casino
 * API: the wire names, the game key header and the error shapes, as
 * game-integration.md section 3 documents them. Never the real casino.
 */
const KEY = 'test-game-key';
const control = {
  status: 'live', status_reason: null, currency: 'euro', unit: null, settings: { gamble_enabled: true },
  limits: { min_bet_cents: 20, max_bet_cents: 500, max_win_cents: 2_500_000, min_bet_micro: 133_333, max_bet_micro: 3_333_333, max_win_micro: 16_666_666_667 },
  rate_micro: 1_500_000, rtp_bps: 9600, multiplayer: false, seats: null, server_time: 0,
};
const player = (micro: number) => ({ id: 7, username: 'cj', tokens_micro: micro, tokens_value_cents: Math.floor((micro * 1_500_000) / 1e10), bankruptcies: 0 });

let server: Server | null = null;
afterEach(async () => {
  if (!server) return;
  // The SDK's control stream stays open until the server drops it.
  server.closeAllConnections();
  await new Promise<void>((r) => server!.close(() => r()));
  server = null;
});

async function stubCasino() {
  const seen: { path: string; body: Record<string, unknown>; auth: string | undefined }[] = [];
  const rounds = new Map<string, { bet: number; win: number | null }>();
  let wallet = 10_000_000;
  const read = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => resolve(b ? JSON.parse(b) : {}));
    });
  server = createServer(async (req, res) => {
    const body = await read(req);
    const path = req.url ?? '';
    seen.push({ path, body, auth: req.headers.authorization });
    const send = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: 'bad key' });
    if (path === '/api/game/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`event: hello\ndata: ${JSON.stringify(control)}\n\n`);
      return;
    }
    if (path === '/api/game/control') return send(200, control);
    if (path === '/api/game/heartbeat') return send(200, control);
    if (path === '/api/game/session/open') {
      return body.token === 'gh_ok' ? send(200, { session: 'casino-session-1', table: null, player: player(wallet), expires_ts: Date.now() + 3600_000 }) : send(401, { error: 'bad token' });
    }
    if (path === '/api/game/round/open') {
      const bet = Number(body.bet_cents);
      const known = rounds.get(String(body.round));
      if (known) return send(200, { round: body.round, status: 'open', bet_cents: known.bet, replay: true });
      if (bet * 6667 > wallet) return send(402, { error: 'cannot afford', balance: wallet });
      wallet -= bet * 6667;
      rounds.set(String(body.round), { bet, win: null });
      return send(200, { round: body.round, status: 'open', bet_cents: bet, bet_micro: bet * 6667, rate_micro: 1_500_000, player: player(wallet) });
    }
    if (path === '/api/game/round/settle') {
      const r = rounds.get(String(body.round))!;
      const win = Number(body.win_cents);
      if (r.win !== null) return send(200, { round: body.round, status: 'settled', win_cents: r.win, replay: true });
      r.win = win;
      wallet += win * 6667;
      return send(200, { round: body.round, status: 'settled', bet_cents: r.bet, win_cents: win, player: player(wallet) });
    }
    if (path === '/api/game/score') return send(200, { id: 1, score: body.score });
    return send(404, { error: 'not found' });
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
  const url = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  return { url, seen, wallet: () => wallet };
}

describe('casino SDK integration (stub casino over HTTP)', () => {
  it('opens a session, plays rounds with the documented wire names and the game key', async () => {
    const stub = await stubCasino();
    const casino = createCasino({ url: stub.url, key: KEY });
    const { game, stop } = startGame(casino, { rng: createRng(11), journal: new Journal(':memory:'), version: '1.0.42' });
    try {
      await expect.poll(() => game.controlState.status).toBe('live');
      const s = await game.openSession('gh_ok');
      expect(s.player.name).toBe('cj');
      const { result, state } = await game.spin(s, 40);
      expect(state.balance?.tokensMicro).toBe(stub.wallet());

      const open = stub.seen.find((c) => c.path === '/api/game/round/open')!;
      const settle = stub.seen.find((c) => c.path === '/api/game/round/settle')!;
      expect(open.body).toMatchObject({ session: 'casino-session-1', bet_cents: 40 });
      expect(settle.body).toMatchObject({ round: open.body.round, win_cents: result.totalWin });
      expect(stub.seen.find((c) => c.path === '/api/game/heartbeat')!.body).toMatchObject({ version: '1.0.42', players: expect.any(Number) });
      expect(stub.seen.every((c) => c.auth === `Bearer ${KEY}`)).toBe(true);
    } finally {
      stop();
    }
  });

  it('surfaces casino errors as CasinoError with status and data', async () => {
    const stub = await stubCasino();
    const casino = createCasino({ url: stub.url, key: KEY });
    await expect(casino.openSession('gh_bad')).rejects.toMatchObject({ status: 401 });
    const err = await casino.openRound({ session: 'x', round: 'r1', betCents: 10_000 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CasinoError);
    expect(err).toMatchObject({ status: 402, data: { balance: 10_000_000 } });
  });
});
