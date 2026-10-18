import { Container, Graphics, Text } from 'pixi.js';
import { Button } from './Button';
import type { Layout } from './layout';
import { COLORS, FONT_TAG, textStyle } from './theme';

export interface StatusMessage {
  title: string;
  body: string;
  /** Full screen blocks play; a strip only informs (last bets). */
  mode: 'full' | 'strip';
  /** Where "Back to the lobby" goes; hidden when empty. */
  lobbyUrl?: string;
}

/** The casino's word on the game: halted, maintenance, last bets or no session. */
export class StatusOverlay extends Container {
  private layoutRef: Layout | null = null;
  private current: StatusMessage | null = null;

  arrange(layout: Layout): void {
    this.layoutRef = layout;
    this.render();
  }

  show(message: StatusMessage | null): void {
    this.current = message;
    this.render();
  }

  private render(): void {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    const m = this.current;
    const layout = this.layoutRef;
    if (!m || !layout) {
      this.visible = false;
      return;
    }
    this.visible = true;
    const { width: W, height: H } = layout;

    if (m.mode === 'strip') {
      const strip = new Graphics().rect(0, 0, W, 64).fill({ color: COLORS.danger, alpha: 0.92 });
      const t = new Text({ text: `${m.title} · ${m.body}`, style: textStyle(COLORS.text, 32) });
      t.anchor.set(0.5);
      t.position.set(W / 2, 32);
      t.scale.set(Math.min(1, (W - 40) / t.width));
      this.addChild(strip, t);
      return;
    }

    const dim = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.82 });
    dim.eventMode = 'static';
    const panelW = Math.min(1000, W - 80);
    const title = new Text({ text: m.title, style: textStyle(COLORS.gold, 96, { fontFamily: FONT_TAG }) });
    title.anchor.set(0.5);
    title.scale.set(Math.min(1, (panelW - 60) / title.width));
    const body = new Text({
      text: m.body,
      style: textStyle(COLORS.text, 40, { wordWrap: true, wordWrapWidth: panelW - 80, align: 'center' }),
    });
    body.anchor.set(0.5, 0);
    const panelH = 140 + body.height + (m.lobbyUrl ? 170 : 60);
    const panel = new Container();
    panel.position.set((W - panelW) / 2, (H - panelH) / 2);
    panel.addChild(new Graphics().roundRect(0, 0, panelW, panelH, 30).fill(COLORS.panel).stroke({ color: COLORS.gold, width: 6 }));
    title.position.set(panelW / 2, 80);
    body.position.set(panelW / 2, 150);
    panel.addChild(title, body);
    if (m.lobbyUrl) {
      const url = m.lobbyUrl;
      const button = new Button({ width: 420, height: 100, label: 'BACK TO THE LOBBY', fontSize: 36, fill: COLORS.gold, textColor: COLORS.background }, () =>
        window.location.assign(url),
      );
      button.position.set((panelW - 420) / 2, panelH - 140);
      panel.addChild(button);
    }
    this.addChild(dim, panel);
  }
}
