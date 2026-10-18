/** Every symbol that can land on the reels. */
export const SYMBOLS = [
  'WILD', // Trident G
  'SCATTER', // Spray Can → Free Spins
  'BONUS', // Lowrider → Lowrider Hop
  'TURF', // Palm G → Turf War
  'OG',
  'SABRE',
  'HOUSE',
  'CHAIN',
  'BOOMBOX',
  'BMX',
  'BALL',
  'CAP',
  'A',
  'K',
  'Q',
  'J',
  'TEN',
] as const;

export type SymbolId = (typeof SYMBOLS)[number];

/** Symbols that never take part in payline wins and are never replaced by WILD. */
export const SPECIAL_SYMBOLS: ReadonlySet<SymbolId> = new Set(['SCATTER', 'BONUS', 'TURF']);
