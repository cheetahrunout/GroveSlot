import { Container, Graphics, Text } from 'pixi.js';
import { FREE_SPINS } from '../config/features';
import { COLORS, FONT_TAG, textStyle } from './theme';
import { easeOutBack, tween } from './tween';

/** Top bar during free spins: spin counter, multiplier and the Tag the Hood wall. */
export class FreeSpinsBar extends Container {
  private readonly counter: Text;
  private readonly multiplier: Text;
  private readonly wall = new Graphics();
  private readonly tagMarks: Text[] = [];
  static readonly barWidth = 1500;

  constructor() {
    super();
    const W = FreeSpinsBar.barWidth;
    const bg = new Graphics().roundRect(0, 0, W, 116, 24).fill(COLORS.panel).stroke({ color: COLORS.gold, width: 4 });
    this.counter = new Text({ text: '', style: textStyle(COLORS.text, 52) });
    this.counter.anchor.set(0, 0.5);
    this.counter.position.set(30, 58);
    this.multiplier = new Text({ text: '', style: textStyle(COLORS.gold, 72, { stroke: { color: COLORS.background, width: 6 } }) });
    this.multiplier.anchor.set(0.5);
    this.multiplier.position.set(W / 2, 58);

    // The wall: a brick panel with one slot per tag needed for the next level.
    const wallX = W - 520;
    this.wall.position.set(wallX, 14);
    const wallLabel = new Text({ text: 'TAG THE HOOD', style: textStyle(COLORS.muted, 26) });
    wallLabel.anchor.set(1, 0.5);
    wallLabel.position.set(wallX - 16, 58);
    this.addChild(bg, this.counter, this.multiplier, wallLabel, this.wall);
    for (let i = 0; i < FREE_SPINS.tagsPerLevel; i++) {
      const mark = new Text({
        text: 'G',
        style: textStyle('#7dff6a', 84, { fontFamily: FONT_TAG, stroke: { color: COLORS.background, width: 6 } }),
      });
      mark.anchor.set(0.5);
      mark.position.set(wallX + 80 + i * 170, 58);
      this.tagMarks.push(mark);
      this.addChild(mark);
    }
    this.drawWall();
  }

  private drawWall(): void {
    const g = this.wall.clear();
    g.roundRect(0, 0, 500, 88, 10).fill('#5a3a2e');
    for (let row = 0; row < 3; row++) {
      // Alternate rows shift by half a brick; clip bricks to the wall.
      for (let x = row % 2 ? -40 : 0; x < 500; x += 84) {
        const left = Math.max(x, 0) + 2;
        const right = Math.min(x + 82, 498);
        if (right > left) g.rect(left, row * 29 + 2, right - left, 25).fill('#7a4a3a');
      }
    }
    g.roundRect(0, 0, 500, 88, 10).stroke({ color: COLORS.background, width: 3 });
  }

  update(spin: number, total: number, multiplier: number, tags: number, maxed: boolean): void {
    this.counter.text = `FREE SPIN ${spin} / ${total}`;
    this.multiplier.text = `×${multiplier}`;
    const filled = maxed ? FREE_SPINS.tagsPerLevel : tags % FREE_SPINS.tagsPerLevel;
    this.tagMarks.forEach((m, i) => (m.alpha = i < filled ? 1 : 0.12));
  }

  async pulseMultiplier(): Promise<void> {
    this.multiplier.scale.set(2);
    await tween(this.multiplier, { 'scale.x': 1, 'scale.y': 1 }, 500, easeOutBack);
  }
}
