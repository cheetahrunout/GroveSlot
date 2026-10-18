// npm run odds -- [rounds]
// The GAMES.md odds check: runs the real game loop (LowriderGame, the CSPRNG,
// rounds opened and settled through a stand-in casino ledger) and compares the
// observed RTP with rtp_bps in casino-game.json.
import { readFileSync } from 'node:fs';
import { FakeCasino } from '../server/fakeCasino';
import { LowriderGame } from '../server/game';
import { cryptoRng } from '../server/rng';

const manifest = JSON.parse(readFileSync(new URL('../casino-game.json', import.meta.url), 'utf8'));
const rounds = Number(process.argv[2] ?? 100_000);
const bet = manifest.min_bet_cents as number;

const casino = new FakeCasino(Number.MAX_SAFE_INTEGER / 4);
casino.state = { ...casino.state, limits: { minBetCents: bet, maxBetCents: manifest.max_bet_cents, maxWinCents: manifest.max_win_cents } };
// Leave the gamble out: it is a separate, exactly even bet.
casino.state.settings = { gamble_enabled: false };
const game = new LowriderGame(casino, cryptoRng);
game.applyControl(casino.state);

const session = await game.openSession('odds');
const start = casino.balances.get('player-odds')!;
const started = Date.now();
for (let i = 0; i < rounds; i++) await game.spin(session, bet);
const end = casino.balances.get('player-odds')!;

const wagered = rounds * bet;
const observed = (wagered + (end - start)) / wagered;
const declared = manifest.rtp_bps / 10_000;
const diff = (observed - declared) * 100;
// How far the observed RTP may wander from the true one by chance alone.
let sumSq = 0;
for (const r of casino.rounds.values()) sumSq += ((r.win ?? 0) / r.bet) ** 2;
const sigma = Math.sqrt(sumSq / rounds - observed ** 2);
const band = ((2 * sigma) / Math.sqrt(rounds)) * 100;
console.log(`Lowrider odds check: ${rounds.toLocaleString('en-US')} rounds at ${bet} cents, CSPRNG`);
console.log(`  Declared RTP   ${(declared * 100).toFixed(2)}%  (casino-game.json rtp_bps ${manifest.rtp_bps})`);
console.log(`  Observed RTP   ${(observed * 100).toFixed(2)}%  (from the stand-in casino ledger)`);
console.log(`  Difference     ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} points  (GAMES.md asks for within 1 point)`);
console.log(`  Chance spread  ±${band.toFixed(2)} points at this many rounds (σ = ${sigma.toFixed(1)}× bet per round, 95%)`);
console.log(`  Verdict        ${Math.abs(diff) <= band ? 'consistent with the declared RTP' : 'NOT consistent with the declared RTP'}`);
console.log(`  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
process.exitCode = Math.abs(diff) <= band ? 0 : 1;
