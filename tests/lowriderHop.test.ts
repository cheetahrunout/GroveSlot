import { describe, expect, it } from 'vitest';
import { LOWRIDER_HOP } from '../src/config/features';
import { playLowriderHop } from '../src/engine/features/lowriderHop';
import { createRng } from '../src/engine/rng';
import { INITIAL_STATE, playRound } from '../src/engine/round';

describe('playLowriderHop', () => {
  it('draws five hops from the table and pays them on the total bet', () => {
    const r = playLowriderHop(createRng(1), 40);
    expect(r.hops).toHaveLength(LOWRIDER_HOP.hops);
    for (const hop of r.hops) {
      expect(hop.multiplier).toBe(LOWRIDER_HOP.table[hop.level].multiplier);
      expect(hop.win).toBe(hop.multiplier * 40);
    }
    expect(r.totalWin).toBe(r.hops.reduce((n, h) => n + h.win, 0));
  });

  it('matches the table odds over many hops', () => {
    const rng = createRng(2);
    const counts = new Array(LOWRIDER_HOP.table.length).fill(0);
    const runs = 40_000;
    for (let i = 0; i < runs; i++) for (const h of playLowriderHop(rng, 1).hops) counts[h.level]++;
    const totalWeight = LOWRIDER_HOP.table.reduce((n, t) => n + t.weight, 0);
    LOWRIDER_HOP.table.forEach((t, level) => {
      expect(counts[level] / (runs * LOWRIDER_HOP.hops)).toBeCloseTo(t.weight / totalWeight, 2);
    });
  });

  it('is part of a round when three lowriders land', () => {
    const { result } = playRound(createRng(5), INITIAL_STATE, 1, { force: 'lowriderHop' });
    expect(result.features.lowriderHop?.hops).toHaveLength(5);
  });
});
