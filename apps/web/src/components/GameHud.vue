<script setup lang="ts">
import { inject, ref } from 'vue';
import { CONTROLLER } from '../game/injection';
import { useGameStore } from '../stores/game';
import { euro, tokens } from '../view/format';

function autoLabel(n: number): string {
  return Number.isFinite(n) ? String(n) : '∞';
}

// Infinity runs until stopped (or a bonus or big win stops it).
const AUTO_OPTIONS = [10, 25, 50, 100, Infinity] as const;
const store = useGameStore();
const controller = inject(CONTROLLER)!;
const autoMenu = ref(false);

function toggleAuto(): void {
  if (store.autoRemaining !== null) controller.stopAuto();
  else autoMenu.value = !autoMenu.value;
}

function startAuto(n: number): void {
  autoMenu.value = false;
  controller.startAuto(n);
}
</script>

<template>
  <section class="hud" aria-label="Game controls">
    <div class="box balance g-panel">
      <span class="caption">BALANCE</span>
      <template v-if="store.balance">
        <span class="value" aria-live="polite">{{ tokens(store.balance.tokensMicro) }}</span>
        <span class="worth">worth {{ euro(store.balance.valueCents) }}</span>
      </template>
      <span v-else class="value">—</span>
    </div>

    <div class="box bet g-panel">
      <button class="g-button step" :disabled="store.busy || store.betIndex <= 0" aria-label="Lower bet" @click="controller.changeBet(-1)">–</button>
      <span class="stack">
        <span class="caption">TOTAL BET</span>
        <span class="value">{{ store.betCents > 0 ? euro(store.betCents) : '—' }}</span>
      </span>
      <button
        class="g-button step"
        :disabled="store.busy || store.betIndex < 0 || store.betIndex >= store.betOptions.length - 1"
        aria-label="Raise bet"
        @click="controller.changeBet(1)"
      >
        +
      </button>
    </div>

    <div class="box win g-panel">
      <span class="caption">WIN</span>
      <span class="value" aria-live="polite">{{ store.win ? euro(store.win) : '—' }}</span>
    </div>

    <div class="toggles">
      <div class="auto-wrap">
        <button class="g-button" :class="{ 'is-on': store.autoRemaining !== null }" :aria-expanded="autoMenu" @click="toggleAuto">
          {{ store.autoRemaining !== null ? `STOP ${autoLabel(store.autoRemaining)}` : 'AUTO' }}
        </button>
        <div v-if="autoMenu" class="auto-menu" role="menu">
          <button v-for="n in AUTO_OPTIONS" :key="n" class="g-button is-plain" role="menuitem" :aria-label="Number.isFinite(n) ? undefined : 'Unlimited'" :disabled="!store.canSpin" @click="startAuto(n)">
            {{ autoLabel(n) }}
          </button>
        </div>
      </div>
      <button class="g-button" :class="{ 'is-on': store.turbo }" :aria-pressed="store.turbo" @click="controller.toggleTurbo()">TURBO</button>
      <button class="g-button is-plain" :disabled="store.busy" @click="store.menuOpen = true">☰ MENU</button>
    </div>

    <div class="spin-area">
      <button v-if="store.canGamble" class="g-button is-danger gamble" @click="controller.gamble()">GAMBLE x2</button>
      <button class="spin" :disabled="!store.canSpin" aria-label="Spin" @click="controller.spin()">SPIN</button>
    </div>
  </section>
</template>

<style scoped>
.hud {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) auto auto;
  align-items: center;
  gap: var(--hud-gap);
}

.box {
  display: grid;
  justify-items: center;
  padding: 0.2em 0.6em;
  font-family: var(--grove-font-ui);
  min-width: 0;
}

.bet {
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.4em;
}

.stack {
  display: grid;
  justify-items: center;
}

.caption {
  font-size: clamp(11px, 1.6cqmin, 18px);
  color: var(--grove-color-muted);
  letter-spacing: 0.08em;
}

.value {
  font-size: clamp(18px, 3.6cqmin, 42px);
  color: var(--grove-color-gold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.worth {
  font-size: clamp(10px, 1.5cqmin, 16px);
  color: var(--grove-color-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.step {
  padding: 0.1em 0.55em;
  font-size: clamp(18px, 3cqmin, 32px);
}

.toggles {
  display: flex;
  gap: var(--hud-gap);
}

.auto-wrap {
  position: relative;
}

.auto-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  display: grid;
  gap: 6px;
  pointer-events: auto;
}

.spin-area {
  position: relative;
  display: grid;
  justify-items: center;
}

.spin {
  pointer-events: auto;
  width: clamp(76px, 15cqmin, 170px);
  aspect-ratio: 1;
  border-radius: 50%;
  border: 5px solid var(--grove-color-text);
  background: radial-gradient(circle at 35% 30%, var(--grove-color-grove-light), var(--grove-color-grove) 60%);
  color: var(--grove-color-text);
  font-family: var(--grove-font-ui);
  font-size: clamp(22px, 4.5cqmin, 52px);
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 6px 0 #0a2a0a;
  transition: transform 0.08s ease, opacity 0.2s ease;
}

.spin:active:not(:disabled) {
  transform: translateY(4px);
  box-shadow: 0 2px 0 #0a2a0a;
}

.spin:disabled {
  opacity: 0.45;
  cursor: default;
}

.spin:focus-visible {
  outline: 5px solid var(--grove-color-gold);
  outline-offset: 4px;
}

.gamble {
  position: absolute;
  bottom: calc(100% + 8px);
  white-space: nowrap;
}

@container game (orientation: portrait) {
  .hud {
    grid-template-columns: 1fr 1fr;
    grid-template-areas:
      'balance win'
      'bet toggles'
      'spin spin';
  }

  .balance {
    grid-area: balance;
  }

  .win {
    grid-area: win;
  }

  .bet {
    grid-area: bet;
  }

  .toggles {
    grid-area: toggles;
    justify-content: center;
    flex-wrap: wrap;
  }

  .spin-area {
    grid-area: spin;
  }

  .gamble {
    position: static;
    margin-bottom: 8px;
  }
}
</style>
