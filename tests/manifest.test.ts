import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { DEFAULT_LIMITS } from '../server/casino';
import { BET_LADDER_CENTS } from '../server/game';
import { simulate } from '../src/engine/stats';

const manifest = JSON.parse(readFileSync(new URL('../casino-game.json', import.meta.url), 'utf8'));

describe('casino-game.json', () => {
  it('matches the package version and the server defaults', () => {
    expect(manifest.version).toBe(pkg.version);
    expect(manifest.min_bet_cents).toBe(DEFAULT_LIMITS.minBetCents);
    expect(manifest.max_bet_cents).toBe(DEFAULT_LIMITS.maxBetCents);
    expect(manifest.max_win_cents).toBe(DEFAULT_LIMITS.maxWinCents);
    expect(BET_LADDER_CENTS).toContain(manifest.min_bet_cents);
    expect(BET_LADDER_CENTS).toContain(manifest.max_bet_cents);
    expect(manifest.multiplayer).toBe(false);
    expect(manifest.health_url).toBe('/health');
  });

  it('declares an RTP in the slot band that the game delivers', () => {
    expect(manifest.rtp_bps).toBeGreaterThanOrEqual(9200);
    expect(manifest.rtp_bps).toBeLessThanOrEqual(9700);
    // 400k rounds: the chance spread is about ±2.3 points, so allow 2.5.
    const r = simulate(400_000, 99);
    expect(Math.abs(r.rtp * 100 - manifest.rtp_bps / 100)).toBeLessThan(2.5);
  });
});
