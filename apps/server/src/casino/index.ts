/**
 * Lowrider's side of the Grove Casino SDK. `casino-game.js` and
 * `casino-game.d.ts` are copied verbatim from the casino repository
 * (sdk/); refresh them by copying again, never by editing. This file only
 * adds the small helpers Lowrider needs around them.
 */

import { CasinoError, createCasino, rng, type Casino, type Control, type Limits as CasinoLimits, type Player, type WatchState } from './casino-game';
import type { Balance, Limits } from '@lowrider/shared/api';

export { CasinoError, createCasino, rng };
export type { Casino, Control, Player, WatchState };

/** Limits used until the casino sends its own; they match casino-game.json. */
export const DEFAULT_LIMITS: Limits = { minBetCents: 20, maxBetCents: 500, maxWinCents: 2_500_000 };

export function toLimits(l: CasinoLimits | null | undefined): Limits {
  if (!l) return { ...DEFAULT_LIMITS };
  return { minBetCents: l.min_bet_cents, maxBetCents: l.max_bet_cents, maxWinCents: l.max_win_cents };
}

/** The player's tokens as the page shows them (never the casino's player id). */
export function toBalance(p: Player | null | undefined): Balance | null {
  return p ? { tokensMicro: p.tokens_micro, valueCents: p.tokens_value_cents } : null;
}

/**
 * Network trouble (fetch throws, not a CasinoError) or a casino-side failure:
 * safe to retry with the same round id, since the casino treats repeats as replays.
 */
export function retryable(e: unknown): boolean {
  return !(e instanceof CasinoError) || e.status >= 500;
}

/** The JSON body of a casino error, as an object (empty when there is none). */
export function errorData(e: unknown): Record<string, unknown> {
  const d = e instanceof CasinoError ? e.data : null;
  return d && typeof d === 'object' ? (d as Record<string, unknown>) : {};
}
