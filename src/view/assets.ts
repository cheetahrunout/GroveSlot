import '@fontsource/anton/400.css';
import '@fontsource/permanent-marker/400.css';
import { Assets, Rectangle, Texture, type Renderer } from 'pixi.js';
import type { SymbolId } from '../config/symbols';
import { ART_SIZE, DRAWN_SYMBOLS, drawSymbolArt } from './art/symbols';
import kingpinUrl from '../assets/symbols/kingpin-crown-g.jpg';
import turfUrl from '../assets/symbols/turf-war-palms-g.jpg';
import wildUrl from '../assets/symbols/wild-trident-g.jpg';

const SYMBOL_ART: Partial<Record<SymbolId, string>> = {
  WILD: wildUrl,
  TURF: turfUrl,
};

const EXTRA_ART = {
  kingpin: kingpinUrl,
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

export async function loadAssets(renderer: Renderer): Promise<GameTextures> {
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
  // Bake the drawn symbols into textures once; reels reuse them constantly.
  for (const sym of DRAWN_SYMBOLS) {
    const art = drawSymbolArt(sym);
    symbols[sym] = renderer.generateTexture({ target: art, frame: new Rectangle(0, 0, ART_SIZE, ART_SIZE), resolution: 2 });
    art.destroy({ children: true });
  }
  return { symbols, kingpin: cropSquare(loaded[EXTRA_ART.kingpin]) };
}
