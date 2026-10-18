import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from a GitHub Pages sub-path.
  base: './',
  // The page talks to the game server (npm run dev:server) for everything.
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
