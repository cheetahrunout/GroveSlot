import { BET_PER_LINE_OPTIONS } from '../config/paytable';
import { PAYLINES } from '../config/paylines';
import { load, save, type KeyValueStore } from './storage';

export const START_BALANCE = 10_000;

interface WalletData {
  balance: number;
  betIndex: number;
}

const KEY = 'wallet';
const VERSION = 1;

/** Token balance and bet size, saved between visits. Tokens are play money only. */
export class Wallet {
  private data: WalletData;

  constructor(private readonly store?: KeyValueStore | null) {
    const loaded = load<WalletData>(KEY, VERSION, { balance: START_BALANCE, betIndex: 0 }, store);
    this.data = {
      balance: Number.isFinite(loaded.balance) && loaded.balance >= 0 ? Math.floor(loaded.balance) : START_BALANCE,
      betIndex: Math.min(Math.max(0, Math.floor(loaded.betIndex) || 0), BET_PER_LINE_OPTIONS.length - 1),
    };
  }

  get balance(): number {
    return this.data.balance;
  }

  get lineBet(): number {
    return BET_PER_LINE_OPTIONS[this.data.betIndex];
  }

  get totalBet(): number {
    return this.lineBet * PAYLINES.length;
  }

  get minTotalBet(): number {
    return BET_PER_LINE_OPTIONS[0] * PAYLINES.length;
  }

  canAfford(): boolean {
    return this.data.balance >= this.totalBet;
  }

  /** Moves the bet one step up or down; returns false at either end. */
  changeBet(direction: 1 | -1): boolean {
    const next = this.data.betIndex + direction;
    if (next < 0 || next >= BET_PER_LINE_OPTIONS.length) return false;
    this.data.betIndex = next;
    this.persist();
    return true;
  }

  /** Takes the bet for a spin. Throws if the balance is too low. */
  placeBet(): number {
    if (!this.canAfford()) throw new Error('Balance too low for this bet');
    this.data.balance -= this.totalBet;
    this.persist();
    return this.totalBet;
  }

  credit(amount: number): void {
    if (!(amount >= 0) || !Number.isFinite(amount)) throw new RangeError(`Bad credit amount ${amount}`);
    this.data.balance += Math.floor(amount);
    this.persist();
  }

  private persist(): void {
    save(KEY, VERSION, this.data, this.store);
  }
}
