import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { SymbolId } from '../config/symbols';
import type { GameTextures } from './assets';
import { COLORS, textStyle } from './theme';

// Symbols without art yet are drawn as labelled tiles.
const LABELS: Partial<Record<SymbolId, string>> = { SCATTER: 'SPRAY', BONUS: 'LOWRIDER', TEN: '10' };

export function symbolLabel(symbol: SymbolId): string {
  return LABELS[symbol] ?? symbol;
}

/** Draws one symbol filling a size × size square with its top-left at 0,0. */
export function createSymbolView(symbol: SymbolId, size: number, textures: GameTextures): Container {
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
