import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../src/economy/storage';
import { START_BALANCE, Wallet } from '../src/economy/wallet';

const memoryStore = (): KeyValueStore => {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};

describe('Wallet', () => {
  it('starts new players with 10,000 tokens at the lowest bet', () => {
    const w = new Wallet(memoryStore());
    expect(w.balance).toBe(START_BALANCE);
    expect(w.lineBet).toBe(1);
    expect(w.totalBet).toBe(20);
  });

  it('takes bets, pays wins and remembers both', () => {
    const store = memoryStore();
    const w = new Wallet(store);
    w.changeBet(1);
    expect(w.placeBet()).toBe(40);
    w.credit(100);
    const again = new Wallet(store);
    expect(again.balance).toBe(START_BALANCE - 40 + 100);
    expect(again.totalBet).toBe(40);
  });

  it('keeps the bet inside the allowed steps', () => {
    const w = new Wallet(memoryStore());
    expect(w.changeBet(-1)).toBe(false);
    for (let i = 0; i < 10; i++) w.changeBet(1);
    expect(w.lineBet).toBe(25);
  });

  it('refuses a bet it cannot cover', () => {
    const store = memoryStore();
    store.setItem('groveslot:wallet', JSON.stringify({ v: 1, data: { balance: 10, betIndex: 0 } }));
    const w = new Wallet(store);
    expect(w.canAfford()).toBe(false);
    expect(() => w.placeBet()).toThrow();
  });

  it('repairs corrupted saved data', () => {
    const store = memoryStore();
    store.setItem('groveslot:wallet', JSON.stringify({ v: 1, data: { balance: -5, betIndex: 99 } }));
    const w = new Wallet(store);
    expect(w.balance).toBe(START_BALANCE);
    expect(w.lineBet).toBe(25);
  });
});
