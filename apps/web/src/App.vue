<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref } from 'vue';
import ActionBar from './components/ActionBar.vue';
import DemoMark from './components/DemoMark.vue';
import GameHeader from './components/GameHeader.vue';
import GameHud from './components/GameHud.vue';
import MenuPanel from './components/MenuPanel.vue';
import StatusOverlay from './components/StatusOverlay.vue';
import ToastStack from './components/ToastStack.vue';
import { CONTROLLER, SCENE } from './game/injection';
import { answer } from './game/prompt';
import { useGameStore } from './stores/game';
import type { Insets } from './view/GameScene';

const store = useGameStore();
const scene = inject(SCENE)!;
const controller = inject(CONTROLLER)!;
const stage = ref<HTMLElement | null>(null);

/** What the casino bar covers right now: its loader keeps --grove-bar-* current on the root element. */
function barInsets(): Insets {
  const css = getComputedStyle(document.documentElement);
  const px = (side: string) => parseFloat(css.getPropertyValue(`--grove-bar-${side}`)) || 0;
  return { top: px('top'), right: px('right'), bottom: px('bottom'), left: px('left') };
}

/** Tells the canvas where the Vue layout leaves room for the reels, and what the casino bar covers. */
function arrange(): void {
  if (!stage.value) return;
  const r = stage.value.getBoundingClientRect();
  scene.arrange({ width: window.innerWidth, height: window.innerHeight }, { x: r.left, y: r.top, width: r.width, height: r.height }, barInsets());
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
// The bar's panes open, close and move: the loader rewrites the variables on the root's style.
const barObserver = new MutationObserver(() => requestAnimationFrame(arrange));

onMounted(() => {
  observer = new ResizeObserver(arrange);
  if (stage.value) observer.observe(stage.value);
  barObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
  window.addEventListener('resize', arrange);
  window.addEventListener('keydown', onKey);
  arrange();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  barObserver.disconnect();
  window.removeEventListener('resize', arrange);
  window.removeEventListener('keydown', onKey);
});
</script>

<template>
  <main class="layout">
    <GameHeader class="top" :class="{ away: store.mode === 'bonus' }" />
    <div ref="stage" class="stage" aria-hidden="true"></div>
    <GameHud class="bottom" :class="{ away: store.mode === 'bonus' }" />
    <p class="disclaimer" :class="{ away: store.mode === 'bonus' && !store.demo }">
      <DemoMark v-if="store.demo" />
      For fun only. No real money is played here.
    </p>
  </main>
  <ActionBar />
  <ToastStack />
  <MenuPanel v-if="store.menuOpen" />
  <StatusOverlay />
</template>

<style scoped>
.layout {
  position: absolute;
  /* Clear of the casino bar: its strip on top, its panes docked left, right or bottom. */
  inset: var(--grove-bar-top, 0px) var(--grove-bar-right, 0px) var(--grove-bar-bottom, 0px) var(--grove-bar-left, 0px);
  /* The HUD sizes itself to the room the bar leaves, not to the window (cqmin units, container queries). */
  container: game / size;
  --hud-gap: clamp(6px, 1.2cqmin, 14px);
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
  font-size: clamp(10px, 1.5cqmin, 15px);
  color: var(--grove-color-muted);
}
</style>
