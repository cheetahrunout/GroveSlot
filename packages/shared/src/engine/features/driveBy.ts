import { DRIVE_BY } from '../../config/features';
import { SPECIAL_SYMBOLS } from '../../config/symbols';
import type { Position } from '../evaluate';
import type { Rng } from '../rng';
import type { Grid } from '../spin';

/**
 * A car rolls past and sprays wilds onto plain symbols. Returns the new
 * grid and where the wilds went; specials and existing wilds are left alone.
 */
export function applyDriveBy(rng: Rng, grid: Grid): { grid: Grid; positions: Position[] } {
  const open: Position[] = [];
  grid.forEach((column, reel) =>
    column.forEach((symbol, row) => {
      if (symbol !== 'WILD' && !SPECIAL_SYMBOLS.has(symbol)) open.push({ reel, row });
    }),
  );
  const count = Math.min(open.length, DRIVE_BY.minWilds + rng.int(DRIVE_BY.maxWilds - DRIVE_BY.minWilds + 1));
  const positions: Position[] = [];
  for (let i = 0; i < count; i++) positions.push(...open.splice(rng.int(open.length), 1));
  positions.sort((a, b) => a.reel - b.reel || a.row - b.row);

  const next = grid.map((c) => [...c]);
  for (const p of positions) next[p.reel][p.row] = 'WILD';
  return { grid: next, positions };
}
