<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useGameStore } from '../stores/game';

/**
 * The casino's own balance strip (tokens, euro value, top up, lobby), served
 * by the casino inside the player's casino session. The page never touches
 * what is inside it; it only gives it room.
 */
const BAR_HEIGHT = 56;
const store = useGameStore();
const origin = computed(() => {
  try {
    return new URL(store.casinoUrl).origin;
  } catch {
    return '';
  }
});
const src = computed(() => `${store.casinoUrl}/bar?game=${encodeURIComponent(store.slug)}`);

function onMessage(e: MessageEvent): void {
  // The bar asks for more room when its panels open, and gives it back.
  if (e.origin !== origin.value || !e.data || e.data.type !== 'grove-bar') return;
  const h = Number(e.data.height);
  if (Number.isFinite(h)) store.barHeight = Math.max(0, Math.min(h, 600));
}

onMounted(() => {
  store.barHeight = BAR_HEIGHT;
  window.addEventListener('message', onMessage);
});
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
  store.barHeight = 0;
});
</script>

<template>
  <iframe id="grove-bar" class="casino-bar" :src="src" title="Grove Casino" :style="{ height: `${store.barHeight}px` }"></iframe>
</template>

<style scoped>
.casino-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 6;
  display: block;
  width: 100%;
  border: 0;
  background: var(--grove-color-background);
}
</style>
