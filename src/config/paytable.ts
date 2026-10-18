import type { SymbolId } from './symbols';

/**
 * Line pays as multiples of the line bet, indexed by match count
 * (3, 4 or 5 of a kind from the left).
 */
export const LINE_PAYS: Partial<Record<SymbolId, { 3: number; 4: number; 5: number }>> = {
  WILD: { 3: 225, 4: 1125, 5: 4500 },
  OG: { 3: 110, 4: 450, 5: 2250 },
  SABRE: { 3: 90, 4: 340, 5: 1350 },
  HOUSE: { 3: 70, 4: 225, 5: 900 },
  CHAIN: { 3: 55, 4: 180, 5: 675 },
  BOOMBOX: { 3: 45, 4: 135, 5: 560 },
  BMX: { 3: 35, 4: 110, 5: 450 },
  BALL: { 3: 28, 4: 80, 5: 340 },
  CAP: { 3: 28, 4: 80, 5: 340 },
  A: { 3: 22, 4: 60, 5: 270 },
  K: { 3: 18, 4: 55, 5: 225 },
  Q: { 3: 18, 4: 45, 5: 180 },
  J: { 3: 11, 4: 36, 5: 135 },
  TEN: { 3: 11, 4: 27, 5: 110 },
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
