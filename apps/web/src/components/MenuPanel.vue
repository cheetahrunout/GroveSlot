<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import { CASH_RUN, DRIVE_BY, FREE_SPINS, GAMBLE, JACKPOTS, LOWRIDER_HOP, TURF_WAR, WANTED } from '@lowrider/shared/config/features';
import { PAYLINES } from '@lowrider/shared/config/paylines';
import { CASH_TRIGGER_COUNT, LINE_PAYS, MAX_WIN_MULTIPLIER, SCATTER_PAYS } from '@lowrider/shared/config/paytable';
import manifest from '../../../../casino-game.json';
import type { SymbolId } from '@lowrider/shared/config/symbols';
import { ACHIEVEMENTS, SKINS, type SkinId } from '../economy/achievements';
import type { Settings } from '../economy/progress';
import { CONTROLLER, PROGRESS } from '../game/injection';
import { useGameStore } from '../stores/game';
import { euro, fmt } from '../view/format';
import { symbolLabel } from '../view/SymbolView';

type Tab = 'pays' | 'stats' | 'trophies' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'pays', label: 'PAYS' },
  { id: 'stats', label: 'STATS' },
  { id: 'trophies', label: 'TROPHIES' },
  { id: 'settings', label: 'SETTINGS' },
];

const store = useGameStore();
const controller = inject(CONTROLLER)!;
const progress = inject(PROGRESS)!;
const tab = ref<Tab>('pays');
// Progress is a plain object; bump this to re-read it after a change.
const version = ref(0);
const panel = ref<HTMLElement | null>(null);

const lineBet = computed(() => store.betCents / PAYLINES.length);
const pays = computed(() =>
  (Object.keys(LINE_PAYS) as SymbolId[]).map((sym) => {
    const p = LINE_PAYS[sym]!;
    return {
      sym,
      name: sym === 'WILD' ? 'TRIDENT G (WILD)' : symbolLabel(sym),
      amounts: [p[3], p[4], p[5]].map((x) => euro(x * lineBet.value)).join(' · '),
    };
  }),
);

const scatterPays = computed(() => [3, 4, 5].map((n) => euro(SCATTER_PAYS[n] * store.betCents)).join(' / '));
const jackpotList = (['homie', 'soldier', 'og', 'kingpin'] as const).map((j) => `${JACKPOTS[j].name} ${JACKPOTS[j].multiplier}x`).join(', ');

/** The declared return to player, from the manifest the casino registered (rtp_bps). */
const rtp = `${(manifest.rtp_bps / 100).toLocaleString('nl-NL', { maximumFractionDigits: 2 })}%`;
const maxWin = fmt(MAX_WIN_MULTIPLIER);

/** A prize table as "multiple × bet: chance" rows, from the weights the server draws with. */
function chances<T extends { weight: number }>(rows: readonly T[], label: (row: T) => string): { label: string; chance: string }[] {
  const total = rows.reduce((sum, r) => sum + r.weight, 0);
  return rows.map((r) => ({ label: label(r), chance: `${((r.weight / total) * 100).toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%` }));
}
const x = (m: number) => `${fmt(m)}x bet`;
const hopTable = chances(LOWRIDER_HOP.table, (r) => x(r.multiplier));
const bagTable = chances(CASH_RUN.values, (r) => ('jackpot' in r ? `${JACKPOTS[r.jackpot].name} ${x(JACKPOTS[r.jackpot].multiplier)}` : x(r.multiplier)));
const paydayTable = chances(WANTED.payday, (r) => x(r.multiplier));
const wheelCounts = (() => {
  const prizes = new Map<number, number>();
  let backup = 0;
  let ballas = 0;
  for (const slice of TURF_WAR.wheel) {
    if (slice.type === 'prize') prizes.set(slice.multiplier, (prizes.get(slice.multiplier) ?? 0) + 1);
    else if (slice.type === 'backup') backup++;
    else ballas++;
  }
  const list = [...prizes].sort((a, b) => a[0] - b[0]).map(([m, n]) => `${n} pay ${x(m)}`);
  return `${TURF_WAR.wheel.length} slices: ${list.join(', ')}, ${backup} BACKUP, ${ballas} BALLAS`;
})();
const levels = FREE_SPINS.maxMultiplier - 1;

const stats = computed(() => {
  void version.value;
  const s = progress.stats;
  const minutes = Math.round(s.playTimeMs / 60000);
  return [
    ['Spins played', fmt(s.spins)],
    ['Total bet', euro(s.totalBet)],
    ['Total won', euro(s.totalWon)],
    ['Biggest win', `${euro(s.biggestWin)} (x${Math.round(s.biggestMultiplier * 10) / 10})`],
    ['Free Spins', fmt(s.featureCounts.freeSpins)],
    ['Lowrider Hops', fmt(s.featureCounts.lowriderHop)],
    ['Cash Runs', fmt(s.featureCounts.holdAndSpin)],
    ['Turf Wars', fmt(s.featureCounts.turfWar)],
    ['Territories taken', fmt(s.territoriesTaken)],
    ['Kingpin jackpots', fmt(s.kingpins)],
    ['Wanted paydays', fmt(s.paydays)],
    ['Drive-Bys', fmt(s.driveBys)],
    ['Best Car Chase streak', fmt(s.bestChaseStreak)],
    ['Time played', minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`],
  ] as const;
});

const trophies = computed(() => {
  void version.value;
  return ACHIEVEMENTS.map((a) => ({ ...a, done: progress.isUnlocked(a.id), skin: a.unlocks ? SKINS[a.unlocks].name : null }));
});

const settings = computed(() => {
  void version.value;
  return progress.settings;
});

const skins = computed(() => {
  void version.value;
  return (Object.keys(SKINS) as SkinId[]).map((id) => ({ id, ...SKINS[id], unlocked: progress.isSkinUnlocked(id) }));
});

function change(patch: Partial<Settings>): void {
  controller.applySettings(patch);
  version.value++;
}

function close(): void {
  store.menuOpen = false;
}

onMounted(() => panel.value?.focus());
</script>

<template>
  <div class="cover" @click.self="close">
    <div ref="panel" class="panel g-panel" role="dialog" aria-modal="true" aria-label="Menu" tabindex="-1" @keydown.esc="close">
      <nav class="tabs" role="tablist">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="g-button is-plain"
          role="tab"
          :aria-selected="tab === t.id"
          :class="{ 'is-on': tab === t.id }"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
        <button class="g-button is-danger close" aria-label="Close menu" @click="close">✕</button>
      </nav>

      <div class="content" role="tabpanel">
        <template v-if="tab === 'pays'">
          <p class="note">Line pays at your bet of {{ euro(store.betCents) }} ({{ euro(lineBet) }} per line, {{ PAYLINES.length }} lines, left to right): 3 · 4 · 5 of a kind.</p>
          <dl class="pays">
            <template v-for="p in pays" :key="p.sym">
              <dt :class="{ wild: p.sym === 'WILD' }">{{ p.name }}</dt>
              <dd>{{ p.amounts }}</dd>
            </template>
          </dl>
          <ul class="rules">
            <li>
              SPRAY CAN anywhere: 3 / 4 / 5 pay {{ scatterPays }} and start 10 / 15 / 20 FREE SPINS.
            </li>
            <li>LOWRIDER on reels 1, 3 and 5: LOWRIDER HOP. PALM G on reels 2, 3 and 4: TURF WAR.</li>
            <li>
              {{ CASH_TRIGGER_COUNT }}+ CASH BAGS: CASH RUN. Jackpots: {{ jackpotList }} your bet.
            </li>
            <li>The Trident G stands in for every symbol except Spray Can, Lowrider, Palm G and Cash Bag.</li>
            <li>
              One spin pays at most {{ maxWin }}x your total bet, or the casino's maximum win if that is lower. Every
              outcome, bonus games included, is decided by the game server the moment you spin. Return to player: {{ rtp }}.
            </li>
          </ul>

          <h3>FREE SPINS</h3>
          <ul class="rules">
            <li>
              3 / 4 / 5 Spray Cans give {{ FREE_SPINS.awards[3] }} / {{ FREE_SPINS.awards[4] }} / {{ FREE_SPINS.awards[5] }} free spins at
              the bet that started them, on their own reels. A Trident G wild expands to fill its reel.
            </li>
            <li>
              Every Spray Can tags the hood: each {{ FREE_SPINS.tagsPerLevel }} tags add +1 to the win multiplier (up to
              {{ FREE_SPINS.maxMultiplier }}x, {{ levels }} levels) and {{ FREE_SPINS.spinsPerLevel }} more spins.
            </li>
            <li>3 Spray Cans on one free spin add {{ FREE_SPINS.retrigger }} spins. A run stops at {{ FREE_SPINS.maxSpins }} spins.</li>
          </ul>

          <h3>LOWRIDER HOP</h3>
          <p class="note">
            {{ LOWRIDER_HOP.hops }} hops, each paying from this table. The whole bonus is decided the moment it starts: the car you pick
            and pressing HOP only play the result back.
          </p>
          <dl class="table">
            <template v-for="r in hopTable" :key="r.label">
              <dt>{{ r.label }}</dt>
              <dd>{{ r.chance }}</dd>
            </template>
          </dl>

          <h3>CASH RUN</h3>
          <p class="note">
            {{ CASH_TRIGGER_COUNT }}+ Cash Bags lock in place and you get {{ CASH_RUN.respins }} respins. Each empty cell lands a new bag with a
            {{ (CASH_RUN.landChance * 100).toLocaleString('nl-NL') }}% chance per respin, and every new bag resets the respins to
            {{ CASH_RUN.respins }}. Filling all 15 cells adds the KINGPIN, {{ x(JACKPOTS.kingpin.multiplier) }}. What a bag holds:
          </p>
          <dl class="table">
            <template v-for="r in bagTable" :key="r.label">
              <dt>{{ r.label }}</dt>
              <dd>{{ r.chance }}</dd>
            </template>
          </dl>

          <h3>TURF WAR</h3>
          <p class="note">
            Also starts by surprise on 1 in {{ fmt(Math.round(1 / TURF_WAR.randomChance)) }} spins that win nothing. The wheel has
            {{ wheelCounts }}. It spins until the Ballas win: a prize takes the next of {{ TURF_WAR.territories.length }} territories, a
            Backup blocks one Ballas push, and taking all {{ TURF_WAR.territories.length }} adds the TURF BOSS,
            {{ x(TURF_WAR.turfBossMultiplier) }}.
          </p>

          <h3>WANTED LEVEL</h3>
          <p class="note">
            Every winning spin adds a star (up to {{ WANTED.maxStars }}); every {{ WANTED.lossesPerStar }} losing spins in a row take one
            away. With {{ WANTED.maxStars }} stars the next spin also pays a PAYDAY, then the meter empties. The Payday is paid on the
            smallest total bet you played since the meter was last empty, or on the payday spin's bet if that is smaller. Your stars
            are shared by all your Lowrider tabs.
          </p>
          <dl class="table">
            <template v-for="r in paydayTable" :key="r.label">
              <dt>{{ r.label }}</dt>
              <dd>{{ r.chance }}</dd>
            </template>
          </dl>

          <h3>DRIVE-BY</h3>
          <p class="note">On 1 in {{ fmt(Math.round(1 / DRIVE_BY.chance)) }} spins a car sprays {{ DRIVE_BY.minWilds }} to {{ DRIVE_BY.maxWilds }} wilds onto the reels before the spin is paid.</p>

          <h3>CAR CHASE</h3>
          <p class="note">
            After a win of up to the table's maximum bet you may stake it on an alley, left or right. The getaway is drawn after you
            pick, exactly 50/50: guess right and the stake doubles, guess wrong and it is lost. At most {{ GAMBLE.maxRounds }} picks, and
            never more than {{ GAMBLE.capMultiplier }}x the original win. Collect at any time. Each pick is its own round at the casino.
          </p>
        </template>

        <dl v-else-if="tab === 'stats'" class="stats">
          <template v-for="[k, v] in stats" :key="k">
            <dt>{{ k }}</dt>
            <dd>{{ v }}</dd>
          </template>
        </dl>

        <ul v-else-if="tab === 'trophies'" class="trophies">
          <li v-for="t in trophies" :key="t.id" :class="{ done: t.done }">
            <strong>{{ t.done ? '🏆' : '🔒' }} {{ t.name }}</strong>
            <span>{{ t.description }}<template v-if="t.skin"> · unlocks {{ t.skin }}</template></span>
          </li>
        </ul>

        <div v-else class="settings">
          <label class="row">
            <span>Show the Car Chase gamble after wins</span>
            <button class="g-button" :class="{ 'is-on': settings.gamble }" :aria-pressed="settings.gamble" @click="change({ gamble: !settings.gamble })">
              {{ settings.gamble ? 'ON' : 'OFF' }}
            </button>
          </label>
          <label class="row">
            <span>Sound effects</span>
            <button class="g-button" :class="{ 'is-on': settings.sound }" :aria-pressed="settings.sound" @click="change({ sound: !settings.sound })">
              {{ settings.sound ? 'ON' : 'OFF' }}
            </button>
          </label>
          <label class="row">
            <span>Music</span>
            <button class="g-button" :class="{ 'is-on': settings.music }" :aria-pressed="settings.music" @click="change({ music: !settings.music })">
              {{ settings.music ? 'ON' : 'OFF' }}
            </button>
          </label>
          <p class="note">Reel skin (unlock more with trophies)</p>
          <div class="skins">
            <button
              v-for="s in skins"
              :key="s.id"
              class="g-button skin"
              :style="{ background: s.backdrop, borderColor: settings.skin === s.id ? 'var(--grove-color-gold)' : s.frame }"
              :disabled="!s.unlocked"
              :aria-pressed="settings.skin === s.id"
              @click="change({ skin: s.id })"
            >
              {{ s.unlocked ? '' : '🔒 ' }}{{ s.name }}
            </button>
          </div>
          <p class="note">Stats and trophies are kept in this browser. Your balance is kept by Grove Casino.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cover {
  position: fixed;
  inset: var(--grove-bar-top, 0px) var(--grove-bar-right, 0px) var(--grove-bar-bottom, 0px) var(--grove-bar-left, 0px);
  z-index: 4;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.7);
  pointer-events: auto;
}

.panel {
  display: grid;
  grid-template-rows: auto 1fr;
  width: min(1100px, 100%);
  max-height: min(860px, 100%);
  border-color: var(--grove-color-gold);
  background: #0f1f10;
  outline: none;
  overflow: hidden;
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
}

.close {
  margin-left: auto;
}

.content {
  overflow: auto;
  padding: 4px 20px 20px;
  font-family: var(--grove-font-ui);
  font-size: clamp(14px, 2.2vmin, 22px);
}

.note {
  color: var(--grove-color-muted);
}

.pays,
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  column-gap: 32px;
  row-gap: 6px;
  margin: 0;
}

.pays {
  grid-template-columns: minmax(0, 1fr) auto;
}

dt {
  color: var(--grove-color-text);
}

dt.wild {
  color: var(--grove-color-gold);
}

dd {
  margin: 0;
  color: var(--grove-color-gold);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.stats {
  grid-template-columns: minmax(0, 1fr) auto;
}

h3 {
  margin: 1.2em 0 0.3em;
  font-family: var(--grove-font-tag);
  font-weight: 400;
  color: var(--grove-color-gold);
}

.table {
  display: grid;
  grid-template-columns: max-content max-content;
  column-gap: 32px;
  row-gap: 4px;
  margin: 0 0 0 1.2em;
}

.rules {
  padding-left: 1.2em;
  color: var(--grove-color-muted);
  line-height: 1.4;
}

.trophies {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 10px;
  padding: 0;
  list-style: none;
}

.trophies li {
  display: grid;
  gap: 4px;
  padding: 10px 14px;
  border: 2px solid #333;
  border-radius: var(--grove-radius-md);
  background: #141414;
}

.trophies li.done {
  border-color: var(--grove-color-gold);
  background: #1f3d1f;
}

.trophies strong {
  font-weight: 400;
  color: var(--grove-color-muted);
}

.trophies li.done strong {
  color: var(--grove-color-gold);
}

.trophies span {
  font-family: var(--grove-font-body);
  font-size: 0.8em;
}

.settings {
  display: grid;
  gap: 12px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.skins {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
