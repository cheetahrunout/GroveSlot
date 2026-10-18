/**
 * How a canvas scene asks the player something. The scene says what the
 * choices are; the Vue action bar shows them as real buttons (keyboard and
 * screen reader friendly) and answers with the chosen id.
 */
export interface Choice {
  id: string;
  label: string;
  tone?: 'go' | 'gold' | 'plain';
}

export interface AskOptions {
  /** Shown above the buttons. */
  title?: string;
  /** Read out by screen readers when the scene already shows the title itself. */
  label?: string;
  /** Answer automatically after this long (auto-spin, or a player who walked away). */
  autoAfterMs?: number;
  /** The answer used when the time runs out (defaults to the first choice). */
  autoChoice?: string;
}

export type Ask = (choices: Choice[], options?: AskOptions) => Promise<string>;
