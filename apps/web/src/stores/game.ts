import { defineStore } from 'pinia';
import { JACKPOTS, type JackpotId } from '@lowrider/shared/config/features';
import { isPlayable, type Balance, type GameStatus } from '@lowrider/shared/api';
import type { FreeSpinsHud, UiMode } from '../game/ui';
import type { Choice } from '../view/ask';

export interface ToastItem {
  id: number;
  title: string;
  line: string;
}

export interface PromptState {
  title?: string;
  label?: string;
  choices: Choice[];
}

export interface StatusMessage {
  title: string;
  body: string;
  /** Full screen blocks play; a strip only informs (last bets). */
  mode: 'full' | 'strip';
  lobbyUrl: string;
}

/**
 * Client UI state only: what the HUD, menus and overlays show. Balances
 * here are copies of what the casino reported; nothing here decides play.
 */
let toastCount = 0;

export const useGameStore = defineStore('game', {
  state: () => ({
    connected: false,
    hasSession: false,
    /** The casino's public address: lobby link, casino bar, theme. Empty in local play. */
    casinoUrl: '',
    /** Where a player without a session goes to get one (CASINO_PUBLIC_URL/play/lowrider). */
    playUrl: '',
    slug: 'lowrider',
    status: 'closed' as GameStatus,
    /** The demo state: rounds are real but the casino returns every one. */
    demo: false,
    reason: '',
    balance: null as Balance | null,
    betOptions: [] as number[],
    betCents: 0,
    gambleOffer: null as { stake: number } | null,
    wantedStars: 0,
    /** The bet a Payday is paid on: the smallest bet played while the meter filled. */
    wantedBet: 0,
    /** A refusal that blocks play, such as the seat limit; shown with the way back to the lobby. */
    notice: null as { title: string; body: string } | null,
    /** Running win of the current round, in euro cents. */
    win: null as number | null,
    busy: false,
    autoRemaining: null as number | null,
    /** Auto-spin stops once it has lost this many total bets (null: no limit). */
    autoLossLimit: 50 as number | null,
    turbo: false,
    mode: 'base' as UiMode,
    freeSpins: null as FreeSpinsHud | null,
    prompt: null as PromptState | null,
    toasts: [] as ToastItem[],
    menuOpen: false,
    /** Player preference: show the Car Chase button after wins. */
    showGamble: true,
  }),

  getters: {
    canSpin(state): boolean {
      return state.hasSession && isPlayable(state.status) && state.betCents > 0 && !state.busy && !state.menuOpen && state.mode !== 'bonus';
    },
    canGamble(state): boolean {
      return !!state.gambleOffer && state.showGamble && isPlayable(state.status) && !state.busy && state.autoRemaining === null && state.mode === 'base';
    },
    betIndex(state): number {
      return state.betOptions.indexOf(state.betCents);
    },
    /** The four jackpots for the current bet: fixed multiples of it. */
    jackpots(state): { id: JackpotId; name: string; cents: number }[] {
      return (['homie', 'soldier', 'og', 'kingpin'] as const).map((id) => ({
        id,
        name: JACKPOTS[id].name,
        cents: JACKPOTS[id].multiplier * state.betCents,
      }));
    },
    statusMessage(state): StatusMessage | null {
      const lobbyUrl = state.casinoUrl;
      if (state.notice) return { mode: 'full', ...state.notice, lobbyUrl };
      if (!state.connected) return null;
      if (state.status === 'closed') {
        return { mode: 'full', title: 'Closed', body: state.reason || 'Lowrider is closed right now. Any open round was refunded.', lobbyUrl };
      }
      if (state.status === 'offline') {
        return { mode: 'strip', title: 'Casino unreachable', body: state.reason || 'The casino is not answering. Spins are paused until it is back.', lobbyUrl };
      }
      if (!state.hasSession) {
        return { mode: 'full', title: 'Lowrider', body: state.playUrl ? 'Taking you to Grove Casino to sign in…' : 'Open Lowrider from the Grove Casino lobby to play.', lobbyUrl };
      }
      if (state.status === 'maintenance') {
        return { mode: 'strip', title: 'Maintenance', body: state.reason || 'No new spins for a moment: Lowrider is getting a tune-up.', lobbyUrl };
      }
      if (state.betOptions.length === 0) return { mode: 'full', title: 'No open bets', body: 'The casino limits leave no bet open right now.', lobbyUrl };
      return null;
    },
  },

  actions: {
    toast(title: string, line: string): void {
      const id = ++toastCount;
      this.toasts.push({ id, title, line });
      setTimeout(() => (this.toasts = this.toasts.filter((t) => t.id !== id)), 3500);
    },
  },
});

export type GameStore = ReturnType<typeof useGameStore>;
