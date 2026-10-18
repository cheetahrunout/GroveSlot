import { defineConfig } from 'vitest/config';

// One `pnpm test` runs the shared maths, the server and the page's unit tests.
export default defineConfig({
  test: {
    projects: ['packages/shared', 'apps/server', 'apps/web'],
  },
});
