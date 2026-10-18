import { GAMBLE } from '@lowrider/shared/config/features';
import { PAYLINES } from '@lowrider/shared/config/paylines';
import { BASE_REELS, ROW_COUNT } from '@lowrider/shared/config/reels';
import type { PublicState } from '@lowrider/shared/api';
import type { FeatureKey, RoundResult } from '@lowrider/shared/engine/round';
import { sound } from '../audio/sound';
import { SKINS } from '../economy/achievements';
import type { Progress, Settings } from '../economy/progress';
import type { GameStore } from '../stores/game';
import { bigWinTier, showBigWin } from '../view/BigWin';
import { bagLabels, euro } from '../view/format';
import type { GameScene } from '../view/GameScene';
import { CarChaseScene } from '../view/scenes/CarChaseScene';
import { COLORS } from '../view/theme';
import { TRANSITION_COLORS, playTransition } from '../view/Transition';
import { timing, wait } from '../view/tween';
import { ApiError, api } from './api';
import type { PresentContext } from './presenters/context';
import { presentFreeSpins } from './presenters/freeSpins';
import { presentHoldAndSpin } from './presenters/holdAndSpin';
import { presentLowriderHop } from './presenters/lowriderHop';
import { presentTurfWar } from './presenters/turfWar';
import { createAsk } from './prompt';
import type { UiPort } from './ui';

/** Big wins stop auto-spin, as a multiple of the total bet. */
const AUTO_STOP_WIN = 25;
const BET_PREF_KEY = 'groveslot:betCents';

function savedBet(): number {
  try {
    return Number(localStorage.getItem(BET_PREF_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Runs the page side of Lowrider. It sends the player's intentions (spin,
 * gamble pick) to the game server and plays back what comes back: the
 * PixiJS scene draws it, the Pinia store feeds the Vue HUD. It never
 * decides an outcome and never holds money.
 */
export class GameController {
  private readonly ui: UiPort;
  /** Local play only: the next spin triggers this (the server ignores it with the real casino). */
  forceNext: FeatureKey | 'driveBy' | undefined;

  constructor(
    private readonly store: GameStore,
    private readonly scene: GameScene,
    private readonly progress: Progress,
  ) {
    store.betCents = savedBet();
    store.showGamble = progress.settings.gamble;
    store.turbo = false;
    this.ui = {
      setMode: (mode) => {
        store.mode = mode;
        if (mode !== 'freeSpins' && mode !== 'bonus') store.freeSpins = null;
      },
      setFreeSpins: (hud) => (store.freeSpins = hud),
      ask: createAsk(store),
    };
  }

  async start(): Promise<void> {
    const { scene, store } = this;
    scene.applySkin(this.progress.settings.skin);
    sound.setSfx(this.progress.settings.sound);
    sound.setMusic(this.progress.settings.music);
    // A still frame of the real strips until the first spin.
    scene.reels.show(BASE_REELS.map((strip) => strip.slice(0, ROW_COUNT)));

    // The casino sends players here with a one-time token: use it once, then drop it from the URL.
    const params = new URLSearchParams(window.location.search);
    const token = params.get('gc_token');
    if (token) {
      params.delete('gc_token');
      const query = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }
    try {
      const welcome = await api.openSession(token);
      store.lobbyUrl = welcome.lobbyUrl;
      store.hasSession = true;
      this.applyState(welcome.state);
    } catch (e) {
      const body = e instanceof ApiError ? e.body : {};
      store.lobbyUrl = typeof body.lobbyUrl === 'string' ? body.lobbyUrl : '';
      if (body.state) this.applyState(body.state as PublicState);
      if (!(e instanceof ApiError) || e.status !== 401) this.showError(e);
    }
    store.connected = true;

    api.events((c) => {
      const reopened = store.status !== 'live' && c.status === 'live';
      store.status = c.status;
      store.reason = c.reason;
      // A halt closes every session: only the lobby can open a new one.
      if (c.status === 'halted' || c.status === 'maintenance') store.hasSession = false;
      if (c.status !== 'live') {
        this.stopAuto();
        store.gambleOffer = null;
      }
      if (reopened && store.hasSession) void api.state().then((w) => this.applyState(w.state), () => undefined);
    });
    window.addEventListener('pagehide', () => api.leave());
  }

  private applyState(state: PublicState): void {
    const { store } = this;
    store.status = state.status;
    store.reason = state.reason;
    store.balance = state.balance;
    store.betOptions = state.betOptions;
    store.wantedStars = state.wantedStars;
    store.gambleOffer = state.gamble;
    const options = state.betOptions;
    if (options.length > 0 && !options.includes(store.betCents)) {
      // Keep the player's bet when the limits allow it, else the closest one below.
      store.betCents = [...options].reverse().find((b) => b <= store.betCents) ?? options[0];
    }
  }

  private showError(e: unknown): void {
    const message = e instanceof Error ? e.message : 'Something went wrong.';
    void this.scene.banner.show('HOLD UP', message, 2200, COLORS.danger);
  }

  // --- controls --------------------------------------------------------------

  changeBet(direction: 1 | -1): void {
    const { store } = this;
    if (store.busy) return;
    const next = store.betOptions[store.betIndex + direction];
    if (next === undefined) return;
    store.betCents = next;
    try {
      localStorage.setItem(BET_PREF_KEY, String(next));
    } catch {
      // Remembering the bet is a convenience only.
    }
  }

  toggleTurbo(): void {
    this.store.turbo = !this.store.turbo;
    timing.speed = this.store.turbo ? 2.2 : 1;
  }

  startAuto(count: number): void {
    if (!this.store.canSpin) return;
    this.store.autoRemaining = count;
    void this.autoLoop();
  }

  stopAuto(): void {
    this.store.autoRemaining = null;
  }

  private async autoLoop(): Promise<void> {
    const { store } = this;
    while (store.autoRemaining !== null && store.autoRemaining > 0) {
      if (store.busy) {
        await wait(100);
        continue;
      }
      store.autoRemaining--;
      const result = await this.spin();
      if (!result || result.totalWin >= result.totalBet * AUTO_STOP_WIN) break;
      await wait(result.totalWin > 0 ? 700 : 250);
    }
    this.stopAuto();
  }

  /** Runs `task` with the controls locked. */
  private async locked<T>(task: () => Promise<T>): Promise<T | null> {
    if (this.store.busy) return null;
    this.store.busy = true;
    try {
      return await task();
    } finally {
      this.store.busy = false;
    }
  }

  // --- settings --------------------------------------------------------------

  applySettings(patch: Partial<Settings>): void {
    if (patch.skin && !this.progress.isSkinUnlocked(patch.skin)) delete patch.skin;
    this.progress.updateSettings(patch);
    if (patch.skin) this.scene.applySkin(patch.skin);
    if (patch.sound !== undefined) sound.setSfx(patch.sound);
    if (patch.music !== undefined) sound.setMusic(patch.music);
    if (patch.gamble !== undefined) this.store.showGamble = patch.gamble;
  }

  // --- Car Chase -----------------------------------------------------------

  /** Car Chase: each pick is its own round on the server, settled by the casino. */
  async gamble(): Promise<void> {
    const { store, scene } = this;
    const offer = store.gambleOffer;
    if (!offer || !store.canGamble) return;
    await this.locked(async () => {
      let view!: CarChaseScene;
      let chase!: Promise<number>;
      this.ui.setMode('bonus');
      await playTransition(scene.overlay, scene.layout, {
        colors: TRANSITION_COLORS.carChase,
        title: 'CAR CHASE',
        sub: `${euro(offer.stake)} ON THE LINE`,
        hold: 700,
        onCovered: () => {
          view = new CarChaseScene(scene.layout, this.ui.ask);
          scene.overlay.addChildAt(view, 0);
          chase = view.play(
            offer.stake,
            async (pick) => {
              try {
                const answer = await api.gamble(pick);
                this.applyState(answer.state);
                this.toastAchievements(this.progress.recordChase(answer.won));
                return answer;
              } catch (e) {
                if (e instanceof ApiError && e.body.balance) store.balance = e.body.balance as PublicState['balance'];
                throw e;
              }
            },
            GAMBLE.maxRounds,
          );
        },
      });
      const final = await chase;
      if (store.gambleOffer) {
        await api.collect().then(
          (a) => this.applyState(a.state),
          () => (store.gambleOffer = null),
        );
      }
      await playTransition(scene.overlay, scene.layout, {
        colors: TRANSITION_COLORS.carChase,
        onCovered: () => view.destroy({ children: true }),
      });
      this.ui.setMode('base');
      store.win = final > 0 ? final : null;
    });
  }

  // --- rounds ------------------------------------------------------------

  private addWin(amount: number): void {
    this.store.win = (this.store.win ?? 0) + amount;
  }

  private toastAchievements(list: { name: string; description: string; unlocks?: keyof typeof SKINS }[]): void {
    for (const a of list) {
      const extra = a.unlocks ? ` · ${SKINS[a.unlocks].name} skin unlocked` : '';
      this.store.toast(a.name, `${a.description}${extra}`);
    }
  }

  private async presentFeatures(result: RoundResult): Promise<void> {
    const ctx: PresentContext = {
      scene: this.scene,
      ui: this.ui,
      turbo: this.store.turbo,
      auto: this.store.autoRemaining !== null,
      addWin: (n) => this.addWin(n),
    };
    const { freeSpins, lowriderHop, holdAndSpin, turfWar } = result.features;
    if (freeSpins) await wait(400).then(() => presentFreeSpins(ctx, freeSpins));
    if (lowriderHop) await wait(400).then(() => presentLowriderHop(ctx, lowriderHop));
    if (holdAndSpin) await wait(400).then(() => presentHoldAndSpin(ctx, holdAndSpin));
    if (turfWar) await wait(400).then(() => presentTurfWar(ctx, turfWar));
  }

  get lineBetCents(): number {
    return this.store.betCents / PAYLINES.length;
  }

  /** Plays one round. Returns null when the spin did not happen. */
  async spin(): Promise<RoundResult | null> {
    const { store, scene } = this;
    if (!store.canSpin) return null;
    return this.locked(async () => {
      store.gambleOffer = null;
      store.win = null;

      // The server opens the round with the casino, decides it and settles it before answering.
      let answer;
      try {
        answer = await api.spin(store.betCents, import.meta.env.DEV ? this.forceNext : undefined);
      } catch (e) {
        this.stopAuto();
        if (e instanceof ApiError) {
          if (e.body.balance) store.balance = e.body.balance as PublicState['balance'];
          if (e.status === 401) store.hasSession = false;
        }
        this.showError(e);
        return null;
      } finally {
        this.forceNext = undefined;
      }
      const { result, state } = answer;
      const unlocked = this.progress.recordRound(result);

      if (result.payday > 0) void scene.banner.show('5 STARS!', `WANTED PAYDAY +${euro(result.payday)}`, 1100, '#ff5a3c');
      await scene.reels.spinTo(result.landed, result.stops, BASE_REELS, store.turbo, bagLabels(result.cashBags));
      if (result.driveBy) {
        void scene.banner.show('DRIVE-BY!', `${result.driveBy.length} WILD${result.driveBy.length > 1 ? 'S' : ''} SPRAYED`, 700);
        await scene.reels.driveBy(result.driveBy);
      }
      const base = result.base;
      if (base.totalWin > 0) {
        this.addWin(base.totalWin);
        await scene.reels.presentWins(base);
      }
      if (result.payday > 0) this.addWin(result.payday);
      await this.presentFeatures(result);
      if (result.capped) await scene.banner.show('MAX WIN', `Capped at ${euro(result.totalWin)}`, 1500);
      store.win = result.totalWin > 0 ? result.totalWin : null;
      if (bigWinTier(result.totalWin, result.totalBet) >= 0) {
        scene.reels.clearWins();
        this.ui.setMode('bonus');
        await showBigWin(scene.overlay, scene.layout, result.totalWin, result.totalBet);
        this.ui.setMode('base');
      }

      // Only now show the balance the casino confirmed for this round.
      this.applyState(state);
      this.toastAchievements(unlocked);
      return result;
    });
  }
}
