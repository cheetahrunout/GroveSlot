// Type declarations for sdk/casino-game.js, the Grove Casino game SDK. Copy both files next to your
// server (TypeScript games: apps/server/src/casino/) and read game-integration.md. The module is CommonJS:
//   import { createCasino, rng } from './casino-game';   // with esModuleInterop
// Field names on the wire are the casino's (snake_case); the SDK's call arguments are camelCase.

/** the casino's four states, plus 'offline': what watch() sets when the casino has not answered a heartbeat for 90 s (refuse new rounds) */
export type GameStatus = 'open' | 'demo' | 'maintenance' | 'closed' | 'offline';
export type RoundStatus = 'open' | 'settled' | 'void';
export type TableStatus = 'open' | 'full' | 'playing' | 'closed';
export type Meta = Record<string, unknown>;

/** the limits the admin set in euro, and the same in micro-tokens at the current rate (null before the first rate tick); a game that bets in tokens scales its credits to the micro figures */
export interface Limits { min_bet_cents: number; max_bet_cents: number; max_win_cents: number; min_bet_micro: number | null; max_bet_micro: number | null; max_win_micro: number | null; /** how many seats one player may hold at this game at once, the admin's number; the casino enforces it at session/open, show it if you like, never cap on your own */ sessions_per_player: number; }

/** what /api/game/control, every heartbeat answer and every 'control' event carry */
export interface Control {
  status: GameStatus;
  /** true in the demo state: play exactly as open and show a DEMO mark; the casino returns every round when it ends */
  demo: boolean;
  status_reason: string | null;
  /** what the manifest declared the game bets and shows in */
  currency: 'euro' | 'tokens';
  /** the game's own credit scale, when the manifest declared one */
  unit: Unit | null;
  /** the current values of the knobs your manifest's settings_schema declares */
  settings: Meta;
  limits: Limits;
  /** micro-euro per token right now: tokens_micro * rate_micro / 1e10 is the value in euro cents */
  rate_micro: number | null;
  rtp_bps: number;
  multiplayer: boolean;
  seats: number | null;
  server_time: number;
}

/** the player as the casino shows them to a game: never the email, never the balances in euro */
export interface Player {
  id: number;
  username: string;
  tokens_micro: number;
  tokens_value_cents: number;
  bankruptcies: number;
}

/** the answer to openSession: keep `session` server-side, never send it to the browser */
export interface Session { session: string; table: string | null; player: Player; expires_ts: number; }

/** a 'balance' event on the control stream: the player's tokens changed (a round, a top-up, the exchange, another game) */
export interface BalanceEvent { session: string; player: Player; }

/** a game's own credit scale from the manifest: how many units make one token */
export interface Unit { name: string; per_token: number; }

export interface Round {
  round: string;
  status: RoundStatus;
  bet_cents: number;
  bet_micro: number;
  win_cents: number;
  win_micro: number;
  /** micro-euro per token at the moment the round opened; the settle uses the same rate */
  rate_micro: number;
  outcome: string | null;
  table: string | null;
  hand: string | null;
  opened_ts: number;
  settled_ts: number | null;
  /** who refunded a void round: the game, the casino after a silence (offline), a halt, or the 6-hour sweep */
  void_by?: 'game' | 'offline' | 'halt' | 'sweep' | null;
  /** true when this call repeated an earlier open, settle or void with the same values */
  replay?: boolean;
  /** true when a win was paid on a round the casino had refunded while the game was offline */
  late?: boolean;
  /** the player's balances after the move (absent on a replay) */
  player?: Player;
}

export interface Table {
  table: string;
  seats_max: number;
  seats_used: number;
  status: TableStatus;
  players: string[];
  meta: Meta | null;
  updated_ts: number;
}

/** a table as the heartbeat reports it (wire names, passed through to the casino unchanged) */
export interface TableReport {
  table: string;
  seats_max?: number;
  seats_used?: number;
  status?: TableStatus;
  players?: string[];
  meta?: Meta;
}

export interface Heartbeat { version?: string; players?: number; /** every casino session the game holds, seated or within its grace period; the list is complete: one left out for GAME_SESSION_GRACE_S (60 s) is closed by the casino */ sessions?: string[]; tables?: TableReport[]; }

/** the object watch() keeps current; read status, settings and limits from it before every round */
export interface WatchState {
  status: GameStatus;
  demo?: boolean;
  settings: Meta;
  limits: Limits | null;
  rtp_bps?: number;
  updated?: number;
  /** 'up' after every good heartbeat or control answer, 'down' after 90 s without one */
  link?: 'up' | 'down';
  link_ts?: number;
}

export class CasinoError extends Error {
  /** the HTTP status the casino answered: 400 bad input, 401 key, token or session, 402 the player cannot afford it, 409 round or control state, 503 maintenance */
  status: number;
  /** the casino's JSON body, when it sent one (402 carries `balance`, 409 carries `game_status`, or `refunded: true` when the casino refunded the round in the meantime) */
  data: unknown;
  constructor(message: string, status: number, data?: unknown);
}

export interface Casino {
  /** exchange the one-time ?gc_token= from the player's first request for a game session */
  openSession(token: string): Promise<Session>;
  session(id: string): Promise<{ session: string; table: string | null; player: Player; expires_ts: number }>;
  closeSession(id: string): Promise<{ closed: number }>;
  /** the bet leaves the player's wallet; `round` is yours and unique for this game (rng.id() is fine). One of betCents (euro, converted at this moment's rate), betMicro (micro-tokens) or betTokens (tokens, decimals): a token bet moves exactly that amount */
  openRound(a: { session: string; round: string; betCents?: number; betMicro?: number; betTokens?: number; table?: string; hand?: string; meta?: Meta }): Promise<Round>;
  /** the win (or 0) goes back to the player, as winCents at the round's rate or as winMicro / winTokens moved as is; the same round and win again is a safe replay */
  settle(a: { round: string; winCents?: number; winMicro?: number; winTokens?: number; outcome?: string; meta?: Meta }): Promise<Round>;
  /** refund the bet; the casino does the same on its own for rounds open longer than 6 hours */
  voidRound(a: { round: string; reason?: string }): Promise<Round>;
  /** multiplayer: report a table whenever its seats or status change */
  table(a: { table: string; seatsMax?: number; seatsUsed?: number; status?: TableStatus; players?: string[]; meta?: Meta }): Promise<Table>;
  heartbeat(a?: Heartbeat): Promise<Control>;
  control(): Promise<Control>;
  score(a: { session: string; score: number; meta?: Meta }): Promise<{ id: number; score: number }>;
  /** the control stream; handler(type, data) with type 'hello' or 'control'; returns a stop function */
  events(handler: (type: string, data: unknown) => void, state?: { stop: boolean }): () => void;
  /** keeps `state` current from the stream (control events come at every change and every rate tick) and heartbeats every 30 s with `extra` (a value or a function); other events reach onEvent, 'balance' with a BalanceEvent; returns a stop function */
  watch(state: WatchState, extra?: Heartbeat | (() => Heartbeat), onEvent?: (type: string, data: unknown) => void): () => void;
  readonly url: string;
  readonly CasinoError: typeof CasinoError;
}

/** url and key default to CASINO_URL and GAME_KEY from the environment; timeoutMs defaults to 10000 */
export function createCasino(opts?: { url?: string; key?: string; timeoutMs?: number }): Casino;

/** the only randomness a casino game may use: node:crypto's CSPRNG */
export const rng: {
  /** uniform integer in [min, maxExclusive) */
  int(min: number, maxExclusive: number): number;
  /** true with probability p (6 decimals) */
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  /** weighted pick: [['cherry', 50], ['bar', 10], ['seven', 1]] */
  weighted<T>(table: ReadonlyArray<readonly [T, number]>): T;
  /** a UUID for round ids */
  id(): string;
};

/** expected return per unit bet from your paytable: [{ p: 0.48, payout: 2 }] gives 0.96 */
export function expectedRtp(outcomes: ReadonlyArray<{ p: number; payout: number }>): number;
