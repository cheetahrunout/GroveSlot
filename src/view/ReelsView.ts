import { Container, Graphics, Text } from 'pixi.js';
import { PAYLINES } from '../config/paylines';
import { REEL_COUNT, ROW_COUNT } from '../config/reels';
import type { SymbolId } from '../config/symbols';
import type { Evaluation, Position } from '../engine/evaluate';
import type { Grid } from '../engine/spin';
import type { GameTextures } from './assets';
import { createSymbolView } from './SymbolView';
import { COLORS, LINE_COLORS, textStyle } from './theme';
import { easeOutBack, easeOutCubic, tween, wait } from './tween';

export const CELL = 220;
export const GAP = 12;
const STEP = CELL + GAP;
export const GRID_WIDTH = REEL_COUNT * CELL + (REEL_COUNT - 1) * GAP;
export const GRID_HEIGHT = ROW_COUNT * CELL + (ROW_COUNT - 1) * GAP;
const FRAME_PAD = 24;
const BOUNCE = 36;

/** The 5×3 reel window: spinning, stopping and showing wins. */
export class ReelsView extends Container {
  private readonly reels: Container[] = [];
  private readonly cellViews: Container[][] = [];
  private readonly overlay = new Container();
  private readonly lineLabel: Text;
  private readonly lineLabelBg = new Graphics();
  private grid: Grid = [];
  private winLoop = 0;

  constructor(private readonly textures: GameTextures) {
    super();
    const frame = new Graphics()
      .roundRect(-FRAME_PAD, -FRAME_PAD, GRID_WIDTH + FRAME_PAD * 2, GRID_HEIGHT + FRAME_PAD * 2, 28)
      .fill(COLORS.panel)
      .stroke({ color: COLORS.panelEdge, width: 6 });
    const mask = new Graphics().rect(0, 0, GRID_WIDTH, GRID_HEIGHT).fill(0xffffff);
    const reelLayer = new Container();
    reelLayer.mask = mask;
    for (let reel = 0; reel < REEL_COUNT; reel++) {
      const c = new Container();
      c.x = reel * STEP;
      reelLayer.addChild(c);
      this.reels.push(c);
      this.cellViews.push([]);
    }
    this.lineLabel = new Text({ text: '', style: textStyle(COLORS.text, 34, { stroke: { color: COLORS.background, width: 6 } }) });
    this.lineLabel.anchor.set(0.5);
    this.lineLabel.position.set(GRID_WIDTH / 2, GRID_HEIGHT - 34);
    this.addChild(frame, reelLayer, mask, this.overlay, this.lineLabelBg, this.lineLabel);
  }

  /** Width and height including the frame, for layout. */
  static readonly outerWidth = GRID_WIDTH + FRAME_PAD * 2;
  static readonly outerHeight = GRID_HEIGHT + FRAME_PAD * 2;

  get currentGrid(): Grid {
    return this.grid;
  }

  show(grid: Grid): void {
    this.grid = grid.map((c) => [...c]);
    grid.forEach((column, reel) => this.fillReel(reel, column));
  }

  /** Replaces single cells without spinning (e.g. Drive-By wilds). */
  setCell(reel: number, row: number, symbol: SymbolId): Container {
    this.grid[reel][row] = symbol;
    const old = this.cellViews[reel][row];
    const view = createSymbolView(symbol, CELL, this.textures);
    view.position.copyFrom(old.position);
    this.reels[reel].addChildAt(view, this.reels[reel].getChildIndex(old));
    old.destroy({ children: true });
    this.cellViews[reel][row] = view;
    return view;
  }

  /** Turns a whole reel wild, cell by cell, with a pop. */
  async expandReel(reel: number): Promise<void> {
    for (let row = 0; row < ROW_COUNT; row++) {
      const view = this.setCell(reel, row, 'WILD');
      const { x, y } = view.position;
      view.pivot.set(CELL / 2, CELL / 2);
      view.position.set(x + CELL / 2, y + CELL / 2);
      view.scale.set(0.2);
      await tween(view, { 'scale.x': 1, 'scale.y': 1 }, 220, easeOutBack);
      view.pivot.set(0, 0);
      view.position.set(x, y);
    }
  }

  cellPosition(reel: number, row: number): { x: number; y: number } {
    return { x: reel * STEP, y: row * STEP };
  }

  private fillReel(reel: number, column: readonly SymbolId[]): void {
    const container = this.reels[reel];
    container.removeChildren().forEach((c) => c.destroy({ children: true }));
    container.y = 0;
    this.cellViews[reel] = column.map((symbol, row) => {
      const view = createSymbolView(symbol, CELL, this.textures);
      view.y = row * STEP;
      container.addChild(view);
      return view;
    });
  }

  /**
   * Spins every reel and lands on `target`. Filler symbols come from the
   * real strips, so what scrolls past is what the reel holds.
   */
  async spinTo(target: Grid, stops: readonly number[], strips: readonly (readonly SymbolId[])[], turbo: boolean): Promise<void> {
    this.clearWins();
    const spins = target.map(async (column, reel) => {
      const strip = strips[reel];
      const fillerCount = turbo ? 6 + reel * 2 : 14 + reel * 5;
      const fillers = Array.from({ length: fillerCount }, (_, k) => strip[(stops[reel] + ROW_COUNT + k) % strip.length]);
      const current = this.grid[reel] ?? column;
      // One extra symbol above the target covers the gap during the bounce.
      const above = strip[(stops[reel] - 1 + strip.length) % strip.length];
      const symbols = [above, ...column, ...fillers, ...current];

      const container = this.reels[reel];
      container.removeChildren().forEach((c) => c.destroy({ children: true }));
      symbols.forEach((symbol, i) => {
        const view = createSymbolView(symbol, CELL, this.textures);
        view.y = (i - 1) * STEP;
        container.addChild(view);
      });
      container.y = -(symbols.length - 1 - ROW_COUNT) * STEP;
      const duration = turbo ? 350 + reel * 90 : 900 + reel * 260;
      await tween(container, { y: BOUNCE }, duration, easeOutCubic);
      await tween(container, { y: 0 }, 160, easeOutBack);
      this.fillReel(reel, column);
    });
    await Promise.all(spins);
    this.grid = target.map((c) => [...c]);
  }

  /** Dims everything except `positions`. */
  highlight(positions: readonly Position[]): void {
    const keep = new Set(positions.map((p) => `${p.reel},${p.row}`));
    this.cellViews.forEach((column, reel) =>
      column.forEach((view, row) => (view.alpha = keep.has(`${reel},${row}`) ? 1 : 0.35)),
    );
  }

  clearWins(): void {
    this.winLoop++;
    this.overlay.removeChildren().forEach((c) => c.destroy());
    this.setLineLabel('');
    this.cellViews.forEach((column) => column.forEach((v) => (v.alpha = 1)));
  }

  private setLineLabel(text: string): void {
    this.lineLabel.text = text;
    this.lineLabelBg.clear();
    if (!text) return;
    const w = this.lineLabel.width + 48;
    this.lineLabelBg
      .roundRect(GRID_WIDTH / 2 - w / 2, GRID_HEIGHT - 62, w, 56, 28)
      .fill({ color: COLORS.background, alpha: 0.85 })
      .stroke({ color: COLORS.gold, width: 3 });
  }

  private drawLine(line: number, count: number): Graphics {
    const g = new Graphics();
    const color = LINE_COLORS[line];
    const pts = PAYLINES[line].map((row, reel) => ({ x: reel * STEP + CELL / 2, y: row * STEP + CELL / 2 }));
    g.moveTo(pts[0].x - CELL / 2, pts[0].y);
    pts.forEach((p) => g.lineTo(p.x, p.y));
    g.lineTo(pts[4].x + CELL / 2, pts[4].y);
    g.stroke({ color: 0x000000, width: 16, alpha: 0.5, join: 'round', cap: 'round' });
    g.moveTo(pts[0].x - CELL / 2, pts[0].y);
    pts.forEach((p) => g.lineTo(p.x, p.y));
    g.lineTo(pts[4].x + CELL / 2, pts[4].y);
    g.stroke({ color, width: 8, join: 'round', cap: 'round' });
    for (let reel = 0; reel < count; reel++) {
      const { x, y } = this.cellPosition(reel, PAYLINES[line][reel]);
      g.roundRect(x + 4, y + 4, CELL - 8, CELL - 8, 18).stroke({ color, width: 8 });
    }
    return g;
  }

  private winPositions(result: Evaluation): Position[] {
    const positions: Position[] = [];
    for (const w of result.lineWins) {
      for (let reel = 0; reel < w.count; reel++) positions.push({ reel, row: PAYLINES[w.line][reel] });
    }
    if (result.scatterWin > 0) positions.push(...result.scatterPositions);
    return positions;
  }

  /**
   * Shows all wins at once, then cycles through each line until the next
   * spin. Resolves after the first full pass so callers can continue.
   */
  async presentWins(result: Evaluation, multiplier = 1): Promise<void> {
    const loop = ++this.winLoop;
    const total = this.winPositions(result);
    if (total.length === 0) return;

    this.highlight(total);
    for (const w of result.lineWins) this.overlay.addChild(this.drawLine(w.line, w.count));
    await wait(900);

    const steps: (() => void)[] = result.lineWins.map((w) => () => {
      this.overlay.removeChildren().forEach((c) => c.destroy());
      this.overlay.addChild(this.drawLine(w.line, w.count));
      this.highlight(Array.from({ length: w.count }, (_, reel) => ({ reel, row: PAYLINES[w.line][reel] })));
      const sym = w.symbol === 'TEN' ? '10' : w.symbol;
      this.setLineLabel(`LINE ${w.line + 1} · ${w.count}× ${sym} · ${(w.payout * multiplier).toLocaleString('en-US')}`);
    });
    if (result.scatterWin > 0) {
      steps.push(() => {
        this.overlay.removeChildren().forEach((c) => c.destroy());
        this.highlight(result.scatterPositions);
        this.setLineLabel(`${result.scatterCount}× SPRAY CAN · ${(result.scatterWin * multiplier).toLocaleString('en-US')}`);
      });
    }

    // Keeps cycling in the background until clearWins() bumps winLoop.
    void (async () => {
      while (loop === this.winLoop) {
        for (const step of steps) {
          if (loop !== this.winLoop) return;
          step();
          await wait(1100);
        }
        if (steps.length <= 1) return;
      }
    })();
  }
}
