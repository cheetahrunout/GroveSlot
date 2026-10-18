<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { FREE_SPINS } from '@lowrider/shared/config/features';
import type { FreeSpinsHud } from '../game/ui';

const props = defineProps<{ hud: FreeSpinsHud }>();
const filled = computed(() => (props.hud.maxed ? FREE_SPINS.tagsPerLevel : props.hud.tags % FREE_SPINS.tagsPerLevel));
const pulsing = ref(false);
watch(
  () => props.hud.pulse,
  () => {
    pulsing.value = false;
    requestAnimationFrame(() => (pulsing.value = true));
  },
);
</script>

<template>
  <div class="fs-bar g-panel" role="status" aria-live="polite">
    <span class="counter">FREE SPIN {{ hud.spin }} / {{ hud.total }}</span>
    <span class="multiplier" :class="{ pulse: pulsing }" @animationend="pulsing = false">x{{ hud.multiplier }}</span>
    <span class="wall" :aria-label="`Tag the Hood: ${filled} of ${FREE_SPINS.tagsPerLevel} tags`">
      <span class="wall-label">TAG THE HOOD</span>
      <span v-for="i in FREE_SPINS.tagsPerLevel" :key="i" class="tag" :class="{ on: i <= filled }">G</span>
    </span>
  </div>
</template>

<style scoped>
.fs-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--hud-gap);
  padding: 0.3em 1em;
  border-color: var(--grove-color-gold);
  font-family: var(--grove-font-ui);
  flex-wrap: wrap;
}

.counter {
  font-size: clamp(18px, 3.4cqmin, 40px);
}

.multiplier {
  font-size: clamp(28px, 5.5cqmin, 64px);
  color: var(--grove-color-gold);
}

.multiplier.pulse {
  animation: pulse 0.5s ease-out;
}

@keyframes pulse {
  from {
    transform: scale(1.8);
  }
  to {
    transform: scale(1);
  }
}

.wall {
  display: flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.1em 0.6em;
  border-radius: var(--grove-radius-sm);
  background: repeating-linear-gradient(0deg, #7a4a3a 0 22px, #5a3a2e 22px 26px);
}

.wall-label {
  font-size: clamp(11px, 1.6cqmin, 18px);
  color: var(--grove-color-text);
  text-shadow: 0 2px 2px #000;
}

.tag {
  font-family: var(--grove-font-tag);
  font-size: clamp(24px, 4.5cqmin, 52px);
  color: #7dff6a;
  -webkit-text-stroke: 2px var(--grove-color-background);
  opacity: 0.15;
  transition: opacity 0.2s ease;
}

.tag.on {
  opacity: 1;
}
</style>
