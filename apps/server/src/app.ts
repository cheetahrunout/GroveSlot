import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import {
  DevControlRequestSchema,
  GambleRequestSchema,
  SessionRequestSchema,
  SpinRequestSchema,
  type BalanceEvent,
  type ControlEvent,
  type Welcome,
} from '@lowrider/shared/api';
import type { Casino } from './casino';
import { FakeCasino } from './fakeCasino';
import { GameError, type LowriderGame, type PlayerSession } from './game';

export interface AppOptions {
  game: LowriderGame;
  casino: Casino;
  /** Build version reported by /health (GAME_VERSION). */
  version: string;
  /** Local play with the stand-in casino: allows forced bonuses and /api/dev/control. */
  devMode: boolean;
  /** The casino's public address (CASINO_PUBLIC_URL): lobby link, casino bar, theme. Empty in local play. */
  casinoUrl: string;
  /** The game's slug, for CASINO_PUBLIC_URL/play/<slug>. */
  slug: string;
  /** The production Vite build to serve; skipped when missing. */
  webDir?: string;
}

/**
 * Spins and Car Chase picks per seat per minute. A seat's rounds already run one at a time (a second one is
 * refused as busy); the page at its fastest spins about 110 times a minute on turbo auto-spin (0.55 s a losing
 * spin) and about 170 by hand on turbo, so the limit sits above both and still stops a script.
 */
export const ACTIONS_PER_MINUTE = 240;

/**
 * The seat a request speaks for: the tab's `X-Lowrider-Seat` header, or `?seat=` on the event stream and the
 * leave beacon (neither can carry a header). A player may hold several seats at once (one per tab), and tabs
 * share cookies, so the seat is never kept in a cookie (rule 9): a page without storage keeps it in memory.
 */
function seatOf(req: FastifyRequest): string | undefined {
  const header = req.headers['x-lowrider-seat'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (typeof fromHeader === 'string' && fromHeader) return fromHeader;
  const query = req.query as Record<string, unknown> | undefined;
  const fromQuery = query?.seat;
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
  return undefined;
}

/** The Lowrider HTTP surface: the page, /health and the page's JSON API. */
export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { game, casino, devMode } = opts;
  const app = Fastify({
    // Fastify's own logger stays off: request logs would include ?gc_token=
    // on the first page load. The game writes its own JSON events instead.
    logger: false,
    bodyLimit: 10_000,
    trustProxy: true,
  });

  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // Per seat where we know it, else per address.
    keyGenerator: (req) => seatOf(req) ?? req.ip,
  });

  // --- helpers ------------------------------------------------------------

  const parse = <T>(schema: ZodType<T>, body: unknown): T => {
    const result = schema.safeParse(body ?? {});
    if (!result.success) throw new GameError(400, 'bad_request', 'That request is not valid.');
    return result.data;
  };

  const sessionOf = (req: FastifyRequest): PlayerSession | null => game.getSession(seatOf(req));

  const requireSession = (req: FastifyRequest): PlayerSession => {
    const s = sessionOf(req);
    if (!s) throw new GameError(401, 'no_session', 'Open Lowrider from the casino lobby to play.');
    return s;
  };

  const casinoUrl = opts.casinoUrl.replace(/\/+$/, '');
  // No session (or the casino ended it): the casino logs the player in and comes back with a fresh token.
  const playUrl = casinoUrl ? `${casinoUrl}/play/${opts.slug}` : '';
  const welcome = (s: PlayerSession | null): Welcome => ({ casinoUrl, playUrl, slug: opts.slug, dev: devMode, state: game.publicState(s), seat: s ? s.id : null });

  // The page may load only itself, plus the casino's theme and bar (and the fonts a theme imports).
  const casinoOrigin = casinoUrl ? new URL(casinoUrl).origin : '';
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${casinoOrigin}`.trim(),
    `style-src 'self' 'unsafe-inline' ${casinoOrigin} https://fonts.googleapis.com`.trim(),
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    `frame-src ${casinoOrigin || "'none'"}`,
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Content-Security-Policy', csp);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    return payload;
  });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof GameError) {
      reply.code(error.status).send({ error: error.message, code: error.code, balance: error.balance, casinoUrl, ...(error.status === 401 ? { playUrl } : {}) });
      return;
    }
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) {
      reply.code(429).send({ error: 'Slow down a little and try again.', code: 'rate_limited' });
      return;
    }
    if (status && status < 500) {
      reply.code(status).send({ error: 'That request is not valid.', code: 'bad_request' });
      return;
    }
    app.log.error({ event: 'error', error: (error as Error).message });
    reply.code(500).send({ error: 'Something went wrong.', code: 'server_error' });
  });

  // --- health and API -----------------------------------------------------

  app.get('/health', { config: { rateLimit: false } }, async () => ({
    ok: true,
    version: opts.version,
    status: game.controlState.status,
  }));

  app.post('/api/session', async (req, reply) => {
    const { token } = parse(SessionRequestSchema, req.body);
    // Local play: the stand-in casino hands out a session without a lobby.
    const useToken = token ?? (devMode ? 'local' : undefined);
    if (!useToken) {
      const existing = sessionOf(req);
      reply.code(existing ? 200 : 401);
      return welcome(existing);
    }
    // A tab that already held a seat and comes back with a new token gives the old one up.
    const s = await game.openSession(useToken, seatOf(req));
    return welcome(s);
  });

  app.get('/api/state', async (req) => welcome(sessionOf(req)));

  const actionLimit = { rateLimit: { max: ACTIONS_PER_MINUTE, timeWindow: '1 minute' } };

  app.post('/api/spin', { config: actionLimit }, async (req) => {
    const s = requireSession(req);
    const { betCents, force } = parse(SpinRequestSchema, req.body);
    return game.spin(s, betCents, devMode ? force : undefined);
  });

  app.post('/api/gamble', { config: actionLimit }, async (req) => {
    const s = requireSession(req);
    const { pick } = parse(GambleRequestSchema, req.body);
    return game.gamble(s, pick);
  });

  app.post('/api/collect', async (req) => ({ state: game.collect(requireSession(req)) }));

  /** The page finished playing back a bonus: nothing from that spin is in progress any more (rule 17). */
  app.post('/api/shown', async (req) => {
    game.featureShown(requireSession(req));
    return { ok: true };
  });

  /** The page went away: the seat is kept for the grace period (a reload picks it back up), then closed. */
  app.post('/api/leave', async (req) => {
    game.pageLeft(seatOf(req));
    return { ok: true };
  });

  /** Server-sent events: the casino's control state, and this player's balance, as they change. */
  app.get('/api/events', (req, reply) => {
    const sessionId = seatOf(req);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    const send = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    const pushControl = (c: ControlEvent) => send('control', { status: c.status, demo: c.demo, reason: c.reason } satisfies ControlEvent);
    pushControl(game.controlState);
    const stopControl = game.onControl(pushControl);
    const stopBalance = game.onBalance((id, balance) => {
      if (id === sessionId) send('balance', { balance } satisfies BalanceEvent);
    });
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    // While the stream is open the page is there; once it closes, the seat's grace period starts.
    const streamClosed = game.streamOpened(sessionId);
    req.raw.on('close', () => {
      clearInterval(ping);
      stopControl();
      stopBalance();
      streamClosed();
    });
  });

  if (devMode && casino instanceof FakeCasino) {
    app.post('/api/dev/control', async (req) => {
      const { status, reason } = parse(DevControlRequestSchema, req.body);
      casino.setState({ status, reason: reason ?? '' });
      return { ok: true };
    });
  }

  // --- the page -------------------------------------------------------------

  if (opts.webDir && existsSync(join(opts.webDir, 'index.html'))) {
    // The casino bar comes from the casino itself: one loader tag in the page
    // (game-integration.md section 7). The casino address is runtime config,
    // never in the image, so the tag goes in when the page is served.
    const barTag = casinoUrl ? `<script src="${casinoUrl}/bar.js" data-game="${opts.slug}"></script>` : '';
    const page = readFileSync(join(opts.webDir, 'index.html'), 'utf8').replace('</head>', `    ${barTag}\n  </head>`);
    const sendPage = (_req: FastifyRequest, reply: FastifyReply) => reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(page);
    app.get('/', sendPage);
    app.get('/index.html', sendPage);
    await app.register(fastifyStatic, {
      root: opts.webDir,
      index: false,
      setHeaders: (res) => {
        // Vite fingerprints assets.
        res.header('Cache-Control', 'public, max-age=31536000, immutable');
      },
    });
  } else {
    app.get('/', async (_req, reply) => reply.type('text/html').send('<!doctype html><title>Lowrider</title><p>The page is not built yet: run pnpm build.</p>'));
  }

  return app;
}
