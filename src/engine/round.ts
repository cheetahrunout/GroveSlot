import { PAYLINES } from '../config/paylines';
import { MAX_WIN_MULTIPLIER } from '../config/paytable';
import { BASE_REELS } from '../config/reels';
import { evaluate, type Evaluation } from './evaluate';
import { playFreeSpins, type FreeSpinsResult } from './features/freeSpins';
import type { Rng } from './rng';
import { spinReels, type Grid } from './spin';

/** State that carries over from one round to the next. */
export interface GameState {}

export const INITIAL_STATE: GameState = {};

/** Bonus features, in the order a round plays them. */
export const FEATURES = ['freeSpins'] as const;
export type FeatureKey = (typeof FEATURES)[number];

export interface RoundFeatures {
  freeSpins?: FreeSpinsResult;
}

export interface RoundResult {
  lineBet: number;
  totalBet: number;
  stops: number[];
  grid: Grid;
  base: Evaluation;
  features: RoundFeatures;
  /** Everything the round pays, after the max-win cap. */
  totalWin: number;
  /** True when the cap cut the win down. */
  capped: boolean;
}

export interface RoundOptions {
  /** Debug only: re-spin the base game until this feature triggers. */
  force?: FeatureKey;
}

const MAX_FORCE_TRIES = 100_000;

function baseSpin(rng: Rng, lineBet: number, force?: FeatureKey) {
  for (let i = 0; i < MAX_FORCE_TRIES; i++) {
    const spin = spinReels(rng, BASE_REELS);
    const evaluation = evaluate(spin.grid, lineBet);
    if (!force || evaluation.triggers[force]) return { ...spin, evaluation };
  }
  throw new Error(`Could not force ${force}`);
}

/**
 * Plays one full round. Every outcome, including any bonus it triggers, is
 * decided here before anything is shown; the view only plays it back.
 */
export function playRound(
  rng: Rng,
  state: GameState,
  lineBet: number,
  options: RoundOptions = {},
): { result: RoundResult; state: GameState } {
  const totalBet = lineBet * PAYLINES.length;
  const { stops, grid, evaluation: base } = baseSpin(rng, lineBet, options.force);

  const features: RoundFeatures = {};
  if (base.triggers.freeSpins) features.freeSpins = playFreeSpins(rng, base.scatterCount, lineBet);

  const uncapped = base.totalWin + Object.values(features).reduce((sum, f) => sum + f.totalWin, 0);
  const cap = totalBet * MAX_WIN_MULTIPLIER;
  const result: RoundResult = {
    lineBet,
    totalBet,
    stops,
    grid,
    base,
    features,
    totalWin: Math.min(uncapped, cap),
    capped: uncapped > cap,
  };
  return { result, state };
}
