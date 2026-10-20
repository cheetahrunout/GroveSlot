import { DatabaseSync } from 'node:sqlite';
import { INITIAL_STATE, type GameState } from '@lowrider/shared/engine/round';

/** `decided`: the outcome is fixed and its win recorded, so the round is settled (never voided) after a restart. */
export type RoundStatus = 'opening' | 'open' | 'decided' | 'settled' | 'voided' | 'refunded' | 'refused' | 'closed_by_casino';

/** A round this server started but did not finish; `winCents` is set once it was decided. */
export interface UnfinishedRound {
  id: string;
  kind: string;
  status: 'opening' | 'open' | 'decided';
  winCents: number | null;
  outcome: string | null;
}

/**
 * Meters saved before the journal kept the Payday bet count as filled at the
 * smallest bet Lowrider offers (BET_LADDER_CENTS), so they pay out honestly.
 */
const LEGACY_FILL_BET_CENTS = 20;

/**
 * Game state only, never money: which rounds this server started and how
 * far they got (so a restart can settle or clean up), and each player's Wanted
 * meter.
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
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    // Journals from before the decided win was kept get the columns added.
    const columns = (this.db.prepare('PRAGMA table_info(rounds)').all() as { name: string }[]).map((c) => c.name);
    if (!columns.includes('win_cents')) this.db.exec('ALTER TABLE rounds ADD COLUMN win_cents INTEGER');
    if (!columns.includes('outcome')) this.db.exec('ALTER TABLE rounds ADD COLUMN outcome TEXT');
    this.db.exec(`
      DROP INDEX IF EXISTS rounds_unfinished;
      CREATE INDEX IF NOT EXISTS rounds_unfinished_v2 ON rounds (status) WHERE status IN ('opening', 'open', 'decided');
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

  /** The outcome is decided: from here on the round is settled with this win, also after a restart. */
  setDecided(id: string, kind: string, winCents: number, outcome: string): void {
    this.db
      .prepare(
        `INSERT INTO rounds (id, kind, status, updated_at, win_cents, outcome) VALUES (?, ?, 'decided', ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET status = 'decided', updated_at = excluded.updated_at, win_cents = excluded.win_cents, outcome = excluded.outcome`,
      )
      .run(id, kind, Date.now(), winCents, outcome);
  }

  roundStatus(id: string): RoundStatus | null {
    const row = this.db.prepare('SELECT status FROM rounds WHERE id = ?').get(id) as { status: RoundStatus } | undefined;
    return row?.status ?? null;
  }

  /** Rounds that were opening, open or decided but not settled when the server stopped. */
  unfinishedRounds(): UnfinishedRound[] {
    const rows = this.db
      .prepare("SELECT id, kind, status, win_cents, outcome FROM rounds WHERE status IN ('opening', 'open', 'decided')")
      .all() as { id: string; kind: string; status: UnfinishedRound['status']; win_cents: number | null; outcome: string | null }[];
    return rows.map((r) => ({ id: r.id, kind: r.kind, status: r.status, winCents: r.win_cents, outcome: r.outcome }));
  }

  loadState(playerId: string): GameState {
    const row = this.db.prepare('SELECT state FROM players WHERE player_id = ?').get(playerId) as { state: string } | undefined;
    if (!row) return INITIAL_STATE;
    try {
      const parsed = JSON.parse(row.state) as GameState;
      const stars = Number(parsed?.wanted?.stars);
      const streak = Number(parsed?.wanted?.lossStreak);
      const saved = parsed?.wanted?.bet;
      const bet = saved === undefined ? (stars > 0 ? LEGACY_FILL_BET_CENTS : 0) : Number(saved);
      if (Number.isInteger(stars) && stars >= 0 && Number.isInteger(streak) && streak >= 0 && Number.isInteger(bet) && (stars === 0 ? bet >= 0 : bet > 0)) {
        return { wanted: { stars, lossStreak: streak, bet } };
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
    this.db.prepare("DELETE FROM rounds WHERE status NOT IN ('opening', 'open', 'decided') AND updated_at < ?").run(Date.now() - ms);
  }

  close(): void {
    this.db.close();
  }
}
