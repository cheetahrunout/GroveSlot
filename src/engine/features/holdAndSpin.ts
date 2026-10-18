import { CASH_RUN, JACKPOTS, type JackpotId } from '../../config/features';
import { REEL_COUNT, ROW_COUNT } from '../../config/reels';
import type { Position } from '../evaluate';
import type { Rng } from '../rng';

export interface CashBag extends Position {
  /** Tokens this bag pays. */
  value: number;
  jackpot?: JackpotId;
}

export interface Respin {
  newBags: CashBag[];
  /** Respins left after this one (reset to 3 when a bag lands). */
  respinsLeft: number;
}

export interface HoldAndSpinResult {
  initialBags: CashBag[];
  respins: Respin[];
  /** Every bag at the end, in landing order. */
  bags: CashBag[];
  /** All 15 cells filled: the Kingpin jackpot. */
  grand: boolean;
  /** Kingpin payout when `grand` is true (1,000× bet plus the pot). */
  kingpinWin: number;
  totalWin: number;
}

/** Draws what a Cash Bag holds. */
export function drawCashBag(rng: Rng, position: Position, totalBet: number): CashBag {
  const entry = CASH_RUN.values[rng.weighted(CASH_RUN.values.map((v) => v.weight))];
  if ('jackpot' in entry) {
    return { ...position, value: JACKPOTS[entry.jackpot].multiplier * totalBet, jackpot: entry.jackpot };
  }
  return { ...position, value: entry.multiplier * totalBet };
}

export function playHoldAndSpin(
  rng: Rng,
  initialBags: readonly CashBag[],
  totalBet: number,
  kingpinPot: number,
): HoldAndSpinResult {
  const cells = REEL_COUNT * ROW_COUNT;
  const taken = new Set(initialBags.map((b) => `${b.reel},${b.row}`));
  const bags: CashBag[] = [...initialBags];
  const respins: Respin[] = [];
  let left = CASH_RUN.respins;

  while (left > 0 && bags.length < cells) {
    left--;
    const newBags: CashBag[] = [];
    for (let reel = 0; reel < REEL_COUNT; reel++) {
      for (let row = 0; row < ROW_COUNT; row++) {
        if (taken.has(`${reel},${row}`)) continue;
        if (rng.next() < CASH_RUN.landChance) newBags.push(drawCashBag(rng, { reel, row }, totalBet));
      }
    }
    for (const b of newBags) taken.add(`${b.reel},${b.row}`);
    bags.push(...newBags);
    if (newBags.length > 0) left = CASH_RUN.respins;
    respins.push({ newBags, respinsLeft: bags.length < cells ? left : 0 });
  }

  const grand = bags.length === cells;
  const kingpinWin = grand ? JACKPOTS.kingpin.multiplier * totalBet + kingpinPot : 0;
  const totalWin = bags.reduce((sum, b) => sum + b.value, 0) + kingpinWin;
  return { initialBags: [...initialBags], respins, bags, grand, kingpinWin, totalWin };
}
