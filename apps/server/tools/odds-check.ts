// pnpm odds -- [loop rounds] [paytable rounds]
// The casino's odds check (game-integration.md section 12, step 1):
//   1. expectedRtp (from the casino SDK) over Lowrider's outcome distribution, measured from
//      millions of engine rounds with the CSPRNG, against rtp_bps in casino-game.json.
//   2. The real game loop (LowriderGame, rounds opened and settled through the stand-in casino)
//      for 100,000 rounds, against the same figure.
import { readFileSync } from 'node:fs';
import { PAYLINES } from '@lowrider/shared/config/paylines';
import { INITIAL_STATE, playRound } from '@lowrider/shared/engine/round';
import { expectedRtp } from '../src/casino/casino-game';
import { FakeCasino } from '../src/fakeCasino';
import { startGame } from '../src/game';
import { Journal } from '../src/journal';
import { cryptoRng } from '../src/rng';

const manifest = JSON.parse(readFileSync(new URL('../../../casino-game.json', import.meta.url), 'utf8'));
const loopRounds = Number(process.argv[2] ?? 100_000);
const tableRounds = Number(process.argv[3] ?? 5_000_000);
const bet = manifest.min_bet_cents as number;
const declared = manifest.rtp_bps / 10_000;
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const points = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(2)} points`;

// --- 1. the paytable: outcome distribution -> expectedRtp ------------------
let started = Date.now();
const payouts = new Map<number, number>();
let state = INITIAL_STATE;
for (let i = 0; i < tableRounds; i++) {
  const played = playRound(cryptoRng, state, 1, { maxWin: (manifest.max_win_cents / bet) * PAYLINES.length });
  state = played.state;
  const payout = played.result.totalWin / played.result.totalBet;
  payouts.set(payout, (payouts.get(payout) ?? 0) + 1);
}
const outcomes = [...payouts].map(([payout, n]) => ({ p: n / tableRounds, payout }));
const expected = expectedRtp(outcomes);
const meanSq = outcomes.reduce((s, o) => s + o.p * o.payout ** 2, 0);
const sigma = Math.sqrt(meanSq - expected ** 2);
const tableBand = (2 * sigma) / Math.sqrt(tableRounds);
console.log(`Lowrider odds check (CSPRNG)`);
console.log(`  Declared RTP     ${pct(declared)}  (casino-game.json rtp_bps ${manifest.rtp_bps})`);
console.log(`  expectedRtp      ${pct(expected)}  over ${outcomes.length.toLocaleString('en-US')} distinct payouts from ${tableRounds.toLocaleString('en-US')} engine rounds (±${(tableBand * 100).toFixed(2)}, 95%)`);
console.log(`                   ${points(expected - declared)} from declared  (${((Date.now() - started) / 1000).toFixed(1)} s)`);

// --- 2. the real game loop through a stand-in casino ------------------------
started = Date.now();
const casino = new FakeCasino(Number.MAX_SAFE_INTEGER / 4e6);
casino.setState({ limitsCents: { min: bet, max: manifest.max_bet_cents, maxWin: manifest.max_win_cents }, settings: { gamble_enabled: false } });
// The gamble is left out: it is a separate, exactly even bet.
const { game, stop } = startGame(casino, { rng: cryptoRng, journal: new Journal(':memory:'), version: 'odds' });
await new Promise((r) => setTimeout(r, 0));
const session = await game.openSession('odds');
for (let i = 0; i < loopRounds; i++) await game.spin(session, bet);
stop();
let wagered = 0;
let won = 0;
for (const { round } of casino.rounds.values()) {
  wagered += round.bet_cents;
  won += round.win_cents;
}
const observed = won / wagered;
const loopBand = (2 * sigma) / Math.sqrt(loopRounds);
const diff = observed - declared;
console.log(`  Game loop        ${pct(observed)}  over ${loopRounds.toLocaleString('en-US')} rounds settled through the stand-in casino  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
console.log(`                   ${points(diff)} from declared; chance alone spreads this ±${(loopBand * 100).toFixed(2)} points (σ = ${sigma.toFixed(1)}× bet, 95%)`);

const tableOk = Math.abs(expected - declared) <= Math.max(0.005, tableBand);
const loopWithinPoint = Math.abs(diff) <= 0.01;
const loopConsistent = Math.abs(diff) <= Math.max(0.01, loopBand);
console.log(`  Paytable         ${tableOk ? 'matches' : 'DOES NOT match'} the declared RTP`);
console.log(`  Game loop        ${loopWithinPoint ? 'within a point' : loopConsistent ? 'outside a point, but within what chance allows at this volatility' : 'NOT consistent with the declared RTP'}`);
process.exitCode = tableOk && loopConsistent ? 0 : 1;
