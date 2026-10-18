import { describe, expect, it } from 'vitest';
import { PAYLINES } from '../src/config/paylines';
import { BONUS_REELS, LINE_PAYS, TURF_REELS } from '../src/config/paytable';
import { BASE_REEL_COUNTS, BASE_REELS, MIN_SPECIAL_SPACING, REEL_COUNT, ROW_COUNT, buildStrip } from '../src/config/reels';
import { SPECIAL_SYMBOLS, SYMBOLS } from '../src/config/symbols';

describe('paylines', () => {
  it('has 20 distinct lines across 5 reels with valid rows', () => {
    expect(PAYLINES).toHaveLength(20);
    expect(new Set(PAYLINES.map((l) => l.join())).size).toBe(20);
    for (const line of PAYLINES) {
      expect(line).toHaveLength(REEL_COUNT);
      for (const row of line) expect(row >= 0 && row < ROW_COUNT).toBe(true);
    }
  });
});

describe('paytable', () => {
  it('pays every non-special symbol and pays more for longer matches', () => {
    for (const sym of SYMBOLS) {
      const pays = LINE_PAYS[sym];
      if (SPECIAL_SYMBOLS.has(sym)) {
        expect(pays).toBeUndefined();
        continue;
      }
      expect(pays).toBeDefined();
      expect(pays![3]).toBeLessThan(pays![4]);
      expect(pays![4]).toBeLessThan(pays![5]);
    }
  });
});

describe('reel strips', () => {
  it('builds each strip from exactly its symbol counts', () => {
    expect(BASE_REELS).toHaveLength(REEL_COUNT);
    BASE_REELS.forEach((strip, reel) => {
      const counts: Record<string, number> = {};
      for (const s of strip) counts[s] = (counts[s] ?? 0) + 1;
      expect(counts).toEqual(BASE_REEL_COUNTS[reel]);
    });
  });

  it('only puts Lowriders and Palm G on their trigger reels', () => {
    BASE_REELS.forEach((strip, reel) => {
      expect(strip.includes('BONUS')).toBe(BONUS_REELS.includes(reel));
      expect(strip.includes('TURF')).toBe(TURF_REELS.includes(reel));
    });
  });

  it('never shows two specials or wilds in the same reel window', () => {
    for (const strip of BASE_REELS) {
      for (let stop = 0; stop < strip.length; stop++) {
        const window = Array.from({ length: MIN_SPECIAL_SPACING }, (_, r) => strip[(stop + r) % strip.length]);
        expect(window.filter((s) => s === 'WILD' || SPECIAL_SYMBOLS.has(s)).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    expect(buildStrip(BASE_REEL_COUNTS[0], 99)).toEqual(buildStrip(BASE_REEL_COUNTS[0], 99));
  });
});
