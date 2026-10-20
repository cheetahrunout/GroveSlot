import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../src/casino';
import { BET_LADDER_CENTS } from '../src/game';
import { simulate } from '@lowrider/shared/engine/stats';

const manifest = JSON.parse(readFileSync(new URL('../../../casino-game.json', import.meta.url), 'utf8'));

describe('casino-game.json', () => {
  it('matches the server defaults', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.min_bet_cents).toBe(DEFAULT_LIMITS.minBetCents);
    expect(manifest.max_bet_cents).toBe(DEFAULT_LIMITS.maxBetCents);
    expect(manifest.max_win_cents).toBe(DEFAULT_LIMITS.maxWinCents);
    expect(BET_LADDER_CENTS).toContain(manifest.min_bet_cents);
    expect(BET_LADDER_CENTS).toContain(manifest.max_bet_cents);
    expect(manifest.multiplayer).toBe(false);
    expect(manifest.health_url).toBe('/health');
    expect(manifest.currency).toBe('euro');
    expect(manifest.repository).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
  });

  it('has a build ledger the casino can read (rule 14)', () => {
    const lines = readFileSync(new URL('../../../build-cost.jsonl', import.meta.url), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
    expect(lines.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const line of lines) {
      const e = JSON.parse(line);
      expect(e).toMatchObject({ id: expect.any(String), date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), model: expect.any(String), note: expect.any(String) });
      for (const k of ['input_tokens', 'output_tokens', 'cache_write_tokens', 'cache_read_tokens']) {
        expect(Number.isInteger(e[k] ?? 0)).toBe(true);
      }
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
    }
  });

  it('publishes the odds the casino checks the record against (integration 0.34.0)', () => {
    const r = simulate(400_000, 99);
    // rtp_sd: the spread of one round's return, in bets.
    expect(Math.abs(manifest.rtp_sd - r.stdDev)).toBeLessThan(1);
    const shares: Record<string, number> = {
      'Free Spins': r.features.freeSpins,
      'Cash Run': r.features.holdAndSpin,
      'Lowrider Hop': r.features.lowriderHop,
      'Turf War': r.features.turfWar,
      'Wanted Payday': r.payday,
    };
    const every: Record<string, number> = {
      'Free Spins': r.triggerEvery.freeSpins,
      'Cash Run': r.triggerEvery.holdAndSpin,
      'Lowrider Hop': r.triggerEvery.lowriderHop,
      'Turf War': r.triggerEvery.turfWar,
      'Wanted Payday': r.paydayEvery,
    };
    expect(manifest.features.map((f: { name: string }) => f.name).sort()).toEqual(Object.keys(shares).sort());
    for (const f of manifest.features as { name: string; every: number; rtp_bps: number; max_x: number }[]) {
      expect(Math.abs(f.rtp_bps / 10_000 - shares[f.name])).toBeLessThan(0.012);
      expect(Math.abs(f.every / every[f.name] - 1)).toBeLessThan(0.15);
      expect(f.max_x).toBeLessThanOrEqual(5000);
    }
    // The settle outcome names the Payday, the round whose value depends on earlier ones.
    expect(manifest.special_outcomes).toEqual(['payday']);
  }, 60_000);

  it('declares an RTP in the slot band that the game delivers', () => {
    expect(manifest.rtp_bps).toBeGreaterThanOrEqual(9200);
    expect(manifest.rtp_bps).toBeLessThanOrEqual(9700);
    // 400k rounds: the chance spread is about ±2.3 points, so allow 2.5.
    const r = simulate(400_000, 99);
    expect(Math.abs(r.rtp * 100 - manifest.rtp_bps / 100)).toBeLessThan(2.5);
  }, 60_000);
});
