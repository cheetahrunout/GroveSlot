// Usage: npm run sim -- [rounds] [seed]
import { RTP_BUDGET } from '../src/config/features';
import { FEATURES } from '../src/engine/round';
import { simulate } from '../src/engine/stats';

// pnpm passes the `--` through; skip it.
const args = process.argv.slice(2).filter((a, i) => i > 0 || a !== '--');
const rounds = Number(args[0] ?? 10_000_000);
const seed = Number(args[1] ?? 1);
const started = Date.now();
const r = simulate(rounds, seed);

const pct = (x: number) => `${(x * 100).toFixed(2)}%`.padStart(7);
const budget = (key: string) => {
  const b = (RTP_BUDGET as Record<string, number>)[key];
  return b === undefined ? '' : `  (budget ${pct(b).trim()})`;
};
console.log(`GroveSlot simulation: ${rounds.toLocaleString('en-US')} rounds, seed ${seed}`);
console.log(`  Total RTP      ${pct(r.rtp)}`);
console.log(`  Base game      ${pct(r.base)}${budget('base')}`);
console.log(`  Wanted payday  ${pct(r.payday)}${budget('wantedPayday')}  1 in ${Math.round(r.paydayEvery)}`);
for (const f of FEATURES) {
  const every = Math.round(r.triggerEvery[f]).toLocaleString('en-US');
  console.log(
    `  ${f.padEnd(14)} ${pct(r.features[f])}${budget(f)}  1 in ${every}, avg ${r.averageAward[f].toFixed(1)}× bet`,
  );
}
console.log(`  Drive-By       1 in ${Math.round(r.driveByEvery)}`);
console.log(`  Hit rate       ${pct(r.hitRate)}`);
console.log(`  Volatility     σ = ${r.stdDev.toFixed(1)}× bet per round`);
for (const n of [500, 100_000]) {
  console.log(`  RTP spread     ±${((2 * r.stdDev) / Math.sqrt(n) * 100).toFixed(1)} points over ${n.toLocaleString('en-US')} rounds (95% of the time)`);
}
console.log(`  Biggest win    ${r.maxWinMultiplier.toFixed(1)}× bet`);
for (const t of r.topPrizes) {
  if (t.hits === 0) continue;
  const band = t.toX === null ? `${t.fromX}x or more` : `${t.fromX}x to ${t.toX}x`;
  console.log(`  Top prize      ${band.padEnd(14)} avg ${t.averageX.toFixed(0)}× bet, 1 in ${Math.round(t.every).toLocaleString('en-US')} (${t.hits} hits)`);
}
console.log(`  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
