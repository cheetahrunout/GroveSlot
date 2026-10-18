<script setup lang="ts">
import { useGameStore } from '../stores/game';

const store = useGameStore();
</script>

<template>
  <div class="toasts" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in store.toasts" :key="t.id" class="toast g-panel">
        <strong>🏆 {{ t.title }}</strong>
        <span>{{ t.line }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  top: max(16px, env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  display: grid;
  gap: 8px;
  width: min(560px, calc(100vw - 32px));
}

.toast {
  display: grid;
  gap: 2px;
  padding: 10px 16px;
  border-color: var(--grove-color-gold);
  font-family: var(--grove-font-ui);
}

strong {
  font-weight: 400;
  font-size: clamp(16px, 2.8vmin, 28px);
  color: var(--grove-color-gold);
}

span {
  font-size: clamp(12px, 2vmin, 18px);
}

.toast-enter-active,
.toast-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  transform: translateY(-40px);
  opacity: 0;
}
</style>
