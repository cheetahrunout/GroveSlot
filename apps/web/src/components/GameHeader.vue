<script setup lang="ts">
import { useGameStore } from '../stores/game';
import FreeSpinsBar from './FreeSpinsBar.vue';
import JackpotMeter from './JackpotMeter.vue';
import WantedStars from './WantedStars.vue';

const store = useGameStore();
</script>

<template>
  <header class="header">
    <FreeSpinsBar v-if="store.freeSpins" :hud="store.freeSpins" class="fs" />
    <template v-else>
      <h1 class="title">LOWRIDER</h1>
      <JackpotMeter class="jackpots" />
      <WantedStars class="wanted" />
    </template>
  </header>
</template>

<style scoped>
.header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  grid-template-areas: 'jackpots title wanted';
  align-items: center;
  gap: var(--hud-gap);
}

.fs {
  grid-column: 1 / -1;
}

.title {
  grid-area: title;
  margin: 0;
  font-family: var(--grove-font-tag);
  font-weight: 400;
  font-size: clamp(36px, 8cqmin, 96px);
  line-height: 1;
  color: var(--grove-color-text);
  -webkit-text-stroke: 3px var(--grove-color-grove);
  paint-order: stroke fill;
}

.jackpots {
  grid-area: jackpots;
}

.wanted {
  grid-area: wanted;
  justify-self: center;
}

@container game (orientation: portrait) {
  .header {
    grid-template-columns: 1fr;
    grid-template-areas: 'title' 'jackpots' 'wanted';
    justify-items: center;
  }

  .jackpots {
    width: 100%;
  }
}
</style>
