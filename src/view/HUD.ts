import { Container, Graphics, Text } from 'pixi.js';
import { Button } from './Button';
import { COLORS, textStyle } from './theme';

export const AUTO_SPIN_OPTIONS = [10, 25, 50, 100] as const;

/** A labelled value box (balance, bet, win). */
export class InfoBox extends Container {
  readonly value: Text;

  constructor(caption: string, readonly boxWidth: number, readonly boxHeight = 110) {
    super();
    const bg = new Graphics()
      .roundRect(0, 0, boxWidth, boxHeight, 18)
      .fill(COLORS.panel)
      .stroke({ color: COLORS.panelEdge, width: 4 });
    const label = new Text({ text: caption, style: textStyle(COLORS.muted, 24) });
    label.anchor.set(0.5, 0);
    label.position.set(boxWidth / 2, 8);
    this.value = new Text({ text: '', style: textStyle(COLORS.gold, 48) });
    this.value.anchor.set(0.5, 0.5);
    this.value.position.set(boxWidth / 2, boxHeight * 0.62);
    this.addChild(bg, label, this.value);
  }

  setValue(text: string): void {
    this.value.text = text;
    this.value.scale.set(1);
    this.value.scale.set(Math.min(1, (this.boxWidth - 40) / this.value.width));
  }
}

export interface HudHandlers {
  spin(): void;
  betDown(): void;
  betUp(): void;
  startAuto(count: number): void;
  stopAuto(): void;
  toggleTurbo(): void;
}

/** Balance, bet, win, auto-spin, turbo and the spin button. */
export class HUD {
  readonly balance = new InfoBox('BALANCE', 380);
  readonly bet = new InfoBox('TOTAL BET', 380);
  readonly win = new InfoBox('WIN', 380);
  readonly betDown: Button;
  readonly betUp: Button;
  readonly spin: Button;
  readonly auto: Button;
  readonly turbo: Button;
  readonly autoMenu = new Container();
  private autoRunning = false;

  constructor(handlers: HudHandlers) {
    this.betDown = new Button({ width: 64, height: 64, label: '–', fontSize: 56 }, handlers.betDown);
    this.betUp = new Button({ width: 64, height: 64, label: '+', fontSize: 56 }, handlers.betUp);
    this.betDown.position.set(14, 30);
    this.betUp.position.set(this.bet.boxWidth - 78, 30);
    this.bet.addChild(this.betDown, this.betUp);

    this.spin = new Button({ width: 0, height: 0, radius: 105, label: 'SPIN', fontSize: 58 }, handlers.spin);
    this.auto = new Button({ width: 170, height: 110, label: 'AUTO', fontSize: 34 }, () =>
      this.autoRunning ? handlers.stopAuto() : (this.autoMenu.visible = !this.autoMenu.visible),
    );
    this.turbo = new Button({ width: 170, height: 110, label: 'TURBO', fontSize: 34 }, handlers.toggleTurbo);

    // Auto-spin choices pop up above the AUTO button.
    this.autoMenu.visible = false;
    AUTO_SPIN_OPTIONS.forEach((count, i) => {
      const b = new Button({ width: 170, height: 76, label: String(count), fontSize: 34, fill: COLORS.panel }, () => {
        this.autoMenu.visible = false;
        handlers.startAuto(count);
      });
      b.y = -(i + 1) * 86;
      this.autoMenu.addChild(b);
    });
  }

  get all(): Container[] {
    return [this.balance, this.bet, this.win, this.auto, this.turbo, this.spin, this.autoMenu];
  }

  setAutoRemaining(remaining: number | null): void {
    this.autoRunning = remaining !== null;
    this.auto.setText(remaining === null ? 'AUTO' : `STOP ${remaining}`);
    this.auto.setActive(remaining !== null);
  }

  /** Locks the controls that must not change mid-spin. */
  setBusy(busy: boolean): void {
    this.spin.setEnabled(!busy);
    this.betDown.setEnabled(!busy);
    this.betUp.setEnabled(!busy);
    if (busy) this.autoMenu.visible = false;
  }
}
