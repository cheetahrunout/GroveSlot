import { WANTED } from '../config/features';
import { BASE_REELS } from '../config/reels';
import { SKINS } from '../economy/achievements';
import { DAILY_ALLOWANCE, RESCUE_AMOUNT, type Progress, type Settings } from '../economy/progress';
import { load, save } from '../economy/storage';
import type { Wallet } from '../economy/wallet';
import { playGamble } from '../engine/features/gamble';
import type { Rng } from '../engine/rng';
import { INITIAL_STATE, playRound, type FeatureKey, type GameState, type RoundResult } from '../engine/round';
import { spinReels } from '../engine/spin';
import type { LeaderboardService } from '../leaderboard/leaderboard';
import { sound } from '../audio/sound';
import { bigWinTier, showBigWin } from '../view/BigWin';
import { showDialog } from '../view/Dialog';
import { bagLabels } from '../view/format';
import type { GameScene } from '../view/GameScene';
import { CarChaseScene } from '../view/scenes/CarChaseScene';
import { MenuPanel } from '../view/scenes/MenuPanel';
import { TRANSITION_COLORS, playTransition } from '../view/Transition';
import { COLORS } from '../view/theme';
import { countUp, timing, wait } from '../view/tween';
import { fmt, type PresentContext } from './presenters/context';
import { presentFreeSpins } from './presenters/freeSpins';
import { presentHoldAndSpin } from './presenters/holdAndSpin';
import { presentLowriderHop } from './presenters/lowriderHop';
import { presentTurfWar } from './presenters/turfWar';

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
/** Rounds worth a leaderboard entry, as a multiple of the total bet. */
const LEADERBOARD_MIN_MULTIPLIER = 10;

/** Runs the game: takes bets, plays rounds, presents them and keeps score. */
export class GameController {
  private busy = false;
  private autoRemaining: number | null = null;
  private turbo = false;
  private state: GameState = loadGameState();
  private scene!: GameScene;
  private roundWin = 0;
  /** The last round's win, while the Car Chase gamble is on offer. */
  private gambleOffer = 0;
  /** Debug only: the next spin triggers this feature. */
  forceNext: FeatureKey | undefined;
  /** Debug only: the next spin gets a Drive-By. */
  forceDriveBy = false;

  constructor(
    private readonly wallet: Wallet,
    private readonly rng: Rng,
    private readonly progress: Progress,
    private readonly leaderboard: LeaderboardService,
  ) {}

  attach(scene: GameScene): void {
    this.scene = scene;
    scene.applySkin(this.progress.settings.skin);
    sound.setSfx(this.progress.settings.sound);
    sound.setMusic(this.progress.settings.music);
    scene.reels.show(spinReels(this.rng, BASE_REELS).grid);
    this.refreshHud();
    scene.hud.win.setValue('—');
    void this.offerDaily();
  }

  private refreshHud(): void {
    const hud = this.scene.hud;
    hud.balance.setValue(fmt(this.wallet.balance));
    hud.bet.setValue(fmt(this.wallet.totalBet));
    this.scene.jackpots.update(this.wallet.totalBet, this.state.kingpinPot);
    this.scene.wanted.setStars(this.state.wanted.stars);
  }

  /** Runs `task` with the controls locked. */
  private async locked<T>(task: () => Promise<T>): Promise<T | null> {
    if (this.busy) return null;
    this.busy = true;
    this.scene.hud.setBusy(true);
    try {
      return await task();
    } finally {
      this.busy = false;
      this.scene.hud.setBusy(false);
    }
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
    if (this.busy) return;
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

  // --- Free tokens -------------------------------------------------------

  private async offerDaily(): Promise<void> {
    if (this.progress.dailyWait() > 0) return;
    await this.locked(async () => {
      await showDialog(this.scene.overlay, this.scene.layout, 'DAILY ALLOWANCE', `Your daily ${fmt(DAILY_ALLOWANCE)} free tokens are here.`, [
        { label: `CLAIM +${fmt(DAILY_ALLOWANCE)}`, value: 'claim', fill: COLORS.gold, textColor: COLORS.background },
      ]);
      const amount = this.progress.claimDaily();
      if (amount > 0) this.wallet.credit(amount);
      this.refreshHud();
    });
  }

  /** Called when the balance cannot cover the bet. */
  private async handleBroke(): Promise<void> {
    const { scene, wallet, progress } = this;
    this.stopAuto();
    if (wallet.balance >= wallet.minTotalBet) {
      void scene.banner.show('NOT ENOUGH TOKENS', 'Lower your bet', 1200, COLORS.danger);
      return;
    }
    await this.locked(async () => {
      const rescueIn = progress.rescueWait();
      if (rescueIn > 0) {
        const minutes = Math.ceil(rescueIn / 60000);
        const daily = Math.ceil(progress.dailyWait() / 3_600_000);
        await showDialog(scene.overlay, scene.layout, 'OUT OF TOKENS', `Next free top-up in ${minutes} min. Daily allowance in ${daily} h.`, [
          { label: 'OK', value: 'ok' },
        ]);
        return;
      }
      await showDialog(scene.overlay, scene.layout, 'BACK ON YOUR FEET', `Out of tokens? Here are ${fmt(RESCUE_AMOUNT)} free ones. Once an hour.`, [
        { label: `TAKE +${fmt(RESCUE_AMOUNT)}`, value: 'take', fill: COLORS.gold, textColor: COLORS.background },
      ]);
      const amount = progress.claimRescue(wallet.balance, wallet.minTotalBet);
      if (amount > 0) wallet.credit(amount);
      this.refreshHud();
    });
  }

  // --- Menu and settings -------------------------------------------------

  async openMenu(): Promise<void> {
    await this.locked(async () => {
      const panel = new MenuPanel(this.scene.layout, {
        progress: this.progress,
        leaderboard: this.leaderboard,
        lineBet: this.wallet.lineBet,
        onSettings: (patch) => this.applySettings(patch),
      });
      this.scene.overlay.addChild(panel);
      await panel.closed;
    });
  }

  private applySettings(patch: Partial<Settings>): void {
    if (patch.skin && !this.progress.isSkinUnlocked(patch.skin)) delete patch.skin;
    this.progress.updateSettings(patch);
    if (patch.skin) this.scene.applySkin(patch.skin);
    if (patch.sound !== undefined) sound.setSfx(patch.sound);
    if (patch.music !== undefined) sound.setMusic(patch.music);
    if (patch.gamble === false) this.setGambleOffer(0);
  }

  // --- Car Chase ---------------------------------------------------------

  private setGambleOffer(amount: number): void {
    this.gambleOffer = amount;
    this.scene.hud.gamble.visible = amount > 0;
  }

  /** Car Chase: risk the last win on a 50/50 for double. */
  async gamble(): Promise<void> {
    const offer = this.gambleOffer;
    if (offer <= 0) return;
    await this.locked(async () => {
      const { scene, wallet } = this;
      this.setGambleOffer(0);
      wallet.debit(offer);
      let final = 0;
      try {
        let view!: CarChaseScene;
        let chase!: Promise<number>;
        await playTransition(scene.overlay, scene.layout, {
          colors: TRANSITION_COLORS.carChase,
          title: 'CAR CHASE',
          sub: `${fmt(offer)} ON THE LINE`,
          hold: 700,
          onCovered: () => {
            view = new CarChaseScene(scene.layout);
            scene.overlay.addChildAt(view, 0);
            chase = view.play(offer, (pick, stake) => {
              const outcome = playGamble(this.rng, pick, stake);
              this.toastAchievements(this.progress.recordChase(outcome.won));
              return outcome;
            });
          },
        });
        final = await chase;
        await playTransition(scene.overlay, scene.layout, {
          colors: TRANSITION_COLORS.carChase,
          onCovered: () => view.destroy({ children: true }),
        });
      } finally {
        wallet.credit(final);
      }
      scene.hud.win.setValue(final > 0 ? fmt(final) : '—');
      this.refreshHud();
    });
  }

  // --- Rounds ------------------------------------------------------------

  private addWin(amount: number): void {
    this.roundWin += amount;
    this.scene.hud.win.setValue(fmt(this.roundWin));
  }

  private toastAchievements(list: { name: string; description: string; unlocks?: keyof typeof SKINS }[]): void {
    for (const a of list) {
      const extra = a.unlocks ? ` · ${SKINS[a.unlocks].name} skin unlocked` : '';
      this.scene.toasts.show(a.name, `${a.description}${extra}`);
    }
  }

  private async presentFeatures(result: RoundResult): Promise<void> {
    const ctx: PresentContext = {
      scene: this.scene,
      turbo: this.turbo,
      auto: this.autoRemaining !== null,
      addWin: (n) => this.addWin(n),
    };
    const { freeSpins, lowriderHop, holdAndSpin, turfWar } = result.features;
    if (freeSpins) await wait(400).then(() => presentFreeSpins(ctx, freeSpins));
    if (lowriderHop) await wait(400).then(() => presentLowriderHop(ctx, lowriderHop));
    if (holdAndSpin) await wait(400).then(() => presentHoldAndSpin(ctx, holdAndSpin));
    if (turfWar) await wait(400).then(() => presentTurfWar(ctx, turfWar));
  }

  private submitScores(result: RoundResult): void {
    const name = this.progress.settings.name;
    const at = Date.now();
    const multiplier = result.totalWin / result.totalBet;
    if (multiplier >= LEADERBOARD_MIN_MULTIPLIER) {
      void this.leaderboard.submit('biggestWin', { name, score: result.totalWin, at });
      void this.leaderboard.submit('biggestMultiplier', { name, score: Math.round(multiplier * 10) / 10, at });
    }
    const taken = result.features.turfWar?.territoriesTaken ?? 0;
    if (taken > 0) void this.leaderboard.submit('territoriesTaken', { name, score: taken, at });
  }

  /** Plays one round. Returns null when the spin could not start. */
  async spin(): Promise<RoundResult | null> {
    if (this.busy) return null;
    if (!this.wallet.canAfford()) {
      await this.handleBroke();
      return null;
    }
    return this.locked(async () => {
      const { scene, wallet } = this;
      this.setGambleOffer(0);
      wallet.placeBet();
      this.refreshHud();
      scene.hud.win.setValue('—');

      const force = this.forceDriveBy ? 'driveBy' : this.forceNext;
      const { result, state } = playRound(this.rng, this.state, wallet.lineBet, { force });
      this.forceNext = undefined;
      this.forceDriveBy = false;
      // The outcome is final: pay and save it now, then show it.
      this.state = state;
      save('game', 1, state);
      wallet.credit(result.totalWin);
      const shownBalance = wallet.balance - result.totalWin;
      const unlocked = this.progress.recordRound(result);
      this.submitScores(result);
      this.roundWin = 0;

      if (result.guaranteed) void scene.banner.show('5 STARS!', 'This spin pays at least 5x bet', 900, '#ff5a3c');
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
      if (result.capped) await scene.banner.show('MAX WIN', `Capped at ${fmt(result.totalWin)}`, 1500);
      scene.hud.win.setValue(result.totalWin > 0 ? fmt(result.totalWin) : '—');
      if (bigWinTier(result.totalWin, result.totalBet) >= 0) {
        scene.reels.clearWins();
        await showBigWin(scene.overlay, scene.layout, result.totalWin, result.totalBet);
      }

      if (result.totalWin > 0) {
        await countUp(shownBalance, wallet.balance, Math.min(1200, 300 + result.totalWin), (v) => scene.hud.balance.setValue(fmt(v)));
      }
      this.refreshHud();
      this.toastAchievements(unlocked);
      if (result.totalWin > 0 && this.autoRemaining === null && this.progress.settings.gamble) this.setGambleOffer(result.totalWin);
      return result;
    });
  }
}
