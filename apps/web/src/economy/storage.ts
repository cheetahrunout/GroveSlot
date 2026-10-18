/**
 * Versioned localStorage wrapper. Storage can be missing or throw (private
 * windows, blocked site data), so every access falls back to defaults.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = 'groveslot:';

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function load<T>(key: string, version: number, fallback: T, store = defaultStore()): T {
  try {
    const raw = store?.getItem(PREFIX + key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { v: number; data: T };
    return parsed.v === version ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, version: number, data: T, store = defaultStore()): void {
  try {
    store?.setItem(PREFIX + key, JSON.stringify({ v: version, data }));
  } catch {
    // Quota or access errors only lose persistence, never the game.
  }
}
