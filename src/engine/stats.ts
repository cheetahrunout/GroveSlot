import type { RoundResult } from './round';
import { createRng } from './rng';
import { INITIAL_STATE, playRound } from './round';

/** Where the RTP comes from, as fractions of the total amount bet. */
export interface RtpBreakdown {
  rounds: number;
  rtp: number;
  base: number;
  hitRate: number;
  maxWinMultiplier: number;
  /** Rounds per trigger, keyed by feature. */
  triggerEvery: Record<string, number>;
}

/** Runs `rounds` rounds from a seed and measures the game's maths. */
export function simulate(rounds: number, seed: number, lineBet = 1): RtpBreakdown {
  const rng = createRng(seed);
  let state = INITIAL_STATE;
  let bet = 0;
  let won = 0;
  let base = 0;
  let hits = 0;
  let maxWin = 0;
  const triggers: Record<string, number> = { freeSpins: 0, lowriderHop: 0, turfWar: 0 };

  for (let i = 0; i < rounds; i++) {
    const out = playRound(rng, state, lineBet);
    state = out.state;
    const r: RoundResult = out.result;
    bet += r.totalBet;
    won += r.totalWin;
    base += r.base.totalWin;
    if (r.totalWin > 0) hits++;
    maxWin = Math.max(maxWin, r.totalWin / r.totalBet);
    for (const key of Object.keys(triggers)) {
      if (r.base.triggers[key as keyof typeof r.base.triggers]) triggers[key]++;
    }
  }

  return {
    rounds,
    rtp: won / bet,
    base: base / bet,
    hitRate: hits / rounds,
    maxWinMultiplier: maxWin,
    triggerEvery: Object.fromEntries(
      Object.entries(triggers).map(([k, n]) => [k, n > 0 ? rounds / n : Infinity]),
    ),
  };
}
