import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json';
import { buildApp } from './app';
import { HttpCasino, type Casino } from './casino';
import { FakeCasino } from './fakeCasino';
import { LowriderGame } from './game';
import { Journal } from './journal';
import { cryptoRng } from './rng';

const env = process.env;
// The Docker image sets GAME_VERSION from BUILD_VERSION (1.0.<build number>).
const VERSION = env.GAME_VERSION || pkg.version;
const PORT = Number(env.PORT ?? 8787);
const HEARTBEAT_MS = 30_000;
const here = dirname(fileURLToPath(import.meta.url));

/** One JSON line per event on stdout; never a key, token or session id. */
function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...fields }));
}

// Without CASINO_URL the server runs against the in-memory stand-in casino:
// local play only, never for the real casino.
const devMode = !env.CASINO_URL;
if (!devMode && !env.GAME_KEY) {
  log('fatal', { error: 'CASINO_URL is set but GAME_KEY is missing' });
  process.exit(1);
}
const casino: Casino = devMode ? new FakeCasino() : new HttpCasino(env.CASINO_URL!, env.GAME_KEY!);
const journal = new Journal(env.DATA_PATH ?? (devMode ? ':memory:' : resolve(here, '../data/lowrider.db')));
const game = new LowriderGame(casino, cryptoRng, journal, log, devMode);

const app = await buildApp({
  game,
  casino,
  version: VERSION,
  devMode,
  lobbyUrl: env.CASINO_PUBLIC_URL ?? '',
  webDir: env.WEB_DIR ? resolve(env.WEB_DIR) : resolve(here, '../../web/dist'),
  secureCookies: !devMode,
});

// --- control state: stream, on-demand reads and heartbeats -----------------

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
  // Rounds left open by a crash or a casino outage are voided as soon as the casino answers.
  await game.reconcile().catch((e) => log('reconcile_failed', { error: (e as Error).message }));
  journal.prune(7 * 24 * 60 * 60 * 1000);
}

casino.events((c) => game.applyControl(c));
await refreshControl();
await heartbeat();
setInterval(heartbeat, HEARTBEAT_MS).unref();

const shutdown = async () => {
  log('stopping');
  await app.close();
  journal.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: PORT, host: '0.0.0.0' });
log('listening', { port: PORT, version: VERSION, casino: devMode ? 'local stand-in' : 'grove casino' });
