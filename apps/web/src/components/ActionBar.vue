<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { answer } from '../game/prompt';
import { useGameStore } from '../stores/game';

const store = useGameStore();
const bar = ref<HTMLElement | null>(null);

// Move focus to the first choice so the keyboard (and screen readers) follow the game.
watch(
  () => store.prompt,
  async (p) => {
    if (!p) return;
    await nextTick();
    bar.value?.querySelector<HTMLButtonElement>('button')?.focus();
  },
);
</script>

<template>
  <div v-if="store.prompt" ref="bar" class="action-bar" role="group" :aria-label="store.prompt.title ?? store.prompt.label ?? 'Your move'">
    <p v-if="store.prompt.title" class="title">{{ store.prompt.title }}</p>
    <div class="choices">
      <button
        v-for="c in store.prompt.choices"
        :key="c.id"
        class="g-button choice"
        :class="{ 'is-danger': c.tone === 'go', 'is-gold': c.tone === 'gold', 'is-plain': c.tone === 'plain' }"
        @click="answer(c.id)"
      >
        {{ c.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.action-bar {
  position: fixed;
  left: 50%;
  bottom: max(16px, env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  z-index: 3;
  display: grid;
  justify-items: center;
  gap: 8px;
  max-width: calc(100vw - 32px);
  pointer-events: auto;
}

.title {
  margin: 0;
  padding: 0.2em 0.8em;
  border-radius: var(--grove-radius-pill);
  background: rgb(0 0 0 / 0.6);
  font-family: var(--grove-font-ui);
  font-size: clamp(16px, 2.8vmin, 30px);
  color: var(--grove-color-text);
}

.choices {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--hud-gap);
}

.choice {
  font-size: clamp(18px, 3.4vmin, 38px);
  padding: 0.4em 1.1em;
  min-height: 48px;
}
</style>
