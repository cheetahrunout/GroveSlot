# Lowrider

**Lowrider** is a Grove Street themed slot machine for the browser, inspired by GTA: San Andreas. The project and repository are called GroveSlot. You play with **free tokens only**: no real money, no purchases, no cash-out. It's just for fun.

## Features

- **5 reels, 20 paylines**, read left to right. The Trident G is wild.
- **Grove Street Free Spins:** 3+ Spray Cans give 10/15/20 spins. Wilds expand to fill their reel, and every 3 Spray Cans tag the hood for +1 multiplier (up to ×5) and +2 spins.
- **Lowrider Hop:** Lowriders on reels 1, 3 and 5 start the bonus. Pick a ride and hop 5 times for ×2–×60 your bet. The results are pure odds; pressing HOP only plays them.
- **Cash Run (Hold & Spin):** 6+ Cash Bags lock in place for 3 respins, and every new bag resets them. Bags hold 1×–25× the bet or the Homie, Soldier or OG jackpot. Fill all 15 cells for the **Kingpin** jackpot (1,000× bet plus a growing pot).
- **Turf War:** 3 Palm G (or a rare surprise) open a wheel and a map of eight neighbourhoods. Take them block by block until the Ballas push you back. Take all eight to be Turf Boss.
- **Drive-By:** sometimes a car rolls past and sprays wilds onto the reels.
- **Wanted Level:** wins add stars. With five stars, the next spin is guaranteed to pay at least 5× your bet.
- **Car Chase:** after a win, gamble double or nothing by picking an alley.
- **Free tokens:** you start with 10,000, get a daily allowance of 2,000, and a once-an-hour top-up if you go broke.
- **Progress:** stats, 11 trophies, unlockable reel skins and a local leaderboard, all in MENU.
- Every bonus opens and closes with a paint-stripe transition: a lowrider hops across the screen, the stripes follow, and the bonus name is sprayed on.
- Original artwork and synthesised sound and music. The three G emblems are the provided artwork in `public/assets/symbols/`.

Payback is tuned to about **96%** (the measured value is 95.8% over 10 million simulated rounds). It's play money, but the maths is honest, and the simulator checks it on every commit.

## Play

```sh
npm install
npm run dev        # open the printed URL
```

Press **Space** or the SPIN button to spin. Use − / + to change the bet. Use AUTO for 10–100 spins and TURBO for faster reels. It works with a mouse or touch, in landscape (desktop) or portrait (phone).

## Develop

```sh
npm test           # unit tests, including a 200k-round maths check
npm run sim        # full simulation: npm run sim -- [rounds] [seed]
npm run build      # type-check and production build into dist/
```

In `npm run dev` builds, the browser console has a debug hook for testing bonuses, for example `__groveslot.controller.forceNext = 'turfWar'` (or `freeSpins`, `lowriderHop`, `holdAndSpin`), then spin. Production builds leave it out.

- `src/config/`: symbols, paylines, paytable, reel strips and bonus settings (all the numbers you would tune)
- `src/engine/`: pure game logic with no rendering. `playRound` decides a whole round, bonuses included, before anything is shown
- `src/game/`: the controller and bonus presenters that play a round back
- `src/view/`: the PixiJS screens, art and animation
- `src/economy/`, `src/leaderboard/`: wallet, progress, achievements and leaderboard (saved in the browser)
- `src/audio/`: Web Audio sound effects and music

See [PLAN.md](PLAN.md) for the full design.

## Deploy

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on every push to `main`. To turn it on, open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**.

GTA, San Andreas and Grove Street-related names belong to their owners. This is an unofficial fan project with original art and audio.
