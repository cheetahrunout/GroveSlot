import '@fontsource/anton/400.css';
import '@fontsource/permanent-marker/400.css';
import { Assets, Rectangle, Texture } from 'pixi.js';
import type { SymbolId } from '../config/symbols';

const SYMBOL_ART: Partial<Record<SymbolId, string>> = {
  WILD: 'assets/symbols/wild-trident-g.jpg',
  TURF: 'assets/symbols/turf-war-palms-g.jpg',
};

const EXTRA_ART = {
  kingpin: 'assets/symbols/kingpin-crown-g.jpg',
} as const;

export interface GameTextures {
  symbols: Partial<Record<SymbolId, Texture>>;
  kingpin: Texture;
}

/** The provided artwork is a 2:3 card; this crops the square emblem in the middle. */
function cropSquare(tex: Texture): Texture {
  const side = Math.min(tex.width, tex.height);
  return new Texture({
    source: tex.source,
    frame: new Rectangle((tex.width - side) / 2, (tex.height - side) / 2, side, side),
  });
}

export async function loadAssets(): Promise<GameTextures> {
  await Promise.all([
    document.fonts.load('40px Anton'),
    document.fonts.load('40px "Permanent Marker"'),
  ]).catch(() => undefined);

  const urls = [...Object.values(SYMBOL_ART), ...Object.values(EXTRA_ART)] as string[];
  const loaded: Record<string, Texture> = await Assets.load(urls);

  const symbols: Partial<Record<SymbolId, Texture>> = {};
  for (const [sym, url] of Object.entries(SYMBOL_ART) as [SymbolId, string][]) {
    symbols[sym] = cropSquare(loaded[url]);
  }
  return { symbols, kingpin: cropSquare(loaded[EXTRA_ART.kingpin]) };
}
