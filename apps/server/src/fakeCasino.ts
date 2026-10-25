import { randomUUID } from 'node:crypto';
import { CasinoError, type Casino, type Control, type Player, type WatchState } from './casino';
import type { GameStatus } from '@lowrider/shared/api';

type Round = Awaited<ReturnType<Casino['openRound']>>;
type Handler = (type: string, data: unknown) => void;
type Method = 'openSession' | 'openRound' | 'settle' | 'voidRound' | 'heartbeat' | 'control';

/** €1.50 per token, in micro-euro per token. */
const RATE_MICRO = 1_500_000;
export const centsToMicro = (cents: number) => Math.round((cents * 1e10) / RATE_MICRO);
export const microToCents = (micro: number) => Math.floor((micro * RATE_MICRO) / 1e10);

interface StubRound {
  round: Round;
  player: string;
  session: string;
}

/**
 * A stand-in for the casino with the SDK's `Casino` interface, for local play
 * and tests only (never the real casino). It keeps play-money token wallets
 * the way the casino does (the game server itself never does) and follows
 * the same rules: idempotent rounds, limits, control states, refunds while
 * the game is offline, and `balance` events.
 */
export class FakeCasino implements Casino {
  readonly url = 'local stand-in';
  readonly CasinoError = CasinoError;
  readonly wallets = new Map<string, number>();
  readonly rounds = new Map<string, StubRound>();
  readonly sessions = new Map<string, string>();
  readonly scores: { session: string; score: number }[] = [];
  readonly calls: string[] = [];
  readonly heartbeats: { version?: string; players?: number; sessions?: string[] }[] = [];
  /** Tests: the admin's seat cap per player (409 with `sessions` beyond it). */
  seatLimit = Infinity;
  control_: Control = {
    status: 'open',
    demo: false,
    status_reason: null,
    currency: 'euro',
    unit: null,
    settings: {},
    limits: { min_bet_cents: 20, max_bet_cents: 500, max_win_cents: 2_500_000, min_bet_micro: centsToMicro(20), max_bet_micro: centsToMicro(500), max_win_micro: centsToMicro(2_500_000), sessions_per_player: 4 },
    rate_micro: RATE_MICRO,
    rtp_bps: 9600,
    multiplayer: false,
    seats: null,
    server_time: Date.now(),
  };
  /** Tests: make the next N calls of a method fail like a network error. */
  failNext: Partial<Record<Method, number>> = {};
  private readonly handlers = new Set<Handler>();
  private readonly watchers = new Set<{ state: WatchState; extra?: unknown }>();

  constructor(private readonly startTokens = 700) {}

  private maybeFail(method: Method): void {
    this.calls.push(method);
    const n = this.failNext[method] ?? 0;
    if (n > 0) {
      this.failNext[method] = n - 1;
      // What fetch throws when the network is down: not a CasinoError.
      throw new TypeError('fetch failed (simulated)');
    }
  }

  private player(key: string): Player {
    const micro = this.wallets.get(key) ?? 0;
    return { id: Number(key.replace(/\D/g, '')) || 1, username: key.replace(/^player-/, ''), tokens_micro: micro, tokens_value_cents: microToCents(micro), bankruptcies: 0 };
  }

  private move(key: string, micro: number): Player {
    this.wallets.set(key, (this.wallets.get(key) ?? 0) + micro);
    const player = this.player(key);
    for (const [session, owner] of this.sessions) if (owner === key) this.emit('balance', { session, player });
    return player;
  }

  /** A top-up (or another game) changes the wallet; the casino streams a `balance` event. */
  topUp(key: string, micro: number): Player {
    return this.move(key, micro);
  }

  private emit(type: string, data: unknown): void {
    for (const h of this.handlers) h(type, data);
  }

  /** Switches the control state like the admin page does. */
  setState(patch: { status?: GameStatus; reason?: string; settings?: Record<string, unknown>; limitsCents?: { min: number; max: number; maxWin: number } }): void {
    const c = this.control_;
    if (patch.status) {
      c.status = patch.status;
      c.demo = patch.status === 'demo';
    }
    if (patch.limitsCents) {
      const { min, max, maxWin } = patch.limitsCents;
      c.limits = { min_bet_cents: min, max_bet_cents: max, max_win_cents: maxWin, min_bet_micro: centsToMicro(min), max_bet_micro: centsToMicro(max), max_win_micro: centsToMicro(maxWin), sessions_per_player: c.limits.sessions_per_player };
    }
    if (patch.reason !== undefined) c.status_reason = patch.reason || null;
    if (patch.settings) c.settings = patch.settings;
    if (c.status === 'closed') {
      this.refundOpenRounds('halt');
      this.sessions.clear();
    }
    this.publish();
  }

  /** What the casino does after a silence or a halt: refund every open round. */
  refundOpenRounds(by: 'offline' | 'halt' = 'offline'): void {
    for (const r of this.rounds.values()) {
      if (r.round.status !== 'open') continue;
      r.round.status = 'void';
      r.round.void_by = by;
      this.move(r.player, r.round.bet_micro);
    }
  }

  private publish(): void {
    const c = { ...this.control_, server_time: Date.now() };
    for (const w of this.watchers) apply(w.state, c);
    this.emit('control', c);
  }

  async openSession(token: string) {
    this.maybeFail('openSession');
    if (!token) throw new CasinoError('bad token', 401, { error: 'bad token' });
    if (this.control_.status !== 'open' && this.control_.status !== 'demo') throw new CasinoError('not open', 409, { error: 'not open', game_status: this.control_.status });
    const key = `player-${token}`;
    const held = [...this.sessions.values()].filter((owner) => owner === key).length;
    if (held >= this.seatLimit) throw new CasinoError('too many sessions', 409, { error: 'too many sessions', sessions: held });
    if (!this.wallets.has(key)) this.wallets.set(key, this.startTokens * 1e6);
    const session = randomUUID();
    this.sessions.set(session, key);
    return { session, table: null, player: this.player(key), expires_ts: Date.now() + 12 * 3600_000 };
  }

  async session(id: string) {
    const key = this.sessions.get(id);
    if (!key) throw new CasinoError('bad session', 401, { error: 'bad session' });
    return { session: id, table: null, player: this.player(key), expires_ts: Date.now() + 12 * 3600_000 };
  }

  async closeSession(id: string) {
    return { closed: this.sessions.delete(id) ? 1 : 0 };
  }

  async openRound(a: Parameters<Casino['openRound']>[0]): Promise<Round> {
    this.maybeFail('openRound');
    const key = this.sessions.get(a.session);
    if (!key) throw new CasinoError('bad session', 401, { error: 'bad session' });
    if (this.control_.status !== 'open' && this.control_.status !== 'demo') throw new CasinoError('not open', 409, { error: 'not open', game_status: this.control_.status });
    const cents = a.betCents ?? 0;
    const { min_bet_cents, max_bet_cents } = this.control_.limits;
    if (!Number.isInteger(cents) || cents < min_bet_cents || cents > max_bet_cents) throw new CasinoError('bet outside limits', 400, { error: 'bet outside limits' });
    const existing = this.rounds.get(a.round);
    if (existing) {
      if (existing.round.bet_cents !== cents || existing.session !== a.session) throw new CasinoError('round id reused', 409, { error: 'round id reused' });
      return { ...existing.round, replay: true };
    }
    const micro = centsToMicro(cents);
    if ((this.wallets.get(key) ?? 0) < micro) {
      throw new CasinoError('cannot afford', 402, { error: 'cannot afford', balance: this.wallets.get(key) ?? 0 });
    }
    const round: Round = {
      round: a.round, status: 'open', bet_cents: cents, bet_micro: micro, win_cents: 0, win_micro: 0, rate_micro: RATE_MICRO,
      outcome: null, table: null, hand: a.hand ?? null, opened_ts: Date.now(), settled_ts: null, void_by: null,
    };
    this.rounds.set(a.round, { round, player: key, session: a.session });
    return { ...round, player: this.move(key, -micro) };
  }

  async settle(a: Parameters<Casino['settle']>[0]): Promise<Round> {
    this.maybeFail('settle');
    const r = this.rounds.get(a.round);
    if (!r) throw new CasinoError('unknown round', 409, { error: 'unknown round' });
    const win = a.winCents ?? 0;
    if (win > this.control_.limits.max_win_cents) throw new CasinoError('win above limit', 400, { error: 'win above limit' });
    if (r.round.status === 'settled') {
      if (r.round.win_cents !== win) throw new CasinoError('settled with a different win', 409, { error: 'settled with a different win' });
      return { ...r.round, replay: true };
    }
    if (r.round.status === 'void') {
      // Refunded while the game was away: a win of at least the stake is still paid (the difference on top of the refund).
      if (r.round.void_by !== 'offline' || win < r.round.bet_cents) {
        throw new CasinoError('round refunded', 409, { error: 'round refunded', refunded: true });
      }
      Object.assign(r.round, { status: 'settled', win_cents: win, win_micro: centsToMicro(win), outcome: a.outcome ?? null, settled_ts: Date.now() });
      return { ...r.round, late: true, player: this.move(r.player, centsToMicro(win) - r.round.bet_micro) };
    }
    Object.assign(r.round, { status: 'settled', win_cents: win, win_micro: centsToMicro(win), outcome: a.outcome ?? null, settled_ts: Date.now() });
    return { ...r.round, player: this.move(r.player, centsToMicro(win)) };
  }

  async voidRound(a: { round: string; reason?: string }): Promise<Round> {
    this.maybeFail('voidRound');
    const r = this.rounds.get(a.round);
    if (!r) throw new CasinoError('unknown round', 409, { error: 'unknown round' });
    if (r.round.status === 'void') return { ...r.round, replay: true };
    if (r.round.status === 'settled') throw new CasinoError('already settled', 409, { error: 'already settled' });
    Object.assign(r.round, { status: 'void', void_by: 'game' });
    return { ...r.round, player: this.move(r.player, r.round.bet_micro) };
  }

  async table(): Promise<never> {
    throw new CasinoError('Lowrider is single-player', 400, { error: 'not multiplayer' });
  }

  async heartbeat(a?: { version?: string; players?: number; sessions?: string[] }) {
    this.maybeFail('heartbeat');
    this.heartbeats.push({ version: a?.version, players: a?.players, ...(a?.sessions ? { sessions: a.sessions } : {}) });
    return { ...this.control_, server_time: Date.now() };
  }

  async control() {
    this.maybeFail('control');
    return { ...this.control_, server_time: Date.now() };
  }

  async score(a: { session: string; score: number }) {
    this.scores.push({ session: a.session, score: a.score });
    return { id: this.scores.length, score: a.score };
  }

  events(handler: Handler): () => void {
    this.handlers.add(handler);
    queueMicrotask(() => handler('hello', { ...this.control_ }));
    return () => this.handlers.delete(handler);
  }

  /** Like the SDK's watch(): keeps `state` current and hands other events to onEvent. No timers. */
  watch(state: WatchState, extra?: unknown, onEvent?: Handler): () => void {
    const w = { state, extra };
    this.watchers.add(w);
    apply(state, this.control_);
    type Extra = { version?: string; players?: number; sessions?: string[] };
    const extraValue = typeof extra === 'function' ? (extra as () => Extra)() : (extra as Extra | undefined);
    void this.heartbeat(extraValue).catch(() => undefined);
    const forward: Handler = (type, data) => {
      if (type !== 'control' && type !== 'hello') onEvent?.(type, data);
    };
    this.handlers.add(forward);
    return () => {
      this.watchers.delete(w);
      this.handlers.delete(forward);
    };
  }

  /** Tests: a casino that stops answering, as the SDK sees it after 90 s. */
  goOffline(state: WatchState): void {
    state.link = 'down';
    state.status = 'offline';
  }
}

function apply(state: WatchState, c: Control): void {
  state.status = c.status;
  state.demo = !!c.demo;
  state.settings = c.settings || {};
  state.limits = c.limits || state.limits;
  state.rtp_bps = c.rtp_bps;
  state.updated = Date.now();
  state.link = 'up';
  state.link_ts = Date.now();
}
