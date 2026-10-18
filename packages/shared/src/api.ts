import { z } from 'zod';

/**
 * The contract between the Lowrider page and the Lowrider game server.
 * Requests are validated with these schemas on the server; the response
 * types are shared so both sides agree on the shape.
 */

export const GAME_STATUSES = ['live', 'last_bets', 'halted', 'maintenance'] as const;
export const GameStatusSchema = z.enum(GAME_STATUSES);
export type GameStatus = z.infer<typeof GameStatusSchema>;

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
export const DevControlRequestSchema = z.object({ status: GameStatusSchema, reason: z.string().max(200).optional() }).strict();

export type SessionRequest = z.infer<typeof SessionRequestSchema>;
export type SpinRequest = z.infer<typeof SpinRequestSchema>;
export type GambleRequest = z.infer<typeof GambleRequestSchema>;

/** A player's balance as the casino reports it. */
export interface Balance {
  value: number;
  unit: 'cents' | 'tokens';
}

export interface Limits {
  minBetCents: number;
  maxBetCents: number;
  maxWinCents: number;
}

/** What the page may know about the game and the player. Never a casino session id. */
export interface PublicState {
  status: GameStatus;
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
  lobbyUrl: string;
  dev: boolean;
  state: PublicState;
}

export interface ControlEvent {
  status: GameStatus;
  reason: string;
}

/** Error answer: `{error, code}` plus the balance on 402. */
export interface ErrorAnswer {
  error: string;
  code: string;
  balance?: Balance | null;
}
