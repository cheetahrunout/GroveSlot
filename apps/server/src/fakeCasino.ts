import { randomUUID } from 'node:crypto';
import { CasinoError, DEFAULT_LIMITS, type Balance, type Casino, type ControlState, type OpenedSession } from './casino';

/**
 * An in-memory stand-in for the casino, for local play and tests only. It
 * keeps play-money balances the way the real casino does (the game server
 * itself never does) and follows the same rules: idempotent rounds, limits
 * and control states.
 */
export class FakeCasino implements Casino {
  readonly balances = new Map<string, number>();
  readonly rounds = new Map<string, { player: string; session: string; bet: number; win: number | null; voided: boolean }>();
  readonly sessions = new Map<string, string>();
  readonly scores: { session: string; score: number }[] = [];
  readonly calls: string[] = [];
  state: ControlState = { status: 'live', reason: '', settings: {}, limits: { ...DEFAULT_LIMITS }, rtpBps: 9600 };
  /** Tests: make the next N calls of a method fail like a network error. */
  failNext: Partial<Record<keyof Casino, number>> = {};
  private listeners = new Set<(c: ControlState) => void>();

  constructor(private readonly startBalanceCents = 100_000) {}

  private maybeFail(method: keyof Casino): void {
    const n = this.failNext[method] ?? 0;
    if (n > 0) {
      this.failNext[method] = n - 1;
      throw new CasinoError(0, { error: 'network: simulated' });
    }
  }

  private balance(player: string): Balance {
    return { value: this.balances.get(player) ?? 0, unit: 'cents' };
  }

  setState(patch: Partial<ControlState>): void {
    this.state = { ...this.state, ...patch };
    if (this.state.status === 'halted' || this.state.status === 'maintenance') {
      for (const [id, r] of this.rounds) {
        if (r.win === null && !r.voided) void this.voidRound(id, 'halted');
      }
      this.sessions.clear();
    }
    for (const l of this.listeners) l(this.state);
  }

  async openSession(token: string): Promise<OpenedSession> {
    this.calls.push('openSession');
    if (!token) throw new CasinoError(401, { error: 'bad token' });
    const player = `player-${token}`;
    if (!this.balances.has(player)) this.balances.set(player, this.startBalanceCents);
    const session = randomUUID();
    this.sessions.set(session, player);
    return { session, player: { id: player, name: token.toUpperCase() }, table: null, balance: this.balance(player) };
  }

  async openRound(a: { session: string; round: string; betCents: number }) {
    this.calls.push('openRound');
    this.maybeFail('openRound');
    const player = this.sessions.get(a.session);
    if (!player) throw new CasinoError(401, { error: 'bad session' });
    if (this.state.status !== 'live') throw new CasinoError(409, { error: 'not live', game_status: this.state.status });
    const { minBetCents, maxBetCents } = this.state.limits;
    if (a.betCents < minBetCents || a.betCents > maxBetCents) throw new CasinoError(400, { error: 'bet outside limits' });
    const existing = this.rounds.get(a.round);
    if (existing) {
      if (existing.bet !== a.betCents || existing.session !== a.session) throw new CasinoError(409, { error: 'round id reused' });
      return this.balance(player);
    }
    const bal = this.balances.get(player) ?? 0;
    if (bal < a.betCents) throw new CasinoError(402, { error: 'cannot afford', balance_cents: bal });
    this.balances.set(player, bal - a.betCents);
    this.rounds.set(a.round, { player, session: a.session, bet: a.betCents, win: null, voided: false });
    return this.balance(player);
  }

  async settle(a: { round: string; winCents: number }) {
    this.calls.push('settle');
    this.maybeFail('settle');
    const r = this.rounds.get(a.round);
    if (!r || r.voided) throw new CasinoError(409, { error: 'unknown or voided round' });
    const player = r.player;
    if (r.win !== null) {
      if (r.win !== a.winCents) throw new CasinoError(409, { error: 'settled with a different win' });
      return this.balance(player);
    }
    if (a.winCents > this.state.limits.maxWinCents) throw new CasinoError(400, { error: 'win above limit' });
    r.win = a.winCents;
    this.balances.set(player, (this.balances.get(player) ?? 0) + a.winCents);
    return this.balance(player);
  }

  async voidRound(round: string, _reason?: string) {
    this.calls.push('voidRound');
    const r = this.rounds.get(round);
    if (!r || r.voided) return;
    if (r.win !== null) throw new CasinoError(409, { error: 'already settled' });
    r.voided = true;
    this.balances.set(r.player, (this.balances.get(r.player) ?? 0) + r.bet);
  }

  async heartbeat() {
    this.calls.push('heartbeat');
    return this.state;
  }

  async control() {
    return this.state;
  }

  events(onControl: (c: ControlState) => void): () => void {
    this.listeners.add(onControl);
    return () => this.listeners.delete(onControl);
  }

  async score(session: string, score: number) {
    this.scores.push({ session, score });
  }

  async closeSession(session: string) {
    this.sessions.delete(session);
  }
}
