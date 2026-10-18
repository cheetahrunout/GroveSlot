import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from a GitHub Pages sub-path.
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
