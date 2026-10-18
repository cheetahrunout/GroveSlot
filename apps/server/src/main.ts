import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json';
import manifest from '../../../casino-game.json';
import { buildApp } from './app';
import { createCasino, type Casino } from './casino';
import { FakeCasino } from './fakeCasino';
import { startGame } from './game';
import { Journal } from './journal';
import { cryptoRng } from './rng';

const env = process.env;
// The Docker image sets GAME_VERSION from BUILD_VERSION (1.0.<build number>).
const VERSION = env.GAME_VERSION || pkg.version;
const PORT = Number(env.PORT ?? 8787);
const RECONCILE_MS = 30_000;
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
const casino: Casino = devMode ? new FakeCasino() : createCasino({ url: env.CASINO_URL, key: env.GAME_KEY });
const journal = new Journal(env.DATA_PATH ?? (devMode ? ':memory:' : resolve(here, '../data/lowrider.db')));

// Heartbeat at once and every 30 s (version and players), control stream, balance events.
const { game: live, stop: stopWatch } = startGame(casino, { rng: cryptoRng, journal, log, devMode, version: VERSION });

const app = await buildApp({
  game: live,
  casino,
  version: VERSION,
  devMode,
  casinoUrl: env.CASINO_PUBLIC_URL ?? '',
  slug: manifest.slug,
  webDir: env.WEB_DIR ? resolve(env.WEB_DIR) : resolve(here, '../../web/dist'),
  secureCookies: !devMode,
});

async function housekeeping(): Promise<void> {
  // Rounds left open by a crash or a casino outage are voided as soon as the casino answers.
  if (live.controlState.status !== 'offline') {
    await live.reconcile().catch((e) => log('reconcile_failed', { error: (e as Error).message }));
  }
  await live.refreshControl();
  journal.prune(7 * 24 * 60 * 60 * 1000);
}
await live.refreshControl(true);
void housekeeping();
setInterval(() => void housekeeping(), RECONCILE_MS).unref();

// SIGTERM: stop taking rounds, let settles and voids in flight finish, stop the watch loop, exit.
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  log('stopping');
  await live.drain();
  stopWatch();
  await app.close();
  journal.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: PORT, host: '0.0.0.0' });
log('listening', { port: PORT, version: VERSION, casino: devMode ? 'local stand-in' : 'grove casino' });
