import { Container, Graphics, Text } from 'pixi.js';
import { sound } from '../audio/sound';
import { createLowrider } from './art/lowrider';
import type { Layout } from './layout';
import { COLORS, FONT_TAG, textStyle } from './theme';
import { easeInOutQuad, easeOutBack, linear, tween, wait } from './tween';

export interface TransitionOptions {
  /** Paint colours for the stripes, used in turn. */
  colors: readonly string[];
  /** Graffiti title sprayed on while the screen is covered. */
  title?: string;
  sub?: string;
  /** Runs while the screen is fully covered: swap scenes here. */
  onCovered?: () => void | Promise<void>;
  /** How long the title stays up, in ms. */
  hold?: number;
}

/** Colour sets for each bonus. */
export const TRANSITION_COLORS = {
  freeSpins: ['#1f5f1f', '#2f7d2f', '#0b1426', '#5fb85f'],
  lowriderHop: ['#5a2350', '#a8434a', '#e2793f', '#f2b04f'],
  holdAndSpin: ['#1d1405', '#e0b84a', '#2f7d2f', '#7a5a10'],
  turfWar: ['#7b3fa0', '#2f7d2f', '#120a1a', '#c58cf0'],
  carChase: ['#0b1022', '#c0392b', '#2a6aff', '#161c33'],
} as const;

const BANDS = 7;
const SKEW = 260;

/**
 * A lowrider hops across the screen dragging diagonal paint stripes behind
 * it, the bonus name is sprayed on, then the stripes sweep away to reveal
 * what is underneath.
 */
export async function playTransition(parent: Container, layout: Layout, opts: TransitionOptions): Promise<void> {
  const { width: W, height: H } = layout;
  const root = new Container();
  // Swallow taps while the transition runs.
  const blocker = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.001 });
  blocker.eventMode = 'static';
  root.addChild(blocker);

  const bandW = W / BANDS + 2;
  const bands = Array.from({ length: BANDS }, (_, i) => {
    const g = new Graphics()
      .poly([SKEW, 0, SKEW + bandW + 2, 0, bandW + 2, H, 0, H])
      .fill(opts.colors[i % opts.colors.length]);
    // A thin dark edge sells the paint-stroke look.
    g.moveTo(SKEW + bandW + 2, 0).lineTo(bandW + 2, H).stroke({ color: COLORS.background, width: 6, alpha: 0.35 });
    g.x = -bandW - SKEW - 40;
    root.addChild(g);
    return g;
  });
  // The slanted stripes leave a triangle uncovered at each side.
  const edges = new Graphics()
    .poly([0, 0, SKEW, 0, 0, H])
    .fill(opts.colors[0])
    .poly([W, 0, W, H, W - SKEW, H])
    .fill(opts.colors[(BANDS - 1) % opts.colors.length]);
  edges.alpha = 0;
  root.addChild(edges);

  const portrait = layout.mode === 'portrait';
  const { car, body } = createLowrider(0x2f9d3f);
  car.scale.set(portrait ? 0.9 : 0.75);
  car.position.set(-400, H - (portrait ? 140 : 90));
  root.addChild(car);
  parent.addChild(root);

  // Cover: stripes follow the car from left to right.
  sound.play('skid');
  const hops = (async () => {
    for (let i = 0; i < 3; i++) {
      await tween(body, { y: -50 }, 140, easeInOutQuad);
      await tween(body, { y: 0 }, 180, easeOutBack);
    }
  })();
  const drive = tween(car, { x: W + 400 }, 950, linear);
  await Promise.all(
    bands.map((g, i) =>
      wait(i * 70).then(() => tween(g, { x: i * (W / BANDS) - SKEW / 2 }, 420, easeInOutQuad)),
    ),
  );
  edges.alpha = 1;
  await opts.onCovered?.();

  // The title is sprayed on with a puff of paint.
  let title: Container | null = null;
  if (opts.title) {
    title = new Container();
    const t = new Text({
      text: opts.title,
      style: textStyle(COLORS.gold, portrait ? 120 : 150, { fontFamily: FONT_TAG, stroke: { color: COLORS.background, width: 14 } }),
    });
    t.anchor.set(0.5);
    t.rotation = -0.05;
    const fit = Math.min(1, (W - 80) / t.width);
    t.scale.set(fit);
    title.addChild(t);
    if (opts.sub) {
      const s = new Text({ text: opts.sub, style: textStyle(COLORS.text, 50, { stroke: { color: COLORS.background, width: 8 } }) });
      s.anchor.set(0.5);
      s.y = 130 * fit + 20;
      s.scale.set(Math.min(1, (W - 80) / s.width));
      title.addChild(s);
    }
    const mist = new Graphics();
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 120 + Math.random() * Math.min(W * 0.4, 520);
      mist.circle(Math.cos(a) * r, Math.sin(a) * r * 0.45, 3 + Math.random() * 7).fill({ color: COLORS.gold, alpha: 0.5 });
    }
    title.addChildAt(mist, 0);
    title.position.set(W / 2, H / 2 - 40);
    title.scale.set(0.3);
    root.addChild(title);
    sound.play('spray');
    await tween(title, { 'scale.x': 1, 'scale.y': 1 }, 380, easeOutBack);
    await wait(opts.hold ?? 900);
    await tween(title, { alpha: 0 }, 180);
  }
  await drive;
  await hops;

  // Reveal: stripes sweep off to the right.
  edges.alpha = 0;
  await Promise.all(
    bands.map((g, i) => wait((BANDS - 1 - i) * 50).then(() => tween(g, { x: W + SKEW + 40 }, 380, easeInOutQuad))),
  );
  root.destroy({ children: true });
}
