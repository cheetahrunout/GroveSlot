import { JACKPOTS } from '@lowrider/shared/config/features';
import type { CashBag } from '@lowrider/shared/engine/features/holdAndSpin';

/** Counts, Dutch style like the casino: 1.234. */
export const fmt = (n: number) => n.toLocaleString('nl-NL');

/** Euro cents the way the casino writes them: € 0,40, € 1.250,00. Never a dollar sign. */
export function euro(cents: number): string {
  return `€\u00a0${(cents / 100).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Euro cents for small spaces: € 0,40, € 12, € 1,2K. */
export function euroShort(cents: number): string {
  const e = cents / 100;
  const short = (v: number) => (+v.toFixed(1)).toLocaleString('nl-NL');
  if (e >= 1_000_000) return `€\u00a0${short(e / 1_000_000)}M`;
  if (e >= 1000) return `€\u00a0${short(e / 1000)}K`;
  return Number.isInteger(e) ? `€\u00a0${e}` : euro(cents);
}

/** A token balance: whole tokens, fraction dropped (12.9999 → 12 tok). Never decimals. */
export function tokens(micro: number): string {
  const whole = Math.floor(micro / 1_000_000);
  return `${whole.toLocaleString('nl-NL')} tok`;
}

export function bagLabel(bag: CashBag): string {
  return bag.jackpot ? JACKPOTS[bag.jackpot].name : euroShort(bag.value);
}

/** "reel,row" → label, for showing bag values on the reels. */
export function bagLabels(bags: readonly CashBag[]): Map<string, string> {
  return new Map(bags.map((b) => [`${b.reel},${b.row}`, bagLabel(b)]));
}
