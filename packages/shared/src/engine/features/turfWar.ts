import { TURF_WAR } from '../../config/features';
import type { Rng } from '../rng';

export interface TurfSpin {
  /** Index of the wheel slice that won. */
  slice: number;
  outcome: 'prize' | 'backup' | 'ballas' | 'blocked';
  /** Territory taken by a prize slice. */
  territory?: number;
  win: number;
  /** Backups held after this spin. */
  backups: number;
}

export interface TurfWarResult {
  trigger: 'symbols' | 'random';
  spins: TurfSpin[];
  territoriesTaken: number;
  turfBoss: boolean;
  turfBossWin: number;
  totalWin: number;
}

/**
 * Spin the wheel until the Ballas push you back (a Backup blocks one push)
 * or every territory is taken.
 */
export function playTurfWar(rng: Rng, totalBet: number, trigger: TurfWarResult['trigger']): TurfWarResult {
  const spins: TurfSpin[] = [];
  const territories = TURF_WAR.territories.length;
  let taken = 0;
  let backups = 0;
  let totalWin = 0;

  while (taken < territories) {
    const slice = rng.int(TURF_WAR.wheel.length);
    const s = TURF_WAR.wheel[slice];
    if (s.type === 'prize') {
      const win = s.multiplier * totalBet;
      totalWin += win;
      spins.push({ slice, outcome: 'prize', territory: taken, win, backups });
      taken++;
    } else if (s.type === 'backup') {
      backups++;
      spins.push({ slice, outcome: 'backup', win: 0, backups });
    } else if (backups > 0) {
      backups--;
      spins.push({ slice, outcome: 'blocked', win: 0, backups });
    } else {
      spins.push({ slice, outcome: 'ballas', win: 0, backups });
      break;
    }
  }

  const turfBoss = taken === territories;
  const turfBossWin = turfBoss ? TURF_WAR.turfBossMultiplier * totalBet : 0;
  return { trigger, spins, territoriesTaken: taken, turfBoss, turfBossWin, totalWin: totalWin + turfBossWin };
}
