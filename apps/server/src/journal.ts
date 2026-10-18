import { DatabaseSync } from 'node:sqlite';
import { INITIAL_STATE, type GameState } from '@lowrider/shared/engine/round';

export type RoundStatus = 'opening' | 'open' | 'settled' | 'voided' | 'refused' | 'closed_by_casino';

/**
 * Game state only, never money: which rounds this server started and how
 * far they got (so a restart can clean up), and each player's Wanted stars.
 * Balances and amounts live with the casino.
 */
export class Journal {
  private readonly db: DatabaseSync;

  /** `path` is a file for production or ':memory:' for tests. */
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS rounds (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS rounds_unfinished ON rounds (status) WHERE status IN ('opening', 'open');
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  setRound(id: string, kind: string, status: RoundStatus): void {
    this.db
      .prepare(
        `INSERT INTO rounds (id, kind, status, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at`,
      )
      .run(id, kind, status, Date.now());
  }

  roundStatus(id: string): RoundStatus | null {
    const row = this.db.prepare('SELECT status FROM rounds WHERE id = ?').get(id) as { status: RoundStatus } | undefined;
    return row?.status ?? null;
  }

  /** Rounds that were opening or open when the server stopped. */
  unfinishedRounds(): { id: string; kind: string }[] {
    return this.db.prepare("SELECT id, kind FROM rounds WHERE status IN ('opening', 'open')").all() as { id: string; kind: string }[];
  }

  loadState(playerId: string): GameState {
    const row = this.db.prepare('SELECT state FROM players WHERE player_id = ?').get(playerId) as { state: string } | undefined;
    if (!row) return INITIAL_STATE;
    try {
      const parsed = JSON.parse(row.state) as GameState;
      const stars = Number(parsed?.wanted?.stars);
      const streak = Number(parsed?.wanted?.lossStreak);
      if (Number.isInteger(stars) && stars >= 0 && Number.isInteger(streak) && streak >= 0) {
        return { wanted: { stars, lossStreak: streak } };
      }
    } catch {
      // A damaged row falls back to a fresh state.
    }
    return INITIAL_STATE;
  }

  saveState(playerId: string, state: GameState): void {
    this.db
      .prepare(
        `INSERT INTO players (player_id, state, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (player_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
      )
      .run(playerId, JSON.stringify(state), Date.now());
  }

  /** Drops finished rounds older than `ms`; they are only kept for clean-up. */
  prune(ms: number): void {
    this.db.prepare("DELETE FROM rounds WHERE status NOT IN ('opening', 'open') AND updated_at < ?").run(Date.now() - ms);
  }

  close(): void {
    this.db.close();
  }
}
