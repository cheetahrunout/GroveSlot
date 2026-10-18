import { WANTED } from '../../config/features';

export interface WantedState {
  stars: number;
  /** Losing spins in a row since the last star change. */
  lossStreak: number;
}

export const INITIAL_WANTED: WantedState = { stars: 0, lossStreak: 0 };

/** True when this round pays a Payday prize. */
export const isGuaranteed = (w: WantedState) => w.stars >= WANTED.maxStars;

/**
 * After a round: a win adds a star, every few losses in a row take one
 * away, and a payday round resets the meter.
 */
export function nextWanted(w: WantedState, won: boolean): WantedState {
  if (isGuaranteed(w)) return INITIAL_WANTED;
  if (won) return { stars: Math.min(WANTED.maxStars, w.stars + 1), lossStreak: 0 };
  const lossStreak = w.lossStreak + 1;
  if (lossStreak >= WANTED.lossesPerStar) return { stars: Math.max(0, w.stars - 1), lossStreak: 0 };
  return { stars: w.stars, lossStreak };
}
