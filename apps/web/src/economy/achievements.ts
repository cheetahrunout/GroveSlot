import type { Stats } from './progress';

export type SkinId = 'classic' | 'night' | 'sunset' | 'rain';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  /** Reel skin this unlocks, if any. */
  unlocks?: SkinId;
  done(stats: Stats): boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'firstBonus', name: 'All We Had To Do…', description: 'Trigger your first bonus game', done: (s) => s.bonuses > 0 },
  { id: 'tagger', name: 'Tagger', description: 'Reach x5 on the Tag the Hood wall', unlocks: 'night', done: (s) => s.maxFreeSpinMultiplier >= 5 },
  { id: 'hydraulics', name: 'Hydraulics King', description: 'Land a x60 hop in Lowrider Hop', unlocks: 'sunset', done: (s) => s.bestHop >= 60 },
  { id: 'cashRun', name: 'Bag Man', description: 'Play a Cash Run', done: (s) => s.featureCounts.holdAndSpin > 0 },
  { id: 'kingpin', name: 'Kingpin', description: 'Fill all 15 cells in Cash Run', done: (s) => s.kingpins > 0 },
  { id: 'turfBoss', name: 'Turf Boss', description: 'Take every territory in Turf War', unlocks: 'rain', done: (s) => s.turfBosses > 0 },
  { id: 'mostWanted', name: 'Most Wanted', description: 'Fill the Wanted meter', done: (s) => s.paydays > 0 },
  { id: 'driveBy', name: 'Drive-By', description: 'See a Drive-By spray wilds', done: (s) => s.driveBys > 0 },
  { id: 'escape', name: 'Escape Artist', description: 'Win 3 Car Chases in a row', done: (s) => s.bestChaseStreak >= 3 },
  { id: 'bigWin', name: 'Respect', description: 'Win 50x your bet in one round', done: (s) => s.biggestMultiplier >= 50 },
  { id: 'respect', name: 'Respect +', description: 'Play 1,000 spins', done: (s) => s.spins >= 1000 },
];

export const SKINS: Record<SkinId, { name: string; backdrop: string; frame: string; unlockedBy?: string }> = {
  classic: { name: 'Grove Classic', backdrop: '#0d1a0d', frame: '#3f8f3f' },
  night: { name: 'Night Shift', backdrop: '#0a0f1f', frame: '#3f6fbf', unlockedBy: 'tagger' },
  sunset: { name: 'Sunset Cruise', backdrop: '#24101e', frame: '#e2793f', unlockedBy: 'hydraulics' },
  rain: { name: 'Rainy Block', backdrop: '#101a1e', frame: '#7fa8b8', unlockedBy: 'turfBoss' },
};
