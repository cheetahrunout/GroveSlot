import { Container, Graphics, Text } from 'pixi.js';
import { COLORS, FONT_TAG, textStyle } from './theme';
import { easeOutBack, tween, wait } from './tween';

/** Big centred message: feature intros, wins, warnings. */
export class Banner extends Container {
  private readonly bg = new Graphics();
  private readonly title: Text;
  private readonly sub: Text;

  constructor() {
    super();
    this.title = new Text({
      text: '',
      style: textStyle(COLORS.gold, 110, { fontFamily: FONT_TAG, stroke: { color: COLORS.background, width: 10 } }),
    });
    this.sub = new Text({ text: '', style: textStyle(COLORS.text, 48, { stroke: { color: COLORS.background, width: 6 } }) });
    this.title.anchor.set(0.5);
    this.sub.anchor.set(0.5);
    this.sub.y = 100;
    this.addChild(this.bg, this.title, this.sub);
    this.visible = false;
  }

  async show(title: string, sub = '', holdMs = 1400, color: string = COLORS.gold): Promise<void> {
    this.title.text = title;
    this.title.style.fill = color;
    this.sub.text = sub;
    const w = Math.max(this.title.width, this.sub.width) + 120;
    const h = sub ? 300 : 200;
    this.bg.clear().roundRect(-w / 2, -h / 2 + (sub ? 40 : 0), w, h, 30).fill({ color: COLORS.background, alpha: 0.85 }).stroke({ color, width: 6 });
    this.visible = true;
    this.alpha = 1;
    this.scale.set(0.3);
    await tween(this, { 'scale.x': 1, 'scale.y': 1 }, 350, easeOutBack);
    await wait(holdMs);
    await tween(this, { alpha: 0 }, 250);
    this.visible = false;
  }
}
