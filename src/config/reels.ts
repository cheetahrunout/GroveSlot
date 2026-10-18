import { createRng } from '../engine/rng';
import { SPECIAL_SYMBOLS, type SymbolId } from './symbols';

export const REEL_COUNT = 5;
export const ROW_COUNT = 3;

type SymbolCounts = Partial<Record<SymbolId, number>>;

/**
 * How many of each symbol sit on each base-game reel strip. This table is
 * what gets tuned for RTP; the strips themselves are built from it.
 */
const PAYING: SymbolCounts = {
  WILD: 2, OG: 1, SABRE: 2, HOUSE: 2, CHAIN: 2,
  BOOMBOX: 3, BMX: 3, BALL: 3, CAP: 3,
  A: 4, K: 4, Q: 5, J: 5, TEN: 6,
};

// Lowriders only land on reels 1, 3 and 5; Palm G only on reels 2 to 4.
// Measured over 3M spins: base RTP ≈ 59% (scatter ≈ 3%), hit rate ≈ 23%,
// Free Spins ≈ 1 in 195, Lowrider Hop ≈ 1 in 570, Turf War ≈ 1 in 545.
export const BASE_REEL_COUNTS: readonly SymbolCounts[] = [
  { ...PAYING, SCATTER: 2, BONUS: 2 },
  { ...PAYING, SCATTER: 1, TURF: 2 },
  { ...PAYING, SCATTER: 1, BONUS: 2, TURF: 2 },
  { ...PAYING, SCATTER: 1, TURF: 2 },
  { ...PAYING, SCATTER: 2, BONUS: 2 },
];

/** Specials and wilds are kept at least this many positions apart (wrapping). */
export const MIN_SPECIAL_SPACING = ROW_COUNT;

const isSpaced = (sym: SymbolId) => sym === 'WILD' || SPECIAL_SYMBOLS.has(sym);

function spacingOk(strip: readonly SymbolId[]): boolean {
  const positions = strip.flatMap((s, i) => (isSpaced(s) ? [i] : []));
  return positions.every((p, i) => {
    const next = i + 1 < positions.length ? positions[i + 1] : positions[0] + strip.length;
    return positions.length < 2 || next - p >= MIN_SPECIAL_SPACING;
  });
}

/**
 * Turns symbol counts into a strip with a fixed seed, so the same counts
 * always give the same strip. Reshuffles until no window of ROW_COUNT
 * positions holds two specials/wilds.
 */
export function buildStrip(counts: SymbolCounts, seed: number): SymbolId[] {
  const strip = (Object.entries(counts) as [SymbolId, number][]).flatMap(([sym, n]) =>
    Array<SymbolId>(n).fill(sym),
  );
  const rng = createRng(seed);
  for (let attempt = 0; attempt < 10_000; attempt++) {
    for (let i = strip.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [strip[i], strip[j]] = [strip[j], strip[i]];
    }
    if (spacingOk(strip)) return strip;
  }
  throw new Error('Could not space special symbols; the strip has too many of them');
}

export const BASE_REELS: readonly (readonly SymbolId[])[] = BASE_REEL_COUNTS.map((counts, i) =>
  buildStrip(counts, 0x620e5 + i),
);

/**
 * Free-spin strips: no Lowriders or Palm G, more Spray Cans for tags, and
 * any wild that lands expands to fill its reel.
 */
// Wilds only on reels 2 to 4, one each: expanding wilds are strong.
export const FREE_SPIN_REEL_COUNTS: readonly SymbolCounts[] = [
  { ...PAYING, WILD: 0, SCATTER: 2 },
  { ...PAYING, WILD: 1, SCATTER: 2 },
  { ...PAYING, WILD: 1, SCATTER: 2 },
  { ...PAYING, WILD: 1, SCATTER: 2 },
  { ...PAYING, WILD: 0, SCATTER: 2 },
];

export const FREE_SPIN_REELS: readonly (readonly SymbolId[])[] = FREE_SPIN_REEL_COUNTS.map((counts, i) =>
  buildStrip(counts, 0xf5ee + i),
);
