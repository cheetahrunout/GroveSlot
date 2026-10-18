<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import ActionBar from './components/ActionBar.vue';
import CasinoBar from './components/CasinoBar.vue';
import GameHeader from './components/GameHeader.vue';
import GameHud from './components/GameHud.vue';
import MenuPanel from './components/MenuPanel.vue';
import StatusOverlay from './components/StatusOverlay.vue';
import ToastStack from './components/ToastStack.vue';
import { CONTROLLER, SCENE } from './game/injection';
import { answer } from './game/prompt';
import { useGameStore } from './stores/game';

const store = useGameStore();
const scene = inject(SCENE)!;
const controller = inject(CONTROLLER)!;
const stage = ref<HTMLElement | null>(null);

/** Tells the canvas where the Vue layout leaves room for the reels. */
function arrange(): void {
  if (!stage.value) return;
  const r = stage.value.getBoundingClientRect();
  // The casino bar takes the bottom of the window; the game gets the rest.
  scene.arrange({ width: window.innerWidth, height: window.innerHeight }, { x: r.left, y: r.top, width: r.width, height: r.height }, store.barHeight);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') store.menuOpen = false;
  if (e.code !== 'Space' || e.repeat) return;
  // Let a focused button handle Space itself.
  if (document.activeElement instanceof HTMLButtonElement) return;
  e.preventDefault();
  if (store.prompt?.choices.length === 1) answer(store.prompt.choices[0].id);
  else void controller.spin();
}

let observer: ResizeObserver | null = null;
watch(
  () => store.barHeight,
  (h) => {
    document.documentElement.style.setProperty('--bar-h', `${h}px`);
    void nextTick(arrange);
  },
);

onMounted(() => {
  observer = new ResizeObserver(arrange);
  if (stage.value) observer.observe(stage.value);
  window.addEventListener('resize', arrange);
  window.addEventListener('keydown', onKey);
  arrange();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('resize', arrange);
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <main class="layout" :style="{ bottom: `${store.barHeight}px` }">
    <GameHeader class="top" :class="{ away: store.mode === 'bonus' }" />
    <div ref="stage" class="stage" aria-hidden="true"></div>
    <GameHud class="bottom" :class="{ away: store.mode === 'bonus' }" />
    <p class="disclaimer" :class="{ away: store.mode === 'bonus' }">For fun only. No real money is played here.</p>
  </main>
  <ActionBar />
  <ToastStack />
  <MenuPanel v-if="store.menuOpen" />
  <StatusOverlay />
  <CasinoBar v-if="store.casinoUrl" />
</template>

<style scoped>
.layout {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto;
  gap: var(--hud-gap);
  padding-block: max(10px, env(safe-area-inset-top, 0px)) max(6px, env(safe-area-inset-bottom, 0px));
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
}

/* Interactive parts take clicks; the stage lets the canvas show through. */
.top,
.bottom {
  pointer-events: auto;
  transition: opacity 0.25s ease, visibility 0.25s;
}

/* During a full-screen bonus the HUD steps aside but keeps its space, so the reels do not move. */
.away {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.stage {
  min-height: 0;
}

.disclaimer {
  margin: 0;
  text-align: center;
  font-size: clamp(10px, 1.5vmin, 15px);
  color: var(--grove-color-muted);
}
</style>
