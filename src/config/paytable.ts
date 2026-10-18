import type { SymbolId } from './symbols';

/**
 * Line pays as multiples of the line bet, indexed by match count
 * (3, 4 or 5 of a kind from the left).
 */
export const LINE_PAYS: Partial<Record<SymbolId, { 3: number; 4: number; 5: number }>> = {
  WILD: { 3: 200, 4: 1000, 5: 4000 },
  OG: { 3: 100, 4: 400, 5: 2000 },
  SABRE: { 3: 80, 4: 300, 5: 1200 },
  HOUSE: { 3: 60, 4: 200, 5: 800 },
  CHAIN: { 3: 50, 4: 160, 5: 600 },
  BOOMBOX: { 3: 40, 4: 120, 5: 500 },
  BMX: { 3: 30, 4: 100, 5: 400 },
  BALL: { 3: 25, 4: 75, 5: 300 },
  CAP: { 3: 25, 4: 75, 5: 300 },
  A: { 3: 20, 4: 50, 5: 250 },
  K: { 3: 15, 4: 50, 5: 200 },
  Q: { 3: 15, 4: 40, 5: 150 },
  J: { 3: 10, 4: 30, 5: 120 },
  TEN: { 3: 10, 4: 25, 5: 100 },
};

/** Spray Can pays anywhere, as multiples of the total bet. */
export const SCATTER_PAYS: Record<number, number> = { 3: 5, 4: 25, 5: 100 };

/** Lowrider Hop needs a Lowrider on each of these reels (0-based). */
export const BONUS_REELS: readonly number[] = [0, 2, 4];

/** Turf War needs a Palm G on each of these reels (0-based). */
export const TURF_REELS: readonly number[] = [1, 2, 3];

/** Cap on what a single round can pay, as a multiple of the total bet. */
export const MAX_WIN_MULTIPLIER = 5000;

export const BET_PER_LINE_OPTIONS: readonly number[] = [1, 2, 5, 10, 25];
