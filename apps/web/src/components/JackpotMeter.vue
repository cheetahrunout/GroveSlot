<script setup lang="ts">
import kingpinArt from '../assets/symbols/kingpin-crown-g.jpg';
import { useGameStore } from '../stores/game';
import { euro } from '../view/format';

const store = useGameStore();
</script>

<template>
  <ul class="jackpots" aria-label="Jackpots for your bet">
    <li v-for="j in store.jackpots" :key="j.id" class="jackpot" :class="{ 'is-kingpin': j.id === 'kingpin' }">
      <img v-if="j.id === 'kingpin'" :src="kingpinArt" alt="" class="crown" />
      <span class="name">{{ j.name }}</span>
      <span class="value">{{ euro(j.cents) }}</span>
    </li>
  </ul>
</template>

<style scoped>
/*
 * The type sizes follow the HUD (cqmin of the game container), computed once on the meter so that each
 * jackpot box can be a container of its own: the full amount (€ 5.000,00) shrinks to fit its box, never clipped.
 */
@property --jackpot-name {
  syntax: '<length>';
  inherits: true;
  initial-value: 14px;
}

@property --jackpot-value {
  syntax: '<length>';
  inherits: true;
  initial-value: 22px;
}

.jackpots {
  --jackpot-name: clamp(11px, 1.7cqmin, 18px);
  --jackpot-value: clamp(16px, 2.8cqmin, 32px);
  display: grid;
  /* The Kingpin also carries its crown. */
  grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.5fr);
  gap: var(--hud-gap);
  margin: 0;
  padding: 0;
  list-style: none;
}

.jackpot {
  container-type: inline-size;
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
  width: clamp(28px, 5cqmin, 56px);
  aspect-ratio: 1;
  object-fit: cover;
  object-position: center;
  border-radius: var(--grove-radius-sm);
}

.name {
  font-size: var(--jackpot-name);
  color: var(--grove-color-muted);
  letter-spacing: 0.06em;
}

.is-kingpin .value {
  /* The crown takes part of the box. */
  font-size: min(var(--jackpot-value), 14cqi);
}

.is-kingpin .name {
  color: var(--grove-color-gold);
}

.value {
  font-size: min(var(--jackpot-value), 21cqi);
  color: var(--grove-color-gold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
