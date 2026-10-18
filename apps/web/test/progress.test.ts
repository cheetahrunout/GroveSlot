import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../src/economy/storage';
import { Progress } from '../src/economy/progress';
import { createRng } from '@lowrider/shared/engine/rng';
import { INITIAL_STATE, playRound } from '@lowrider/shared/engine/round';

const memoryStore = (): KeyValueStore => {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};

describe('Progress', () => {
  it('counts rounds and unlocks achievements once', () => {
    const store = memoryStore();
    const p = new Progress(store);
    const { result } = playRound(createRng(1), INITIAL_STATE, 1, { force: 'lowriderHop' });
    const unlocked = p.recordRound(result, 42);
    expect(p.stats.spins).toBe(1);
    expect(p.stats.featureCounts.lowriderHop).toBe(1);
    expect(unlocked.map((a) => a.id)).toContain('firstBonus');
    expect(p.recordRound(result, 43).map((a) => a.id)).not.toContain('firstBonus');
    expect(new Progress(store).isUnlocked('firstBonus')).toBe(true);
  });

  it('tracks Car Chase streaks', () => {
    const p = new Progress(memoryStore());
    p.recordChase(true);
    p.recordChase(true);
    expect(p.recordChase(true).map((a) => a.id)).toContain('escape');
    p.recordChase(false);
    expect(p.stats.chaseStreak).toBe(0);
    expect(p.stats.bestChaseStreak).toBe(3);
  });

  it('only allows unlocked skins', () => {
    const store = memoryStore();
    store.setItem('groveslot:progress', JSON.stringify({ v: 1, data: { settings: { skin: 'rain' } } }));
    expect(new Progress(store).settings.skin).toBe('classic');
  });
});
