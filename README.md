# Lowrider

**Lowrider** is a Grove Street themed slot machine for [Grove Casino](https://casino.grovestreet.zip), inspired by GTA: San Andreas. The project and repository are called GroveSlot.

It follows the casino's integration guide (`game-integration.md` in the casino repository): the game runs on its own server, every bet and win goes through the casino, and the page in the browser only shows results.

## Features

- **5 reels, 20 paylines**, read left to right. The Trident G is wild.
- **Grove Street Free Spins:** 3+ Spray Cans give 10/15/20 spins. Wilds expand to fill their reel, and every 3 Spray Cans tag the hood for +1 multiplier (up to ×5) and +2 spins.
- **Lowrider Hop:** Lowriders on reels 1, 3 and 5 start the bonus: pick a ride and hop 5 times for ×2–×60 your bet. Pure odds, decided on the server; pressing HOP only plays the result.
- **Cash Run (Hold & Spin):** 6+ Cash Bags lock in place for 3 respins, and every new bag resets them. Bags hold 1×–25× the bet or the Homie, Soldier or OG jackpot. Fill all 15 cells for the **Kingpin** (1,000× bet).
- **Turf War:** 3 Palm G (or a rare surprise) open a wheel and a map of eight neighbourhoods. Take them block by block until the Ballas push you back.
- **Drive-By:** sometimes a car rolls past and sprays wilds onto the reels.
- **Wanted Level:** wins add stars. At five stars the next spin also pays a **Payday** of 6×–28× the bet.
- **Car Chase:** after a win, double or nothing by picking an alley. Each pick is its own casino round.
- Every bonus opens with a paint-stripe transition, and there are stats, trophies and unlockable reel skins (MENU). The art and sound are original and generated in code, except the three G emblems in `apps/web/src/assets/symbols/`.

**Return to player: 96%** (`rtp_bps` 9600). 40 million rounds with the CSPRNG measured 96.06% (±0.22). Bets run from € 0,20 to € 5,00 inside the casino's limits, in euro (`currency: euro`).

## How it fits the casino

```
browser page  ──►  Lowrider game server (this repo)  ──►  Grove Casino API
(shows results)     decides rounds with the SDK's rng       holds every balance
     └── casino bar (bar.js loader from the casino: the strip, the chat and players panes)
```

- The page never decides anything or talks to the casino API. It is Vue 3 (HUD, menus, prompts, accessibility) over a PixiJS canvas (reels, bonus scenes, effects). It sends "spin at € 0,40" or "left alley" to the game server as JSON and plays back the answer; the control state and the player's balance arrive over Server-Sent Events.
- **Casino SDK.** `apps/server/src/casino/casino-game.js` and `.d.ts` are the casino's `sdk/` files, copied verbatim (refresh by copying again). `createCasino()` makes every call, `watch()` keeps the control state current from the stream and heartbeats every 30 s with the build version and the player count, and the engine's randomness is the SDK's `rng` (`crypto.randomInt`).
- **The handoff.** The page posts the lobby's one-time `?gc_token=` once and drops it from the address bar. The server swaps it for a casino session, keeps that session on the server, and gives the browser its own Secure, HTTP-only cookie. `GAME_KEY` and the casino session id never reach the browser. A visitor without a session, or whose session the casino ended (401), is sent to `CASINO_PUBLIC_URL/play/lowrider` and comes back with a fresh token. There is no login form.
- **Rounds.** Each spin and each Car Chase pick is one casino round in euro cents: `round/open` (debit), the outcome, then `round/settle` (credit). Network trouble is retried with the same round id. A round that cannot be settled is voided, which refunds the bet. The page only shows a win after the casino confirmed it. Round references and Wanted levels are kept in SQLite (never balances); rounds left open by a crash or restart are voided once the casino answers.
- **Control states** (guide section 4) apply the moment the SDK's state changes, with the reason the admin gave: `open` plays; `demo` plays exactly the same while the casino returns every round, and the page shows a DEMO mark; `maintenance` takes no new players or spins but lets a round in progress settle; `closed` means the casino refunded everything and closed every session, and when it opens again the page goes back through `/play/lowrider` for a fresh one. When the casino stops answering heartbeats for 90 s the SDK reports `offline`: no new rounds until it answers. A settle the casino refunded meanwhile (`refunded: true`) is shown as "stake returned"; a late win of at least the stake is still paid.
- **Money on screen.** The casino bar comes from one loader tag, `<script src="CASINO_PUBLIC_URL/bar.js" data-game="lowrider">`, which the server writes into the page when it serves it (the casino address is runtime config, never in the image; the conformance check looks for the tag). The loader opens the strip across the top (tokens and their euro value, live, Top up, Players, Chat) and the chat and players panes the player docks left, right or bottom; it sets `--grove-bar-top/right/bottom/left`, and the game lays itself out inside them (the HUD sizes to the room left, with container queries). The HUD also shows the balance in tokens (four decimals, rounded down) and its euro value, updated after every round and on every `balance` event. Euro is written the casino's way, `€ 1.234,56`; never a dollar sign.
- **Theme.** The HUD links `CASINO_PUBLIC_URL/theme.css` (the player's own theme) and follows its tokens (`--bg`, `--surface`, `--ink`, `--gold`, the radii) with Lowrider's own values as the fallback. The reels, the bonus art and the graffiti fonts stay Lowrider's.
- **Security.** Every request is checked with Zod, game actions are rate-limited, and the page runs under a Content-Security-Policy (`script-src 'self'`, no eval, frames and styles only from the casino).
- Bet options and the max win per round come from the casino's limits. The admin setting `gamble_enabled` turns the Car Chase on or off. Big wins (10× bet and up) go to the casino leaderboard with `score()`.
- `GET /health` answers `{ok, version, status}` with `GAME_VERSION`. Logs are one JSON line per event, never a key, a token or a session id. On SIGTERM the server stops taking rounds, lets settles and voids in flight finish, stops the watch loop and exits.

## Run it locally

Needs Node.js 24 and pnpm (`corepack enable` picks up the pinned version).

```sh
pnpm install
pnpm dev           # game server on :8787 + Vite page on :5173; open http://localhost:5173
```

Without `CASINO_URL` the server uses a built-in stand-in casino with a €1,000 play-money balance, so you can play without the real casino. In that mode only, these work from the browser console:

- `__groveslot.controller.forceNext = 'turfWar'` (or `freeSpins`, `lowriderHop`, `holdAndSpin`, `driveBy`), then spin.
- `fetch('/api/dev/control', {method: 'POST', body: JSON.stringify({status: 'maintenance', reason: 'Testing'})})` shows the control-state screens (`open`, `demo`, `maintenance`, `closed`).

## Develop

```sh
pnpm typecheck     # strict TypeScript in every package (vue-tsc for the page)
pnpm lint          # ESLint (typescript-eslint + eslint-plugin-vue)
pnpm test          # Vitest: maths/RTP, RNG, rounds, idempotency, recovery, casino client, HTTP
pnpm build         # apps/web/dist (Vite) + apps/server/dist/server.mjs
pnpm start         # run the built server, which also serves the built page
pnpm test:e2e      # Playwright smoke tests against the built server and a stub casino (run pnpm build first)
pnpm sim           # engine simulation: pnpm sim -- [rounds] [seed]
pnpm odds          # the casino's odds check: pnpm odds -- [loop rounds] [paytable rounds]
```

The odds check (integration guide, section 12) does two things. It runs `expectedRtp` from the SDK over Lowrider's outcome distribution (5 million engine rounds by default), and it plays 100,000 rounds through the real game loop and the stub casino. Both are compared with `rtp_bps`. Lowrider's volatility is about 7× the bet per round, so a 100,000-round run normally lands within ±4.5 points of 96% by chance alone, and the casino's 500-round flag band (10 points) is narrower than chance at this volatility (about ±64 points). Only tens of millions of rounds pin the figure to within a few tenths of a point.

- `apps/server/`: Fastify game server (the casino SDK, sessions, rounds, control state, SSE, SQLite journal, the stub casino for local play and tests)
- `apps/web/`: the page: Vue 3 + Pinia for the HUD and menus, PixiJS for the canvas, Grove design tokens as CSS variables
- `packages/shared/`: game maths (run only by the server), reel/paytable config and the Zod API contract
- `e2e/`: Playwright smoke tests (local play, the casino handoff, the Content-Security-Policy)
- `casino-game.json`: the manifest for registration
- `build-cost.jsonl`: the build ledger (the AI cost of building Lowrider), read by the casino

## Deploy

- `Dockerfile` is multi-stage: it builds with pnpm on Node 24 and runs only the server bundle, its production dependencies and the built page, as the non-root `node` user. `BUILD_VERSION` becomes `GAME_VERSION`, which `/health` and the heartbeat report. Mount a volume on `/data` for the SQLite journal.
- Runtime environment (the Portainer stack only, never the repository or build arguments): `PORT` (8080 in the image), `CASINO_URL` (the casino API on the LAN), `CASINO_PUBLIC_URL` (the casino's public address) and `GAME_KEY`.
- `.github/workflows/build.yml` is the guide's workflow: on every push to every branch it runs typecheck, lint, tests, build and the Playwright smoke tests, then publishes `ghcr.io/<owner>/<repo>:1.0.<build number>` (linux/amd64). Pushes to `main` also get a GitHub Release. The casino host pulls with the casino owner's GHCR credentials, so make the package public or give that account read access.
- `build-cost.jsonl` must be up to date before every release. From the casino repository: `node tools/build-cost.js lowrider <transcripts dir> --ledger <this repo>/build-cost.jsonl`. The repository is private, so the casino needs read access to it (ask the admin).
- Going live (guide section 12): run `pnpm odds`, send the admin the manifest, the image tag and a screenshot; the admin registers the game (it starts `closed`); deploy the stack with the key; run `GAME_KEY=... node tools/game-check.js lowrider casino-game.json` from the casino repository; the admin sets `demo` for the testers, then approves the ledger and sets the game `open`. Before a deploy that changes game logic, set `maintenance`, or `closed` for anything longer than a hand. Keep the SDK pair and the bar embed current with the casino's releases (its CLAUDE.md release notes).

GTA, San Andreas and Grove Street-related names belong to their owners. This is an unofficial fan project with original art and audio. For fun only: no real money is played.
