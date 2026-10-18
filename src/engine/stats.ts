import { createRng } from './rng';
import { FEATURES, INITIAL_STATE, playRound, type FeatureKey } from './round';

/** Where the RTP comes from, as fractions of the total amount bet. */
export interface RtpBreakdown {
  rounds: number;
  rtp: number;
  base: number;
  features: Record<FeatureKey, number>;
  hitRate: number;
  maxWinMultiplier: number;
  /** Rounds per trigger, keyed by feature. */
  triggerEvery: Record<FeatureKey, number>;
  /** Average feature payout in total bets, keyed by feature. */
  averageAward: Record<FeatureKey, number>;
}

const perFeature = (value: number) =>
  Object.fromEntries(FEATURES.map((f) => [f, value])) as Record<FeatureKey, number>;

/** Runs `rounds` rounds from a seed and measures the game's maths. */
export function simulate(rounds: number, seed: number, lineBet = 1): RtpBreakdown {
  const rng = createRng(seed);
  let state = INITIAL_STATE;
  let bet = 0;
  let won = 0;
  let base = 0;
  let hits = 0;
  let maxWin = 0;
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
    features: Object.fromEntries(FEATURES.map((f) => [f, featureWin[f] / bet])) as Record<FeatureKey, number>,
    hitRate: hits / rounds,
    maxWinMultiplier: maxWin,
    triggerEvery: Object.fromEntries(
      FEATURES.map((f) => [f, featureCount[f] > 0 ? rounds / featureCount[f] : Infinity]),
    ) as Record<FeatureKey, number>,
    averageAward: Object.fromEntries(
      FEATURES.map((f) => [f, featureCount[f] > 0 ? featureWin[f] / featureCount[f] / totalBet : 0]),
    ) as Record<FeatureKey, number>,
  };
}
