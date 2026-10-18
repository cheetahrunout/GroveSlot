import type { TextStyleOptions } from 'pixi.js';

export const COLORS = {
  background: '#0d1a0d',
  night: '#0b1426',
  panel: '#132613',
  panelEdge: '#3f8f3f',
  grove: '#2f7d2f',
  groveLight: '#5fb85f',
  text: '#e8f5e0',
  muted: '#8fb88f',
  gold: '#f2d36b',
  purple: '#7b3fa0',
  danger: '#c0392b',
  tile: '#e9ece6',
  tileText: '#1d4d1d',
} as const;

export const FONT_UI = 'Anton, Impact, sans-serif';
export const FONT_TAG = '"Permanent Marker", cursive';

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
