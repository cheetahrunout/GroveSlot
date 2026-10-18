import { randomBytes, randomUUID } from 'node:crypto';
import { GAMBLE } from '@lowrider/shared/config/features';
import { PAYLINES } from '@lowrider/shared/config/paylines';
import { canGamble, playGamble, type Alley } from '@lowrider/shared/engine/features/gamble';
import type { Rng } from '@lowrider/shared/engine/rng';
import { playRound, type FeatureKey, type RoundResult } from '@lowrider/shared/engine/round';
import type { Balance, Limits, PublicState } from '@lowrider/shared/api';
import { CasinoError, DEFAULT_LIMITS, type Casino, type ControlState } from './casino';
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
  busy: boolean;
  gamble: GambleOffer | null;
  balance: Balance | null;
}


type Log = (event: string, fields?: Record<string, unknown>) => void;

/**
 * Runs Lowrider for the casino: sessions, control state, rounds and the
 * Car Chase gamble. All money moves through `casino`; this class only
 * remembers game state (Wanted stars, the open gamble offer).
 */
export class LowriderGame {
  private control: ControlState = {
    status: 'maintenance',
    reason: 'Starting up',
    settings: {},
    limits: { ...DEFAULT_LIMITS },
    rtpBps: null,
  };
  private readonly sessions = new Map<string, PlayerSession>();
  private readonly listeners = new Set<(c: ControlState) => void>();

  constructor(
    private readonly casino: Casino,
    private readonly rng: Rng,
    /** Round references and Wanted stars (game state only), for restarts. */
    private readonly journal: Journal,
    private readonly log: Log = () => {},
    /** Local development with the stand-in casino: allows forcing bonuses. */
    private readonly devMode = false,
  ) {}

  // --- control state -------------------------------------------------------

  get controlState(): ControlState {
    return this.control;
  }

  onControl(listener: (c: ControlState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  applyControl(next: ControlState): void {
    const before = this.control.status;
    this.control = next;
    if (next.status !== before) this.log('control', { status: next.status });
    if (next.status === 'halted' || next.status === 'maintenance') {
      // The casino has refunded open rounds and closed every session.
      this.sessions.clear();
    }
    if (next.status !== 'live') for (const s of this.sessions.values()) s.gamble = null;
    for (const l of this.listeners) l(next);
  }

  private get gambleEnabled(): boolean {
    return this.control.settings.gamble_enabled !== false;
  }

  activePlayers(now = Date.now()): number {
    let n = 0;
    for (const s of this.sessions.values()) if (now - s.lastSeen < ACTIVE_MS) n++;
    return n;
  }

  // --- sessions ------------------------------------------------------------

  async openSession(token: string): Promise<PlayerSession> {
    if (this.control.status !== 'live') {
      throw new GameError(409, this.control.status, this.control.reason || 'Lowrider is closed right now.');
    }
    let opened;
    try {
      opened = await this.casino.openSession(token);
    } catch (e) {
      if (e instanceof CasinoError && e.status === 401) {
        throw new GameError(401, 'bad_token', 'This link has expired. Open Lowrider again from the casino lobby.');
      }
      throw e;
    }
    const s: PlayerSession = {
      id: randomBytes(24).toString('hex'),
      casinoSession: opened.session,
      player: opened.player,
      lastSeen: Date.now(),
      busy: false,
      gamble: null,
      balance: opened.balance,
    };
    this.sessions.set(s.id, s);
    this.log('session_open');
    return s;
  }

  getSession(id: string | undefined, now = Date.now()): PlayerSession | null {
    if (!id) return null;
    const s = this.sessions.get(id);
    if (!s) return null;
    if (now - s.lastSeen > SESSION_IDLE_MS) {
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
      status: this.control.status,
      reason: this.control.reason,
      betOptions: betOptions(this.control.limits),
      limits: this.control.limits,
      gambleEnabled: this.gambleEnabled,
      player: s ? { name: s.player.name } : null,
      balance: s?.balance ?? null,
      wantedStars: s ? this.journal.loadState(s.player.id).wanted.stars : 0,
      gamble: s?.gamble ? { stake: s.gamble.stake } : null,
    };
  }

  // --- rounds --------------------------------------------------------------

  private requireLive(): void {
    const { status, reason } = this.control;
    if (status === 'live') return;
    const message =
      status === 'last_bets'
        ? 'Last bets have been called: no new spins right now.'
        : reason || (status === 'maintenance' ? 'Lowrider is closed for planned work.' : 'Lowrider is paused.');
    throw new GameError(409, status, message);
  }

  /** Retries network trouble with the same round id: the casino treats repeats as replays. */
  private async retry<T>(task: () => Promise<T>, tries = 4): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await task();
      } catch (e) {
        if (!(e instanceof CasinoError) || !e.retryable || attempt >= tries) throw e;
        await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1)));
      }
    }
  }

  private refusal(e: unknown, s: PlayerSession): never {
    if (e instanceof CasinoError) {
      if (e.status === 402) {
        const raw = e.body;
        const balance =
          typeof raw.balance_cents === 'number'
            ? ({ value: raw.balance_cents, unit: 'cents' } as const)
            : typeof raw.balance === 'number'
              ? ({ value: raw.balance, unit: 'tokens' } as const)
              : null;
        if (balance) s.balance = balance;
        throw new GameError(402, 'cannot_afford', 'Your balance does not cover this bet.', balance);
      }
      if (e.status === 401) {
        this.sessions.delete(s.id);
        throw new GameError(401, 'session_closed', 'Your session has ended. Open Lowrider again from the casino lobby.');
      }
      if (e.status === 409) {
        throw new GameError(409, String(e.body.game_status ?? 'refused'), this.control.reason || 'The casino refused this round.');
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
    const round = randomUUID();
    const kind = String(meta.type);
    // Written before the casino is asked, so a crash at any point leaves a trace to clean up.
    this.journal.setRound(round, kind, 'opening');
    try {
      await this.retry(() => this.casino.openRound({ session: s.casinoSession, round, betCents, meta }));
      this.journal.setRound(round, kind, 'open');
    } catch (e) {
      if (e instanceof CasinoError && !e.retryable) {
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
      const balance = await this.retry(() =>
        this.casino.settle({ round, winCents: decided.winCents, outcome: decided.outcome, meta }),
      );
      this.journal.setRound(round, kind, 'settled');
      s.balance = balance ?? s.balance;
      this.log('round', { kind, bet: betCents, win: decided.winCents, outcome: decided.outcome });
      return { value: decided.value, balance: s.balance };
    } catch (e) {
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
      await this.retry(() => this.casino.voidRound(round, reason));
      this.journal.setRound(round, kind, 'voided');
      return true;
    } catch (e) {
      if (e instanceof CasinoError && !e.retryable) {
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
    if (!betOptions(this.control.limits).includes(totalBetCents)) {
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
          maxWin: this.control.limits.maxWinCents,
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
        this.casino.score(s.casinoSession, result.totalWin, { multiplier, bet_cents: totalBetCents }).catch((e) =>
          this.log('score_failed', { error: (e as Error).message }),
        );
      }
      return { result, state: this.publicState(s) };
    } finally {
      s.busy = false;
    }
  }

  private stakeAllowed(stake: number): boolean {
    const { minBetCents, maxBetCents } = this.control.limits;
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
