import { PAYLINES } from '../config/paylines';
import {
  BONUS_REELS,
  LINE_PAYS,
  SCATTER_PAYS,
  TURF_REELS,
} from '../config/paytable';
import { SPECIAL_SYMBOLS, type SymbolId } from '../config/symbols';
import type { Grid } from './spin';

export interface LineWin {
  /** 0-based payline index. */
  line: number;
  symbol: SymbolId;
  /** How many reels from the left match (3 to 5). */
  count: number;
  payout: number;
}

export interface Position {
  reel: number;
  row: number;
}

export interface Evaluation {
  lineWins: LineWin[];
  scatterCount: number;
  scatterPositions: Position[];
  scatterWin: number;
  triggers: {
    freeSpins: boolean;
    lowriderHop: boolean;
    turfWar: boolean;
  };
  /**
   * Line wins + scatter win. The base game tops out at about 4,100× the
   * total bet, so the MAX_WIN_MULTIPLIER cap is applied per round once
   * features with multipliers exist.
   */
  totalWin: number;
}

const payFor = (symbol: SymbolId, count: number): number => {
  const pays = LINE_PAYS[symbol];
  return pays && count >= 3 ? pays[count as 3 | 4 | 5] : 0;
};

/**
 * Best win on one line. WILD substitutes for any paying symbol; a run of
 * leading wilds can also pay as wilds on its own, and the higher pay wins.
 */
export function evaluateLine(symbols: readonly SymbolId[], lineBet: number): { symbol: SymbolId; count: number; payout: number } | null {
  let wildRun = 0;
  while (wildRun < symbols.length && symbols[wildRun] === 'WILD') wildRun++;

  const target = symbols[wildRun];
  let symbolRun = 0;
  if (target !== undefined && !SPECIAL_SYMBOLS.has(target)) {
    symbolRun = wildRun;
    while (symbolRun < symbols.length && (symbols[symbolRun] === target || symbols[symbolRun] === 'WILD')) {
      symbolRun++;
    }
  }

  const wildPay = payFor('WILD', wildRun);
  const symbolPay = target !== undefined ? payFor(target, symbolRun) : 0;
  if (wildPay === 0 && symbolPay === 0) return null;
  return wildPay >= symbolPay
    ? { symbol: 'WILD', count: wildRun, payout: wildPay * lineBet }
    : { symbol: target!, count: symbolRun, payout: symbolPay * lineBet };
}

const reelHas = (grid: Grid, reel: number, symbol: SymbolId) => grid[reel].includes(symbol);

export function evaluate(grid: Grid, lineBet: number): Evaluation {
  const totalBet = lineBet * PAYLINES.length;

  const lineWins: LineWin[] = [];
  PAYLINES.forEach((rows, line) => {
    const win = evaluateLine(rows.map((row, reel) => grid[reel][row]), lineBet);
    if (win) lineWins.push({ line, ...win });
  });

  const scatterPositions: Position[] = [];
  grid.forEach((column, reel) =>
    column.forEach((symbol, row) => {
      if (symbol === 'SCATTER') scatterPositions.push({ reel, row });
    }),
  );
  const scatterCount = scatterPositions.length;
  const scatterWin = (SCATTER_PAYS[Math.min(scatterCount, 5)] ?? 0) * totalBet;

  const lineTotal = lineWins.reduce((sum, w) => sum + w.payout, 0);
  return {
    lineWins,
    scatterCount,
    scatterPositions,
    scatterWin,
    triggers: {
      freeSpins: scatterCount >= 3,
      lowriderHop: BONUS_REELS.every((reel) => reelHas(grid, reel, 'BONUS')),
      turfWar: TURF_REELS.every((reel) => reelHas(grid, reel, 'TURF')),
    },
    totalWin: lineTotal + scatterWin,
  };
}
