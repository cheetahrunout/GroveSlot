import { WANTED } from '../config/features';
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
import { presentLowriderHop } from './presenters/lowriderHop';
import { presentHoldAndSpin } from './presenters/holdAndSpin';
import { presentTurfWar } from './presenters/turfWar';
import { bagLabels } from '../view/format';
import { load, save } from '../economy/storage';

import { fmt } from './presenters/context';

function loadGameState(): GameState {
  const saved = load<GameState>('game', 1, INITIAL_STATE);
  const pot = Number(saved?.kingpinPot);
  const stars = Number(saved?.wanted?.stars);
  const streak = Number(saved?.wanted?.lossStreak);
  return {
    kingpinPot: Number.isFinite(pot) && pot >= 0 ? pot : 0,
    wanted: {
      stars: Number.isInteger(stars) && stars >= 0 && stars <= WANTED.maxStars ? stars : 0,
      lossStreak: Number.isInteger(streak) && streak >= 0 ? streak : 0,
    },
  };
}

/** Big wins stop auto-spin, as a multiple of the total bet. */
const AUTO_STOP_WIN = 25;

/** Runs the spin loop: takes the bet, plays a round and presents it. */
export class GameController {
  private busy = false;
  private autoRemaining: number | null = null;
  private turbo = false;
  private state: GameState = loadGameState();
  /** Debug only: the next spin gets a Drive-By. */
  forceDriveBy = false;
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
    this.scene.jackpots.update(this.wallet.totalBet, this.state.kingpinPot);
    this.scene.wanted.setStars(this.state.wanted.stars);
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
    const ctx: PresentContext = {
      scene: this.scene,
      turbo: this.turbo,
      auto: this.autoRemaining !== null,
      addWin: (n) => this.addWin(n),
    };
    if (result.features.freeSpins) {
      await wait(400);
      await presentFreeSpins(ctx, result.features.freeSpins);
    }
    if (result.features.lowriderHop) {
      await wait(400);
      await presentLowriderHop(ctx, result.features.lowriderHop);
    }
    if (result.features.holdAndSpin) {
      await wait(400);
      await presentHoldAndSpin(ctx, result.features.holdAndSpin);
    }
    if (result.features.turfWar) {
      await wait(400);
      await presentTurfWar(ctx, result.features.turfWar);
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

      const force = this.forceDriveBy ? 'driveBy' : this.forceNext;
      const { result, state } = playRound(this.rng, this.state, wallet.lineBet, { force });
      this.forceNext = undefined;
      this.forceDriveBy = false;
      this.state = state;
      save('game', 1, state);
      this.roundWin = 0;

      if (result.guaranteed) void scene.banner.show('5 STARS!', 'This spin pays at least 5× bet', 900, '#ff5a3c');
      await scene.reels.spinTo(result.landed, result.stops, BASE_REELS, this.turbo, bagLabels(result.cashBags));
      if (result.driveBy) {
        void scene.banner.show('DRIVE-BY!', `${result.driveBy.length} WILD${result.driveBy.length > 1 ? 'S' : ''} SPRAYED`, 700);
        await scene.reels.driveBy(result.driveBy);
      }
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
