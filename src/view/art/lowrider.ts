import { Container, Graphics } from 'pixi.js';

/**
 * A side-on lowrider, about 520 × 170, origin at the middle of the ground
 * line. `body` hops while the wheels stay on the ground.
 */
export function createLowrider(paint: number): { car: Container; body: Container } {
  const car = new Container();
  const body = new Container();
  const g = new Graphics();
  const outline = { color: 0x0b0b0b, width: 6, join: 'round' as const };

  // Long low body with a sloped roof.
  g.poly([-260, -40, -250, -80, -150, -90, -90, -150, 70, -150, 130, -95, 250, -88, 262, -45, 250, -30, -250, -30])
    .fill(paint)
    .stroke(outline);
  // Windows.
  g.poly([-75, -140, -10, -140, -10, -95, -125, -95]).fill(0x9fd3e6).stroke({ color: 0x0b0b0b, width: 4 });
  g.poly([5, -140, 62, -140, 110, -95, 5, -95]).fill(0x9fd3e6).stroke({ color: 0x0b0b0b, width: 4 });
  // Chrome trim and bumpers.
  g.rect(-245, -62, 495, 8).fill(0xd8d8d8);
  g.roundRect(-272, -52, 26, 20, 6).fill(0xd8d8d8).stroke({ color: 0x0b0b0b, width: 3 });
  g.roundRect(246, -52, 26, 20, 6).fill(0xd8d8d8).stroke({ color: 0x0b0b0b, width: 3 });
  // Head and tail lights.
  g.circle(252, -70, 7).fill(0xfff2a8);
  g.rect(-258, -76, 10, 12).fill(0xff4040);
  body.addChild(g);

  const wheels = new Graphics();
  for (const x of [-165, 165]) {
    wheels.circle(x, -30, 38).fill(0x111111).stroke(outline);
    // Gold wire rims.
    wheels.circle(x, -30, 24).fill(0xe0b84a);
    for (let a = 0; a < 12; a++) {
      const r = (a / 12) * Math.PI * 2;
      wheels.moveTo(x, -30).lineTo(x + Math.cos(r) * 22, -30 + Math.sin(r) * 22);
    }
    wheels.stroke({ color: 0x8a6a1a, width: 2 });
    wheels.circle(x, -30, 6).fill(0xffffff);
  }

  car.addChild(wheels, body);
  return { car, body };
}
