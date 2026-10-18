import { describe, expect, it } from 'vitest';
import { FREE_SPINS } from '../src/config/features';
import { FREE_SPIN_REELS } from '../src/config/reels';
import type { SymbolId } from '../src/config/symbols';
import { expandWilds, playFreeSpins } from '../src/engine/features/freeSpins';
import { createRng } from '../src/engine/rng';
import { INITIAL_STATE, playRound } from '../src/engine/round';

describe('expandWilds', () => {
  it('turns every reel holding a wild fully wild', () => {
    const landed: SymbolId[][] = [
      ['A', 'K', 'Q'],
      ['J', 'WILD', 'Q'],
      ['A', 'A', 'A'],
      ['WILD', 'TEN', 'K'],
      ['Q', 'Q', 'Q'],
    ];
    const { grid, expandedReels } = expandWilds(landed);
    expect(expandedReels).toEqual([1, 3]);
    expect(grid[1]).toEqual(['WILD', 'WILD', 'WILD']);
    expect(grid[0]).toEqual(['A', 'K', 'Q']);
    expect(landed[1][0]).toBe('J');
  });
});

describe('playFreeSpins', () => {
  it('awards 10, 15 or 20 spins', () => {
    expect(playFreeSpins(createRng(1), 3, 1).initialSpins).toBe(10);
    expect(playFreeSpins(createRng(1), 4, 1).initialSpins).toBe(15);
    expect(playFreeSpins(createRng(1), 5, 1).initialSpins).toBe(20);
  });

  it('keeps its bookkeeping consistent over many runs', () => {
    const rng = createRng(3);
    for (let run = 0; run < 300; run++) {
      const fs = playFreeSpins(rng, 3, 2);
      const added = fs.spins.reduce((n, s) => n + s.addedSpins, 0);
      expect(fs.spins.length).toBe(Math.min(fs.initialSpins + added, FREE_SPINS.maxSpins));
      expect(fs.spins.at(-1)!.spinsLeft).toBe(0);
      expect(fs.totalWin).toBe(fs.spins.reduce((n, s) => n + s.win, 0));
      let multiplier = 1;
      for (const s of fs.spins) {
        expect(s.multiplier).toBe(multiplier);
        expect(s.win).toBe(s.evaluation.totalWin * s.multiplier);
        expect(s.retriggered).toBe(s.evaluation.scatterCount >= 3);
        if (s.levelUp) multiplier = Math.min(FREE_SPINS.maxMultiplier, 1 + Math.floor(s.tags / FREE_SPINS.tagsPerLevel));
      }
      expect(fs.finalMultiplier).toBe(multiplier);
      expect(fs.finalMultiplier).toBeLessThanOrEqual(FREE_SPINS.maxMultiplier);
    }
  });

  it('never puts a wild on reels 1 or 5 of the free-spin strips', () => {
    expect(FREE_SPIN_REELS[0]).not.toContain('WILD');
    expect(FREE_SPIN_REELS[4]).not.toContain('WILD');
  });
});

describe('playRound with free spins', () => {
  it('plays free spins when forced and adds them to the round total', () => {
    const { result } = playRound(createRng(11), INITIAL_STATE, 1, { force: 'freeSpins' });
    expect(result.base.triggers.freeSpins).toBe(true);
    const fs = result.features.freeSpins!;
    expect(fs.spins.length).toBeGreaterThanOrEqual(10);
    expect(result.totalWin).toBe(Math.min(result.base.totalWin + fs.totalWin, result.totalBet * 5000));
  });
});
