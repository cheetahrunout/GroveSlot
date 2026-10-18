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
- Online multiplayer (maybe later: a local leaderboard only).

**IP note:** GTA and its characters, logos, music and art belong to Rockstar. Use **original art and audio** that pays homage to the setting (green bandanas, lowriders, cul-de-sac, spray cans) instead of ripped assets, logos or soundtrack clips. Keep in-game names as homages or nicknames ("The Cul-de-sac", "OG", "Homie") so the project stays shareable.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** | Fast dev loop, simple static deploy |
| Rendering | **PixiJS v8** | WebGL sprites, smooth reel spins, particles |
| Animation | GSAP (or Pixi ticker tweens) | Reel easing, win celebrations |
| Audio | **Howler.js** | Sprite sheets, mobile-safe unlock |
| State | Small typed store (no framework) or Zustand | Game state machine is simple |
| Persistence | `localStorage` (try/catch, versioned schema) | Tokens, stats, settings |
| Tests | **Vitest** | Math, payouts and state machine |
| Deploy | GitHub Pages / any static host | No backend needed |

---

## 3. Core game

### Grid and paylines
- **5×3 grid, 20 fixed paylines**, left-to-right, 3+ of a kind pays.
- Later option: switch to 243 ways-to-win as a config flag (the evaluator should support both).

### Symbols (original artwork, Grove Street flavour)

| Tier | Symbol | Notes |
|---|---|---|
| Wild | **Trident G** (`wild-trident-g.jpg`) | Substitutes for all except Scatter/Bonus; expands to a full reel during free spins |
| Jackpot | **Crown G** (`kingpin-crown-g.jpg`) | Only appears on Cash Bags in Hold & Spin and marks the Kingpin (Grand) jackpot; also the big-win "Kingpin" badge |
| Feature | **Palm G** (`turf-war-palms-g.jpg`) | Turf War emblem: shown on the wheel hub and the "Turf War!" trigger splash; 3 on reels 2–4 also triggers Turf War |
| Scatter | **Spray Can** | 3+ anywhere triggers Free Spins |
| Bonus | **Lowrider** | 3 on reels 1, 3 and 5 trigger the Lowrider Hop bonus |
| High | The OG (gang leader portrait), Green Sabre (muscle car), Cul-de-sac house, Gold Chain |
| Mid | Boombox, BMX bike, Basketball, Cap & shades |
| Low | A, K, Q, J, 10 styled as graffiti tags |
| Special | **Cash Bag** | Holds a token value; used by the Hold & Spin feature |

### Bet settings
- Bet per line: 1, 2, 5, 10, 25 tokens → total bet 20–500.
- Auto-spin (10/25/50/100, stops on any bonus or a big win) and a Turbo toggle.

### Target math (for fun, but keep it honest)
- Target **RTP ≈ 96%**, medium volatility, hit rate ≈ 25–30%.
- Rough RTP split: base game 60%, free spins 20%, Lowrider Hop 8%, Hold & Spin + jackpots 8%.
- Max win cap: 5,000× total bet.

---

## 4. Bonus games and features

### 4.1 Grove Street Free Spins (Scatter)
- 3 / 4 / 5 Spray Cans → **10 / 15 / 20 free spins**.
- **Tag the Hood meter:** each Spray Can landing during free spins adds a tag to a wall graphic. Every 3 tags adds +1 multiplier (×1 → ×5) and +2 spins.
- Bandana wilds **expand** to the full reel.
- Retrigger: 3+ Spray Cans adds +10 spins.

### 4.2 Lowrider Hop (pick/skill-lite bonus)
- Triggered by 3 Lowriders on reels 1, 3 and 5.
- Pick 1 of 3 lowriders, then a "hydraulics hop" mini-game: press at the right time on 5 rounds of a timing bar; higher hops pay more (2×–50× bet per hop).
- The timing only adjusts the multiplier inside a fixed range, so the RTP stays predictable. The outcome table is still decided by the RNG, and the timing nudges you up or down one step.

### 4.3 Turf War (wheel / map bonus)
- Triggered by 3 **Palm G** symbols on reels 2–4, or by a random **"Turf War!"** event after any non-winning spin (≈1 in 150).
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
- **Drive-By:** a car rolls past and splashes 2–5 random wilds on the reels (≈1 in 80 spins).
- **Wanted Level:** five stars in the header. Each base-game win adds a star and each loss removes one. At 5 stars the next spin is guaranteed a win of ≥ 5× bet, then the meter resets. This is a mild "streak" feeling; its cost is built into the RTP.

### 4.7 Gamble: "Car Chase" (optional after any win)
- Double or nothing: guess which alley the car escapes through (left/right). Up to 5 rounds, capped at 10× the original win.
- Exactly 50/50, so it's RTP-neutral. You can turn it off in settings.

---

## 5. Token economy (no real money)

- New player: **10,000 tokens**.
- **Daily handout** ("Sweet's allowance"): +2,000 tokens every 24 h.
- **Broke rescue:** if your balance is below the minimum bet, a "Back on your feet" button gives +1,000 (with a cooldown of 1 per hour).
- Tokens can't be bought, transferred or redeemed. A "No real money, for fun only" notice sits on the title screen and in settings.
- Optional cosmetics unlocked by **achievements** (not purchases): reel skins (night / sunset / rain), alternate bandana colours, a car horn sound.

### Stats and achievements
- Track total spins, biggest win, bonuses triggered, territories taken and time played.
- Achievements: "All we had to do…" (first bonus), "Turf Boss", "Hydraulics King", "Kingpin", "Respect +" (1,000 spins).

---

## 6. Architecture

```
src/
  main.ts                 # bootstrap Pixi app + loader
  config/
    symbols.ts            # symbol ids, tiers
    reels.ts              # reel strips (base + free spins), data-only
    paytable.ts           # payouts per symbol/count
    paylines.ts           # 20 line definitions
    features.ts           # trigger rates, bonus tables, jackpots
  engine/                 # pure TS, no rendering → fully unit-testable
    rng.ts                # seedable PRNG (e.g. xoshiro128**), crypto seed by default
    spin.ts               # pick stops → grid
    evaluate.ts           # lines/ways evaluation, scatter, bonus detection
    features/
      freeSpins.ts
      lowriderHop.ts
      turfWar.ts
      holdAndSpin.ts
      driveBy.ts
      wantedLevel.ts
      gamble.ts
    jackpots.ts
    stateMachine.ts       # IDLE → SPINNING → EVALUATE → FEATURE → PAYOUT → IDLE
  economy/
    wallet.ts             # balance, bet validation, daily handout, rescue
    storage.ts            # versioned localStorage with try/catch + migration
    achievements.ts
  view/                   # Pixi rendering, listens to engine events
    ReelView.ts
    WinLineView.ts
    HUD.ts                # balance, bet, spin, auto, turbo
    scenes/
      BaseGameScene.ts
      FreeSpinsScene.ts
      LowriderHopScene.ts
      TurfWarScene.ts
      HoldAndSpinScene.ts
      GambleScene.ts
    effects/              # coin bursts, big-win banners, screen shake
  audio/
    sound.ts              # Howler wrapper, music ducking, mute
tools/
  simulate.ts             # runs N million spins → RTP, hit rate, volatility, feature frequency
tests/
  evaluate.test.ts, features.test.ts, wallet.test.ts, rng.test.ts
public/assets/            # original sprites, atlases, audio
```

**Key rule:** the engine decides every outcome **before** the animation starts, and the view only plays it back. That keeps the math testable and lets the simulator run without rendering.

---

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
| 1 | **Scaffold** | Vite + TS + Pixi + Vitest, lint/format, CI running tests |
| 2 | **Engine core** | RNG, reel strips, spin, line evaluation, paytable; unit tests |
| 3 | **Simulator** | `npm run sim`: 10M spins, reports RTP/hit rate; tune strips to about 96% |
| 4 | **Base game UI** | Spinning reels with placeholder art, HUD, bet controls, win lines, wallet + localStorage |
| 5 | **Free Spins** | Scatter trigger, expanding wilds, Tag the Hood multiplier, retriggers |
| 6 | **Lowrider Hop** | Pick + timing mini-game scene |
| 7 | **Hold & Spin + Jackpots** | Cash Bags, respins, 4 jackpot tiers |
| 8 | **Turf War + Drive-By + Wanted Level** | Random features and wheel/map scene |
| 9 | **Gamble** | Car Chase double-or-nothing |
| 10 | **Economy polish** | Daily handout, rescue, stats, achievements, cosmetic unlocks |
| 11 | **Art and audio pass** | Replace placeholders, big-win celebrations, music |
| 12 | **QA and release** | Mobile layout, performance, re-run the simulator after all features, deploy to GitHub Pages |

After every feature milestone, re-run the simulator and keep the total RTP inside 95–97%.

---

## 9. Testing strategy
- **Unit tests:** evaluator (every payline, wild substitution, scatter counts), each feature's trigger and payout, wallet edge cases (insufficient balance, cooldowns, corrupted storage).
- **Deterministic replays:** a seeded RNG means any reported weird spin can be reproduced from its seed.
- **Simulator checks in CI:** a short run of 200k spins asserts RTP is within a loose band, so a strip edit can't silently break the math.
- **Manual QA:** a debug panel (dev builds only) that forces triggers: "force free spins", "force Turf War", "set balance".

---

## 10. Open questions
1. Paylines (20 lines) or 243 ways? The plan defaults to 20 lines.
2. Should the Lowrider Hop timing be real skill, or purely cosmetic for the most predictable math?
3. Desktop-first or mobile-first layout?
4. Do you want a local high-score / biggest-win leaderboard?
