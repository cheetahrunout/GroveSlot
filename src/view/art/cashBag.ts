import { Graphics } from 'pixi.js';

/** A tied money sack filling a size × size square (origin top-left). */
export function drawCashBag(size: number, color = 0x2f7d2f): Graphics {
  const s = size / 220;
  const g = new Graphics();
  const outline = { color: 0x0b0b0b, width: 6 * s, join: 'round' as const };
  // Sack body.
  g.moveTo(70 * s, 78 * s)
    .bezierCurveTo(20 * s, 110 * s, 22 * s, 196 * s, 110 * s, 198 * s)
    .bezierCurveTo(198 * s, 196 * s, 200 * s, 110 * s, 150 * s, 78 * s)
    .closePath()
    .fill(color)
    .stroke(outline);
  // Neck and tie.
  g.poly([78 * s, 40 * s, 142 * s, 40 * s, 130 * s, 78 * s, 90 * s, 78 * s]).fill(color).stroke(outline);
  g.roundRect(80 * s, 70 * s, 60 * s, 16 * s, 6 * s).fill(0xe0b84a).stroke({ color: 0x0b0b0b, width: 4 * s });
  // Shine.
  g.ellipse(72 * s, 130 * s, 10 * s, 26 * s).fill({ color: 0xffffff, alpha: 0.25 });
  return g;
}
