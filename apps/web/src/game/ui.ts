import type { Ask } from '../view/ask';

/** What the Vue header shows during free spins. */
export interface FreeSpinsHud {
  spin: number;
  total: number;
  multiplier: number;
  /** Spray Cans on the Tag the Hood wall towards the next level. */
  tags: number;
  maxed: boolean;
  /** Bumped to make the multiplier pulse. */
  pulse: number;
}

/**
 * base: reels and the full HUD. freeSpins: reels with the free-spins bar.
 * bonus: a full-screen canvas scene; the HUD steps aside and only the
 * action bar shows.
 */
export type UiMode = 'base' | 'freeSpins' | 'bonus';

/** How presenters and the controller talk to the Vue layer. */
export interface UiPort {
  setMode(mode: UiMode): void;
  setFreeSpins(hud: FreeSpinsHud | null): void;
  ask: Ask;
}
