import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, textStyle } from './theme';
import { easeOutBack, tween, wait } from './tween';

/** Small slide-down notices (achievements), shown one after another. */
export class Toasts extends Container {
  private queue: Promise<void> = Promise.resolve();
  areaWidth = 1920;

  show(title: string, line: string): void {
    this.queue = this.queue.then(() => this.play(title, line));
  }

  private async play(title: string, line: string): Promise<void> {
    const box = new Container();
    const t = new Text({ text: `🏆 ${title}`, style: textStyle(COLORS.gold, 40) });
    const l = new Text({ text: line, style: textStyle(COLORS.text, 28) });
    l.y = 52;
    const w = Math.max(t.width, l.width) + 60;
    box.addChild(new Graphics().roundRect(-30, -18, w, 120, 20).fill(COLORS.panel).stroke({ color: COLORS.gold, width: 4 }), t, l);
    box.position.set((this.areaWidth - w) / 2 + 30, -160);
    this.addChild(box);
    await tween(box, { y: 30 }, 400, easeOutBack);
    await wait(2600);
    await tween(box, { y: -160 }, 300);
    box.destroy({ children: true });
  }
}
