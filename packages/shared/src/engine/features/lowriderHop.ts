import { LOWRIDER_HOP } from '../../config/features';
import type { Rng } from '../rng';

export interface Hop {
  /** Index into LOWRIDER_HOP.table: 0 is the lowest hop. */
  level: number;
  multiplier: number;
  win: number;
}

export interface LowriderHopResult {
  hops: Hop[];
  totalWin: number;
}

/**
 * Pure odds: every hop is drawn here, when the bonus triggers. The player
 * only chooses a car and presses HOP to watch the next result.
 */
export function playLowriderHop(rng: Rng, totalBet: number): LowriderHopResult {
  const weights = LOWRIDER_HOP.table.map((t) => t.weight);
  const hops = Array.from({ length: LOWRIDER_HOP.hops }, () => {
    const level = rng.weighted(weights);
    const { multiplier } = LOWRIDER_HOP.table[level];
    return { level, multiplier, win: multiplier * totalBet };
  });
  return { hops, totalWin: hops.reduce((sum, h) => sum + h.win, 0) };
}
