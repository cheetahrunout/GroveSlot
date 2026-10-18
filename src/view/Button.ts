import { Container, Graphics, Text } from 'pixi.js';
import { sound } from '../audio/sound';
import { COLORS, textStyle } from './theme';

export interface ButtonOptions {
  width: number;
  height: number;
  label: string;
  fontSize?: number;
  fill?: string;
  textColor?: string;
  /** Draws a circle with this radius instead of a rounded rectangle. */
  radius?: number;
}

/** A clickable rounded button that works with mouse and touch. */
export class Button extends Container {
  private readonly bg = new Graphics();
  readonly caption: Text;
  private enabled = true;
  private active = false;
  private hovered = false;

  constructor(private readonly opts: ButtonOptions, onTap: () => void) {
    super();
    this.caption = new Text({ text: opts.label, style: textStyle(opts.textColor ?? COLORS.text, opts.fontSize ?? 32) });
    this.caption.anchor.set(0.5);
    if (opts.radius === undefined) this.caption.position.set(opts.width / 2, opts.height / 2);
    this.addChild(this.bg, this.caption);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointertap', () => {
      if (!this.enabled) return;
      sound.play('click');
      onTap();
    });
    this.on('pointerover', () => ((this.hovered = true), this.redraw()));
    this.on('pointerout', () => ((this.hovered = false), this.redraw()));
    this.redraw();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.cursor = enabled ? 'pointer' : 'default';
    this.alpha = enabled ? 1 : 0.45;
    this.redraw();
  }

  /** Toggle look, for on/off buttons such as turbo. */
  setActive(active: boolean): void {
    this.active = active;
    this.redraw();
  }

  setText(text: string): void {
    this.caption.text = text;
    const maxWidth = (this.opts.radius ? this.opts.radius * 2 : this.opts.width) - 16;
    this.caption.scale.set(1);
    this.caption.scale.set(Math.min(1, maxWidth / this.caption.width));
  }

  private redraw(): void {
    const fill = this.active ? COLORS.gold : (this.opts.fill ?? COLORS.grove);
    const edge = this.hovered && this.enabled ? COLORS.gold : COLORS.text;
    this.bg.clear();
    if (this.opts.radius !== undefined) {
      this.bg.circle(0, 0, this.opts.radius).fill(fill).stroke({ color: edge, width: 6 });
    } else {
      this.bg.roundRect(0, 0, this.opts.width, this.opts.height, 16).fill(fill).stroke({ color: edge, width: 4 });
    }
    this.caption.style.fill = this.active ? COLORS.background : (this.opts.textColor ?? COLORS.text);
  }
}
