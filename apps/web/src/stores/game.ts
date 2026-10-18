import { defineStore } from 'pinia';
import { JACKPOTS, type JackpotId } from '@lowrider/shared/config/features';
import type { Balance, GameStatus } from '@lowrider/shared/api';
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
    lobbyUrl: '',
    status: 'maintenance' as GameStatus,
    reason: '',
    balance: null as Balance | null,
    betOptions: [] as number[],
    betCents: 0,
    gambleOffer: null as { stake: number } | null,
    wantedStars: 0,
    /** Running win of the current round, in euro cents. */
    win: null as number | null,
    busy: false,
    autoRemaining: null as number | null,
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
      return state.hasSession && state.status === 'live' && state.betCents > 0 && !state.busy && !state.menuOpen && state.mode !== 'bonus';
    },
    canGamble(state): boolean {
      return !!state.gambleOffer && state.showGamble && state.status === 'live' && !state.busy && state.autoRemaining === null && state.mode === 'base';
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
      const lobbyUrl = state.lobbyUrl;
      if (!state.connected) return null;
      if (state.status === 'halted') {
        return { mode: 'full', title: 'Game paused', body: state.reason || 'Lowrider is paused by the casino. Any open round was refunded.', lobbyUrl };
      }
      if (state.status === 'maintenance') {
        return { mode: 'full', title: 'Maintenance', body: state.reason || 'Lowrider is closed for planned work. Any open round was refunded.', lobbyUrl };
      }
      if (!state.hasSession) return { mode: 'full', title: 'Lowrider', body: 'Open Lowrider from the Grove Casino lobby to play.', lobbyUrl };
      if (state.status === 'last_bets') {
        return { mode: 'strip', title: 'Last bets', body: state.reason || 'No new spins: the game is closing for a moment.', lobbyUrl };
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
