import { ROW_COUNT } from '../config/reels';
import type { SymbolId } from '../config/symbols';
import type { Rng } from './rng';

/** grid[reel][row], row 0 is the top. */
export type Grid = SymbolId[][];

export interface SpinResult {
  /** Index on each strip of the symbol shown in the top row. */
  stops: number[];
  grid: Grid;
}

export function gridAt(strips: readonly (readonly SymbolId[])[], stops: readonly number[]): Grid {
  return strips.map((strip, reel) =>
    Array.from({ length: ROW_COUNT }, (_, row) => strip[(stops[reel] + row) % strip.length]),
  );
}

export function spinReels(rng: Rng, strips: readonly (readonly SymbolId[])[]): SpinResult {
  const stops = strips.map((strip) => rng.int(strip.length));
  return { stops, grid: gridAt(strips, stops) };
}
