import { Container, Graphics, Text } from 'pixi.js';
import { WANTED } from '../config/features';
import { COLORS, textStyle } from './theme';
import { easeOutBack, tween } from './tween';

function starPoints(r: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return pts;
}

/** Five wanted stars: wins add stars, a full meter means a guaranteed win. */
export class WantedMeter extends Container {
  private readonly stars: Graphics[] = [];
  private readonly caption: Text;
  private lit = -1;

  constructor() {
    super();
    this.caption = new Text({ text: 'WANTED', style: textStyle(COLORS.muted, 26) });
    this.caption.anchor.set(0.5, 1);
    this.caption.y = -30;
    this.addChild(this.caption);
    for (let i = 0; i < WANTED.maxStars; i++) {
      const g = new Graphics();
      g.x = (i - (WANTED.maxStars - 1) / 2) * 52;
      this.stars.push(g);
      this.addChild(g);
    }
    this.setStars(0);
  }

  setStars(count: number): void {
    const full = count >= WANTED.maxStars;
    this.stars.forEach((g, i) => {
      const on = i < count;
      g.clear().poly(starPoints(23)).fill(on ? (full ? '#ff5a3c' : COLORS.gold) : '#2a2a2a').stroke({ color: COLORS.text, width: 2 });
    });
    this.caption.text = full ? 'NEXT SPIN WINS!' : 'WANTED';
    this.caption.style.fill = full ? '#ff5a3c' : COLORS.muted;
    if (count > this.lit && count > 0) {
      const star = this.stars[Math.min(count, WANTED.maxStars) - 1];
      star.scale.set(1.8);
      void tween(star, { 'scale.x': 1, 'scale.y': 1 }, 400, easeOutBack);
    }
    this.lit = count;
  }
}
