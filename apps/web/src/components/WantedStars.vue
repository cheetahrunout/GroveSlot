<script setup lang="ts">
import { computed } from 'vue';
import { WANTED } from '@lowrider/shared/config/features';
import { useGameStore } from '../stores/game';
import { euro } from '../view/format';

const store = useGameStore();
const full = computed(() => store.wantedStars >= WANTED.maxStars);
// The Payday is paid on the smallest bet played while the meter filled (or the payday spin's, if smaller), so say which.
const paydayBet = computed(() => Math.min(store.wantedBet, store.betCents));
const label = computed(() => (full.value ? (paydayBet.value > 0 ? `PAYDAY ON ${euro(paydayBet.value)} BET` : 'NEXT SPIN: PAYDAY!') : 'WANTED'));
const STAR = 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z';
</script>

<template>
  <div class="wanted" :class="{ 'is-full': full }" role="img" :aria-label="`Wanted level ${store.wantedStars} of ${WANTED.maxStars}`">
    <span class="label">{{ label }}</span>
    <span class="stars">
      <svg v-for="i in WANTED.maxStars" :key="i" viewBox="0 0 24 24" :class="{ on: i <= store.wantedStars }">
        <path :d="STAR" />
      </svg>
    </span>
  </div>
</template>

<style scoped>
.wanted {
  display: grid;
  justify-items: center;
  gap: 2px;
  font-family: var(--grove-font-ui);
}

.label {
  font-size: clamp(11px, 1.6cqmin, 18px);
  color: var(--grove-color-muted);
  letter-spacing: 0.08em;
}

.is-full .label {
  color: #ff5a3c;
}

.stars {
  display: flex;
  gap: 4px;
}

svg {
  width: clamp(18px, 3cqmin, 34px);
  aspect-ratio: 1;
  fill: #2a2a2a;
  stroke: var(--grove-color-text);
  stroke-width: 1;
  transition: fill 0.2s ease, transform 0.2s ease;
}

svg.on {
  fill: var(--grove-color-gold);
  transform: scale(1.1);
}

.is-full svg.on {
  fill: #ff5a3c;
}
</style>
