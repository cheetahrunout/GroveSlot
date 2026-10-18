import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyCookie from '@fastify/cookie';
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
  /** Mark cookies Secure (always outside local play). */
  secureCookies: boolean;
}

const COOKIE = 'lowrider_id';
const COOKIE_MAX_AGE = 12 * 60 * 60;

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

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // Per browser where we know it, else per address.
    keyGenerator: (req) => req.cookies?.[COOKIE] ?? req.ip,
  });

  // --- helpers ------------------------------------------------------------

  const parse = <T>(schema: ZodType<T>, body: unknown): T => {
    const result = schema.safeParse(body ?? {});
    if (!result.success) throw new GameError(400, 'bad_request', 'That request is not valid.');
    return result.data;
  };

  const sessionOf = (req: FastifyRequest): PlayerSession | null => game.getSession(req.cookies[COOKIE]);

  const requireSession = (req: FastifyRequest): PlayerSession => {
    const s = sessionOf(req);
    if (!s) throw new GameError(401, 'no_session', 'Open Lowrider from the casino lobby to play.');
    return s;
  };

  const casinoUrl = opts.casinoUrl.replace(/\/+$/, '');
  // No session (or the casino ended it): the casino logs the player in and comes back with a fresh token.
  const playUrl = casinoUrl ? `${casinoUrl}/play/${opts.slug}` : '';
  const welcome = (s: PlayerSession | null): Welcome => ({ casinoUrl, playUrl, slug: opts.slug, dev: devMode, state: game.publicState(s) });

  const setSessionCookie = (reply: FastifyReply, id: string) =>
    reply.setCookie(COOKIE, id, { path: '/', httpOnly: true, sameSite: 'lax', secure: opts.secureCookies, maxAge: COOKIE_MAX_AGE });

  // The page may load only itself, plus the casino's theme and bar (and the fonts a theme imports).
  const casinoOrigin = casinoUrl ? new URL(casinoUrl).origin : '';
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
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
      reply.code(error.status).send({ error: error.message, code: error.code, balance: error.balance, ...(error.status === 401 ? { playUrl } : {}) });
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
    const s = await game.openSession(useToken);
    setSessionCookie(reply, s.id);
    return welcome(s);
  });

  app.get('/api/state', async (req) => welcome(sessionOf(req)));

  const actionLimit = { rateLimit: { max: 90, timeWindow: '1 minute' } };

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

  app.post('/api/leave', async (req, reply) => {
    const id = req.cookies[COOKIE];
    if (id) await game.closeSession(id);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  /** Server-sent events: the casino's control state, and this player's balance, as they change. */
  app.get('/api/events', (req, reply) => {
    const sessionId = req.cookies[COOKIE];
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    const send = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    const pushControl = (c: { status: ControlEvent['status']; reason: string }) => send('control', { status: c.status, reason: c.reason } satisfies ControlEvent);
    pushControl(game.controlState);
    const stopControl = game.onControl(pushControl);
    const stopBalance = game.onBalance((id, balance) => {
      if (id === sessionId) send('balance', { balance } satisfies BalanceEvent);
    });
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => {
      clearInterval(ping);
      stopControl();
      stopBalance();
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
    await app.register(fastifyStatic, {
      root: opts.webDir,
      index: ['index.html'],
      setHeaders: (res, path) => {
        // Vite fingerprints assets; index.html must always be fresh.
        res.header('Cache-Control', path.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable');
      },
    });
  } else {
    app.get('/', async (_req, reply) => reply.type('text/html').send('<!doctype html><title>Lowrider</title><p>The page is not built yet: run pnpm build.</p>'));
  }

  return app;
}
