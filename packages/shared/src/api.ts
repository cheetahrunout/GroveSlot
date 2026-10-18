import { z } from 'zod';

/**
 * The contract between the Lowrider page and the Lowrider game server.
 * Requests are validated with these schemas on the server; the response
 * types are shared so both sides agree on the shape.
 */

/**
 * The casino's four control states (game-integration.md section 4): `open`
 * plays; `demo` plays exactly the same while the casino returns every round
 * (the page shows a DEMO mark); `maintenance` takes no new players or rounds
 * but lets hands finish; `closed` has refunded everything and closed every session.
 */
export const CASINO_STATUSES = ['open', 'demo', 'maintenance', 'closed'] as const;
export const CasinoStatusSchema = z.enum(CASINO_STATUSES);
/** Plus `offline`: the casino has not answered our heartbeats for 90 s, so no new rounds. */
export type GameStatus = z.infer<typeof CasinoStatusSchema> | 'offline';

/** The states in which players may join and spin. */
export const isPlayable = (status: GameStatus): boolean => status === 'open' || status === 'demo';

export const FORCEABLE = ['freeSpins', 'lowriderHop', 'holdAndSpin', 'turfWar', 'driveBy'] as const;

/** POST /api/session: the casino's one-time token (absent in local play). */
export const SessionRequestSchema = z.object({ token: z.string().min(1).max(512).optional() }).strict();

/** POST /api/spin: total bet in euro cents; `force` works only with the local stand-in casino. */
export const SpinRequestSchema = z
  .object({
    betCents: z.number().int().positive().max(1_000_000),
    force: z.enum(FORCEABLE).optional(),
  })
  .strict();

/** POST /api/gamble: which alley the car takes. */
export const GambleRequestSchema = z.object({ pick: z.enum(['left', 'right']) }).strict();

/** POST /api/dev/control (local play only): switch the stand-in casino's state. */
export const DevControlRequestSchema = z.object({ status: CasinoStatusSchema, reason: z.string().max(200).optional() }).strict();

export type SessionRequest = z.infer<typeof SessionRequestSchema>;
export type SpinRequest = z.infer<typeof SpinRequestSchema>;
export type GambleRequest = z.infer<typeof GambleRequestSchema>;

/** The player's casino tokens: micro-tokens (6 decimals) and their euro value at the current rate. */
export interface Balance {
  tokensMicro: number;
  valueCents: number;
}

export interface Limits {
  minBetCents: number;
  maxBetCents: number;
  maxWinCents: number;
}

/** What the page may know about the game and the player. Never a casino session id. */
export interface PublicState {
  status: GameStatus;
  /** The demo state: every round is returned by the casino; the page shows a DEMO mark. */
  demo: boolean;
  reason: string;
  betOptions: number[];
  limits: Limits;
  gambleEnabled: boolean;
  player: { name: string } | null;
  balance: Balance | null;
  wantedStars: number;
  gamble: { stake: number } | null;
}

export interface Welcome {
  /** The casino (CASINO_PUBLIC_URL): the lobby link, the casino bar and the theme. Empty in local play. */
  casinoUrl: string;
  /** Where a player without a session goes: the casino logs them in and sends them back with a token. */
  playUrl: string;
  /** The game's slug at the casino (casino-game.json), for the casino bar. */
  slug: string;
  dev: boolean;
  state: PublicState;
  /**
   * This tab's seat at the game. Send it as `X-Lowrider-Seat` on every call and as `?seat=` on the event stream:
   * a player may hold several seats at once (several tabs), and tabs share cookies, so a cookie alone would let a
   * second tab kick the first. Null when the request carried no seat.
   */
  seat: string | null;
}

/** SSE `control` event. */
export interface ControlEvent {
  status: GameStatus;
  demo: boolean;
  reason: string;
}

/** SSE `balance` event: the player's tokens changed (a round, a top-up, another game). */
export interface BalanceEvent {
  balance: Balance;
}

/** Error answer: `{error, code}` plus the balance on 402. */
export interface ErrorAnswer {
  error: string;
  code: string;
  balance?: Balance | null;
}
