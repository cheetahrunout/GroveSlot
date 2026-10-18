import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { LOWRIDER_HOP } from '../../config/features';
import type { LowriderHopResult } from '../../engine/features/lowriderHop';
import { createLowrider } from '../art/lowrider';
import { Button } from '../Button';
import type { Layout } from '../layout';
import { COLORS, FONT_TAG, textStyle } from '../theme';
import { easeInOutQuad, easeOutBack, easeOutCubic, tween, wait } from '../tween';

const PAINTS = [0x2f9d3f, 0xe0b84a, 0xf2f2f2];
const PAINT_NAMES = ['GREEN SABRE', 'GOLD RUSH', 'WHITE WALLS'];
/** Pixels the body rises for each step up the hop table. */
const HOP_STEP = 52;

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * Lowrider Hop playback. The outcome is already decided; picking a car and
 * pressing HOP only start the animations. `auto` plays without input.
 */
export class LowriderHopScene extends Container {
  private readonly W: number;
  private readonly H: number;

  constructor(layout: Layout) {
    super();
    this.W = layout.width;
    this.H = layout.height;
    const bg = new Graphics();
    // Sunset sky, street and kerb.
    const bands = ['#2a1440', '#5a2350', '#a8434a', '#e2793f', '#f2b04f'];
    const groundY = this.H * 0.72;
    bands.forEach((c, i) => bg.rect(0, (groundY / bands.length) * i, this.W, groundY / bands.length + 1).fill(c));
    bg.rect(0, groundY, this.W, this.H - groundY).fill('#2b2b2b');
    bg.rect(0, groundY, this.W, 14).fill('#9a9a9a');
    for (let x = 40; x < this.W; x += 220) bg.rect(x, groundY + 110, 120, 14).fill('#e8d36b');
    // Palm silhouettes.
    for (const px of [this.W * 0.08, this.W * 0.9]) {
      bg.rect(px - 8, groundY - 360, 16, 360).fill('#1a0f1f');
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        bg.ellipse(px + Math.cos(a) * 60, groundY - 360 + Math.sin(a) * 22, 70, 16).fill('#1a0f1f');
      }
    }
    bg.eventMode = 'static'; // swallow taps meant for the game behind
    this.addChild(bg);
  }

  private get groundY(): number {
    return this.H * 0.72;
  }

  private heading(text: string, sub: string): Container {
    const c = new Container();
    const t = new Text({ text, style: textStyle(COLORS.gold, 96, { fontFamily: FONT_TAG, stroke: { color: COLORS.background, width: 10 } }) });
    t.anchor.set(0.5, 0);
    const s = new Text({ text: sub, style: textStyle(COLORS.text, 44, { stroke: { color: COLORS.background, width: 6 } }) });
    s.anchor.set(0.5, 0);
    s.y = 120;
    c.addChild(t, s);
    c.position.set(this.W / 2, 40);
    this.addChild(c);
    return c;
  }

  private async pickCar(auto: boolean): Promise<number> {
    const heading = this.heading('LOWRIDER HOP', 'PICK YOUR RIDE');
    const portrait = this.H > this.W;
    const scale = portrait ? 0.55 : 0.6;
    const spacing = portrait ? 300 : 600;
    const options = new Container();
    let resolvePick!: (i: number) => void;
    const picked = new Promise<number>((r) => (resolvePick = r));

    PAINTS.forEach((paint, i) => {
      const slot = new Container();
      const { car } = createLowrider(paint);
      car.scale.set(scale);
      const name = new Text({ text: PAINT_NAMES[i], style: textStyle(COLORS.text, 34, { stroke: { color: COLORS.background, width: 5 } }) });
      name.anchor.set(0.5, 0);
      name.y = 20;
      slot.addChild(car, name);
      if (portrait) slot.position.set(this.W / 2, 520 + i * spacing);
      else slot.position.set(this.W / 2 + (i - 1) * spacing, this.groundY - 60);
      // Generous tap area: the whole car plus its name.
      slot.hitArea = new Rectangle(-180 * (scale / 0.6), -120, 360 * (scale / 0.6), 200);
      slot.eventMode = 'static';
      slot.cursor = 'pointer';
      slot.on('pointertap', () => resolvePick(i));
      options.addChild(slot);
    });
    this.addChild(options);
    // Picks for you during auto-spin, or if nobody taps for a while.
    void wait(auto ? 1200 : 10_000).then(() => resolvePick(0));

    const choice = await picked;
    heading.destroy({ children: true });
    options.destroy({ children: true });
    return choice;
  }

  async play(result: LowriderHopResult, auto: boolean, onHop: (win: number) => void): Promise<void> {
    const paint = PAINTS[await this.pickCar(auto)];
    const heading = this.heading('LOWRIDER HOP', `${LOWRIDER_HOP.hops} HOPS · HIGHER HOPS PAY MORE`);

    const { car, body } = createLowrider(paint);
    const portrait = this.H > this.W;
    car.scale.set(portrait ? 1.3 : 1.2);
    car.position.set(portrait ? this.W / 2 : this.W * 0.42, this.groundY + 40);
    this.addChild(car);

    // Height meter: one rung per table entry, lowest at the bottom.
    const meter = new Container();
    const rungH = 56;
    const rungs = LOWRIDER_HOP.table.map((entry, level) => {
      const rung = new Container();
      const bg = new Graphics();
      rung.y = -(level + 1) * rungH;
      const label = new Text({ text: `x${entry.multiplier}`, style: textStyle(COLORS.gold, 34) });
      label.anchor.set(0.5);
      label.position.set(110, (rungH - 8) / 2);
      rung.addChild(bg, label);
      meter.addChild(rung);
      const light = (lit: boolean) => {
        bg.clear().roundRect(0, 0, 220, rungH - 8, 12)
          .fill(lit ? COLORS.gold : COLORS.panel)
          .stroke({ color: lit ? COLORS.text : COLORS.panelEdge, width: 3 });
        label.style.fill = lit ? COLORS.background : COLORS.gold;
      };
      light(false);
      return light;
    });
    if (portrait) {
      meter.scale.set(0.8);
      meter.position.set(this.W - 220, this.groundY - 520);
    } else {
      meter.position.set(this.W * 0.78, this.groundY - 40);
    }
    this.addChild(meter);

    const totalText = new Text({ text: 'TOTAL 0', style: textStyle(COLORS.gold, 56, { stroke: { color: COLORS.background, width: 6 } }) });
    totalText.anchor.set(0.5);
    totalText.position.set(this.W / 2, this.H - 60);
    const hopsText = new Text({ text: '', style: textStyle(COLORS.text, 40, { stroke: { color: COLORS.background, width: 5 } }) });
    hopsText.anchor.set(0.5);
    hopsText.position.set(this.W / 2, portrait ? 340 : 280);
    this.addChild(totalText, hopsText);

    let resolveTap: (() => void) | null = null;
    const hopButton = new Button({ width: 0, height: 0, radius: 95, label: 'HOP!', fontSize: 56, fill: COLORS.danger }, () => resolveTap?.());
    hopButton.position.set(portrait ? this.W / 2 : this.W * 0.42, this.H - 190);
    if (!portrait) hopButton.position.set(this.W * 0.15, this.groundY - 150);
    this.addChild(hopButton);

    let total = 0;
    for (const [i, hop] of result.hops.entries()) {
      hopsText.text = `HOP ${i + 1} OF ${result.hops.length}`;
      hopButton.setEnabled(true);
      await new Promise<void>((resolve) => {
        resolveTap = resolve;
        // Plays itself during auto-spin, or if the player waits.
        void wait(auto ? 700 : 8000).then(resolve);
      });
      resolveTap = null;
      hopButton.setEnabled(false);

      const height = (hop.level + 1) * HOP_STEP;
      await tween(body, { y: 18 }, 140, easeInOutQuad); // squat
      await tween(body, { y: -height }, 260 + hop.level * 40, easeOutCubic);
      rungs[hop.level](true);
      const pop = new Text({ text: `+${fmt(hop.win)}`, style: textStyle(COLORS.gold, 72, { stroke: { color: COLORS.background, width: 8 } }) });
      pop.anchor.set(0.5);
      pop.position.set(car.x, car.y - 300 - height);
      this.addChild(pop);
      total += hop.win;
      totalText.text = `TOTAL ${fmt(total)}`;
      onHop(hop.win);
      await tween(body, { y: 0 }, 360, easeOutBack);
      await wait(350);
      rungs[hop.level](false);
      pop.destroy();
    }

    hopButton.visible = false;
    hopsText.text = '';
    heading.destroy({ children: true });
    this.heading('HOP WIN', fmt(result.totalWin));
    await wait(1600);
  }
}
