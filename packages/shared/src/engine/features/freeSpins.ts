import { FREE_SPINS } from '../../config/features';
import { FREE_SPIN_REELS, ROW_COUNT } from '../../config/reels';
import { evaluate, type Evaluation } from '../evaluate';
import type { Rng } from '../rng';
import { spinReels, type Grid } from '../spin';

export interface FreeSpin {
  stops: number[];
  /** What the reels landed on, before wilds expand. */
  landed: Grid;
  /** Reels turned fully wild. */
  expandedReels: number[];
  /** The grid that is paid. */
  grid: Grid;
  evaluation: Evaluation;
  /** Multiplier applied to this spin's win. */
  multiplier: number;
  win: number;
  /** Tag the Hood progress after this spin. */
  tags: number;
  /** True when this spin's tags raised the level. */
  levelUp: boolean;
  /** Spins added by this spin (level-ups and retriggers). */
  addedSpins: number;
  retriggered: boolean;
  /** Spins left after this one. */
  spinsLeft: number;
}

export interface FreeSpinsResult {
  initialSpins: number;
  spins: FreeSpin[];
  finalMultiplier: number;
  totalWin: number;
}

export function expandWilds(landed: Grid): { grid: Grid; expandedReels: number[] } {
  const expandedReels: number[] = [];
  const grid = landed.map((column, reel) => {
    if (!column.includes('WILD')) return [...column];
    expandedReels.push(reel);
    return Array(ROW_COUNT).fill('WILD');
  });
  return { grid, expandedReels };
}

export function playFreeSpins(rng: Rng, scatterCount: number, lineBet: number): FreeSpinsResult {
  const initialSpins = FREE_SPINS.awards[Math.min(scatterCount, 5)] ?? 0;
  let spinsLeft = initialSpins;
  let multiplier = 1;
  let tags = 0;
  let level = 0;
  let totalWin = 0;
  const spins: FreeSpin[] = [];

  while (spinsLeft > 0 && spins.length < FREE_SPINS.maxSpins) {
    spinsLeft--;
    const { stops, grid: landed } = spinReels(rng, FREE_SPIN_REELS);
    const { grid, expandedReels } = expandWilds(landed);
    const evaluation = evaluate(grid, lineBet);
    const win = evaluation.totalWin * multiplier;
    const spinMultiplier = multiplier;
    totalWin += win;

    let addedSpins = 0;
    let levelUp = false;
    tags += evaluation.scatterCount;
    while (multiplier < FREE_SPINS.maxMultiplier && tags >= (level + 1) * FREE_SPINS.tagsPerLevel) {
      level++;
      multiplier++;
      addedSpins += FREE_SPINS.spinsPerLevel;
      levelUp = true;
    }
    const retriggered = evaluation.scatterCount >= 3;
    if (retriggered) addedSpins += FREE_SPINS.retrigger;
    spinsLeft = Math.min(spinsLeft + addedSpins, FREE_SPINS.maxSpins - spins.length - 1);

    spins.push({
      stops,
      landed,
      expandedReels,
      grid,
      evaluation,
      multiplier: spinMultiplier,
      win,
      tags,
      levelUp,
      addedSpins,
      retriggered,
      spinsLeft,
    });
  }

  return { initialSpins, spins, finalMultiplier: multiplier, totalWin };
}
