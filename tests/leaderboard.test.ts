import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from '../src/economy/storage';
import { LocalLeaderboard } from '../src/leaderboard/leaderboard';

const memoryStore = (): KeyValueStore => {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
};

describe('LocalLeaderboard', () => {
  it('sorts by score and keeps categories separate', async () => {
    const board = new LocalLeaderboard(memoryStore());
    await board.submit('biggestWin', { name: 'CJ', score: 500, at: 1 });
    await board.submit('biggestWin', { name: 'Sweet', score: 2000, at: 2 });
    await board.submit('territoriesTaken', { name: 'Ryder', score: 3, at: 3 });
    expect((await board.top('biggestWin')).map((e) => e.name)).toEqual(['Sweet', 'CJ']);
    expect(await board.top('territoriesTaken')).toHaveLength(1);
    expect(await board.top('biggestMultiplier')).toEqual([]);
  });

  it('survives corrupted or unavailable storage', async () => {
    const store = memoryStore();
    store.setItem('groveslot:leaderboard', '{not json');
    expect(await new LocalLeaderboard(store).top('biggestWin')).toEqual([]);

    const throwing: KeyValueStore = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const board = new LocalLeaderboard(throwing);
    await expect(board.submit('biggestWin', { name: 'x', score: 1, at: 0 })).resolves.toBeUndefined();
    expect(await board.top('biggestWin')).toEqual([]);
  });
});
