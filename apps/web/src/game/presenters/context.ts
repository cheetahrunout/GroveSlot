import type { GameScene } from '../../view/GameScene';
import type { UiPort } from '../ui';

/** What a bonus presenter needs from the controller. */
export interface PresentContext {
  scene: GameScene;
  ui: UiPort;
  turbo: boolean;
  /** Auto-spin is running: bonuses play without waiting for input. */
  auto: boolean;
  /** Adds to the round's running win shown in the WIN box. */
  addWin(amount: number): void;
}
