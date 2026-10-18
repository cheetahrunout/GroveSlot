import type { SymbolId } from './symbols';

/**
 * Line pays as multiples of the line bet, indexed by match count
 * (3, 4 or 5 of a kind from the left).
 */
export const LINE_PAYS: Partial<Record<SymbolId, { 3: number; 4: number; 5: number }>> = {
  WILD: { 3: 250, 4: 1250, 5: 5000 },
  OG: { 3: 125, 4: 500, 5: 2500 },
  SABRE: { 3: 100, 4: 375, 5: 1500 },
  HOUSE: { 3: 75, 4: 250, 5: 1000 },
  CHAIN: { 3: 60, 4: 200, 5: 750 },
  BOOMBOX: { 3: 50, 4: 150, 5: 625 },
  BMX: { 3: 40, 4: 125, 5: 500 },
  BALL: { 3: 30, 4: 90, 5: 375 },
  CAP: { 3: 30, 4: 90, 5: 375 },
  A: { 3: 25, 4: 65, 5: 300 },
  K: { 3: 20, 4: 60, 5: 250 },
  Q: { 3: 20, 4: 50, 5: 200 },
  J: { 3: 12, 4: 40, 5: 150 },
  TEN: { 3: 12, 4: 30, 5: 125 },
};

/** Spray Can pays anywhere, as multiples of the total bet. */
export const SCATTER_PAYS: Record<number, number> = { 3: 5, 4: 25, 5: 100 };

/** Lowrider Hop needs a Lowrider on each of these reels (0-based). */
export const BONUS_REELS: readonly number[] = [0, 2, 4];

/** Turf War needs a Palm G on each of these reels (0-based). */
export const TURF_REELS: readonly number[] = [1, 2, 3];

/** Cash Run (Hold & Spin) needs at least this many Cash Bags on screen. */
export const CASH_TRIGGER_COUNT = 6;

/** Cap on what a single round can pay, as a multiple of the total bet. */
export const MAX_WIN_MULTIPLIER = 5000;

export const BET_PER_LINE_OPTIONS: readonly number[] = [1, 2, 5, 10, 25];
