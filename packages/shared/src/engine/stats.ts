import { createRng, type Rng } from './rng';
import { FEATURES, INITIAL_STATE, playRound, type FeatureKey } from './round';

/** Where the RTP comes from, as fractions of the total amount bet. */
export interface RtpBreakdown {
  rounds: number;
  rtp: number;
  base: number;
  /** Wanted Level Payday prizes. */
  payday: number;
  features: Record<FeatureKey, number>;
  hitRate: number;
  /** Standard deviation of one round's return, in total bets (volatility). */
  stdDev: number;
  maxWinMultiplier: number;
  /** Rounds per trigger, keyed by feature. */
  triggerEvery: Record<FeatureKey, number>;
  /** Average feature payout in total bets, keyed by feature. */
  averageAward: Record<FeatureKey, number>;
  driveByEvery: number;
  paydayEvery: number;
}

const perFeature = (value: number) =>
  Object.fromEntries(FEATURES.map((f) => [f, value])) as Record<FeatureKey, number>;

/** Runs `rounds` rounds from a seed (or a given RNG, such as the CSPRNG) and measures the game's maths. */
export function simulate(rounds: number, seed: number | Rng, lineBet = 1): RtpBreakdown {
  const rng = typeof seed === 'number' ? createRng(seed) : seed;
  let state = INITIAL_STATE;
  let bet = 0;
  let won = 0;
  let base = 0;
  let hits = 0;
  let maxWin = 0;
  let sumSq = 0;
  let driveBys = 0;
  let paydays = 0;
  let paydayWon = 0;
  const featureWin = perFeature(0);
  const featureCount = perFeature(0);

  for (let i = 0; i < rounds; i++) {
    const out = playRound(rng, state, lineBet);
    state = out.state;
    const r = out.result;
    bet += r.totalBet;
    won += r.totalWin;
    base += r.base.totalWin;
    if (r.totalWin > 0) hits++;
    maxWin = Math.max(maxWin, r.totalWin / r.totalBet);
    sumSq += (r.totalWin / r.totalBet) ** 2;
    if (r.driveBy) driveBys++;
    if (r.payday > 0) paydays++;
    paydayWon += r.payday;
    for (const f of FEATURES) {
      const feature = r.features[f];
      if (feature) {
        featureCount[f]++;
        featureWin[f] += feature.totalWin;
      }
    }
  }

  const totalBet = bet / rounds;
  return {
    rounds,
    rtp: won / bet,
    base: base / bet,
    payday: paydayWon / bet,
    features: Object.fromEntries(FEATURES.map((f) => [f, featureWin[f] / bet])) as Record<FeatureKey, number>,
    hitRate: hits / rounds,
    stdDev: Math.sqrt(sumSq / rounds - (won / bet) ** 2),
    maxWinMultiplier: maxWin,
    triggerEvery: Object.fromEntries(
      FEATURES.map((f) => [f, featureCount[f] > 0 ? rounds / featureCount[f] : Infinity]),
    ) as Record<FeatureKey, number>,
    averageAward: Object.fromEntries(
      FEATURES.map((f) => [f, featureCount[f] > 0 ? featureWin[f] / featureCount[f] / totalBet : 0]),
    ) as Record<FeatureKey, number>,
    driveByEvery: driveBys > 0 ? rounds / driveBys : Infinity,
    paydayEvery: paydays > 0 ? rounds / paydays : Infinity,
  };
}
