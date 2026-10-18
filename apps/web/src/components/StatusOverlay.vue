<script setup lang="ts">
import { useGameStore } from '../stores/game';

const store = useGameStore();
</script>

<template>
  <div v-if="store.statusMessage?.mode === 'strip'" class="strip" role="status">
    <strong>{{ store.statusMessage.title.toUpperCase() }}</strong> · {{ store.statusMessage.body }}
  </div>
  <div v-else-if="store.statusMessage" class="cover" role="alertdialog" aria-modal="true" :aria-label="store.statusMessage.title">
    <div class="panel g-panel">
      <h2>{{ store.statusMessage.title.toUpperCase() }}</h2>
      <p>{{ store.statusMessage.body }}</p>
      <a v-if="store.statusMessage.lobbyUrl" class="g-button is-gold" :href="store.statusMessage.lobbyUrl">BACK TO THE LOBBY</a>
    </div>
  </div>
</template>

<style scoped>
.strip {
  position: fixed;
  inset: 0 0 auto;
  z-index: 4;
  padding: max(8px, env(safe-area-inset-top, 0px)) 16px 8px;
  background: var(--grove-color-danger);
  font-family: var(--grove-font-ui);
  font-size: clamp(14px, 2.4vmin, 26px);
  text-align: center;
}

.cover {
  position: fixed;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.8);
  pointer-events: auto;
}

.panel {
  display: grid;
  justify-items: center;
  gap: 12px;
  max-width: 640px;
  padding: 24px 32px;
  border-color: var(--grove-color-gold);
  text-align: center;
}

h2 {
  margin: 0;
  font-family: var(--grove-font-tag);
  font-weight: 400;
  font-size: clamp(32px, 7vmin, 72px);
  color: var(--grove-color-gold);
}

p {
  margin: 0;
  font-family: var(--grove-font-ui);
  font-size: clamp(16px, 3vmin, 30px);
  line-height: 1.3;
}

a {
  text-decoration: none;
}
</style>
