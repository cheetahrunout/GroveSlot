# Lowrider

**Lowrider** is a Grove Street themed slot machine for [Grove Casino](https://casino.grovestreet.zip), inspired by GTA: San Andreas. The project and repository are called GroveSlot.

It follows the casino's game contract (GAMES.md): the game runs on its own server, every bet and win goes through the casino, and the page in the browser only shows results.

## Features

- **5 reels, 20 paylines**, read left to right. The Trident G is wild.
- **Grove Street Free Spins:** 3+ Spray Cans give 10/15/20 spins. Wilds expand to fill their reel, and every 3 Spray Cans tag the hood for +1 multiplier (up to ×5) and +2 spins.
- **Lowrider Hop:** Lowriders on reels 1, 3 and 5 start the bonus: pick a ride and hop 5 times for ×2–×60 your bet. Pure odds, decided on the server; pressing HOP only plays the result.
- **Cash Run (Hold & Spin):** 6+ Cash Bags lock in place for 3 respins, and every new bag resets them. Bags hold 1×–25× the bet or the Homie, Soldier or OG jackpot. Fill all 15 cells for the **Kingpin** (1,000× bet).
- **Turf War:** 3 Palm G (or a rare surprise) open a wheel and a map of eight neighbourhoods. Take them block by block until the Ballas push you back.
- **Drive-By:** sometimes a car rolls past and sprays wilds onto the reels.
- **Wanted Level:** wins add stars. At five stars the next spin also pays a **Payday** of 5×–25× the bet.
- **Car Chase:** after a win, double or nothing by picking an alley. Each pick is its own casino round.
- Every bonus opens with a paint-stripe transition, and there are stats, trophies and unlockable reel skins (MENU). The art and sound are original and generated in code, except the three G emblems in `apps/web/src/assets/symbols/`.

**Return to player: 96.00%** (`rtp_bps` 9600). A million rounds through the real game loop measured 95.70%. Bets run from €0.20 to €5.00 inside the casino's limits.

## How it fits the casino

```
browser page  ──►  Lowrider game server (this repo)  ──►  Grove Casino API
(shows results)     decides rounds with crypto.randomInt     holds every balance
```

- The page never decides anything or talks to the casino. It is Vue 3 (HUD, menus, prompts, accessibility) over a PixiJS canvas (reels, bonus scenes, effects). It sends "spin at €0.40" or "left alley" to the game server as JSON and plays back the answer; control-state changes arrive over Server-Sent Events.
- The server swaps the lobby's one-time `?gc_token=` for a casino session, keeps that session on the server, and gives the browser its own Secure, HTTP-only cookie. `GAME_KEY` and the casino session id never reach the browser. Every request is checked with Zod and game actions are rate-limited.
- Each spin is one casino round: `round/open` (debit), the outcome from `crypto.randomInt`, then `round/settle` (credit). Network trouble is retried with the same round id. A round that cannot be settled is voided, which refunds the bet. The page only shows a win after the casino confirmed it. Round references and Wanted levels are kept in SQLite (never balances), so rounds left open by a crash or restart are voided on the next start.
- The server follows the control state (`live`, `last_bets`, `halted`, `maintenance`) from the casino's event stream and from every heartbeat (sent every 30 s). The page shows the casino's reason.
- Bet options and the max win per round come from the casino's limits. The admin setting `gamble_enabled` turns the Car Chase on or off.
- Big wins (10× bet and up) go to the casino leaderboard with `score()`.
- `GET /health` answers `{ok, version, status}`, and logs are one JSON line per event with no keys or session ids.

All casino calls are in `apps/server/src/casino.ts`. It is written from GAMES.md's description of the HTTP API. Check the response fields marked there against the official `sdk/casino-game.js` before going live.

## Run it locally

Needs Node.js 24 and pnpm (`corepack enable` picks up the pinned version).

```sh
pnpm install
pnpm dev           # game server on :8787 + Vite page on :5173; open http://localhost:5173
```

Without `CASINO_URL` the server uses a built-in stand-in casino with a €1,000 play-money balance, so you can play without the real casino. In that mode only, these work from the browser console:

- `__groveslot.controller.forceNext = 'turfWar'` (or `freeSpins`, `lowriderHop`, `holdAndSpin`, `driveBy`), then spin.
- `fetch('/api/dev/control', {method: 'POST', body: JSON.stringify({status: 'last_bets', reason: 'Testing'})})` shows the control-state screens.

## Develop

```sh
pnpm typecheck     # strict TypeScript in every package (vue-tsc for the page)
pnpm lint          # ESLint (typescript-eslint + eslint-plugin-vue)
pnpm test          # Vitest: maths/RTP, RNG, rounds, idempotency, recovery, casino client, HTTP
pnpm build         # apps/web/dist (Vite) + apps/server/dist/server.mjs
pnpm start         # run the built server, which also serves the built page
pnpm test:e2e      # Playwright smoke test against the built server (run pnpm build first)
pnpm sim           # engine simulation: pnpm sim -- [rounds] [seed]
pnpm odds          # GAMES.md odds check through the real game loop: pnpm odds -- [rounds]
```

A note on the odds check: Lowrider's volatility is about 7× the bet per round. That means the observed RTP of a 100,000-round run normally lands within ±4.5 points of 96%, and a 500-round run within about ±64 points. `pnpm odds` prints that spread and judges the result against it. Use a million rounds or more to see the declared figure to within a point or two.

- `apps/server/`: Fastify game server (casino client, sessions, rounds, control state, heartbeat, SSE, SQLite journal)
- `apps/web/`: the page: Vue 3 + Pinia for the HUD and menus, PixiJS for the canvas, Grove design tokens as CSS variables
- `packages/shared/`: game maths (run only by the server), reel/paytable config and the Zod API contract
- `casino-game.json`: the manifest for registration

## Deploy

- `Dockerfile` is multi-stage: it builds with pnpm on Node 24 and runs only the server bundle, its production dependencies and the built page, as the non-root `node` user. `BUILD_VERSION` becomes `GAME_VERSION`, which `/health` and the heartbeat report. Mount a volume on `/data` for the SQLite journal.
- Runtime environment (Portainer stack only, never in the repo or build args): `GAME_KEY`, `CASINO_URL`, `CASINO_PUBLIC_URL`, `PORT` (default 8080 in the image).
- `.github/workflows/build.yml` runs typecheck, lint, test and build on every push to every branch, then publishes `ghcr.io/<owner>/<repo>:1.0.<build number>` (amd64 + arm64). Pushes to `main` also get a GitHub Release.
- Then follow GAMES.md §7: send the manifest, repository, image tag and a screenshot to the admin, deploy the versioned image with the key, run the casino's `tools/game-check.js`, and check `/health` and heartbeats before going `live`.

GTA, San Andreas and Grove Street-related names belong to their owners. This is an unofficial fan project with original art and audio. For fun only: no real money is played.
