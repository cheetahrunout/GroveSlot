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
   * Mean ≈ 9.7× per hop, ≈ 49× per bonus.
   */
  table: [
    { multiplier: 2, weight: 24 },
    { multiplier: 4, weight: 22 },
    { multiplier: 6, weight: 18 },
    { multiplier: 10, weight: 12 },
    { multiplier: 12, weight: 9 },
    { multiplier: 20, weight: 7 },
    { multiplier: 30, weight: 4 },
    { multiplier: 60, weight: 4 },
  ],
} as const;

export type JackpotId = 'homie' | 'soldier' | 'og' | 'kingpin';

export const JACKPOTS: Record<JackpotId, { name: string; multiplier: number }> = {
  homie: { name: 'HOMIE', multiplier: 20 },
  soldier: { name: 'SOLDIER', multiplier: 50 },
  og: { name: 'OG', multiplier: 250 },
  kingpin: { name: 'KINGPIN', multiplier: 1000 },
};

/** Share of every bet that grows the Kingpin pot, paid on top of 1,000× bet. */
export const KINGPIN_POT_RATE = 0.005;

export const CASH_RUN = {
  /** Respins given at the start and after every new Cash Bag. */
  respins: 3,
  /** Chance that an empty cell lands a Cash Bag on a respin. */
  landChance: 0.03,
  /**
   * What a Cash Bag holds: a multiple of the total bet or a jackpot.
   * The Kingpin is only won by filling all 15 cells.
   */
  values: [
    { multiplier: 1, weight: 30 },
    { multiplier: 2, weight: 25 },
    { multiplier: 3, weight: 15 },
    { multiplier: 5, weight: 12 },
    { multiplier: 10, weight: 6 },
    { multiplier: 25, weight: 2 },
    { jackpot: 'homie', weight: 1.2 },
    { jackpot: 'soldier', weight: 0.4 },
    { jackpot: 'og', weight: 0.06 },
  ] as readonly ({ multiplier: number; weight: number } | { jackpot: Exclude<JackpotId, 'kingpin'>; weight: number })[],
} as const;

/**
 * Share of the 96% RTP each part of the game is tuned to. The simulator
 * test checks the measured values against these.
 */
export const RTP_BUDGET = {
  base: 0.58,
  freeSpins: 0.2,
  lowriderHop: 0.07,
  holdAndSpin: 0.07,
} as const;
