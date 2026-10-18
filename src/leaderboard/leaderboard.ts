import { load, save, type KeyValueStore } from '../economy/storage';

/**
 * Leaderboards are local for now. The game only talks to this interface, so
 * an online implementation can be swapped in later without touching the UI.
 */
export type LeaderboardCategory = 'biggestWin' | 'biggestMultiplier' | 'territoriesTaken';

export interface LeaderboardEntry {
  name: string;
  score: number;
  /** Epoch milliseconds. */
  at: number;
}

export interface LeaderboardService {
  submit(category: LeaderboardCategory, entry: LeaderboardEntry): Promise<void>;
  top(category: LeaderboardCategory, limit?: number): Promise<LeaderboardEntry[]>;
}

const STORAGE_KEY = 'leaderboard';
const STORAGE_VERSION = 1;
const MAX_ENTRIES = 50;

type Boards = Partial<Record<LeaderboardCategory, LeaderboardEntry[]>>;

export class LocalLeaderboard implements LeaderboardService {
  /** Omit `store` to use localStorage; pass `null` to keep nothing. */
  constructor(private readonly store?: KeyValueStore | null) {}

  async submit(category: LeaderboardCategory, entry: LeaderboardEntry): Promise<void> {
    const boards = this.read();
    const list = [...(boards[category] ?? []), entry]
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, MAX_ENTRIES);
    save(STORAGE_KEY, STORAGE_VERSION, { ...boards, [category]: list }, this.store);
  }

  async top(category: LeaderboardCategory, limit = 10): Promise<LeaderboardEntry[]> {
    return (this.read()[category] ?? []).slice(0, limit);
  }

  private read(): Boards {
    return load<Boards>(STORAGE_KEY, STORAGE_VERSION, {}, this.store);
  }
}
