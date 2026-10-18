import { Container, Graphics, Text } from 'pixi.js';
import type { SymbolId } from '../../config/symbols';
import { FONT_TAG } from '../theme';
import { createLowrider } from './lowrider';

/**
 * Original vector art for the symbols, drawn on a 220 × 220 tile. These are
 * rendered to textures once at start-up (see assets.ts).
 */
export const ART_SIZE = 220;
const S = ART_SIZE;
const INK = 0x0b0b0b;
const ink = (width = 6) => ({ color: INK, width, join: 'round' as const, cap: 'round' as const });

type Tier = 'high' | 'mid' | 'low' | 'special';
const TILE: Record<Tier, { fill: string; edge: string }> = {
  high: { fill: '#173317', edge: '#e0b84a' },
  mid: { fill: '#16283a', edge: '#4fb3c9' },
  low: { fill: '#2b2b2e', edge: '#5a5a5e' },
  special: { fill: '#2a1a33', edge: '#f2d36b' },
};

function tile(tier: Tier): Graphics {
  const t = TILE[tier];
  const g = new Graphics().roundRect(4, 4, S - 8, S - 8, 22).fill(t.fill).stroke({ color: t.edge, width: 6 });
  // A soft highlight across the top.
  g.roundRect(14, 14, S - 28, 60, 16).fill({ color: 0xffffff, alpha: 0.05 });
  return g;
}

function og(): Container {
  const c = new Container();
  const g = new Graphics();
  // White tank top shoulders.
  g.moveTo(40, 220).bezierCurveTo(46, 160, 80, 150, 110, 150).bezierCurveTo(140, 150, 174, 160, 180, 220).fill(0xf2f2f2).stroke(ink());
  g.rect(92, 150, 36, 16).fill(0x8a5a3c);
  // Head and neck.
  g.roundRect(94, 128, 32, 30, 8).fill(0x8a5a3c).stroke(ink(4));
  g.ellipse(110, 98, 42, 50).fill(0x8a5a3c).stroke(ink());
  // Green bandana tied on the head.
  g.moveTo(66, 84).bezierCurveTo(70, 40, 150, 40, 154, 84).lineTo(66, 84).fill(0x2f9d3f).stroke(ink());
  g.poly([150, 72, 178, 62, 172, 88]).fill(0x2f9d3f).stroke(ink(4));
  g.circle(88, 66, 4).fill(0xffffff).circle(110, 58, 4).fill(0xffffff).circle(132, 66, 4).fill(0xffffff);
  // Shades and a goatee.
  g.roundRect(74, 92, 32, 18, 6).fill(INK).roundRect(114, 92, 32, 18, 6).fill(INK).rect(104, 96, 12, 5).fill(INK);
  g.roundRect(100, 128, 20, 16, 6).fill(0x3a2416);
  c.addChild(g);
  return c;
}

function sabre(): Container {
  const c = new Container();
  const { car } = createLowrider(0x2f9d3f);
  car.scale.set(0.38);
  car.position.set(110, 150);
  const stripes = new Graphics().rect(-200, -84, 400, 10).fill(0xf2f2f2);
  (car.children[1] as Container).addChild(stripes);
  // Motion lines.
  const lines = new Graphics();
  for (const y of [100, 118, 136]) lines.moveTo(10, y).lineTo(30, y);
  lines.stroke({ color: 0xf2d36b, width: 5, cap: 'round' });
  c.addChild(lines, car);
  return c;
}

function house(): Container {
  const g = new Graphics();
  // Palm behind the house.
  g.rect(168, 60, 8, 110).fill(0x5a3a1e);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.ellipse(172 + Math.cos(a) * 22, 58 + Math.sin(a) * 9, 26, 8).fill(0x2f9d3f);
  }
  g.rect(36, 100, 140, 80).fill(0xe8d9b0).stroke(ink());
  g.poly([24, 104, 106, 48, 188, 104]).fill(0x7a3a2a).stroke(ink());
  g.rect(94, 128, 30, 52).fill(0x2f7d2f).stroke(ink(4));
  g.circle(118, 156, 3).fill(0xf2d36b);
  g.rect(50, 118, 32, 28).fill(0x9fd3e6).stroke(ink(4));
  g.rect(136, 118, 32, 28).fill(0x9fd3e6).stroke(ink(4));
  g.rect(20, 180, 180, 10).fill(0x8a8a8a);
  return wrap(g);
}

function chain(): Container {
  const g = new Graphics();
  const links = 22;
  // A U-shaped necklace with the medallion hanging from the bottom.
  for (let i = 0; i < links; i++) {
    const a = Math.PI * 0.1 + (i / (links - 1)) * Math.PI * 0.8;
    const x = 110 + Math.cos(a) * 78;
    const y = 30 + Math.sin(a) * 82;
    g.ellipse(x, y, 9, 6).fill(0xe0b84a).stroke({ color: 0x7a5a10, width: 3 });
  }
  // Medallion.
  g.circle(110, 150, 44).fill(0xe0b84a).stroke(ink());
  g.circle(110, 150, 34).stroke({ color: 0x7a5a10, width: 4 });
  const c = wrap(g);
  const letter = new Text({ text: 'G', style: { fontFamily: FONT_TAG, fontSize: 56, fill: '#2f7d2f', stroke: { color: '#0b0b0b', width: 4 } } });
  letter.anchor.set(0.5);
  letter.position.set(110, 152);
  c.addChild(letter);
  return c;
}

function boombox(): Container {
  const g = new Graphics();
  g.roundRect(70, 50, 80, 20, 8).stroke({ color: 0x9a9a9a, width: 8 });
  g.roundRect(20, 64, 180, 112, 14).fill(0x3a3a3e).stroke(ink());
  for (const x of [62, 158]) {
    g.circle(x, 124, 36).fill(0x1a1a1a).stroke(ink(4));
    g.circle(x, 124, 22).fill(0x4a4a4e);
    g.circle(x, 124, 8).fill(0x9a9a9a);
  }
  g.roundRect(92, 100, 36, 26, 4).fill(0x9fd3e6).stroke(ink(3));
  g.rect(92, 134, 36, 10).fill(0x2f9d3f);
  g.rect(30, 74, 160, 12).fill(0x2f9d3f);
  return wrap(g);
}

function bmx(): Container {
  const g = new Graphics();
  for (const x of [56, 164]) {
    g.circle(x, 140, 38).stroke(ink(8));
    g.circle(x, 140, 6).fill(INK);
  }
  // Frame.
  g.moveTo(56, 140).lineTo(96, 96).lineTo(146, 100).lineTo(110, 142).lineTo(56, 140);
  g.moveTo(146, 100).lineTo(164, 140).moveTo(110, 142).lineTo(96, 96);
  g.stroke({ color: 0x2f9d3f, width: 9, join: 'round', cap: 'round' });
  // Seat, bars and pedal.
  g.moveTo(84, 86).lineTo(108, 86).stroke(ink(8));
  g.moveTo(146, 100).lineTo(140, 64).lineTo(160, 58).stroke(ink(7));
  g.circle(110, 142, 9).fill(0xe0b84a).stroke(ink(3));
  return wrap(g);
}

function ball(): Container {
  const g = new Graphics();
  g.circle(110, 112, 70).fill(0xe2793f).stroke(ink());
  g.moveTo(40, 112).lineTo(180, 112).moveTo(110, 42).lineTo(110, 182);
  g.moveTo(62, 62).bezierCurveTo(92, 92, 92, 132, 62, 162);
  g.moveTo(158, 62).bezierCurveTo(128, 92, 128, 132, 158, 162);
  g.stroke(ink(5));
  g.ellipse(84, 78, 14, 8).fill({ color: 0xffffff, alpha: 0.35 });
  return wrap(g);
}

function cap(): Container {
  const g = new Graphics();
  g.moveTo(40, 132).bezierCurveTo(40, 54, 170, 54, 170, 132).lineTo(40, 132).fill(0x2f7d2f).stroke(ink());
  g.moveTo(150, 128).bezierCurveTo(186, 124, 206, 134, 204, 146).lineTo(140, 146).fill(0x1d4d1d).stroke(ink());
  g.rect(36, 128, 138, 14).fill(0x1d4d1d).stroke(ink(4));
  g.circle(104, 64, 6).fill(0x1d4d1d);
  // Shades hanging below.
  g.roundRect(60, 162, 40, 22, 8).fill(INK).roundRect(110, 162, 40, 22, 8).fill(INK).rect(98, 168, 14, 5).fill(INK);
  const c = wrap(g);
  const letter = new Text({ text: 'G', style: { fontFamily: FONT_TAG, fontSize: 48, fill: '#f2f2f2', stroke: { color: '#0b0b0b', width: 4 } } });
  letter.anchor.set(0.5);
  letter.position.set(104, 104);
  c.addChild(letter);
  return c;
}

function sprayCan(): Container {
  const g = new Graphics();
  // Paint mist.
  for (let i = 0; i < 26; i++) {
    const a = -0.9 + (i / 26) * 0.8;
    const r = 34 + ((i * 37) % 40);
    g.circle(132 + Math.cos(a) * r, 52 + Math.sin(a) * r, 3 + (i % 3)).fill({ color: 0x7dff6a, alpha: 0.8 });
  }
  g.roundRect(64, 70, 64, 120, 14).fill(0x2f9d3f).stroke(ink());
  g.rect(64, 108, 64, 40).fill(0xf2f2f2).stroke(ink(4));
  g.roundRect(78, 46, 36, 28, 8).fill(0xd8d8d8).stroke(ink(5));
  g.rect(110, 52, 16, 10).fill(INK);
  // Drips.
  g.roundRect(70, 186, 8, 18, 4).fill(0x2f9d3f).roundRect(112, 186, 8, 12, 4).fill(0x2f9d3f);
  const c = wrap(g);
  const label = new Text({ text: 'G', style: { fontFamily: FONT_TAG, fontSize: 40, fill: '#2f7d2f' } });
  label.anchor.set(0.5);
  label.position.set(96, 128);
  c.addChild(label);
  return c;
}

function lowriderTile(): Container {
  const c = new Container();
  const sky = new Graphics();
  ['#5a2350', '#a8434a', '#e2793f', '#f2b04f'].forEach((col, i) => sky.rect(10, 12 + i * 34, S - 20, 35).fill(col));
  sky.rect(10, 148, S - 20, 60).fill('#2b2b2b');
  const { car, body } = createLowrider(0xe0b84a);
  car.scale.set(0.36);
  car.position.set(110, 170);
  body.y = -40; // mid-hop
  const bounce = new Graphics();
  for (const x of [52, 168]) bounce.moveTo(x, 182).lineTo(x - 8, 196).moveTo(x, 182).lineTo(x + 8, 196);
  bounce.stroke({ color: 0xf2d36b, width: 4, cap: 'round' });
  c.addChild(sky, bounce, car);
  return c;
}

const LETTER_COLORS: Record<string, string> = { A: '#ff6b3d', K: '#3dd6ff', Q: '#ffd23d', J: '#7dff6a', TEN: '#ff7de0' };

function letter(symbol: SymbolId): Container {
  const c = new Container();
  const t = new Text({
    text: symbol === 'TEN' ? '10' : symbol,
    style: {
      fontFamily: FONT_TAG,
      fontSize: symbol === 'TEN' ? 120 : 140,
      fill: LETTER_COLORS[symbol],
      stroke: { color: '#0b0b0b', width: 10 },
      dropShadow: { color: '#000000', alpha: 0.6, blur: 0, distance: 6, angle: Math.PI / 3 },
    },
  });
  t.anchor.set(0.5);
  t.position.set(110, 116);
  t.rotation = -0.08;
  // A little paint drip under the tag.
  const drip = new Graphics().roundRect(120, 170, 8, 22, 4).fill(LETTER_COLORS[symbol]);
  c.addChild(drip, t);
  return c;
}

function wrap(g: Graphics): Container {
  const c = new Container();
  c.addChild(g);
  return c;
}

const DRAW: Partial<Record<SymbolId, { tier: Tier; draw: () => Container }>> = {
  OG: { tier: 'high', draw: og },
  SABRE: { tier: 'high', draw: sabre },
  HOUSE: { tier: 'high', draw: house },
  CHAIN: { tier: 'high', draw: chain },
  BOOMBOX: { tier: 'mid', draw: boombox },
  BMX: { tier: 'mid', draw: bmx },
  BALL: { tier: 'mid', draw: ball },
  CAP: { tier: 'mid', draw: cap },
  A: { tier: 'low', draw: () => letter('A') },
  K: { tier: 'low', draw: () => letter('K') },
  Q: { tier: 'low', draw: () => letter('Q') },
  J: { tier: 'low', draw: () => letter('J') },
  TEN: { tier: 'low', draw: () => letter('TEN') },
  SCATTER: { tier: 'special', draw: sprayCan },
  BONUS: { tier: 'special', draw: lowriderTile },
};

/** Symbols drawn here (the rest use the provided artwork or Cash Bag views). */
export const DRAWN_SYMBOLS = Object.keys(DRAW) as SymbolId[];

export function drawSymbolArt(symbol: SymbolId): Container {
  const def = DRAW[symbol];
  if (!def) throw new Error(`No drawn art for ${symbol}`);
  const c = new Container();
  c.addChild(tile(def.tier), def.draw());
  return c;
}
