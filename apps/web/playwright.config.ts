import { defineConfig, devices } from '@playwright/test';

const PORT = 8790;

/**
 * Browser smoke test against the production build: the real game server
 * serves the built page and plays against its local stand-in casino.
 * Run `pnpm build` first.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    ...devices['Desktop Chrome'],
    launchOptions: {
      // Software WebGL for headless runners without a GPU.
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
      // Lets a machine with preinstalled browsers point at its own Chromium.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  webServer: {
    command: 'node ../server/dist/server.mjs',
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    // No CASINO_URL: local play against the stand-in casino.
    env: { PORT: String(PORT), WEB_DIR: 'dist', DATA_PATH: ':memory:' },
  },
});
