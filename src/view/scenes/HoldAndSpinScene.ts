import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { CASH_RUN, JACKPOTS } from '../../config/features';
import { REEL_COUNT, ROW_COUNT } from '../../config/reels';
import type { CashBag, HoldAndSpinResult } from '../../engine/features/holdAndSpin';
import { bagLabel, fmt } from '../format';
import type { Layout } from '../layout';
import { createCashBagView } from '../SymbolView';
import { COLORS, FONT_TAG, textStyle } from '../theme';
import { easeOutBack, tween, wait } from '../tween';

const CELL = 200;
const GAP = 14;
const STEP = CELL + GAP;
const GRID_W = REEL_COUNT * CELL + (REEL_COUNT - 1) * GAP;
const GRID_H = ROW_COUNT * CELL + (ROW_COUNT - 1) * GAP;

/** Cash Run playback: locked bags, respins, then the collect. */
export class HoldAndSpinScene extends Container {
  private readonly grid = new Container();
  private readonly cells: Container[][] = [];
  private readonly lights: Graphics[] = [];
  private readonly status: Text;
  private readonly totalText: Text;

  constructor(private readonly layout: Layout, private readonly crown: Texture) {
    super();
    const { width: W, height: H } = layout;
    const bg = new Graphics().rect(0, 0, W, H).fill({ color: '#06120a', alpha: 0.96 });
    bg.eventMode = 'static';
    this.addChild(bg);

    const title = new Text({ text: 'CASH RUN', style: textStyle(COLORS.gold, 110, { fontFamily: FONT_TAG, stroke: { color: COLORS.background, width: 10 } }) });
    title.anchor.set(0.5, 0);
    title.position.set(W / 2, layout.mode === 'portrait' ? 120 : 10);
    this.addChild(title);

    // Leave room for the title above and the respins/total below.
    const top = layout.mode === 'portrait' ? 420 : 170;
    const scale = Math.min(1, (W - 80) / (GRID_W + 40), (H - top - 300) / (GRID_H + 40));
    this.grid.scale.set(scale);
    this.grid.position.set((W - GRID_W * scale) / 2, top);
    this.grid.addChild(new Graphics().roundRect(-20, -20, GRID_W + 40, GRID_H + 40, 26).fill(COLORS.panel).stroke({ color: COLORS.gold, width: 6 }));
    for (let reel = 0; reel < REEL_COUNT; reel++) {
      this.cells.push([]);
      for (let row = 0; row < ROW_COUNT; row++) {
        const cell = new Container();
        cell.position.set(reel * STEP, row * STEP);
        this.grid.addChild(cell);
        this.cells[reel].push(cell);
        this.setEmpty(reel, row);
      }
    }
    this.addChild(this.grid);

    const below = this.grid.y + (GRID_H + 20) * scale + 44;
    const lightsRow = new Container();
    const lightsLabel = new Text({ text: 'RESPINS', style: textStyle(COLORS.muted, 34) });
    lightsLabel.anchor.set(1, 0.5);
    lightsRow.addChild(lightsLabel);
    for (let i = 0; i < CASH_RUN.respins; i++) {
      const light = new Graphics();
      light.position.set(50 + i * 70, 0);
      lightsRow.addChild(light);
      this.lights.push(light);
    }
    lightsRow.position.set(W / 2 - 60, below);
    this.status = new Text({ text: '', style: textStyle(COLORS.text, 44) });
    this.status.anchor.set(0.5);
    this.status.position.set(W / 2, below + 80);
    this.totalText = new Text({ text: '', style: textStyle(COLORS.gold, 72, { stroke: { color: COLORS.background, width: 8 } }) });
    this.totalText.anchor.set(0.5);
    this.totalText.position.set(W / 2, below + 160);
    this.addChild(lightsRow, this.status, this.totalText);
  }

  private setEmpty(reel: number, row: number): void {
    const cell = this.cells[reel][row];
    cell.removeChildren().forEach((c) => c.destroy({ children: true }));
    cell.addChild(new Graphics().roundRect(0, 0, CELL, CELL, 18).fill('#0d1f10').stroke({ color: '#24452a', width: 3 }));
  }

  private async placeBag(bag: CashBag, pop: boolean): Promise<Container> {
    const cell = this.cells[bag.reel][bag.row];
    cell.removeChildren().forEach((c) => c.destroy({ children: true }));
    const view = createCashBagView(CELL, bagLabel(bag));
    cell.addChild(view);
    if (pop) {
      view.pivot.set(CELL / 2);
      view.position.set(CELL / 2);
      view.scale.set(0.2);
      await tween(view, { 'scale.x': 1, 'scale.y': 1 }, 300, easeOutBack);
    }
    return view;
  }

  private setLights(left: number): void {
    this.lights.forEach((g, i) => g.clear().circle(0, 0, 24).fill(i < left ? COLORS.gold : '#2a2a2a').stroke({ color: COLORS.text, width: 3 }));
  }

  /** Quick flicker of bags in the empty cells, like the reels turning. */
  private async flicker(taken: Set<string>): Promise<void> {
    const ghosts: Container[] = [];
    for (let k = 0; k < 4; k++) {
      ghosts.forEach((g) => g.destroy({ children: true }));
      ghosts.length = 0;
      for (let reel = 0; reel < REEL_COUNT; reel++) {
        for (let row = 0; row < ROW_COUNT; row++) {
          if (taken.has(`${reel},${row}`) || Math.random() > 0.35) continue;
          const ghost = createCashBagView(CELL, undefined);
          ghost.alpha = 0.25;
          ghost.position.set(reel * STEP, row * STEP);
          this.grid.addChild(ghost);
          ghosts.push(ghost);
        }
      }
      await wait(110);
    }
    ghosts.forEach((g) => g.destroy({ children: true }));
  }

  async play(result: HoldAndSpinResult, onCollect: (amount: number) => void): Promise<void> {
    const taken = new Set<string>();
    for (const bag of result.initialBags) {
      taken.add(`${bag.reel},${bag.row}`);
      await this.placeBag(bag, true);
    }
    this.setLights(CASH_RUN.respins);
    this.status.text = 'NEW BAGS RESET THE RESPINS';
    await wait(900);

    let left: number = CASH_RUN.respins;
    for (const respin of result.respins) {
      this.setLights(--left); // this respin is being used
      await this.flicker(taken);
      for (const bag of respin.newBags) {
        taken.add(`${bag.reel},${bag.row}`);
        await this.placeBag(bag, true);
      }
      left = respin.respinsLeft;
      this.setLights(left);
      this.status.text = respin.newBags.length > 0 ? `+${respin.newBags.length} BAG${respin.newBags.length > 1 ? 'S' : ''}!` : '';
      await wait(respin.newBags.length > 0 ? 500 : 300);
    }

    // Collect every bag, left to right.
    this.status.text = 'COLLECTING';
    let total = 0;
    const ordered = [...result.bags].sort((a, b) => a.reel - b.reel || a.row - b.row);
    for (const bag of ordered) {
      const cell = this.cells[bag.reel][bag.row];
      cell.alpha = 0.35;
      total += bag.value;
      onCollect(bag.value);
      this.totalText.text = fmt(total);
      await wait(bag.jackpot ? 700 : 160);
      if (bag.jackpot) this.status.text = `${JACKPOTS[bag.jackpot].name} JACKPOT!`;
    }

    if (result.grand) {
      await this.showKingpin(result.kingpinWin);
      total += result.kingpinWin;
      onCollect(result.kingpinWin);
      this.totalText.text = fmt(total);
    }
    this.status.text = 'CASH RUN WIN';
    await wait(1600);
  }

  private async showKingpin(amount: number): Promise<void> {
    const { width: W, height: H } = this.layout;
    const panel = new Container();
    panel.addChild(new Graphics().rect(-W, -H, W * 2, H * 2).fill({ color: 0x000000, alpha: 0.7 }));
    const crown = new Sprite(this.crown);
    crown.anchor.set(0.5);
    crown.setSize(420, 420);
    crown.y = -120;
    const title = new Text({ text: 'KINGPIN!', style: textStyle(COLORS.gold, 140, { fontFamily: FONT_TAG, stroke: { color: COLORS.background, width: 12 } }) });
    title.anchor.set(0.5);
    title.y = 170;
    const value = new Text({ text: fmt(amount), style: textStyle(COLORS.text, 90, { stroke: { color: COLORS.background, width: 8 } }) });
    value.anchor.set(0.5);
    value.y = 290;
    panel.addChild(crown, title, value);
    panel.position.set(W / 2, H / 2 - 100);
    panel.scale.set(0.2);
    this.addChild(panel);
    await tween(panel, { 'scale.x': 1, 'scale.y': 1 }, 600, easeOutBack);
    await wait(2500);
    panel.destroy({ children: true });
  }
}
