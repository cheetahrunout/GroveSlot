import { JACKPOTS } from '@lowrider/shared/config/features';
import type { CashBag } from '@lowrider/shared/engine/features/holdAndSpin';

/** Counts: 1,234. */
export const fmt = (n: number) => n.toLocaleString('en-US');

/** Euro cents as euros: €0.40, €1,250.00. */
export function euro(cents: number): string {
  return `€${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Euro cents for small spaces: €0.40, €12, €1.2K. */
export function euroShort(cents: number): string {
  const e = cents / 100;
  if (e >= 1_000_000) return `€${+(e / 1_000_000).toFixed(1)}M`;
  if (e >= 1000) return `€${+(e / 1000).toFixed(1)}K`;
  return Number.isInteger(e) ? `€${e}` : euro(cents);
}

/** A balance as the casino reports it (euro cents or casino tokens). */
export function money(balance: { value: number; unit: 'cents' | 'tokens' } | null): string {
  if (!balance) return '—';
  return balance.unit === 'cents' ? euro(balance.value) : `${fmt(balance.value)} TOKENS`;
}

export function bagLabel(bag: CashBag): string {
  return bag.jackpot ? JACKPOTS[bag.jackpot].name : euroShort(bag.value);
}

/** "reel,row" → label, for showing bag values on the reels. */
export function bagLabels(bags: readonly CashBag[]): Map<string, string> {
  return new Map(bags.map((b) => [`${b.reel},${b.row}`, bagLabel(b)]));
}
