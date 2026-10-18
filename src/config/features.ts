/** Bonus feature settings. Changing these changes the RTP: re-run `npm run sim`. */

export const FREE_SPINS = {
  /** Spins awarded for 3, 4 or 5 Spray Cans. */
  awards: { 3: 10, 4: 15, 5: 20 } as Record<number, number>,
  /** Extra spins for 3+ Spray Cans during free spins. */
  retrigger: 10,
  /** Spray Cans needed on the Tag the Hood wall for the next level. */
  tagsPerLevel: 3,
  /** Each level adds +1 multiplier (up to maxMultiplier) and these extra spins. */
  spinsPerLevel: 2,
  maxMultiplier: 5,
  /** Hard stop so a run can never go on for ever. */
  maxSpins: 100,
} as const;

export const LOWRIDER_HOP = {
  hops: 5,
  /**
   * Each hop pays a multiple of the total bet; higher hops are rarer.
   * Mean ≈ 7.95× per hop, ≈ 40× per bonus.
   */
  table: [
    { multiplier: 2, weight: 24 },
    { multiplier: 3, weight: 22 },
    { multiplier: 5, weight: 18 },
    { multiplier: 8, weight: 12 },
    { multiplier: 10, weight: 9 },
    { multiplier: 15, weight: 7 },
    { multiplier: 25, weight: 4 },
    { multiplier: 50, weight: 4 },
  ],
} as const;

/**
 * Share of the 96% RTP each part of the game is tuned to. The simulator
 * test checks the measured values against these.
 */
export const RTP_BUDGET = {
  base: 0.58,
  freeSpins: 0.2,
  lowriderHop: 0.07,
} as const;
