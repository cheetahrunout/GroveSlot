import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Served by the game server at its root.
  base: '/',
  plugins: [vue()],
  // The page talks to the game server (pnpm dev runs both) for everything.
  server: { proxy: { '/api': 'http://localhost:8787' } },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
