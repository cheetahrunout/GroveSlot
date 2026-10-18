import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json';
import type { FeatureKey } from '../src/engine/round';
import { HttpCasino, type Casino, type GameStatus } from './casino';
import { FakeCasino } from './fakeCasino';
import { GameError, LowriderGame, type PlayerSession } from './game';
import { cryptoRng } from './rng';

const VERSION = pkg.version;
const PORT = Number(process.env.PORT ?? 8787);
const CASINO_URL = process.env.CASINO_URL;
const CASINO_PUBLIC_URL = process.env.CASINO_PUBLIC_URL ?? '';
const GAME_KEY = process.env.GAME_KEY;
const HEARTBEAT_MS = 30_000;
const COOKIE = 'lowrider_id';

/** One line per event on stdout; never a key, token or session id. */
function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

// Without CASINO_URL the server runs against the in-memory stand-in casino:
// local play only, never for the real casino.
const devMode = !CASINO_URL;
if (!devMode && !GAME_KEY) {
  log('fatal', { error: 'CASINO_URL is set but GAME_KEY is missing' });
  process.exit(1);
}
const casino: Casino = devMode ? new FakeCasino() : new HttpCasino(CASINO_URL!, GAME_KEY!);
const game = new LowriderGame(casino, cryptoRng, log, devMode);

// The page: the one-file build, read once at start-up.
const here = dirname(fileURLToPath(import.meta.url));
const pagePath = process.env.PAGE_PATH ?? resolve(here, '../dist-single/index.html');
let page = '<!doctype html><title>Lowrider</title><p>Page not built: run npm run build:single.</p>';
try {
  page = readFileSync(pagePath, 'utf8');
} catch {
  log('page_missing', { path: pagePath });
}

// --- control state: stream, on-demand reads and heartbeats ----------------

async function refreshControl(): Promise<void> {
  try {
    game.applyControl(await casino.control());
  } catch (e) {
    log('control_failed', { error: (e as Error).message });
  }
}

async function heartbeat(): Promise<void> {
  try {
    const answer = await casino.heartbeat(VERSION, game.activePlayers());
    if (answer) game.applyControl(answer);
    else await refreshControl();
  } catch (e) {
    log('heartbeat_failed', { error: (e as Error).message });
  }
}

casino.events((c) => game.applyControl(c));
void refreshControl().then(heartbeat);
setInterval(heartbeat, HEARTBEAT_MS).unref();

// --- helpers --------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(text);
}

function sendError(res: ServerResponse, e: unknown): void {
  if (e instanceof GameError) {
    send(res, e.status, { error: e.message, code: e.code, balance: e.balance, state: null });
    return;
  }
  log('error', { error: (e as Error).message });
  send(res, 500, { error: 'Something went wrong.', code: 'server_error' });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 10_000) throw new GameError(413, 'too_large', 'Request too large.');
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new GameError(400, 'bad_json', 'Bad request.');
  }
}

function cookieId(req: IncomingMessage): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return undefined;
}

function sessionCookie(req: IncomingMessage, id: string): string {
  const secure = req.headers['x-forwarded-proto'] === 'https' || !devMode ? '; Secure' : '';
  return `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`;
}

function requireSession(req: IncomingMessage): PlayerSession {
  const s = game.getSession(cookieId(req));
  if (!s) throw new GameError(401, 'no_session', 'Open Lowrider from the casino lobby to play.');
  return s;
}

const FORCEABLE = new Set(['freeSpins', 'lowriderHop', 'holdAndSpin', 'turfWar', 'driveBy']);

// --- routes ---------------------------------------------------------------

const pageClients = new Set<ServerResponse>();
game.onControl((c) => {
  const data = `event: control\ndata: ${JSON.stringify({ status: c.status, reason: c.reason })}\n\n`;
  for (const client of pageClients) client.write(data);
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = `${req.method} ${url.pathname}`;

  switch (route) {
    case 'GET /':
    case 'GET /index.html':
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(page);
      return;

    case 'GET /health':
      send(res, 200, { ok: true, version: VERSION, status: game.controlState.status });
      return;

    case 'POST /api/session': {
      const body = await readJson(req);
      let token = typeof body.token === 'string' ? body.token : '';
      // Local play: the stand-in casino hands out a session without a lobby.
      if (!token && devMode) token = 'local';
      if (!token) {
        const existing = game.getSession(cookieId(req));
        send(res, existing ? 200 : 401, { ...lobby(), state: game.publicState(existing) });
        return;
      }
      const s = await game.openSession(token);
      send(res, 200, { ...lobby(), state: game.publicState(s) }, { 'Set-Cookie': sessionCookie(req, s.id) });
      return;
    }

    case 'GET /api/state': {
      const s = game.getSession(cookieId(req));
      send(res, 200, { ...lobby(), state: game.publicState(s) });
      return;
    }

    case 'POST /api/spin': {
      const s = requireSession(req);
      const body = await readJson(req);
      const force = devMode && typeof body.force === 'string' && FORCEABLE.has(body.force) ? (body.force as FeatureKey) : undefined;
      send(res, 200, await game.spin(s, Number(body.betCents), force));
      return;
    }

    case 'POST /api/gamble': {
      const s = requireSession(req);
      const body = await readJson(req);
      if (body.pick !== 'left' && body.pick !== 'right') throw new GameError(400, 'bad_pick', 'Pick the left or right alley.');
      send(res, 200, await game.gamble(s, body.pick));
      return;
    }

    case 'POST /api/collect': {
      const s = requireSession(req);
      send(res, 200, { state: game.collect(s) });
      return;
    }

    case 'POST /api/leave': {
      const id = cookieId(req);
      if (id) await game.closeSession(id);
      send(res, 200, { ok: true });
      return;
    }

    case 'GET /api/events': {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      const c = game.controlState;
      res.write(`event: control\ndata: ${JSON.stringify({ status: c.status, reason: c.reason })}\n\n`);
      pageClients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(ping);
        pageClients.delete(res);
      });
      return;
    }

    case 'POST /api/dev/control': {
      // Local play only: switch the stand-in casino's control state to try the screens.
      if (!(casino instanceof FakeCasino)) break;
      const body = await readJson(req);
      const status = String(body.status);
      if (!['live', 'last_bets', 'halted', 'maintenance'].includes(status)) throw new GameError(400, 'bad_status', 'Unknown status.');
      casino.setState({ status: status as GameStatus, reason: String(body.reason ?? '') });
      send(res, 200, { ok: true });
      return;
    }
  }
  send(res, 404, { error: 'Not found' });
}

function lobby(): { lobbyUrl: string; dev: boolean } {
  return { lobbyUrl: CASINO_PUBLIC_URL, dev: devMode };
}

createServer((req, res) => {
  handle(req, res).catch((e) => sendError(res, e));
}).listen(PORT, () => log('listening', { port: PORT, version: VERSION, casino: devMode ? 'local stand-in' : 'grove casino' }));
