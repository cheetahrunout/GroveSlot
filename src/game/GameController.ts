import { BASE_REELS } from '../config/reels';
import type { Wallet } from '../economy/wallet';
import type { Rng } from '../engine/rng';
import { spinReels } from '../engine/spin';
import { INITIAL_STATE, playRound, type FeatureKey, type GameState, type RoundResult } from '../engine/round';
import type { GameScene } from '../view/GameScene';
import { COLORS } from '../view/theme';
import { countUp, timing, wait } from '../view/tween';
import type { PresentContext } from './presenters/context';
import { presentFreeSpins } from './presenters/freeSpins';

import { fmt } from './presenters/context';

/** Big wins stop auto-spin, as a multiple of the total bet. */
const AUTO_STOP_WIN = 25;

/** Runs the spin loop: takes the bet, plays a round and presents it. */
export class GameController {
  private busy = false;
  private autoRemaining: number | null = null;
  private turbo = false;
  private state: GameState = INITIAL_STATE;
  private scene!: GameScene;
  private roundWin = 0;
  /** Debug only: the next spin triggers this feature. */
  forceNext: FeatureKey | undefined;

  constructor(private readonly wallet: Wallet, private readonly rng: Rng) {}

  attach(scene: GameScene): void {
    this.scene = scene;
    scene.reels.show(spinReels(this.rng, BASE_REELS).grid);
    this.refreshHud();
    scene.hud.win.setValue('—');
  }

  private refreshHud(): void {
    const hud = this.scene.hud;
    hud.balance.setValue(fmt(this.wallet.balance));
    hud.bet.setValue(fmt(this.wallet.totalBet));
  }

  changeBet(direction: 1 | -1): void {
    if (this.busy) return;
    this.wallet.changeBet(direction);
    this.refreshHud();
  }

  toggleTurbo(): void {
    this.turbo = !this.turbo;
    timing.speed = this.turbo ? 2.2 : 1;
    this.scene.hud.turbo.setActive(this.turbo);
  }

  startAuto(count: number): void {
    this.autoRemaining = count;
    this.scene.hud.setAutoRemaining(count);
    void this.autoLoop();
  }

  stopAuto(): void {
    this.autoRemaining = null;
    this.scene.hud.setAutoRemaining(null);
  }

  private async autoLoop(): Promise<void> {
    while (this.autoRemaining !== null && this.autoRemaining > 0) {
      if (this.busy) {
        await wait(100);
        continue;
      }
      this.autoRemaining--;
      this.scene.hud.setAutoRemaining(this.autoRemaining);
      const result = await this.spin();
      if (!result || result.totalWin >= result.totalBet * AUTO_STOP_WIN) break;
      await wait(result.totalWin > 0 ? 700 : 250);
    }
    this.stopAuto();
  }

  private addWin(amount: number): void {
    this.roundWin += amount;
    this.scene.hud.win.setValue(fmt(this.roundWin));
  }

  private async presentFeatures(result: RoundResult): Promise<void> {
    const ctx: PresentContext = { scene: this.scene, turbo: this.turbo, addWin: (n) => this.addWin(n) };
    if (result.features.freeSpins) {
      await wait(400);
      await presentFreeSpins(ctx, result.features.freeSpins);
    }
  }

  /** Plays one round. Returns null when the spin could not start. */
  async spin(): Promise<RoundResult | null> {
    if (this.busy) return null;
    const { scene, wallet } = this;
    if (!wallet.canAfford()) {
      this.stopAuto();
      void scene.banner.show('NOT ENOUGH TOKENS', 'Lower your bet', 1200, COLORS.danger);
      return null;
    }
    this.busy = true;
    scene.hud.setBusy(true);
    try {
      wallet.placeBet();
      this.refreshHud();
      scene.hud.win.setValue('—');

      const { result, state } = playRound(this.rng, this.state, wallet.lineBet, { force: this.forceNext });
      this.forceNext = undefined;
      this.state = state;
      this.roundWin = 0;

      await scene.reels.spinTo(result.grid, result.stops, BASE_REELS, this.turbo);
      const base = result.base;
      if (base.totalWin > 0) {
        this.addWin(base.totalWin);
        await scene.reels.presentWins(base);
      }
      await this.presentFeatures(result);
      if (result.capped) {
        await scene.banner.show('MAX WIN', `Capped at ${fmt(result.totalWin)}`, 1500);
      }
      scene.hud.win.setValue(result.totalWin > 0 ? fmt(result.totalWin) : '—');

      wallet.credit(result.totalWin);
      if (result.totalWin > 0) {
        const before = wallet.balance - result.totalWin;
        await countUp(before, wallet.balance, Math.min(1200, 300 + result.totalWin), (v) =>
          scene.hud.balance.setValue(fmt(v)),
        );
      }
      this.refreshHud();
      return result;
    } finally {
      this.busy = false;
      scene.hud.setBusy(false);
    }
  }
}
