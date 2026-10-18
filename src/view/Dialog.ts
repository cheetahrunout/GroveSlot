import { Container, Graphics, Text } from 'pixi.js';
import { Button } from './Button';
import type { Layout } from './layout';
import { COLORS, FONT_TAG, textStyle } from './theme';
import { easeOutBack, tween } from './tween';

export interface DialogButton {
  label: string;
  fill?: string;
  textColor?: string;
  value: string;
}

/** A modal message with buttons; resolves with the chosen button's value. */
export async function showDialog(
  parent: Container,
  layout: Layout,
  title: string,
  body: string,
  buttons: DialogButton[],
): Promise<string> {
  const { width: W, height: H } = layout;
  const root = new Container();
  const dim = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.65 });
  dim.eventMode = 'static';
  root.addChild(dim);

  const panelW = Math.min(900, W - 80);
  const panel = new Container();
  const t = new Text({ text: title, style: textStyle(COLORS.gold, 72, { fontFamily: FONT_TAG }) });
  t.anchor.set(0.5, 0);
  t.position.set(panelW / 2, 40);
  t.scale.set(Math.min(1, (panelW - 60) / t.width));
  const b = new Text({ text: body, style: textStyle(COLORS.text, 36, { wordWrap: true, wordWrapWidth: panelW - 100, align: 'center' }) });
  b.anchor.set(0.5, 0);
  b.position.set(panelW / 2, 150);
  const buttonsY = 150 + b.height + 50;
  const panelH = buttonsY + 150;
  panel.addChild(new Graphics().roundRect(0, 0, panelW, panelH, 30).fill(COLORS.panel).stroke({ color: COLORS.gold, width: 6 }), t, b);

  let resolve!: (v: string) => void;
  const chosen = new Promise<string>((r) => (resolve = r));
  const bw = Math.min(360, (panelW - 80 - (buttons.length - 1) * 24) / buttons.length);
  buttons.forEach((def, i) => {
    const button = new Button({ width: bw, height: 100, label: def.label, fontSize: 34, fill: def.fill, textColor: def.textColor }, () => resolve(def.value));
    button.setText(def.label);
    const rowW = buttons.length * bw + (buttons.length - 1) * 24;
    button.position.set((panelW - rowW) / 2 + i * (bw + 24), buttonsY);
    panel.addChild(button);
  });
  panel.pivot.set(panelW / 2, panelH / 2);
  panel.position.set(W / 2, H / 2);
  panel.scale.set(0.3);
  root.addChild(panel);
  parent.addChild(root);
  await tween(panel, { 'scale.x': 1, 'scale.y': 1 }, 300, easeOutBack);

  const value = await chosen;
  root.destroy({ children: true });
  return value;
}
