import type { TextStyleOptions } from 'pixi.js';
import { TOKENS } from '../design/tokens';

/** PixiJS reads the same Grove tokens the Vue layer uses as CSS variables. */
export const COLORS = TOKENS.color;

export const FONT_UI = TOKENS.font.ui;
export const FONT_TAG = TOKENS.font.tag;

export function textStyle(fill: string, fontSize: number, extra: TextStyleOptions = {}): TextStyleOptions {
  return { fill, fontSize, fontFamily: FONT_UI, letterSpacing: 1, ...extra };
}

/** 20 distinct colours, one per payline. */
export const LINE_COLORS: readonly number[] = Array.from({ length: 20 }, (_, i) => {
  const h = (i * 137.5) % 360;
  // HSL → RGB with s = 0.85, l = 0.6.
  const s = 0.85;
  const l = 0.6;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
});
