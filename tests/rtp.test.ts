import { describe, expect, it } from 'vitest';
import { simulate } from '../src/engine/stats';

// A fixed seed keeps this deterministic: it fails only when the maths changes.
describe('game maths (200k simulated rounds)', () => {
  const r = simulate(200_000, 2024);

  it('keeps the base game near its RTP budget', () => {
    expect(r.base).toBeGreaterThan(0.54);
    expect(r.base).toBeLessThan(0.62);
  });

  it('keeps the hit rate in range', () => {
    expect(r.hitRate).toBeGreaterThan(0.2);
    expect(r.hitRate).toBeLessThan(0.32);
  });
});
