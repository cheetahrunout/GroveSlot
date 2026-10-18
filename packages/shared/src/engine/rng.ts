/**
 * Seedable PRNG (xoshiro128**). The engine draws every outcome from an Rng,
 * so a spin can be replayed exactly from its seed.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Index picked according to non-negative weights. */
  weighted(weights: readonly number[]): number;
}

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

export function createRng(seed: number = randomSeed()): Rng {
  const sm = splitmix32(seed);
  const s = [sm(), sm(), sm(), sm()];

  const nextU32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  };

  const next = () => nextU32() / 0x1_0000_0000;

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`int() needs a positive integer, got ${maxExclusive}`);
    }
    // Rejection sampling avoids modulo bias.
    const limit = 0x1_0000_0000 - (0x1_0000_0000 % maxExclusive);
    let x = nextU32();
    while (x >= limit) x = nextU32();
    return x % maxExclusive;
  };

  const weighted = (weights: readonly number[]): number => {
    const total = weights.reduce((a, w) => a + w, 0);
    if (!(total > 0)) throw new RangeError('weighted() needs a positive total weight');
    let r = next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  };

  return { next, int, weighted };
}

export function randomSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}
