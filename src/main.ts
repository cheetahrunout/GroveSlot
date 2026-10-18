import { Application, Assets, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js';
import { PAYLINES } from './config/paylines';
import { BASE_REELS, REEL_COUNT as REELS, ROW_COUNT as ROWS } from './config/reels';
import type { SymbolId } from './config/symbols';
import { evaluate, type Evaluation } from './engine/evaluate';
import { createRng } from './engine/rng';
import { spinReels, type Grid } from './engine/spin';
import { computeLayout, type Layout } from './view/layout';

// Interim base-game scene: real reels and payouts, instant stops, balance
// kept in memory. Reel animation, bet controls and saving come in milestone 4.

const CELL = 220;
const GAP = 12;
const LINE_BET = 1;
const TOTAL_BET = LINE_BET * PAYLINES.length;
const START_BALANCE = 10_000;

const ART: Partial<Record<SymbolId, string>> = {
  WILD: 'assets/symbols/wild-trident-g.jpg',
  TURF: 'assets/symbols/turf-war-palms-g.jpg',
};

// Symbols without art yet are drawn as labelled tiles.
const LABELS: Partial<Record<SymbolId, string>> = { SCATTER: 'SPRAY', BONUS: 'LOWRIDER', TEN: '10' };

const TRIGGER_TEXT: Record<keyof Evaluation['triggers'], string> = {
  freeSpins: 'FREE SPINS!',
  lowriderHop: 'LOWRIDER HOP!',
  turfWar: 'TURF WAR!',
};

async function boot() {
  const app = new Application();
  await app.init({ resizeTo: window, background: '#0d1a0d', antialias: true });
  document.body.appendChild(app.canvas);

  const loaded: Record<string, Texture> = await Assets.load(Object.values(ART) as string[]);
  // The artwork is a 2:3 card; crop the square emblem from the middle.
  const crop = (url: string) => {
    const tex = loaded[url];
    const side = Math.min(tex.width, tex.height);
    return new Texture({
      source: tex.source,
      frame: new Rectangle((tex.width - side) / 2, (tex.height - side) / 2, side, side),
    });
  };
  const artTextures = Object.fromEntries(
    Object.entries(ART).map(([sym, url]) => [sym, crop(url)]),
  ) as Partial<Record<SymbolId, Texture>>;

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

  const fillCell = (cell: Container, symbol: SymbolId, highlighted: boolean) => {
    cell.removeChildren().forEach((c) => c.destroy());
    const texture = artTextures[symbol];
    if (texture) {
      const sprite = new Sprite(texture);
      sprite.setSize(CELL, CELL);
      cell.addChild(sprite);
    } else {
      const bg = new Graphics().roundRect(0, 0, CELL, CELL, 18).fill('#e9ece6');
      const label = new Text({
        text: LABELS[symbol] ?? symbol,
        style: { fill: '#1d4d1d', fontSize: 44, fontWeight: '900', fontFamily: 'Impact, sans-serif' },
      });
      label.anchor.set(0.5);
      label.scale.set(Math.min(1, (CELL - 24) / label.width));
      label.position.set(CELL / 2, CELL / 2);
      cell.addChild(bg, label);
    }
    if (highlighted) {
      cell.addChild(new Graphics().roundRect(3, 3, CELL - 6, CELL - 6, 18).stroke({ color: '#f2d36b', width: 8 }));
    }
  };

  const winningCells = (result: Evaluation): Set<string> => {
    const keys = new Set<string>();
    for (const win of result.lineWins) {
      for (let reel = 0; reel < win.count; reel++) keys.add(`${reel},${PAYLINES[win.line][reel]}`);
    }
    if (result.scatterWin > 0) result.scatterPositions.forEach((p) => keys.add(`${p.reel},${p.row}`));
    return keys;
  };

  const showGrid = (symbols: Grid, highlight = new Set<string>()) => {
    for (let reel = 0; reel < REELS; reel++) {
      for (let row = 0; row < ROWS; row++) {
        fillCell(cells[reel * ROWS + row], symbols[reel][row], highlight.has(`${reel},${row}`));
      }
    }
  };

  const textStyle = (fill: string, fontSize: number) =>
    ({ fill, fontSize, fontWeight: '900', fontFamily: 'Impact, sans-serif' }) as const;

  let tokens = START_BALANCE;
  const balance = new Text({ text: '', style: textStyle('#f2d36b', 48) });
  balance.anchor.set(0.5);
  const message = new Text({ text: `BET ${TOTAL_BET} · 20 LINES`, style: textStyle('#e8f5e0', 40) });
  message.anchor.set(0.5);
  const updateBalance = () => (balance.text = `${tokens.toLocaleString('en-US')} TOKENS`);
  updateBalance();

  const spin = () => {
    if (tokens < TOTAL_BET) {
      message.text = 'NOT ENOUGH TOKENS';
      return;
    }
    tokens -= TOTAL_BET;
    const { grid: symbols } = spinReels(rng, BASE_REELS);
    const result = evaluate(symbols, LINE_BET);
    tokens += result.totalWin;
    updateBalance();
    showGrid(symbols, winningCells(result));

    const parts = result.totalWin > 0 ? [`WIN ${result.totalWin.toLocaleString('en-US')}`] : [];
    for (const key of Object.keys(TRIGGER_TEXT) as (keyof Evaluation['triggers'])[]) {
      if (result.triggers[key]) parts.push(TRIGGER_TEXT[key]);
    }
    message.text = parts.length > 0 ? parts.join(' · ') : `BET ${TOTAL_BET} · 20 LINES`;
  };
  showGrid(spinReels(rng, BASE_REELS).grid);

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

  root.addChild(title, grid, balance, message, spinButton, disclaimer);

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
      balance.position.set(gridX + gridWidth / 4, gridY + gridHeight + 24 + 60);
      message.position.set(gridX + (gridWidth * 3) / 4, gridY + gridHeight + 24 + 60);
    } else {
      grid.scale.set((layout.width - 120) / (gridWidth + 48));
      const scaledW = (gridWidth + 48) * grid.scale.x;
      const scaledH = (gridHeight + 48) * grid.scale.y;
      grid.position.set(cx - scaledW / 2 + 24 * grid.scale.x, 300);
      balance.position.set(cx, 300 + scaledH + 80);
      message.position.set(cx, 300 + scaledH + 150);
      spinButton.position.set(cx, 300 + scaledH + 330);
    }
  };

  const relayout = () => arrange(computeLayout(app.screen.width, app.screen.height));
  app.renderer.on('resize', relayout);
  relayout();
}

boot();
