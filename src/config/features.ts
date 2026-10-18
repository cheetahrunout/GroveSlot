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

/**
 * Share of the 96% RTP each part of the game is tuned to. The simulator
 * test checks the measured values against these.
 */
export const RTP_BUDGET = {
  base: 0.58,
  freeSpins: 0.2,
} as const;
