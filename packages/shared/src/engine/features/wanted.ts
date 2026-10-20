import { WANTED } from '../../config/features';

export interface WantedState {
  stars: number;
  /** Losing spins in a row since the last star change. */
  lossStreak: number;
  /**
   * The smallest total bet played since the meter was last empty (0 while it
   * is empty). The Payday is paid on this bet, never on a bigger one, so a
   * meter filled at a small bet cannot be collected at a big one.
   */
  bet: number;
}

export const INITIAL_WANTED: WantedState = { stars: 0, lossStreak: 0, bet: 0 };

/** True when this round pays a Payday prize. */
export const isGuaranteed = (w: WantedState) => w.stars >= WANTED.maxStars;

/** The bet a Payday on this spin is paid on: the smallest bet that filled the meter, or this spin's if smaller. */
export const paydayBet = (w: WantedState, totalBet: number) => Math.min(w.bet, totalBet);

/**
 * After a round played at `totalBet`: a win adds a star, every few losses
 * in a row take one away, and a payday round resets the meter.
 */
export function nextWanted(w: WantedState, won: boolean, totalBet: number): WantedState {
  if (isGuaranteed(w)) return INITIAL_WANTED;
  let stars = w.stars;
  let lossStreak = 0;
  if (won) stars = Math.min(WANTED.maxStars, stars + 1);
  else if (w.lossStreak + 1 >= WANTED.lossesPerStar) stars = Math.max(0, stars - 1);
  else lossStreak = w.lossStreak + 1;
  if (stars === 0) return { stars, lossStreak, bet: 0 };
  return { stars, lossStreak, bet: w.bet > 0 ? Math.min(w.bet, totalBet) : totalBet };
}
