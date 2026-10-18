import { PAYLINES } from '../config/paylines';
import { MAX_WIN_MULTIPLIER } from '../config/paytable';
import { BASE_REELS } from '../config/reels';
import { evaluate, type Evaluation } from './evaluate';
import type { Rng } from './rng';
import { spinReels, type Grid } from './spin';

/** State that carries over from one round to the next. */
export interface GameState {}

export const INITIAL_STATE: GameState = {};

export interface RoundResult {
  lineBet: number;
  totalBet: number;
  stops: number[];
  grid: Grid;
  base: Evaluation;
  /** Everything the round pays, after the max-win cap. */
  totalWin: number;
  /** True when the cap cut the win down. */
  capped: boolean;
}

/**
 * Plays one full round. Every outcome, including any bonus it triggers, is
 * decided here before anything is shown; the view only plays it back.
 */
export function playRound(rng: Rng, state: GameState, lineBet: number): { result: RoundResult; state: GameState } {
  const totalBet = lineBet * PAYLINES.length;
  const { stops, grid } = spinReels(rng, BASE_REELS);
  const base = evaluate(grid, lineBet);

  const uncapped = base.totalWin;
  const cap = totalBet * MAX_WIN_MULTIPLIER;
  const result: RoundResult = {
    lineBet,
    totalBet,
    stops,
    grid,
    base,
    totalWin: Math.min(uncapped, cap),
    capped: uncapped > cap,
  };
  return { result, state };
}
