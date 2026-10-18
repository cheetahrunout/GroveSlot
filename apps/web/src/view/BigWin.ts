import { Container, Graphics, Text, Ticker } from 'pixi.js';
import { sound } from '../audio/sound';
import { euro } from './format';
import type { Layout } from './layout';
import { COLORS, FONT_TAG, textStyle } from './theme';
import { easeOutBack, tween, wait } from './tween';
import { fx } from './fx';

/** Win tiers, as multiples of the total bet. */
export const BIG_WIN_TIERS = [
  { multiplier: 10, name: 'NICE!' },
  { multiplier: 25, name: 'RESPECT!' },
  { multiplier: 50, name: 'BIG SMOKE-SIZED!' },
  { multiplier: 100, name: 'KINGPIN WIN!' },
] as const;

export function bigWinTier(win: number, totalBet: number): number {
  let tier = -1;
  BIG_WIN_TIERS.forEach((t, i) => {
    if (win >= t.multiplier * totalBet) tier = i;
  });
  return tier;
}

interface Coin {
  g: Graphics;
  vx: number;
  vy: number;
  spin: number;
}

/** Full-screen celebration that counts the win up through the tiers. Tap to skip. */
export async function showBigWin(parent: Container, layout: Layout, win: number, totalBet: number): Promise<void> {
  const { width: W, height: H } = layout;
  const root = new Container();
  const dim = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.75 });
  dim.eventMode = 'static';
  dim.cursor = 'pointer';
  const coinLayer = new Container();
  const title = new Text({ text: '', style: textStyle(COLORS.gold, 150, { fontFamily: FONT_TAG, stroke: { color: COLORS.background, width: 14 } }) });
  title.anchor.set(0.5);
  title.position.set(W / 2, H / 2 - 110);
  const amount = new Text({ text: euro(0), style: textStyle(COLORS.text, 130, { stroke: { color: COLORS.background, width: 10 } }) });
  amount.anchor.set(0.5);
  amount.position.set(W / 2, H / 2 + 80);
  root.addChild(dim, coinLayer, title, amount);
  parent.addChild(root);

  const coins: Coin[] = [];
  const spawn = () => {
    const g = new Graphics().ellipse(0, 0, 22, 22).fill(0xe0b84a).stroke({ color: 0x7a5a10, width: 4 });
    g.position.set(W / 2 + (fx() - 0.5) * 300, H / 2 + 40);
    coins.push({ g, vx: (fx() - 0.5) * 22, vy: -14 - fx() * 16, spin: fx() * 0.3 });
    coinLayer.addChild(g);
  };
  const physics = (ticker: Ticker) => {
    const dt = ticker.deltaMS / 16.7;
    for (let i = 0; i < 2; i++) spawn();
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      c.vy += 0.6 * dt;
      c.g.x += c.vx * dt;
      c.g.y += c.vy * dt;
      c.g.scale.x = Math.cos(c.g.y * c.spin * 0.1);
      if (c.g.y > H + 60) {
        c.g.destroy();
        coins.splice(i, 1);
      }
    }
  };
  Ticker.shared.add(physics);

  const finalTier = bigWinTier(win, totalBet);
  let skipped = false;
  dim.on('pointertap', () => (skipped = true));

  // Count up; the title upgrades as each tier is passed.
  const duration = 1800 + finalTier * 900;
  let shownTier = -1;
  const start = performance.now();
  sound.play('bigWin');
  while (!skipped) {
    const t = Math.min(1, (performance.now() - start) / duration);
    const value = Math.round(win * (1 - (1 - t) ** 2));
    amount.text = euro(value);
    const tier = bigWinTier(value, totalBet);
    if (tier > shownTier) {
      shownTier = tier;
      title.text = BIG_WIN_TIERS[tier].name;
      title.scale.set(1);
      const fit = Math.min(1, (W - 80) / title.width);
      title.scale.set(0.4 * fit);
      void tween(title, { 'scale.x': fit, 'scale.y': fit }, 400, easeOutBack);
      if (tier > 0) sound.play('bigWin');
    }
    if (t >= 1) break;
    await new Promise((r) => requestAnimationFrame(r));
  }
  amount.text = euro(win);
  await wait(skipped ? 600 : 1500);

  Ticker.shared.remove(physics);
  root.destroy({ children: true });
}
