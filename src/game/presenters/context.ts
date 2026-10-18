import type { GameScene } from '../../view/GameScene';

/** What a bonus presenter needs from the controller. */
export interface PresentContext {
  scene: GameScene;
  turbo: boolean;
  /** Adds to the round's running win shown in the WIN box. */
  addWin(amount: number): void;
}

export const fmt = (n: number) => n.toLocaleString('en-US');
