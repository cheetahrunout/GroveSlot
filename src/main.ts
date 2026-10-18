import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { createRng } from './engine/rng';
import { computeLayout, type Layout } from './view/layout';

// Milestone 1 placeholder scene: a 5×3 grid filled at random on SPIN.
// No paylines or payouts yet; the engine arrives in milestone 2.

const REELS = 5;
const ROWS = 3;
const CELL = 220;
const GAP = 12;

const ART = {
  wild: 'assets/symbols/wild-trident-g.jpg',
  kingpin: 'assets/symbols/kingpin-crown-g.jpg',
  turfWar: 'assets/symbols/turf-war-palms-g.jpg',
} as const;

// Symbols without art yet are drawn as labelled tiles.
const PLACEHOLDERS = ['OG', 'SABRE', 'HOUSE', 'CHAIN', 'BOOMBOX', 'BMX', 'A', 'K', 'Q', 'J', '10'];

async function boot() {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#0d1a0d', antialias: true });
  document.body.appendChild(app.canvas);

  const loaded: Record<string, Texture> = await Assets.load(Object.values(ART));
  // The artwork is a 2:3 card; crop the square emblem from the middle.
  const crop = (url: string) => {
    const tex = loaded[url];
    const side = Math.min(tex.width, tex.height);
    return new Texture({
      source: tex.source,
      frame: new Rectangle((tex.width - side) / 2, (tex.height - side) / 2, side, side),
    });
  };
  const artTextures = Object.values(ART).map(crop);

  const rng = createRng();
  const root = new Container();
  app.stage.addChild(root);

  const title = new Text({
    text: 'GROVESLOT',
    style: { fill: '#e8f5e0', fontSize: 96, fontWeight: '900', fontFamily: 'Impact, sans-serif', letterSpacing: 6 },
  });
  title.anchor.set(0.5, 0);

  const gridWidth = REELS * CELL + (REELS - 1) * GAP;
  const gridHeight = ROWS * CELL + (ROWS - 1) * GAP;
  const grid = new Container();
  const frame = new Graphics()
    .roundRect(-24, -24, gridWidth + 48, gridHeight + 48, 28)
    .fill('#132613')
    .stroke({ color: '#3f8f3f', width: 6 });
  grid.addChild(frame);
  const cells: Container[] = [];
  for (let reel = 0; reel < REELS; reel++) {
    for (let row = 0; row < ROWS; row++) {
      const cell = new Container();
      cell.position.set(reel * (CELL + GAP), row * (CELL + GAP));
      grid.addChild(cell);
      cells.push(cell);
    }
  }

  const fillCell = (cell: Container) => {
    cell.removeChildren().forEach((c) => c.destroy());
    const pick = rng.int(artTextures.length + PLACEHOLDERS.length);
    if (pick < artTextures.length) {
      const sprite = new Sprite(artTextures[pick]);
      sprite.setSize(CELL, CELL);
      cell.addChild(sprite);
      return;
    }
    const bg = new Graphics().roundRect(0, 0, CELL, CELL, 18).fill('#e9ece6');
    const label = new Text({
      text: PLACEHOLDERS[pick - artTextures.length],
      style: { fill: '#1d4d1d', fontSize: 44, fontWeight: '900', fontFamily: 'Impact, sans-serif' },
    });
    label.anchor.set(0.5);
    label.scale.set(Math.min(1, (CELL - 24) / label.width));
    label.position.set(CELL / 2, CELL / 2);
    cell.addChild(bg, label);
  };
  const spin = () => cells.forEach(fillCell);
  spin();

  const balance = new Text({
    text: '10,000 TOKENS',
    style: { fill: '#f2d36b', fontSize: 48, fontWeight: '900', fontFamily: 'Impact, sans-serif' },
  });
  balance.anchor.set(0.5);

  const spinButton = new Container();
  spinButton.addChild(
    new Graphics().circle(0, 0, 90).fill('#2f7d2f').stroke({ color: '#e8f5e0', width: 6 }),
  );
  const spinLabel = new Text({
    text: 'SPIN',
    style: { fill: '#ffffff', fontSize: 48, fontWeight: '900', fontFamily: 'Impact, sans-serif' },
  });
  spinLabel.anchor.set(0.5);
  spinButton.addChild(spinLabel);
  spinButton.eventMode = 'static';
  spinButton.cursor = 'pointer';
  spinButton.on('pointertap', spin);

  const disclaimer = new Text({
    text: 'For fun only. Tokens have no real-money value.',
    style: { fill: '#8fb88f', fontSize: 28, fontFamily: 'sans-serif' },
  });
  disclaimer.anchor.set(0.5, 1);

  root.addChild(title, grid, balance, spinButton, disclaimer);

  const arrange = (layout: Layout) => {
    root.scale.set(layout.scale);
    root.position.set(layout.offsetX, layout.offsetY);
    const cx = layout.width / 2;
    title.position.set(cx, 40);
    disclaimer.position.set(cx, layout.height - 24);
    if (layout.mode === 'landscape') {
      // Centre the grid and the spin button as one group.
      const groupWidth = gridWidth + 48 + 60 + 180;
      const gridX = (layout.width - groupWidth) / 2 + 24;
      const gridY = 190;
      grid.scale.set(1);
      grid.position.set(gridX, gridY);
      spinButton.position.set(gridX + gridWidth + 24 + 60 + 90, gridY + gridHeight / 2);
      balance.position.set(gridX + gridWidth / 2, gridY + gridHeight + 24 + 60);
    } else {
      grid.scale.set((layout.width - 120) / (gridWidth + 48));
      const scaledW = (gridWidth + 48) * grid.scale.x;
      const scaledH = (gridHeight + 48) * grid.scale.y;
      grid.position.set(cx - scaledW / 2 + 24 * grid.scale.x, 300);
      balance.position.set(cx, 300 + scaledH + 80);
      spinButton.position.set(cx, 300 + scaledH + 280);
    }
  };

  const relayout = () => arrange(computeLayout(app.screen.width, app.screen.height));
  app.renderer.on('resize', relayout);
  relayout();
}

boot();
