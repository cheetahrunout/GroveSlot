import { randomBytes } from 'node:crypto';
import { GAMBLE } from '@lowrider/shared/config/features';
import { PAYLINES } from '@lowrider/shared/config/paylines';
import { canGamble, playGamble, type Alley } from '@lowrider/shared/engine/features/gamble';
import type { Rng } from '@lowrider/shared/engine/rng';
import { playRound, type FeatureKey, type RoundResult } from '@lowrider/shared/engine/round';
import { isPlayable, type Balance, type GameStatus, type Limits, type PublicState } from '@lowrider/shared/api';
import { CasinoError, errorData, retryable, rng as casinoRng, toBalance, toLimits, type Casino, type Player, type WatchState } from './casino';
import type { Journal } from './journal';

/** Total bets offered (euro cents), filtered by the casino's current limits. */
export const BET_LADDER_CENTS = [20, 40, 100, 200, 500, 1000, 2000] as const;

export function betOptions(limits: Limits): number[] {
  return BET_LADDER_CENTS.filter((b) => b >= limits.minBetCents && b <= limits.maxBetCents);
}

/** Wins of at least this × bet are sent to the casino leaderboard. */
const SCORE_MIN_MULTIPLIER = 10;
/** The casino closes idle sessions after 12 hours; so do we. */
const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;
/** Players seen within this window count towards the heartbeat. */
const ACTIVE_MS = 5 * 60 * 1000;
/** How often the status reason and the token rate are re-read from the casino. */
const CONTROL_REFRESH_MS = 5 * 60 * 1000;

/** What the page needs to know about the control state. */
export interface ControlView {
  status: GameStatus;
  demo: boolean;
  reason: string;
  limits: Limits;
  settings: Record<string, unknown>;
}

/** A refusal or failure to show the player. */
export class GameError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly balance: Balance | null = null,
  ) {
    super(message);
  }
}

interface GambleOffer {
  original: number;
  stake: number;
  rounds: number;
}

export interface PlayerSession {
  /** Our own id, the browser's cookie. Never the casino session. */
  id: string;
  casinoSession: string;
  player: { id: string; name: string };
  lastSeen: number;
  expiresAt: number;
  busy: boolean;
  gamble: GambleOffer | null;
  balance: Balance | null;
}

type BalanceListener = (sessionId: string, balance: Balance) => void;


type Log = (event: string, fields?: Record<string, unknown>) => void;

/**
 * Runs Lowrider for the casino: sessions, control state, rounds and the
 * Car Chase gamble. All money moves through `casino`; this class only
 * remembers game state (Wanted stars, the open gamble offer).
 */
export class LowriderGame {
  private readonly sessions = new Map<string, PlayerSession>();
  private readonly listeners = new Set<(c: ControlView) => void>();
  private readonly balanceListeners = new Set<BalanceListener>();
  private view: ControlView;
  private reason = '';
  private rateMicro: number | null = null;
  private controlReadAt = 0;
  private stopping = false;

  constructor(
    private readonly casino: Casino,
    /** Kept current by casino.watch(): status (or 'offline'), settings and limits. */
    private readonly state: WatchState,
    private readonly rng: Rng,
    /** Round references and Wanted stars (game state only), for restarts. */
    private readonly journal: Journal,
    private readonly log: Log = () => {},
    /** Local development with the stand-in casino: allows forcing bonuses. */
    private readonly devMode = false,
  ) {
    this.view = this.readView();
  }

  // --- control state -------------------------------------------------------

  private readView(): ControlView {
    const status = this.state.status;
    const reason = status === 'offline' ? 'The casino is not answering. Spins are paused until it is back.' : status === 'open' ? '' : this.reason;
    const demo = status === 'demo' || (isPlayable(status) && this.state.demo === true);
    return { status, demo, reason, limits: toLimits(this.state.limits), settings: this.state.settings ?? {} };
  }

  get controlState(): ControlView {
    return this.view;
  }

  onControl(listener: (c: ControlView) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onBalance(listener: BalanceListener): () => void {
    this.balanceListeners.add(listener);
    return () => this.balanceListeners.delete(listener);
  }

  /**
   * Picks up what casino.watch() changed in the shared state (the stream,
   * heartbeat answers, or 'offline' after 90 s of silence) and acts on it at once.
   */
  syncControl(): void {
    const next = this.readView();
    const before = this.view;
    if (JSON.stringify(next) === JSON.stringify(before)) return;
    this.view = next;
    if (next.status !== before.status) {
      this.log('control', { status: next.status });
      if (next.status !== 'open' && next.status !== 'offline') void this.refreshControl(true);
    }
    if (next.status === 'closed') {
      // The casino has refunded open rounds and closed every session.
      this.sessions.clear();
    }
    if (!isPlayable(next.status)) for (const s of this.sessions.values()) s.gamble = null;
    for (const l of this.listeners) l(next);
  }

  /** Reads the reason players see and the token rate (the SDK's watch state keeps neither). */
  async refreshControl(force = false, now = Date.now()): Promise<void> {
    if (!force && now - this.controlReadAt < CONTROL_REFRESH_MS) return;
    this.controlReadAt = now;
    try {
      const c = await this.casino.control();
      this.reason = c.status_reason ?? '';
      if (c.rate_micro && c.rate_micro !== this.rateMicro) {
        this.rateMicro = c.rate_micro;
        // The euro value of a token balance moves with the rate.
        for (const s of this.sessions.values()) {
          if (!s.balance) continue;
          s.balance = { ...s.balance, valueCents: Math.floor((s.balance.tokensMicro * c.rate_micro) / 1e10) };
          this.emitBalance(s);
        }
      }
      const reasonChanged = this.readView().reason !== this.view.reason;
      if (reasonChanged) {
        this.view = this.readView();
        for (const l of this.listeners) l(this.view);
      }
    } catch (e) {
      this.log('control_failed', { error: (e as Error).message });
    }
  }

  /** A `balance` event from the casino's stream: a round, a top-up or another game moved the player's tokens. */
  onCasinoEvent(type: string, data: unknown): void {
    if (type !== 'balance' || !data || typeof data !== 'object') return;
    const { session, player } = data as { session?: string; player?: Player };
    if (!session || !player) return;
    for (const s of this.sessions.values()) {
      if (s.casinoSession !== session) continue;
      s.balance = toBalance(player);
      this.emitBalance(s);
    }
  }

  private emitBalance(s: PlayerSession): void {
    if (!s.balance) return;
    for (const l of this.balanceListeners) l(s.id, s.balance);
  }

  private setPlayer(s: PlayerSession, player: Player | undefined): void {
    if (!player) return;
    s.balance = toBalance(player);
    this.emitBalance(s);
  }

  private get gambleEnabled(): boolean {
    return this.view.settings.gamble_enabled !== false;
  }

  activePlayers(now = Date.now()): number {
    let n = 0;
    for (const s of this.sessions.values()) if (now - s.lastSeen < ACTIVE_MS) n++;
    return n;
  }

  /** SIGTERM: refuse new rounds, then wait for the ones in flight to settle or void. */
  async drain(timeoutMs = 20_000): Promise<void> {
    this.stopping = true;
    const until = Date.now() + timeoutMs;
    while ([...this.sessions.values()].some((s) => s.busy) && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  // --- sessions ------------------------------------------------------------

  async openSession(token: string): Promise<PlayerSession> {
    if (!isPlayable(this.view.status)) {
      throw new GameError(409, this.view.status, this.view.reason || 'Lowrider is closed right now.');
    }
    let opened;
    try {
      opened = await this.casino.openSession(token);
    } catch (e) {
      if (e instanceof CasinoError && e.status === 401) {
        throw new GameError(401, 'session_closed', 'This link has expired. Back to the casino for a fresh one.');
      }
      if (e instanceof CasinoError && e.status === 409) {
        throw new GameError(409, String(errorData(e).game_status ?? 'refused'), 'Lowrider is closed right now.');
      }
      throw e;
    }
    const s: PlayerSession = {
      id: randomBytes(24).toString('hex'),
      casinoSession: opened.session,
      player: { id: String(opened.player.id), name: opened.player.username },
      lastSeen: Date.now(),
      expiresAt: opened.expires_ts > 0 ? opened.expires_ts : Date.now() + SESSION_IDLE_MS,
      busy: false,
      gamble: null,
      balance: toBalance(opened.player),
    };
    this.sessions.set(s.id, s);
    this.log('session_open');
    return s;
  }

  getSession(id: string | undefined, now = Date.now()): PlayerSession | null {
    if (!id) return null;
    const s = this.sessions.get(id);
    if (!s) return null;
    if (now - s.lastSeen > SESSION_IDLE_MS || now > s.expiresAt) {
      this.sessions.delete(id);
      return null;
    }
    s.lastSeen = now;
    return s;
  }

  async closeSession(id: string): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    await this.casino.closeSession(s.casinoSession).catch(() => undefined);
    this.log('session_close');
  }

  publicState(s: PlayerSession | null): PublicState {
    return {
      status: this.view.status,
      demo: this.view.demo,
      reason: this.view.reason,
      betOptions: betOptions(this.view.limits),
      limits: this.view.limits,
      gambleEnabled: this.gambleEnabled,
      player: s ? { name: s.player.name } : null,
      balance: s?.balance ?? null,
      wantedStars: s ? this.journal.loadState(s.player.id).wanted.stars : 0,
      gamble: s?.gamble ? { stake: s.gamble.stake } : null,
    };
  }

  // --- rounds --------------------------------------------------------------

  private requireLive(): void {
    if (this.stopping) throw new GameError(503, 'restarting', 'Lowrider is restarting. Try again in a moment.');
    const { status, reason } = this.view;
    if (isPlayable(status)) return;
    const message =
      reason ||
      (status === 'maintenance'
        ? 'Lowrider is in maintenance: no new spins right now.'
        : status === 'offline'
          ? 'The casino is not answering. Spins are paused until it is back.'
          : 'Lowrider is closed right now.');
    throw new GameError(409, status, message);
  }

  /** Retries network trouble with the same round id: the casino treats repeats as replays. */
  private async retry<T>(task: () => Promise<T>, tries = 4): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await task();
      } catch (e) {
        if (!retryable(e) || attempt >= tries) throw e;
        await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
      }
    }
  }

  private refusal(e: unknown, s: PlayerSession): never {
    if (e instanceof CasinoError) {
      const data = errorData(e);
      if (e.status === 402) {
        if (typeof data.balance === 'number' && s.balance) {
          const micro = data.balance;
          s.balance = { tokensMicro: micro, valueCents: this.rateMicro ? Math.floor((micro * this.rateMicro) / 1e10) : s.balance.valueCents };
        }
        throw new GameError(402, 'cannot_afford', 'Your balance does not cover this bet. Top up from the casino bar.', s.balance);
      }
      if (e.status === 401) {
        this.sessions.delete(s.id);
        throw new GameError(401, 'session_closed', 'Your casino session has ended. Back to the casino to carry on.');
      }
      if (e.status === 409) {
        throw new GameError(409, String(data.game_status ?? 'refused'), this.view.reason || 'The casino refused this round.');
      }
      if (e.status === 503) throw new GameError(503, 'maintenance', 'The casino is in maintenance.');
      if (e.status === 400) throw new GameError(400, 'bad_bet', 'That bet is outside the table limits.');
    }
    throw new GameError(502, 'casino_unreachable', 'The casino could not be reached. Your balance is unchanged.');
  }

  /**
   * One paid round: open (debit), decide with the CSPRNG, settle (credit).
   * The result is only returned once the casino confirmed the settle.
   */
  private async playPaidRound<T>(
    s: PlayerSession,
    betCents: number,
    meta: Record<string, unknown>,
    decide: () => { winCents: number; outcome: string; value: T },
  ): Promise<{ value: T; balance: Balance | null }> {
    const round = casinoRng.id();
    const kind = String(meta.type);
    // Written before the casino is asked, so a crash at any point leaves a trace to clean up.
    this.journal.setRound(round, kind, 'opening');
    try {
      const opened = await this.retry(() => this.casino.openRound({ session: s.casinoSession, round, betCents, meta }));
      this.journal.setRound(round, kind, 'open');
      this.setPlayer(s, opened.player);
    } catch (e) {
      if (!retryable(e)) {
        this.journal.setRound(round, kind, 'refused');
        this.refusal(e, s);
      }
      // No answer: the bet may or may not have been taken. Void to be sure; a void refunds it.
      await this.voidAndRecord(round, kind, 'open_unconfirmed');
      throw new GameError(502, 'casino_unreachable', 'The casino could not be reached. If the bet was taken, it is refunded.');
    }

    let decided: { winCents: number; outcome: string; value: T };
    try {
      decided = decide();
    } catch (e) {
      this.log('round_error', { error: (e as Error).message });
      await this.voidAndRecord(round, kind, 'game_error');
      throw new GameError(500, 'round_voided', 'Something went wrong; the round was voided and your bet refunded.');
    }

    try {
      const settled = await this.retry(() =>
        this.casino.settle({ round, winCents: decided.winCents, outcome: decided.outcome, meta }),
      );
      this.journal.setRound(round, kind, 'settled');
      this.setPlayer(s, settled.player);
      this.log('round', { kind, bet: betCents, win: decided.winCents, outcome: decided.outcome, ...(settled.late ? { late: true } : {}) });
      return { value: decided.value, balance: s.balance };
    } catch (e) {
      if (e instanceof CasinoError && e.status === 409 && errorData(e).refunded) {
        // The casino gave the stake back while it could not hear us; a loss stays a refund.
        this.journal.setRound(round, kind, 'refunded');
        this.log('round_refunded', { kind, bet: betCents });
        await this.casino.session(s.casinoSession).then((r) => this.setPlayer(s, r.player)).catch(() => undefined);
        throw new GameError(409, 'refunded', 'The casino gave your stake back while Lowrider was offline. This spin does not count.', s.balance);
      }
      this.log('settle_failed', { error: (e as Error).message });
      // The win was never confirmed: refund the bet instead and say so.
      const voided = await this.voidAndRecord(round, kind, 'settle_failed');
      throw new GameError(
        502,
        voided ? 'round_voided' : 'round_pending',
        voided
          ? 'The casino could not confirm this round, so it was voided and your bet refunded.'
          : 'The casino could not confirm this round. It will be settled or refunded by the casino.',
      );
    }
  }

  /** Voids a round; on success the journal marks it done, otherwise it stays for reconcile(). */
  private async voidAndRecord(round: string, kind: string, reason: string): Promise<boolean> {
    try {
      await this.retry(() => this.casino.voidRound({ round, reason }));
      this.journal.setRound(round, kind, 'voided');
      return true;
    } catch (e) {
      if (!retryable(e)) {
        // The casino knows this round as finished (settled, voided or never opened).
        this.journal.setRound(round, kind, 'closed_by_casino');
        return false;
      }
      this.log('void_failed', { reason, error: (e as Error).message });
      return false;
    }
  }

  /**
   * After a restart (and on every heartbeat): void the rounds this server
   * opened but never finished. The player saw no result for them, so a
   * refund is the only safe ending; the casino also voids them after 6 h.
   */
  async reconcile(): Promise<number> {
    let cleaned = 0;
    for (const { id, kind } of this.journal.unfinishedRounds()) {
      if (await this.voidAndRecord(id, kind, 'restart')) cleaned++;
    }
    if (cleaned > 0) this.log('reconciled', { rounds: cleaned });
    return cleaned;
  }

  async spin(s: PlayerSession, totalBetCents: number, force?: FeatureKey | 'driveBy'): Promise<{ result: RoundResult; state: PublicState }> {
    this.requireLive();
    if (!betOptions(this.view.limits).includes(totalBetCents)) {
      throw new GameError(400, 'bad_bet', 'That bet is outside the table limits.');
    }
    if (s.busy) throw new GameError(409, 'busy', 'A spin is already running.');
    s.busy = true;
    s.gamble = null;
    try {
      const lineBet = totalBetCents / PAYLINES.length;
      const before = this.journal.loadState(s.player.id);
      let after = before;
      const { value: result } = await this.playPaidRound(s, totalBetCents, { type: 'spin' }, () => {
        const played = playRound(this.rng, before, lineBet, {
          maxWin: this.view.limits.maxWinCents,
          force: this.devMode ? force : undefined,
        });
        after = played.state;
        const r = played.result;
        const outcome = Object.keys(r.features).join('+') || (r.totalWin > 0 ? 'win' : 'loss');
        return { winCents: r.totalWin, outcome, value: r };
      });
      this.journal.saveState(s.player.id, after);

      if (result.totalWin > 0 && this.gambleEnabled && this.stakeAllowed(result.totalWin)) {
        s.gamble = { original: result.totalWin, stake: result.totalWin, rounds: 0 };
      }
      if (result.totalWin >= SCORE_MIN_MULTIPLIER * totalBetCents) {
        const multiplier = Math.round((result.totalWin / totalBetCents) * 10) / 10;
        this.casino.score({ session: s.casinoSession, score: result.totalWin, meta: { multiplier, bet_cents: totalBetCents } }).catch((e) =>
          this.log('score_failed', { error: (e as Error).message }),
        );
      }
      return { result, state: this.publicState(s) };
    } finally {
      s.busy = false;
    }
  }

  private stakeAllowed(stake: number): boolean {
    const { minBetCents, maxBetCents } = this.view.limits;
    return stake >= minBetCents && stake <= maxBetCents;
  }

  /** Car Chase: stake the offered win on an alley. Each pick is its own casino round. */
  async gamble(s: PlayerSession, pick: Alley): Promise<{ escape: Alley; won: boolean; stake: number; canContinue: boolean; state: PublicState }> {
    this.requireLive();
    if (!this.gambleEnabled) throw new GameError(409, 'gamble_off', 'The Car Chase is switched off.');
    const offer = s.gamble;
    if (!offer) throw new GameError(409, 'no_offer', 'There is no win to gamble.');
    if (s.busy) throw new GameError(409, 'busy', 'A round is already running.');
    s.busy = true;
    try {
      const { value } = await this.playPaidRound(s, offer.stake, { type: 'car_chase', pick, step: offer.rounds + 1 }, () => {
        const g = playGamble(this.rng, pick, offer.stake);
        return { winCents: g.stake, outcome: g.won ? 'escaped' : 'busted', value: g };
      });
      const rounds = offer.rounds + 1;
      const canContinue =
        value.won && canGamble(offer.original, value.stake, rounds) && this.stakeAllowed(value.stake) && rounds < GAMBLE.maxRounds;
      s.gamble = canContinue ? { original: offer.original, stake: value.stake, rounds } : null;
      return { ...value, canContinue, state: this.publicState(s) };
    } finally {
      s.busy = false;
    }
  }

  collect(s: PlayerSession): PublicState {
    s.gamble = null;
    return this.publicState(s);
  }
}

/**
 * The state object casino.watch() keeps current (status, settings, limits).
 * The game is told the moment anything changes, so `closed` or `maintenance`
 * applies at once.
 */
export function watchedState(onChange: () => void): WatchState {
  return new Proxy<WatchState>(
    { status: 'closed', settings: {}, limits: null },
    {
      set(target, key, value) {
        Reflect.set(target, key, value);
        queueMicrotask(onChange);
        return true;
      },
    },
  );
}

/** Wires a game to a casino: watch() with heartbeats (version, players) and balance events. */
export function startGame(
  casino: Casino,
  opts: { rng: Rng; journal: Journal; log?: Log; devMode?: boolean; version: string },
): { game: LowriderGame; state: WatchState; stop: () => void } {
  let game: LowriderGame | null = null;
  const state = watchedState(() => game?.syncControl());
  const g = new LowriderGame(casino, state, opts.rng, opts.journal, opts.log, opts.devMode);
  game = g;
  const stop = casino.watch(state, () => ({ version: opts.version, players: g.activePlayers() }), (type, data) => g.onCasinoEvent(type, data));
  return { game: g, state, stop };
}
