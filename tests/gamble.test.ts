import { describe, expect, it } from 'vitest';
import { GAMBLE } from '../src/config/features';
import { canGamble, playGamble } from '../src/engine/features/gamble';
import { createRng } from '../src/engine/rng';

describe('Car Chase gamble', () => {
  it('doubles or loses the stake, 50/50 whichever alley you pick', () => {
    const rng = createRng(12);
    let wins = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const pick = i % 2 ? 'left' : 'right';
      const r = playGamble(rng, pick, 50);
      expect(r.won).toBe(r.escape === pick);
      expect(r.stake).toBe(r.won ? 100 : 0);
      if (r.won) wins++;
    }
    expect(wins / n).toBeCloseTo(0.5, 2);
  });

  it('stops after 5 rounds or once doubling would pass 10× the win', () => {
    expect(canGamble(100, 100, 0)).toBe(true);
    expect(canGamble(100, 800, 3)).toBe(false); // 1,600 > 1,000
    expect(canGamble(100, 400, 2)).toBe(true);
    expect(canGamble(100, 100, GAMBLE.maxRounds)).toBe(false);
    expect(canGamble(100, 0, 1)).toBe(false);
    expect(canGamble(0, 0, 0)).toBe(false);
  });
});
