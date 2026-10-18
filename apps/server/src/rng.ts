import { randomInt } from 'node:crypto';
import type { Rng } from '@lowrider/shared/engine/rng';

/**
 * The game's only source of randomness when it plays for real: Node's
 * CSPRNG (crypto.randomInt), never Math.random and never a chosen seed.
 */
// randomInt allows a range of at most 2^48 - 1.
const SPAN = 2 ** 48 - 1;

export const cryptoRng: Rng = {
  next: () => randomInt(0, SPAN) / SPAN,
  int: (maxExclusive) => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new RangeError(`int() needs a positive integer, got ${maxExclusive}`);
    return randomInt(0, maxExclusive);
  },
  weighted: (weights) => {
    const total = weights.reduce((a, w) => a + w, 0);
    if (!(total > 0)) throw new RangeError('weighted() needs a positive total weight');
    let r = cryptoRng.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  },
};
