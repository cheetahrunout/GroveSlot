<script setup lang="ts"></script>

<template>
  <!-- The demo state (game-integration.md section 4): rounds are real, but the casino returns every one. -->
  <span class="demo-mark" role="status"><strong>DEMO</strong> Every round is returned when it ends. Thanks for testing!</span>
</template>

<style scoped>
.demo-mark {
  display: inline-flex;
  align-items: baseline;
  gap: 0.5em;
  margin-right: 0.8em;
  padding: 0.1em 0.7em;
  border: 2px solid var(--grove-color-gold);
  border-radius: var(--grove-radius-pill);
  background: rgb(0 0 0 / 0.6);
  color: var(--grove-color-text);
}

.demo-mark strong {
  font-family: var(--grove-font-ui);
  font-size: 1.35em;
  letter-spacing: 0.12em;
  color: var(--grove-color-gold);
}
</style>
