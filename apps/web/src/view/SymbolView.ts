import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { SymbolId } from '@lowrider/shared/config/symbols';
import type { GameTextures } from './assets';
import { drawCashBag } from './art/cashBag';
import { COLORS, textStyle } from './theme';

// Symbols without art yet are drawn as labelled tiles.
const LABELS: Partial<Record<SymbolId, string>> = { SCATTER: 'SPRAY', BONUS: 'LOWRIDER', TEN: '10', CASH: 'CASH' };

export function symbolLabel(symbol: SymbolId): string {
  return LABELS[symbol] ?? symbol;
}

/** A Cash Bag tile with the amount (or jackpot name) it holds. */
export function createCashBagView(size: number, label: string | undefined): Container {
  const view = new Container();
  const bg = new Graphics().roundRect(0, 0, size, size, size * 0.08).fill('#1b2f1b').stroke({ color: COLORS.gold, width: size * 0.02 });
  view.addChild(bg, drawCashBag(size));
  if (label) {
    const jackpot = /[A-Z]/.test(label);
    const text = new Text({
      text: label,
      style: textStyle(jackpot ? COLORS.gold : COLORS.text, size * 0.2, { stroke: { color: COLORS.background, width: size * 0.035 } }),
    });
    text.anchor.set(0.5);
    text.scale.set(Math.min(1, (size * 0.9) / text.width));
    text.position.set(size / 2, size * 0.62);
    view.addChild(text);
  }
  return view;
}

/** Draws one symbol filling a size × size square with its top-left at 0,0. */
export function createSymbolView(symbol: SymbolId, size: number, textures: GameTextures, cashLabel?: string): Container {
  if (symbol === 'CASH') return createCashBagView(size, cashLabel);
  const view = new Container();
  const texture = textures.symbols[symbol];
  if (texture) {
    const sprite = new Sprite(texture);
    sprite.setSize(size, size);
    view.addChild(sprite);
    return view;
  }
  const bg = new Graphics().roundRect(0, 0, size, size, size * 0.08).fill(COLORS.tile);
  const label = new Text({ text: symbolLabel(symbol), style: textStyle(COLORS.tileText, size * 0.2) });
  label.anchor.set(0.5);
  label.scale.set(Math.min(1, (size * 0.9) / label.width));
  label.position.set(size / 2, size / 2);
  view.addChild(bg, label);
  return view;
}
