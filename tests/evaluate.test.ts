import { describe, expect, it } from 'vitest';
import { LINE_PAYS } from '../src/config/paytable';
import type { SymbolId } from '../src/config/symbols';
import { evaluate, evaluateLine } from '../src/engine/evaluate';
import { createRng } from '../src/engine/rng';
import { gridAt, spinReels, type Grid } from '../src/engine/spin';

/** Line pay from the paytable. */
const pay = (s: SymbolId, n: 3 | 4 | 5) => LINE_PAYS[s]![n];

describe('evaluateLine', () => {
  const line = (s: string) => s.split(' ') as SymbolId[];

  it('pays 3, 4 and 5 of a kind from the left only', () => {
    expect(evaluateLine(line('K K K Q J'), 1)).toEqual({ symbol: 'K', count: 3, payout: pay('K', 3) });
    expect(evaluateLine(line('K K K K J'), 2)).toEqual({ symbol: 'K', count: 4, payout: pay('K', 4) * 2 });
    expect(evaluateLine(line('OG OG OG OG OG'), 1)).toEqual({ symbol: 'OG', count: 5, payout: pay('OG', 5) });
    expect(evaluateLine(line('Q K K K K'), 1)).toBeNull();
    expect(evaluateLine(line('K K Q K K'), 1)).toBeNull();
  });

  it('lets wilds stand in, at the start or in the middle', () => {
    expect(evaluateLine(line('WILD K K J Q'), 1)).toEqual({ symbol: 'K', count: 3, payout: pay('K', 3) });
    expect(evaluateLine(line('K WILD K WILD Q'), 1)).toEqual({ symbol: 'K', count: 4, payout: pay('K', 4) });
  });

  it('pays the leading wilds on their own when that is worth more', () => {
    // 3 wilds beat 4 tens.
    expect(pay('WILD', 3)).toBeGreaterThan(pay('TEN', 4));
    expect(pay('OG', 5)).toBeGreaterThan(pay('WILD', 4));
    expect(evaluateLine(line('WILD WILD WILD TEN Q'), 1)).toEqual({ symbol: 'WILD', count: 3, payout: pay('WILD', 3) });
    // 5 OG beat 4 wilds.
    expect(evaluateLine(line('WILD WILD WILD WILD OG'), 1)).toEqual({ symbol: 'OG', count: 5, payout: pay('OG', 5) });
    expect(evaluateLine(line('WILD WILD WILD WILD WILD'), 1)).toEqual({ symbol: 'WILD', count: 5, payout: pay('WILD', 5) });
  });

  it('does not let wilds replace specials, and specials break a line', () => {
    expect(evaluateLine(line('SCATTER WILD WILD K K'), 1)).toBeNull();
    expect(evaluateLine(line('WILD WILD SCATTER K K'), 1)).toBeNull();
    expect(evaluateLine(line('WILD WILD WILD BONUS K'), 1)).toEqual({ symbol: 'WILD', count: 3, payout: pay('WILD', 3) });
    expect(evaluateLine(line('K K CASH K K'), 1)).toBeNull();
    expect(evaluateLine(line('K K TURF K K'), 1)).toBeNull();
  });
});

/** Builds a grid from 3 row strings, top to bottom. */
const gridFromRows = (...rows: string[]): Grid => {
  const cells = rows.map((r) => r.split(' ') as SymbolId[]);
  return cells[0].map((_, reel) => cells.map((row) => row[reel]));
};

describe('evaluate', () => {
  it('finds wins on the right paylines', () => {
    const grid = gridFromRows(
      'A Q TEN J K',
      'K K K J Q',
      'Q A J TEN A',
    );
    const result = evaluate(grid, 1);
    expect(result.lineWins).toEqual([{ line: 0, symbol: 'K', count: 3, payout: pay('K', 3) }]);
    expect(result.totalWin).toBe(pay('K', 3));
  });

  it('pays scatters anywhere on the total bet and triggers free spins', () => {
    const grid = gridFromRows(
      'SCATTER Q TEN J K',
      'J A K SCATTER Q',
      'Q K J TEN SCATTER',
    );
    const result = evaluate(grid, 2);
    expect(result.scatterCount).toBe(3);
    expect(result.scatterWin).toBe(5 * 40);
    expect(result.triggers.freeSpins).toBe(true);
    expect(result.scatterPositions).toContainEqual({ reel: 3, row: 1 });
  });

  it('triggers Lowrider Hop and Turf War on their reels only', () => {
    const hop = gridFromRows(
      'BONUS Q TEN J K',
      'J A BONUS K Q',
      'Q K J TEN BONUS',
    );
    expect(evaluate(hop, 1).triggers).toEqual({ freeSpins: false, lowriderHop: true, turfWar: false, holdAndSpin: false });

    const turf = gridFromRows(
      'A TURF Q J K',
      'J A TURF K Q',
      'Q K J TURF A',
    );
    expect(evaluate(turf, 1).triggers.turfWar).toBe(true);
  });

  it('pays every line on a screen full of wilds', () => {
    const allWild = gridFromRows(
      'WILD WILD WILD WILD WILD',
      'WILD WILD WILD WILD WILD',
      'WILD WILD WILD WILD WILD',
    );
    const result = evaluate(allWild, 1);
    expect(result.lineWins).toHaveLength(20);
    expect(result.totalWin).toBe(20 * pay('WILD', 5));
  });
});

describe('spinReels', () => {
  it('wraps around the end of the strip', () => {
    const strips: SymbolId[][] = Array.from({ length: 5 }, () => ['A', 'K', 'Q', 'J']);
    expect(gridAt(strips, [3, 0, 0, 0, 0])[0]).toEqual(['J', 'A', 'K']);
  });

  it('is reproducible from a seed', () => {
    const strips: SymbolId[][] = Array.from({ length: 5 }, () => ['A', 'K', 'Q', 'J', 'TEN']);
    expect(spinReels(createRng(5), strips)).toEqual(spinReels(createRng(5), strips));
  });
});
