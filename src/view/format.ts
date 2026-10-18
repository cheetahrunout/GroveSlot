import { JACKPOTS } from '../config/features';
import type { CashBag } from '../engine/features/holdAndSpin';

export const fmt = (n: number) => n.toLocaleString('en-US');

/** Short token amounts for small spaces: 950, 12.5K, 3.2M. */
export function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${+(n / 1000).toFixed(1)}K`;
  return fmt(n);
}

export function bagLabel(bag: CashBag): string {
  return bag.jackpot ? JACKPOTS[bag.jackpot].name : fmtShort(bag.value);
}

/** "reel,row" → label, for showing bag values on the reels. */
export function bagLabels(bags: readonly CashBag[]): Map<string, string> {
  return new Map(bags.map((b) => [`${b.reel},${b.row}`, bagLabel(b)]));
}
