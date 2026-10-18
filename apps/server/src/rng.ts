import type { Rng } from '@lowrider/shared/engine/rng';
import { rng } from './casino';

/**
 * The engine's randomness when it plays for real: the casino SDK's `rng`,
 * which is Node's CSPRNG (crypto.randomInt). Never Math.random, never a
 * chosen seed, never a reroll.
 */
// randomInt allows a range of at most 2^48 - 1.
const SPAN = 2 ** 48 - 1;

export const cryptoRng: Rng = {
  next: () => rng.int(0, SPAN) / SPAN,
  int: (maxExclusive) => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new RangeError(`int() needs a positive integer, got ${maxExclusive}`);
    return rng.int(0, maxExclusive);
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
