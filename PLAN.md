# GroveSlot: Project Plan

A browser slot machine themed on Grove Street (GTA: San Andreas). You play with **free tokens only**. There is no real money, no purchases and no cash-out. It's just for fun.

---

## 1. Goals and non-goals

**Goals**
- A polished 5-reel slot with a strong Grove Street / early-90s Los Santos feel.
- Several bonus games: free spins, a pick-'em, a wheel, a gamble round, random features and jackpots.
- A token economy that stays fun: free top-ups, no paywall, nothing to buy.
- Fair, testable math: a seeded RNG, reel strips defined as data, and a simulator that checks RTP.

**Non-goals**
- Real-money gambling, in-app purchases, ads, or any way to turn tokens into money or prizes.
- Online multiplayer. The leaderboard starts local but sits behind an interface, so an online one can be added later (see §5).

**IP note:** GTA and its characters, logos, music and art belong to Rockstar. Use **original art and audio** that pays homage to the setting (green bandanas, lowriders, cul-de-sac, spray cans) instead of ripped assets, logos or soundtrack clips. Keep in-game names as homages or nicknames ("The Cul-de-sac", "OG", "Homie") so the project stays shareable.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** | Fast dev loop, simple static deploy |
| Rendering | **PixiJS v8** | WebGL sprites, smooth reel spins, particles |
| Animation | Small promise-based tween helper on the Pixi ticker (`src/view/tween.ts`) | Reel easing, win celebrations, turbo speed-up |
| Audio | **Web Audio API** synth (`src/audio/sound.ts`) | Every sound and the music loop are generated in code: no audio files, nothing borrowed |
| State | Small typed store (no framework) or Zustand | Game state machine is simple |
| Persistence | `localStorage` (try/catch, versioned schema) | Tokens, stats, settings |
| Tests | **Vitest** | Math, payouts and state machine |
| Fonts | Anton + Permanent Marker via `@fontsource` (bundled) | Graffiti look, works offline |
| Deploy | GitHub Pages / any static host | No backend needed |

---

## 3. Core game

### Grid and paylines
- **5×3 grid, 20 fixed paylines**, left-to-right, 3+ of a kind pays.
- Wins are shown by drawing the winning lines over the reels, with the line number and payout.

### Symbols (original artwork, Grove Street flavour)

| Tier | Symbol | Notes |
|---|---|---|
| Wild | **Trident G** (`wild-trident-g.jpg`) | Substitutes for all except Scatter/Bonus; expands to a full reel during free spins |
| Jackpot | **Crown G** (`kingpin-crown-g.jpg`) | Marks the Kingpin (Grand) jackpot: on the jackpot meter and the Kingpin win screen (won by filling all 15 cells in Cash Run) |
| Feature | **Palm G** (`turf-war-palms-g.jpg`) | Turf War emblem: shown on the wheel hub and the "Turf War!" trigger splash; 3 on reels 2–4 also triggers Turf War |
| Scatter | **Spray Can** | 3+ anywhere triggers Free Spins |
| Bonus | **Lowrider** | 3 on reels 1, 3 and 5 trigger the Lowrider Hop bonus |
| High | The OG (gang leader portrait), Green Sabre (muscle car), Cul-de-sac house, Gold Chain |
| Mid | Boombox, BMX bike, Basketball, Cap & shades |
| Low | A, K, Q, J, 10 styled as graffiti tags |
| Special | **Cash Bag** | Holds a token value (1×–25× bet) or a Homie/Soldier/OG jackpot; lands in stacks of 2; 6+ start Cash Run |

### Bet settings
- Bet per line: 1, 2, 5, 10, 25 tokens → total bet 20–500.
- Auto-spin (10/25/50/100, stops on any bonus or a big win) and a Turbo toggle.

### Target math (for fun, but keep it honest)
- Target **RTP ≈ 96%**, medium volatility, hit rate ≈ 25–30%.
- Rough RTP split: base game 60%, free spins 20%, Lowrider Hop 8%, Hold & Spin + jackpots 8%.
- Max win cap: 5,000× total bet.

**Final maths (10M simulated rounds, seed 2026; `npm run sim`):**
| Part | RTP | How often |
|---|---|---|
| Base game (lines, scatter pays, Drive-By, Wanted paydays) | 58.6% | Drive-By 1 in 286, Wanted payday 1 in 192 |
| Grove Street Free Spins | 19.3% | 1 in 238, avg 45.9× bet |
| Lowrider Hop | 6.9% | 1 in 704, avg 48.7× bet |
| Cash Run + jackpots | 7.1% | 1 in 383, avg 27.1× bet |
| Turf War | 3.9% | 1 in 348, avg 13.5× bet |
| **Total** | **95.8%** | hit rate 21% |
- The hit rate ended at 21%, below the 25–30% first aimed for: Cash Bags and the other specials break lines. Raising it would mean trimming line pays further for the same RTP.
- Line pays are in line bets (for example 3× J = 11, 5× OG = 2,250, 5× Trident G = 4,500); Spray Cans pay 5× / 25× / 100× the total bet. All numbers live in `src/config/`.

---

## 4. Bonus games and features

### 4.1 Grove Street Free Spins (Scatter)
- 3 / 4 / 5 Spray Cans → **10 / 15 / 20 free spins**.
- **Tag the Hood meter:** each Spray Can landing during free spins adds a tag to a wall graphic. Every 3 tags adds +1 multiplier (×1 → ×5) and +2 spins.
- Bandana wilds **expand** to the full reel.
- Retrigger: 3+ Spray Cans adds +10 spins.

### 4.2 Lowrider Hop (just for fun, pure odds)
- Triggered by 3 Lowriders on reels 1, 3 and 5.
- Pick 1 of 3 lowriders (cosmetic), then watch it hop 5 times. Each hop pays 2×–60× bet; higher hops pay more.
- **No skill involved.** The engine draws every hop height from a weighted table the moment the bonus triggers. Pressing "HOP" only plays the next animation, so the result is the same however or whenever you press.

### 4.3 Turf War (wheel / map bonus)
- Triggered by 3 **Palm G** symbols on reels 2–4, or by a random **"Turf War!"** event after a spin that won and triggered nothing (1 in 500 of those).
- A Los Santos map with territories (homage names: Idlewood, Ganton, Jefferson, East LS, Glen Park…).
- You spin a wheel to "take" territories. Each one pays a token prize, and some unlock extra spins of the wheel. A "Ballas" slice (purple) ends the round.
- Taking all territories pays a **Turf Boss** prize of 100× bet.

### 4.4 Hold & Spin: "Cash Run"
- 6+ Cash Bags trigger it. The bags lock and you get 3 respins; any new bag resets the counter to 3.
- Bags show token values (1×–25× bet) or jackpot labels.
- Filling all 15 positions awards the **Grand** jackpot.

### 4.5 Jackpots (token-only, fixed or slowly growing)
| Name | Value |
|---|---|
| Homie | 20× bet |
| Soldier | 50× bet |
| OG | 250× bet |
| Kingpin (Grand) | 1,000× bet + 0.5% of every bet since the last hit (local "progressive") |

### 4.6 Random base-game features
- **Drive-By:** a car rolls past and sprays 1–3 wilds onto plain symbols (1 in 200 spins).
- **Wanted Level:** five stars next to the spin button. Each winning round adds a star; every 2 losing spins in a row take one away. At 5 stars the next spin is guaranteed a line win of ≥ 5× bet (never a bonus), then the meter resets (≈ 1 in 190 spins). Its cost is built into the base-game RTP.

### 4.7 Gamble: "Car Chase" (optional after any win)
- Double or nothing: guess which alley the car escapes through (left/right). Up to 5 rounds, capped at 10× the original win.
- Exactly 50/50, so it's RTP-neutral. You can turn it off in settings.

---

## 5. Token economy (no real money)

- New player: **10,000 tokens**.
- **Daily allowance:** +2,000 tokens every 24 h, offered in a pop-up when you open the game.
- **Broke rescue:** if your balance is below the minimum bet, a "Back on your feet" button gives +1,000 (with a cooldown of 1 per hour).
- Tokens can't be bought, transferred or redeemed. A "No real money, for fun only" notice sits on the title screen and in settings.
- Cosmetics unlocked by **achievements** (not purchases): reel skins Night Shift (Tagger), Sunset Cruise (Hydraulics King) and Rainy Block (Turf Boss).

### Leaderboard (prepared, local first)
- `LeaderboardService` interface with `submit()` / `top()`; categories: biggest win, biggest multiplier, territories taken.
- `LocalLeaderboard` stores the top 50 per category in localStorage. An online version (for example a small serverless API) can implement the same interface later without UI changes.
- The leaderboard screen itself comes with the economy polish milestone.

### Stats and achievements
- Tracked: spins, tokens bet and won, biggest win, each bonus, territories, Kingpins, Wanted paydays, Drive-Bys, best Car Chase streak and time played (MENU → STATS).
- 11 achievements (MENU → TROPHIES): All We Had To Do… (first bonus), Tagger, Hydraulics King, Bag Man, Kingpin, Turf Boss, Most Wanted, Drive-By, Escape Artist, Respect (50× win) and Respect + (1,000 spins). New ones pop up as a toast.
- MENU also has the paytable at your bet (PAYS), the local leaderboard (LEADERS) and SETTINGS: gamble offer, sound, music, player name and reel skin.

---

## 6. Architecture

```
src/
  main.ts                 # boots Pixi, wires controller + scene, dev-only debug hook
  config/                 # symbols, paylines, paytable, reel strips, bonus settings, RTP budget
  engine/                 # pure TS, no rendering → fully unit-testable
    rng.ts                # seedable xoshiro128**, crypto seed by default
    spin.ts, evaluate.ts  # stops → grid, payline/scatter/trigger evaluation
    round.ts              # playRound: base spin + every bonus decided up front, max-win cap
    stats.ts              # simulate(): RTP per part, trigger rates
    features/             # freeSpins, lowriderHop, holdAndSpin, turfWar, driveBy, wanted, gamble
  game/
    GameController.ts     # bets, rounds, saving, menu, gamble, daily/rescue, leaderboard
    presenters/           # play each bonus result back on screen
  economy/                # wallet, progress (stats, achievements, settings), storage
  leaderboard/            # LeaderboardService + LocalLeaderboard
  audio/sound.ts          # Web Audio sound effects and music
  view/                   # Pixi screens: reels, HUD, bars, banners, dialogs, menu, big win
    art/                  # vector art for symbols, lowrider, cash bag
    scenes/               # Lowrider Hop, Cash Run, Turf War, Car Chase, menu
tools/simulate.ts         # npm run sim
tests/                    # 63 Vitest tests, including a 200k-round maths check
```

**Key rule:** the engine decides every outcome **before** the animation starts (and the win is saved straight away), and the view only plays it back. That keeps the math testable and lets the simulator run without rendering.

---

### Screen layout (desktop first, mobile ready)
- The scene is built at a fixed design resolution and scaled to fit with letterboxing (`src/view/layout.ts`).
- **Landscape 1920×1080** is the main layout: reels in the centre, spin button on the right, balance and bet below.
- **Portrait 1080×1920** is already wired up and used automatically on tall screens: reels on top, controls stacked below. It gets a proper polish pass in the QA milestone.
- Use pointer events only (mouse and touch both work), keep buttons ≥ 88 design px, and avoid hover-only UI.

## 7. Art and audio direction

### Provided artwork (`public/assets/symbols/`)
| File | Content | Use |
|---|---|---|
| `wild-trident-g.jpg` | White G with a trident on a green circle, framed like a reel band | **Wild** symbol; also a candidate for the game logo / favicon |
| `kingpin-crown-g.jpg` | Green G under a crown with a star, on black | **Kingpin jackpot** symbol, Grand jackpot banner, "Kingpin" big-win badge |
| `turf-war-palms-g.jpg` | Crowned G between two palm trees, on blue | **Turf War** trigger symbol and wheel hub |

Prep before use:
- All three are 768×1152 JPGs (portrait, opaque background). Reel cells are roughly square, so crop each to its central emblem (about 768×768) or show the full card on a portrait cell.
- Cut the emblems out to transparent PNGs/WebP, so they can glow, pulse and sit on any background, and pack them into a texture atlas with the other symbols.
- Draw the rest of the symbols in the same style (bold white outlines, flat green/black shading) so the set looks consistent.
- Palette note: the blue Palm G stands out from the green set, which suits a special trigger symbol.

### General direction
- Palette: Grove green (#1f7a1f-ish), sunset orange and purple, concrete grey, gold accents.
- Style: chunky early-2000s game UI, graffiti fonts (open-licensed, such as from Google Fonts), slight VHS grain overlay.
- Backgrounds: a cul-de-sac at sunset (base game), a night version with streetlights (free spins).
- Audio: original G-funk-inspired loops (talkbox, synth bass, 90–95 BPM), sounds for reel stops, spray-can hiss, hydraulics, police siren for the Wanted Level and a lowrider horn. Use royalty-free or self-made audio only.
- Big-win tiers: **Nice** (10×), **Respect** (25×), **Big Smoke-sized** (50×), **Kingpin** (100×+), each with escalating animation.

---

## 8. Milestones

| # | Milestone | Deliverable |
|---|---|---|
| 1 | **Scaffold** ✅ | Vite + TS + Pixi + Vitest, CI running tests, seeded RNG, layout system, leaderboard interface, placeholder grid |
| 2 | **Engine core** ✅ | Reel strips, spin, line evaluation, paytable, bonus triggers; unit tests; wired into the placeholder screen |
| 3 | **Simulator** ✅ | `npm run sim -- [rounds] [seed]` reports RTP, hit rate, biggest win and trigger rates; a 200k-round test guards the maths in CI |
| 4 | **Base game UI** ✅ | Spinning reels with bounce, HUD (balance, bet −/+, win, auto-spin 10–100, turbo, space bar), win lines cycling with labels, saved wallet |
| 5 | **Free Spins** ✅ | Spray Can trigger (10/15/20 spins), night backdrop, expanding wilds, Tag the Hood wall raising the multiplier to ×5 with +2 spins per level, +10 retriggers, free-spin RTP ≈ 21% |
| 6 | **Lowrider Hop** ✅ | Pick 1 of 3 lowriders (cosmetic), 5 hops drawn from a weighted ×2–×50 table when the bonus triggers; HOP only plays the next animation; ≈ 7% RTP |
| 7 | **Hold & Spin + Jackpots** ✅ | Stacked Cash Bags with values, 6+ start Cash Run: 3 respins that reset on every new bag, collect screen, Homie/Soldier/OG bag jackpots, Kingpin (1,000× + pot) for all 15 cells, jackpot meter, saved pot; ≈ 7.7% RTP |
| 8 | **Turf War + Drive-By + Wanted Level** ✅ | Turf War wheel (prizes, Backup, Ballas) and Los Santos map with Turf Boss; Drive-By car spraying 1–3 wilds; Wanted stars with a guaranteed 5× payday; total RTP ≈ 97% before final tuning |
| 9 | **Gamble** ✅ | GAMBLE ×2 button after a win (not during auto-spin): pick the left or right alley, 50/50 escape or bust, up to 5 rounds and 10× the win, COLLECT any time |
| 10 | **Economy polish** ✅ | Daily allowance and broke rescue pop-ups, stats, 11 achievements with toasts, 3 unlockable reel skins, local leaderboard (big wins, multipliers, territories), MENU with pays/stats/trophies/leaders/settings; wins are saved the moment a round is decided |
| 11 | **Art and audio pass** ✅ | Original vector art for every remaining symbol (OG, Sabre, house, chain, boombox, BMX, ball, cap, spray can, lowrider, graffiti letters) baked to textures; big-win screen (Nice → Respect → Big Smoke-sized → Kingpin) with coins; synthesised sound effects and a G-funk-style music loop, both switchable in Settings |
| 12 | **QA and release** ✅ | Final tuning to 95.8% RTP (10M rounds), portrait layout polish, production build checked, GitHub Pages workflow (enable Pages → GitHub Actions), README |

After every feature milestone, re-run the simulator and keep the total RTP inside 95–97%.

---

## 9. Testing strategy
- **Unit tests:** evaluator (every payline, wild substitution, scatter counts), each feature's trigger and payout, wallet edge cases (insufficient balance, cooldowns, corrupted storage).
- **Deterministic replays:** a seeded RNG means any reported weird spin can be reproduced from its seed.
- **Simulator checks in CI:** a short run of 200k spins asserts RTP is within a loose band, so a strip edit can't silently break the math.
- **Manual QA:** a debug panel (dev builds only) that forces triggers: "force free spins", "force Turf War", "set balance".

---

## 10. Decisions
1. **Paylines:** 20 fixed lines, left to right (confirmed; no ways-to-win).
2. **Lowrider Hop:** no skill, pure odds. The outcome is drawn when the bonus triggers.
3. **Layout:** desktop first, with the portrait/mobile layout prepared from the start.
4. **Leaderboard:** prepared now (interface + local storage); screen added in milestone 10.
