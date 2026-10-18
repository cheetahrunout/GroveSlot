import { createRng } from '@lowrider/shared/engine/rng';
import { FakeCasino } from '../src/fakeCasino';
import { startGame } from '../src/game';
import { Journal } from '../src/journal';

/** Lets queued microtasks and timers run (control changes reach the game this way). */
export const flush = () => new Promise((r) => setTimeout(r, 0));

/** A game wired to the stand-in casino exactly as main.ts wires it to the real one. */
export async function setup(opts: { journal?: Journal; devMode?: boolean; casino?: FakeCasino } = {}) {
  const casino = opts.casino ?? new FakeCasino();
  const journal = opts.journal ?? new Journal(':memory:');
  const started = startGame(casino, { rng: createRng(7), journal, devMode: opts.devMode, version: '1.0.42' });
  await flush();
  return { casino, journal, ...started };
}
