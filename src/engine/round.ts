import { DRIVE_BY, KINGPIN_POT_RATE, TURF_WAR, WANTED } from '../config/features';
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

/** State that carries over from one round to the next. */
export interface GameState {
  /** Tokens added to the Kingpin jackpot on top of its 1,000× bet. */
  kingpinPot: number;
  wanted: WantedState;
}

export const INITIAL_STATE: GameState = { kingpinPot: 0, wanted: INITIAL_WANTED };

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
  /** This round was the Wanted Level's guaranteed win. */
  guaranteed: boolean;
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
  /** Debug only: re-spin the base game until this happens. */
  force?: FeatureKey | 'driveBy';
}

const MAX_TRIES = 100_000;

interface BaseSpin {
  stops: number[];
  landed: Grid;
  grid: Grid;
  driveBy: Position[] | null;
  evaluation: Evaluation;
}

function baseSpin(rng: Rng, lineBet: number, accept: (spin: BaseSpin) => boolean, driveByChance: number): BaseSpin {
  for (let i = 0; i < MAX_TRIES; i++) {
    const { stops, grid: landed } = spinReels(rng, BASE_REELS);
    let grid = landed;
    let driveBy: Position[] | null = null;
    if (rng.next() < driveByChance) {
      const d = applyDriveBy(rng, landed);
      grid = d.grid;
      driveBy = d.positions;
    }
    const spin = { stops, landed, grid, driveBy, evaluation: evaluate(grid, lineBet) };
    if (accept(spin)) return spin;
  }
  throw new Error('No base spin matched the request');
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
  const guaranteed = isGuaranteed(state.wanted);
  const force = options.force;

  const spin = baseSpin(
    rng,
    lineBet,
    (s) => {
      // The guaranteed win comes from the line pays alone, never from a bonus.
      if (guaranteed) {
        const e = s.evaluation;
        const triggered = Object.values(e.triggers).some(Boolean);
        return !triggered && e.totalWin >= WANTED.guaranteedMultiplier * totalBet;
      }
      if (force === 'driveBy') return s.driveBy !== null;
      return !force || s.evaluation.triggers[force];
    },
    force === 'driveBy' ? 1 : DRIVE_BY.chance,
  );
  const base = spin.evaluation;

  const cashBags = base.cashPositions.map((p) => drawCashBag(rng, p, totalBet));
  let kingpinPot = state.kingpinPot + totalBet * KINGPIN_POT_RATE;

  const features: RoundFeatures = {};
  if (base.triggers.freeSpins) features.freeSpins = playFreeSpins(rng, base.scatterCount, lineBet);
  if (base.triggers.lowriderHop) features.lowriderHop = playLowriderHop(rng, totalBet);
  if (base.triggers.holdAndSpin) {
    features.holdAndSpin = playHoldAndSpin(rng, cashBags, totalBet, kingpinPot);
    if (features.holdAndSpin.grand) kingpinPot = 0;
  }
  if (base.triggers.turfWar) {
    features.turfWar = playTurfWar(rng, totalBet, 'symbols');
  } else if (base.totalWin === 0 && Object.keys(features).length === 0 && rng.next() < TURF_WAR.randomChance) {
    features.turfWar = playTurfWar(rng, totalBet, 'random');
  }

  const uncapped = base.totalWin + Object.values(features).reduce((sum, f) => sum + f.totalWin, 0);
  const cap = totalBet * MAX_WIN_MULTIPLIER;
  const totalWin = Math.min(uncapped, cap);
  const result: RoundResult = {
    lineBet,
    totalBet,
    stops: spin.stops,
    landed: spin.landed,
    grid: spin.grid,
    driveBy: spin.driveBy,
    guaranteed,
    base,
    cashBags,
    features,
    totalWin,
    capped: uncapped > cap,
  };
  return { result, state: { kingpinPot, wanted: nextWanted(state.wanted, totalWin > 0) } };
}
