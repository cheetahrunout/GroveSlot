// Usage: npm run sim -- [rounds] [seed]
import { simulate } from '../src/engine/stats';

const rounds = Number(process.argv[2] ?? 10_000_000);
const seed = Number(process.argv[3] ?? 1);
const started = Date.now();
const r = simulate(rounds, seed);

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
console.log(`GroveSlot simulation: ${rounds.toLocaleString('en-US')} rounds, seed ${seed}`);
console.log(`  Total RTP        ${pct(r.rtp)}`);
console.log(`  Base game        ${pct(r.base)}`);
console.log(`  Hit rate         ${pct(r.hitRate)}`);
console.log(`  Biggest win      ${r.maxWinMultiplier.toFixed(1)}× bet`);
for (const [feature, every] of Object.entries(r.triggerEvery)) {
  console.log(`  ${feature.padEnd(16)} 1 in ${Math.round(every).toLocaleString('en-US')}`);
}
console.log(`  (${((Date.now() - started) / 1000).toFixed(1)} s)`);
