import { PAYLINES } from '../config/paylines';
import { MAX_WIN_MULTIPLIER } from '../config/paytable';
import { BASE_REELS } from '../config/reels';
import { evaluate, type Evaluation } from './evaluate';
import { KINGPIN_POT_RATE } from '../config/features';
import { playFreeSpins, type FreeSpinsResult } from './features/freeSpins';
import { drawCashBag, playHoldAndSpin, type CashBag, type HoldAndSpinResult } from './features/holdAndSpin';
import { playLowriderHop, type LowriderHopResult } from './features/lowriderHop';
import type { Rng } from './rng';
import { spinReels, type Grid } from './spin';

/** State that carries over from one round to the next. */
export interface GameState {
  /** Tokens added to the Kingpin jackpot on top of its 1,000× bet. */
  kingpinPot: number;
}

export const INITIAL_STATE: GameState = { kingpinPot: 0 };

/** Bonus features, in the order a round plays them. */
export const FEATURES = ['freeSpins', 'lowriderHop', 'holdAndSpin'] as const;
export type FeatureKey = (typeof FEATURES)[number];

export interface RoundFeatures {
  freeSpins?: FreeSpinsResult;
  lowriderHop?: LowriderHopResult;
  holdAndSpin?: HoldAndSpinResult;
}

export interface RoundResult {
  lineBet: number;
  totalBet: number;
  stops: number[];
  grid: Grid;
  base: Evaluation;
  /** What each Cash Bag on the base grid holds. */
  cashBags: CashBag[];
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

  const cashBags = base.cashPositions.map((p) => drawCashBag(rng, p, totalBet));
  let kingpinPot = state.kingpinPot + totalBet * KINGPIN_POT_RATE;

  const features: RoundFeatures = {};
  if (base.triggers.freeSpins) features.freeSpins = playFreeSpins(rng, base.scatterCount, lineBet);
  if (base.triggers.lowriderHop) features.lowriderHop = playLowriderHop(rng, totalBet);
  if (base.triggers.holdAndSpin) {
    features.holdAndSpin = playHoldAndSpin(rng, cashBags, totalBet, kingpinPot);
    if (features.holdAndSpin.grand) kingpinPot = 0;
  }

  const uncapped = base.totalWin + Object.values(features).reduce((sum, f) => sum + f.totalWin, 0);
  const cap = totalBet * MAX_WIN_MULTIPLIER;
  const result: RoundResult = {
    lineBet,
    totalBet,
    stops,
    grid,
    base,
    cashBags,
    features,
    totalWin: Math.min(uncapped, cap),
    capped: uncapped > cap,
  };
  return { result, state: { ...state, kingpinPot } };
}
