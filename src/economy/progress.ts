import type { FeatureKey, RoundResult } from '../engine/round';
import { ACHIEVEMENTS, SKINS, type Achievement, type SkinId } from './achievements';
import { load, save, type KeyValueStore } from './storage';

export interface Stats {
  spins: number;
  totalBet: number;
  totalWon: number;
  biggestWin: number;
  biggestMultiplier: number;
  bonuses: number;
  featureCounts: Record<FeatureKey, number>;
  maxFreeSpinMultiplier: number;
  bestHop: number;
  kingpins: number;
  territoriesTaken: number;
  turfBosses: number;
  paydays: number;
  driveBys: number;
  chaseStreak: number;
  bestChaseStreak: number;
  /** Milliseconds with the game open. */
  playTimeMs: number;
}

export interface Settings {
  gamble: boolean;
  sound: boolean;
  music: boolean;
  skin: SkinId;
}

interface ProgressData {
  stats: Stats;
  /** Achievement id → unlock time. */
  achievements: Record<string, number>;
  settings: Settings;
}

const emptyStats = (): Stats => ({
  spins: 0,
  totalBet: 0,
  totalWon: 0,
  biggestWin: 0,
  biggestMultiplier: 0,
  bonuses: 0,
  featureCounts: { freeSpins: 0, lowriderHop: 0, holdAndSpin: 0, turfWar: 0 },
  maxFreeSpinMultiplier: 0,
  bestHop: 0,
  kingpins: 0,
  territoriesTaken: 0,
  turfBosses: 0,
  paydays: 0,
  driveBys: 0,
  chaseStreak: 0,
  bestChaseStreak: 0,
  playTimeMs: 0,
});

const DEFAULT_SETTINGS: Settings = { gamble: true, sound: true, music: true, skin: 'classic' };

const KEY = 'progress';
const VERSION = 1;

/**
 * Stats, achievements and display settings, saved in this browser. Purely
 * for show: balances and results live with the casino and the game server.
 */
export class Progress {
  private data: ProgressData;

  constructor(private readonly store?: KeyValueStore | null) {
    const loaded = load<Partial<ProgressData>>(KEY, VERSION, {}, store);
    this.data = {
      stats: { ...emptyStats(), ...(loaded.stats ?? {}) },
      achievements: { ...(loaded.achievements ?? {}) },
      settings: { ...DEFAULT_SETTINGS, ...(loaded.settings ?? {}) },
    };
    this.data.stats.featureCounts = { ...emptyStats().featureCounts, ...this.data.stats.featureCounts };
    if (!(this.data.settings.skin in SKINS) || !this.isSkinUnlocked(this.data.settings.skin)) this.data.settings.skin = 'classic';
  }

  get stats(): Readonly<Stats> {
    return this.data.stats;
  }

  get settings(): Readonly<Settings> {
    return this.data.settings;
  }

  updateSettings(patch: Partial<Settings>): void {
    this.data.settings = { ...this.data.settings, ...patch };
    this.persist();
  }

  isUnlocked(id: string): boolean {
    return id in this.data.achievements;
  }

  isSkinUnlocked(skin: SkinId): boolean {
    const by = SKINS[skin].unlockedBy;
    return !by || this.isUnlocked(by);
  }

  /** Records a finished round; returns achievements it unlocked. */
  recordRound(r: RoundResult, now = Date.now()): Achievement[] {
    const s = this.data.stats;
    s.spins++;
    s.totalBet += r.totalBet;
    s.totalWon += r.totalWin;
    s.biggestWin = Math.max(s.biggestWin, r.totalWin);
    s.biggestMultiplier = Math.max(s.biggestMultiplier, r.totalWin / r.totalBet);
    for (const key of Object.keys(r.features) as FeatureKey[]) {
      s.featureCounts[key]++;
      s.bonuses++;
    }
    const fs = r.features.freeSpins;
    if (fs) s.maxFreeSpinMultiplier = Math.max(s.maxFreeSpinMultiplier, fs.finalMultiplier);
    const hop = r.features.lowriderHop;
    if (hop) s.bestHop = Math.max(s.bestHop, ...hop.hops.map((h) => h.multiplier));
    if (r.features.holdAndSpin?.grand) s.kingpins++;
    const turf = r.features.turfWar;
    if (turf) {
      s.territoriesTaken += turf.territoriesTaken;
      if (turf.turfBoss) s.turfBosses++;
    }
    if (r.payday > 0) s.paydays++;
    if (r.driveBy) s.driveBys++;
    return this.checkAchievements(now);
  }

  /** Records one Car Chase round. */
  recordChase(won: boolean, now = Date.now()): Achievement[] {
    const s = this.data.stats;
    s.chaseStreak = won ? s.chaseStreak + 1 : 0;
    s.bestChaseStreak = Math.max(s.bestChaseStreak, s.chaseStreak);
    return this.checkAchievements(now);
  }

  addPlayTime(ms: number): void {
    this.data.stats.playTimeMs += ms;
    this.persist();
  }

  private checkAchievements(now: number): Achievement[] {
    const fresh = ACHIEVEMENTS.filter((a) => !this.isUnlocked(a.id) && a.done(this.data.stats));
    for (const a of fresh) this.data.achievements[a.id] = now;
    this.persist();
    return fresh;
  }

  private persist(): void {
    save(KEY, VERSION, this.data, this.store);
  }
}
