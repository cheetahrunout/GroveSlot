import { describe, expect, it } from 'vitest';
import { CASH_RUN, JACKPOTS } from '../src/config/features';
import { drawCashBag, playHoldAndSpin, type CashBag } from '../src/engine/features/holdAndSpin';
import { createRng, type Rng } from '../src/engine/rng';
import { INITIAL_STATE, playRound } from '../src/engine/round';

const bagsAt = (positions: [number, number][], value = 20): CashBag[] =>
  positions.map(([reel, row]) => ({ reel, row, value }));

describe('playHoldAndSpin', () => {
  it('gives 3 respins and resets them whenever a bag lands', () => {
    const rng = createRng(4);
    for (let run = 0; run < 500; run++) {
      const r = playHoldAndSpin(rng, bagsAt([[0, 0], [0, 1], [1, 0], [2, 2], [3, 1], [4, 0]]), 20, 0);
      let left: number = CASH_RUN.respins;
      for (const spin of r.respins) {
        left = spin.newBags.length > 0 ? CASH_RUN.respins : left - 1;
        if (r.bags.length < 15) expect(spin.respinsLeft).toBe(left);
      }
      if (!r.grand) expect(r.respins.at(-1)!.respinsLeft).toBe(0);
      const keys = r.bags.map((b) => `${b.reel},${b.row}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(r.totalWin).toBe(r.bags.reduce((n, b) => n + b.value, 0) + r.kingpinWin);
    }
  });

  it('pays the Kingpin with its pot when all 15 cells fill', () => {
    // An Rng that always lands a 1× bag.
    const always: Rng = { next: () => 0, int: () => 0, weighted: () => 0 };
    const start = bagsAt([[0, 0], [1, 1], [2, 2], [3, 0], [4, 1], [4, 2]]);
    const r = playHoldAndSpin(always, start, 20, 345);
    expect(r.grand).toBe(true);
    expect(r.bags).toHaveLength(15);
    expect(r.kingpinWin).toBe(JACKPOTS.kingpin.multiplier * 20 + 345);
  });

  it('values bags on the total bet, including jackpots', () => {
    const rng = createRng(8);
    let jackpots = 0;
    for (let i = 0; i < 20_000; i++) {
      const bag = drawCashBag(rng, { reel: 0, row: 0 }, 40);
      if (bag.jackpot) {
        jackpots++;
        expect(bag.value).toBe(JACKPOTS[bag.jackpot].multiplier * 40);
        expect(bag.jackpot).not.toBe('kingpin');
      } else {
        expect(bag.value % 40).toBe(0);
      }
    }
    expect(jackpots).toBeGreaterThan(0);
  });
});

describe('playRound with Cash Run', () => {
  it('values every Cash Bag on screen and starts the feature from them', () => {
    const { result, state } = playRound(createRng(9), INITIAL_STATE, 1, { force: 'holdAndSpin' });
    expect(result.cashBags.length).toBeGreaterThanOrEqual(6);
    expect(result.features.holdAndSpin!.initialBags).toEqual(result.cashBags);
    expect(state.kingpinPot).toBeGreaterThan(0);
  });

  it('grows the Kingpin pot by 0.5% of each bet', () => {
    const rng = createRng(1);
    let state = INITIAL_STATE;
    for (let i = 0; i < 100; i++) state = playRound(rng, state, 5).state;
    expect(state.kingpinPot).toBeCloseTo(100 * 100 * 0.005, 6);
  });
});
