import { DRIVE_BY, TURF_WAR, WANTED } from '../config/features';
import { PAYLINES } from '../config/paylines';
import { MAX_WIN_MULTIPLIER } from '../config/paytable';
import { BASE_REELS } from '../config/reels';
import { evaluate, type Evaluation, type Position } from './evaluate';
import { applyDriveBy } from './features/driveBy';
import { playFreeSpins, type FreeSpinsResult } from './features/freeSpins';
import { drawCashBag, playHoldAndSpin, type CashBag, type HoldAndSpinResult } from './features/holdAndSpin';
import { playLowriderHop, type LowriderHopResult } from './features/lowriderHop';
import { playTurfWar, type TurfWarResult } from './features/turfWar';
import { INITIAL_WANTED, isGuaranteed, nextWanted, type WantedState } from './features/wanted';
import type { Rng } from './rng';
import { spinReels, type Grid } from './spin';

/** Per-player game state that carries over between rounds. Never money. */
export interface GameState {
  wanted: WantedState;
}

export const INITIAL_STATE: GameState = { wanted: INITIAL_WANTED };

/** Bonus features, in the order a round plays them. */
export const FEATURES = ['freeSpins', 'lowriderHop', 'holdAndSpin', 'turfWar'] as const;
export type FeatureKey = (typeof FEATURES)[number];

export interface RoundFeatures {
  freeSpins?: FreeSpinsResult;
  lowriderHop?: LowriderHopResult;
  holdAndSpin?: HoldAndSpinResult;
  turfWar?: TurfWarResult;
}

export interface RoundResult {
  lineBet: number;
  totalBet: number;
  stops: number[];
  /** What the reels stopped on, before any Drive-By wilds. */
  landed: Grid;
  /** The grid that is paid. */
  grid: Grid;
  /** Wilds sprayed by a Drive-By, if one happened. */
  driveBy: Position[] | null;
  /** Wanted Level payday prize (0 when this was not a payday round). */
  payday: number;
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
  /** Cap on the round's win, in the same unit as the bet (the casino's limit). */
  maxWin?: number;
  /**
   * Tests and local development only: re-spin the base game until this
   * happens. The game server never passes it when talking to the casino.
   */
  force?: FeatureKey | 'driveBy';
}

const MAX_FORCE_TRIES = 100_000;

interface BaseSpin {
  stops: number[];
  landed: Grid;
  grid: Grid;
  driveBy: Position[] | null;
  evaluation: Evaluation;
}

function baseSpin(rng: Rng, lineBet: number, driveByChance: number): BaseSpin {
  const { stops, grid: landed } = spinReels(rng, BASE_REELS);
  let grid = landed;
  let driveBy: Position[] | null = null;
  if (rng.next() < driveByChance) {
    const d = applyDriveBy(rng, landed);
    grid = d.grid;
    driveBy = d.positions;
  }
  return { stops, landed, grid, driveBy, evaluation: evaluate(grid, lineBet) };
}

function forcedSpin(rng: Rng, lineBet: number, force: FeatureKey | 'driveBy'): BaseSpin {
  for (let i = 0; i < MAX_FORCE_TRIES; i++) {
    const spin = baseSpin(rng, lineBet, force === 'driveBy' ? 1 : DRIVE_BY.chance);
    if (force === 'driveBy' || spin.evaluation.triggers[force]) return spin;
  }
  throw new Error(`Could not force ${force}`);
}

/**
 * Plays one full round. Every outcome, including any bonus it triggers, is
 * decided here, once, from `rng`; the page only plays it back.
 */
export function playRound(
  rng: Rng,
  state: GameState,
  lineBet: number,
  options: RoundOptions = {},
): { result: RoundResult; state: GameState } {
  const totalBet = lineBet * PAYLINES.length;
  const spin = options.force ? forcedSpin(rng, lineBet, options.force) : baseSpin(rng, lineBet, DRIVE_BY.chance);
  const base = spin.evaluation;

  const cashBags = base.cashPositions.map((p) => drawCashBag(rng, p, totalBet));

  const features: RoundFeatures = {};
  if (base.triggers.freeSpins) features.freeSpins = playFreeSpins(rng, base.scatterCount, lineBet);
  if (base.triggers.lowriderHop) features.lowriderHop = playLowriderHop(rng, totalBet);
  if (base.triggers.holdAndSpin) features.holdAndSpin = playHoldAndSpin(rng, cashBags, totalBet);
  if (base.triggers.turfWar) {
    features.turfWar = playTurfWar(rng, totalBet, 'symbols');
  } else if (base.totalWin === 0 && Object.keys(features).length === 0 && rng.next() < TURF_WAR.randomChance) {
    features.turfWar = playTurfWar(rng, totalBet, 'random');
  }

  const payday = isGuaranteed(state.wanted)
    ? WANTED.payday[rng.weighted(WANTED.payday.map((p) => p.weight))].multiplier * totalBet
    : 0;

  const uncapped = base.totalWin + payday + Object.values(features).reduce((sum, f) => sum + f.totalWin, 0);
  const cap = Math.min(totalBet * MAX_WIN_MULTIPLIER, options.maxWin ?? Infinity);
  const totalWin = Math.min(uncapped, cap);
  const result: RoundResult = {
    lineBet,
    totalBet,
    stops: spin.stops,
    landed: spin.landed,
    grid: spin.grid,
    driveBy: spin.driveBy,
    payday,
    base,
    cashBags,
    features,
    totalWin,
    capped: uncapped > cap,
  };
  return { result, state: { wanted: nextWanted(state.wanted, totalWin > 0) } };
}
