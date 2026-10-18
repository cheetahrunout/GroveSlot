<script setup lang="ts">
import kingpinArt from '../assets/symbols/kingpin-crown-g.jpg';
import { useGameStore } from '../stores/game';
import { euroShort } from '../view/format';

const store = useGameStore();
</script>

<template>
  <ul class="jackpots" aria-label="Jackpots for your bet">
    <li v-for="j in store.jackpots" :key="j.id" class="jackpot" :class="{ 'is-kingpin': j.id === 'kingpin' }">
      <img v-if="j.id === 'kingpin'" :src="kingpinArt" alt="" class="crown" />
      <span class="name">{{ j.name }}</span>
      <span class="value">{{ euroShort(j.cents) }}</span>
    </li>
  </ul>
</template>

<style scoped>
.jackpots {
  display: grid;
  /* The Kingpin also carries its crown. */
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.5fr);
  gap: var(--hud-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.jackpot {
  position: relative;
  display: grid;
  justify-items: center;
  padding: 0.25em 0.5em;
  background: var(--grove-color-panel);
  border: 3px solid var(--grove-color-panel-edge);
  border-radius: var(--grove-radius-md);
  font-family: var(--grove-font-ui);
  min-width: 0;
}

.jackpot.is-kingpin {
  border-color: var(--grove-color-gold);
  background: #1d1405;
  grid-template-columns: auto 1fr;
  column-gap: 0.5em;
}

.crown {
  grid-row: span 2;
  width: clamp(28px, 5vmin, 56px);
  aspect-ratio: 1;
  object-fit: cover;
  object-position: center;
  border-radius: var(--grove-radius-sm);
}

.name {
  font-size: clamp(11px, 1.7vmin, 18px);
  color: var(--grove-color-muted);
  letter-spacing: 0.06em;
}

.is-kingpin .name {
  color: var(--grove-color-gold);
}

.value {
  font-size: clamp(16px, 2.8vmin, 32px);
  color: var(--grove-color-gold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
