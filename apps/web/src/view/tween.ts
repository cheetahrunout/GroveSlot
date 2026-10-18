import { Ticker } from 'pixi.js';

export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;
export const easeOutCubic: Ease = (t) => 1 - (1 - t) ** 3;
export const easeInOutQuad: Ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutBack: Ease = (t) => {
  const c1 = 1.2;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Global animation speed; turbo mode raises it. */
export const timing = { speed: 1 };

const scaled = (ms: number) => ms / timing.speed;

/** Animates numeric properties of `target` (dot paths allowed, e.g. "scale.x"). */
export function tween(
  target: object,
  to: Record<string, number>,
  ms: number,
  ease: Ease = easeOutCubic,
): Promise<void> {
  const duration = Math.max(1, scaled(ms));
  const props = Object.entries(to).map(([path, end]) => {
    const keys = path.split('.');
    const last = keys.pop()!;
    const owner = keys.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, target as Record<string, unknown>);
    return { owner, last, start: owner[last] as number, end };
  });
  return new Promise((resolve) => {
    let elapsed = 0;
    const tick = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const e = ease(t);
      for (const p of props) p.owner[p.last] = p.start + (p.end - p.start) * e;
      if (t >= 1) {
        Ticker.shared.remove(tick);
        resolve();
      }
    };
    Ticker.shared.add(tick);
  });
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, scaled(ms)));
}

/** Counts a number up over time, calling `update` with each value. */
export async function countUp(from: number, to: number, ms: number, update: (value: number) => void): Promise<void> {
  const box = { v: from };
  const done = tween(box, { v: to }, ms, easeOutCubic);
  const tick = () => update(Math.round(box.v));
  Ticker.shared.add(tick);
  await done;
  Ticker.shared.remove(tick);
  update(to);
}
