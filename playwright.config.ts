import { defineConfig, devices } from '@playwright/test';

/** Local play: the built server against its in-memory stub casino. */
export const LOCAL_PORT = 8790;
/** Casino mode against a casino that is not there: for the handoff and rejoin paths. */
export const CASINO_PORT = 8791;

const server = (port: number, env: Record<string, string> = {}) => ({
  command: 'node apps/server/dist/server.mjs',
  url: `http://127.0.0.1:${port}/health`,
  reuseExistingServer: false,
  timeout: 30_000,
  env: { PORT: String(port), WEB_DIR: 'apps/web/dist', DATA_PATH: ':memory:', ...env },
});

/**
 * Browser smoke tests against the production build (run `pnpm build` first),
 * served by the real game server with a stub casino. Never the real casino.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${LOCAL_PORT}`,
    ...devices['Desktop Chrome'],
    launchOptions: {
      // Software WebGL for runners without a GPU.
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
      // Lets a machine with preinstalled browsers point at its own Chromium.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    },
  },
  webServer: [
    server(LOCAL_PORT),
    // Port 9 answers nothing: the SDK reports the casino offline.
    server(CASINO_PORT, { CASINO_URL: 'http://127.0.0.1:9', GAME_KEY: 'e2e-not-a-real-key', CASINO_PUBLIC_URL: 'http://127.0.0.1:9' }),
  ],
});
