import { GAMBLE } from '../../config/features';
import type { Rng } from '../rng';

export type Alley = 'left' | 'right';

/**
 * Car Chase: double or nothing on a win. Exactly 50/50, so it never changes
 * the RTP; it only makes the result swing more.
 */
export function canGamble(originalWin: number, stake: number, roundsPlayed: number): boolean {
  return originalWin > 0 && stake > 0 && roundsPlayed < GAMBLE.maxRounds && stake * 2 <= originalWin * GAMBLE.capMultiplier;
}

export function playGamble(rng: Rng, pick: Alley, stake: number): { escape: Alley; won: boolean; stake: number } {
  const escape: Alley = rng.int(2) === 0 ? 'left' : 'right';
  const won = escape === pick;
  return { escape, won, stake: won ? stake * 2 : 0 };
}
