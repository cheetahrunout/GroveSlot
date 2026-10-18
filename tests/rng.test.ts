import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';

describe('createRng', () => {
  it('replays the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(createRng(43).next()).not.toBe(seqA[0]);
  });

  it('keeps next() in [0, 1) and int() in range', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = rng.int(5);
      expect(Number.isInteger(n) && n >= 0 && n < 5).toBe(true);
    }
  });

  it('distributes int() roughly evenly', () => {
    const rng = createRng(123);
    const counts = new Array(6).fill(0);
    const n = 600_000;
    for (let i = 0; i < n; i++) counts[rng.int(6)]++;
    for (const c of counts) expect(Math.abs(c / n - 1 / 6)).toBeLessThan(0.005);
  });

  it('follows weights and never picks zero-weight entries', () => {
    const rng = createRng(9);
    const counts = [0, 0, 0];
    const n = 300_000;
    for (let i = 0; i < n; i++) counts[rng.weighted([1, 0, 3])]++;
    expect(counts[1]).toBe(0);
    expect(counts[2] / n).toBeCloseTo(0.75, 2);
  });

  it('rejects invalid arguments', () => {
    const rng = createRng(1);
    expect(() => rng.int(0)).toThrow(RangeError);
    expect(() => rng.int(2.5)).toThrow(RangeError);
    expect(() => rng.weighted([0, 0])).toThrow(RangeError);
  });
});
