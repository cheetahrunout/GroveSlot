import { GAMBLE } from '../config/features';
import { PAYLINES } from '../config/paylines';
import { BASE_REELS, ROW_COUNT } from '../config/reels';
import { SKINS } from '../economy/achievements';
import type { Progress, Settings } from '../economy/progress';
import type { FeatureKey, RoundResult } from '../engine/round';
import { sound } from '../audio/sound';
import { bigWinTier, showBigWin } from '../view/BigWin';
import { bagLabels, euro, money } from '../view/format';
import type { GameScene } from '../view/GameScene';
import { CarChaseScene } from '../view/scenes/CarChaseScene';
import { MenuPanel } from '../view/scenes/MenuPanel';
import type { StatusMessage } from '../view/StatusOverlay';
import { COLORS } from '../view/theme';
import { TRANSITION_COLORS, playTransition } from '../view/Transition';
import { timing, wait } from '../view/tween';
import { ApiError, api, type PublicState } from './api';
import type { PresentContext } from './presenters/context';
import { presentFreeSpins } from './presenters/freeSpins';
import { presentHoldAndSpin } from './presenters/holdAndSpin';
import { presentLowriderHop } from './presenters/lowriderHop';
import { presentTurfWar } from './presenters/turfWar';

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
 * gamble pick) to the game server and plays back what comes back. It never
 * decides an outcome and never holds money: the balance shown is the one
 * the casino reported.
 */
export class GameController {
  private busy = false;
  private autoRemaining: number | null = null;
  private turbo = false;
  private scene!: GameScene;
  private roundWin = 0;
  private state: PublicState | null = null;
  private lobbyUrl = '';
  private hasSession = false;
  private betCents = savedBet();
  /** Local play only: the next spin triggers this (the server ignores it with the real casino). */
  forceNext: FeatureKey | 'driveBy' | undefined;

  constructor(private readonly progress: Progress) {}

  async attach(scene: GameScene): Promise<void> {
    this.scene = scene;
    scene.applySkin(this.progress.settings.skin);
    sound.setSfx(this.progress.settings.sound);
    sound.setMusic(this.progress.settings.music);
    // A still frame of the real strips until the first spin.
    scene.reels.show(BASE_REELS.map((strip) => strip.slice(0, ROW_COUNT)));
    scene.hud.win.setValue('—');
    scene.hud.gamble.visible = false;

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
      this.lobbyUrl = welcome.lobbyUrl;
      this.hasSession = true;
      this.applyState(welcome.state);
    } catch (e) {
      const body = e instanceof ApiError ? e.body : {};
      this.lobbyUrl = typeof body.lobbyUrl === 'string' ? body.lobbyUrl : '';
      if (body.state) this.applyState(body.state as PublicState);
      this.showStatus();
      if (!(e instanceof ApiError) || e.status !== 401) this.showError(e);
    }

    api.events((c) => {
      if (!this.state) return;
      const reopened = this.state.status !== 'live' && c.status === 'live';
      this.state = { ...this.state, status: c.status, reason: c.reason };
      // A halt closes every session: only the lobby can open a new one.
      if (c.status === 'halted' || c.status === 'maintenance') this.hasSession = false;
      if (c.status !== 'live') {
        this.stopAuto();
        this.state.gamble = null;
      }
      this.refreshHud();
      this.showStatus();
      if (reopened && this.hasSession) void api.state().then((w) => this.applyState(w.state), () => undefined);
    });
    window.addEventListener('pagehide', () => api.leave());
  }

  // --- state ---------------------------------------------------------------

  private applyState(state: PublicState): void {
    this.state = state;
    const options = state.betOptions;
    if (options.length > 0 && !options.includes(this.betCents)) {
      // Keep the player's bet when the limits allow it, else the closest one below.
      this.betCents = [...options].reverse().find((b) => b <= this.betCents) ?? options[0];
    }
    this.refreshHud();
    this.showStatus();
  }

  private refreshHud(): void {
    const { hud, jackpots, wanted } = this.scene;
    hud.balance.setValue(money(this.state?.balance ?? null));
    hud.bet.setValue(this.betCents > 0 ? euro(this.betCents) : '—');
    jackpots.update(this.betCents);
    wanted.setStars(this.state?.wantedStars ?? 0);
    hud.gamble.visible = !!this.state?.gamble && this.progress.settings.gamble && this.autoRemaining === null && !this.busy;
    if (!this.busy) hud.spin.setEnabled(this.hasSession && this.state?.status === 'live' && this.betCents > 0);
  }

  private statusMessage(): StatusMessage | null {
    const s = this.state;
    const lobbyUrl = this.lobbyUrl;
    if (s?.status === 'halted') return { mode: 'full', title: 'GAME PAUSED', body: s.reason || 'Lowrider is paused by the casino. Any open round was refunded.', lobbyUrl };
    if (s?.status === 'maintenance') return { mode: 'full', title: 'MAINTENANCE', body: s.reason || 'Lowrider is closed for planned work. Any open round was refunded.', lobbyUrl };
    if (!this.hasSession) return { mode: 'full', title: 'LOWRIDER', body: 'Open Lowrider from the Grove Casino lobby to play.', lobbyUrl };
    if (s?.status === 'last_bets') return { mode: 'strip', title: 'LAST BETS', body: s.reason || 'No new spins: the game is closing for a moment.' };
    if (s && s.betOptions.length === 0) return { mode: 'full', title: 'NO OPEN BETS', body: 'The casino limits leave no bet open right now.', lobbyUrl };
    return null;
  }

  private showStatus(): void {
    this.scene.status.show(this.statusMessage());
  }

  private showError(e: unknown): void {
    const message = e instanceof Error ? e.message : 'Something went wrong.';
    void this.scene.banner.show('HOLD UP', message, 2200, COLORS.danger);
  }

  // --- controls --------------------------------------------------------------

  changeBet(direction: 1 | -1): void {
    if (this.busy || !this.state) return;
    const options = this.state.betOptions;
    const next = options[options.indexOf(this.betCents) + direction];
    if (next === undefined) return;
    this.betCents = next;
    try {
      localStorage.setItem(BET_PREF_KEY, String(next));
    } catch {
      // Remembering the bet is a convenience only.
    }
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
    this.refreshHud();
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

  // --- menu --------------------------------------------------------------

  async openMenu(): Promise<void> {
    await this.locked(async () => {
      const panel = new MenuPanel(this.scene.layout, {
        progress: this.progress,
        lineBetCents: this.betCents / PAYLINES.length,
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
    this.refreshHud();
  }

  // --- Car Chase -----------------------------------------------------------

  /** Car Chase: each pick is its own round on the server, settled by the casino. */
  async gamble(): Promise<void> {
    const offer = this.state?.gamble;
    if (!offer || this.state?.status !== 'live') return;
    await this.locked(async () => {
      const { scene } = this;
      scene.hud.gamble.visible = false;
      let view!: CarChaseScene;
      let chase!: Promise<number>;
      await playTransition(scene.overlay, scene.layout, {
        colors: TRANSITION_COLORS.carChase,
        title: 'CAR CHASE',
        sub: `${euro(offer.stake)} ON THE LINE`,
        hold: 700,
        onCovered: () => {
          view = new CarChaseScene(scene.layout);
          scene.overlay.addChildAt(view, 0);
          chase = view.play(
            offer.stake,
            async (pick) => {
              try {
                const answer = await api.gamble(pick);
                this.state = answer.state;
                this.toastAchievements(this.progress.recordChase(answer.won));
                return answer;
              } catch (e) {
                if (e instanceof ApiError && e.body.balance) {
                  this.state = { ...this.state!, balance: e.body.balance as PublicState['balance'] };
                }
                throw e;
              }
            },
            GAMBLE.maxRounds,
          );
        },
      });
      const final = await chase;
      if (this.state?.gamble) {
        this.state = await api.collect().then(
          (a) => a.state,
          () => ({ ...this.state!, gamble: null }),
        );
      }
      await playTransition(scene.overlay, scene.layout, {
        colors: TRANSITION_COLORS.carChase,
        onCovered: () => view.destroy({ children: true }),
      });
      scene.hud.win.setValue(final > 0 ? euro(final) : '—');
    });
    this.refreshHud();
  }

  // --- rounds ------------------------------------------------------------

  private addWin(amount: number): void {
    this.roundWin += amount;
    this.scene.hud.win.setValue(euro(this.roundWin));
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

  /** Plays one round. Returns null when the spin did not happen. */
  async spin(): Promise<RoundResult | null> {
    if (this.busy || !this.hasSession || this.state?.status !== 'live' || this.betCents <= 0) {
      this.showStatus();
      return null;
    }
    const played = await this.locked(async () => {
      const { scene } = this;
      scene.hud.gamble.visible = false;
      scene.hud.win.setValue('—');

      // The server opens the round with the casino, decides it and settles it before answering.
      let answer;
      try {
        answer = await api.spin(this.betCents, import.meta.env.DEV ? this.forceNext : undefined);
      } catch (e) {
        this.stopAuto();
        if (e instanceof ApiError) {
          if (e.body.balance) this.state = { ...this.state!, balance: e.body.balance as PublicState['balance'] };
          if (e.status === 401) this.hasSession = false;
        }
        this.showStatus();
        this.showError(e);
        return null;
      } finally {
        this.forceNext = undefined;
      }
      const { result, state } = answer;
      const unlocked = this.progress.recordRound(result);
      this.roundWin = 0;

      if (result.payday > 0) void scene.banner.show('5 STARS!', `WANTED PAYDAY +${euro(result.payday)}`, 1100, '#ff5a3c');
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
      if (result.payday > 0) this.addWin(result.payday);
      await this.presentFeatures(result);
      if (result.capped) await scene.banner.show('MAX WIN', `Capped at ${euro(result.totalWin)}`, 1500);
      scene.hud.win.setValue(result.totalWin > 0 ? euro(result.totalWin) : '—');
      if (bigWinTier(result.totalWin, result.totalBet) >= 0) {
        scene.reels.clearWins();
        await showBigWin(scene.overlay, scene.layout, result.totalWin, result.totalBet);
      }

      // Only now show the balance the casino confirmed for this round.
      this.state = state;
      this.toastAchievements(unlocked);
      return result;
    });
    this.refreshHud();
    return played;
  }
}
