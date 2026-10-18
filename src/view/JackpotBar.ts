import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { JACKPOTS, type JackpotId } from '../config/features';
import { euroShort } from './format';
import type { LayoutMode } from './layout';
import { COLORS, textStyle } from './theme';

const ORDER: JackpotId[] = ['homie', 'soldier', 'og', 'kingpin'];
const BOX_W = 240;
const BOX_H = 100;

/** The four jackpot values for the current bet (fixed multiples of it). */
export class JackpotBar extends Container {
  private readonly boxes = new Map<JackpotId, { box: Container; value: Text }>();

  constructor(crown: Texture) {
    super();
    for (const id of ORDER) {
      const box = new Container();
      const kingpin = id === 'kingpin';
      box.addChild(
        new Graphics()
          .roundRect(0, 0, BOX_W, BOX_H, 18)
          .fill(kingpin ? '#1d1405' : COLORS.panel)
          .stroke({ color: kingpin ? COLORS.gold : COLORS.panelEdge, width: 4 }),
      );
      const textX = kingpin ? BOX_W / 2 + 34 : BOX_W / 2;
      if (kingpin) {
        const icon = new Sprite(crown);
        icon.setSize(76, 76);
        icon.position.set(12, 12);
        box.addChild(icon);
      }
      const name = new Text({ text: JACKPOTS[id].name, style: textStyle(kingpin ? COLORS.gold : COLORS.muted, 26) });
      name.anchor.set(0.5, 0);
      name.position.set(textX, 8);
      const value = new Text({ text: '', style: textStyle(COLORS.gold, 40) });
      value.anchor.set(0.5, 0.5);
      value.position.set(textX, 64);
      box.addChild(name, value);
      this.addChild(box);
      this.boxes.set(id, { box, value });
    }
  }

  update(totalBet: number): void {
    for (const id of ORDER) {
      const amount = JACKPOTS[id].multiplier * totalBet;
      const { value } = this.boxes.get(id)!;
      value.text = euroShort(amount);
      value.scale.set(1);
      value.scale.set(Math.min(1, (id === 'kingpin' ? 130 : 210) / value.width));
    }
  }

  /** Landscape: two boxes either side of the title. Portrait: one row. */
  arrange(mode: LayoutMode, width: number): void {
    ORDER.forEach((id, i) => {
      const { box } = this.boxes.get(id)!;
      if (mode === 'landscape') {
        const x = i < 2 ? 60 + i * (BOX_W + 16) : width - 60 - (4 - i) * (BOX_W + 16) + 16;
        box.position.set(x, 18);
      } else {
        const gap = (width - 4 * BOX_W) / 5;
        box.position.set(gap + i * (BOX_W + gap), 150);
      }
    });
  }
}
