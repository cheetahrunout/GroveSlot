import { describe, expect, it } from 'vitest';
import { simulate } from '../src/engine/stats';

// A fixed seed keeps this deterministic: it fails only when the maths changes.
describe('game maths (200k simulated rounds)', () => {
  const r = simulate(200_000, 2024);

  it('keeps the base game near its RTP budget', () => {
    expect(r.base).toBeGreaterThan(0.54);
    expect(r.base).toBeLessThan(0.62);
  });

  it('keeps free spins near their RTP budget', () => {
    expect(r.features.freeSpins).toBeGreaterThan(0.15);
    expect(r.features.freeSpins).toBeLessThan(0.27);
  });

  it('keeps Lowrider Hop near its RTP budget', () => {
    expect(r.features.lowriderHop).toBeGreaterThan(0.04);
    expect(r.features.lowriderHop).toBeLessThan(0.1);
  });

  it('keeps Cash Run and jackpots near their RTP budget', () => {
    expect(r.features.holdAndSpin).toBeGreaterThan(0.04);
    expect(r.features.holdAndSpin).toBeLessThan(0.11);
  });

  it('keeps the hit rate in range', () => {
    expect(r.hitRate).toBeGreaterThan(0.18);
    expect(r.hitRate).toBeLessThan(0.32);
  });
});
