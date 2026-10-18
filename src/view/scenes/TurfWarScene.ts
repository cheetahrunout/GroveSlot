import { Container, Graphics, Text } from 'pixi.js';
import { TURF_WAR, type WheelSlice } from '../../config/features';
import type { TurfWarResult } from '../../engine/features/turfWar';
import { sound } from '../../audio/sound';
import { Button } from '../Button';
import { euro } from '../format';
import type { Layout } from '../layout';
import { COLORS, FONT_TAG, textStyle } from '../theme';
import { easeOutBack, easeOutCubic, tween, wait } from '../tween';

const SLICE_ANGLE = (Math.PI * 2) / TURF_WAR.wheel.length;
const PRIZE_SHADES = ['#2f7d2f', '#3f9a3f'];

function sliceLabel(s: WheelSlice): string {
  if (s.type === 'prize') return `x${s.multiplier}`;
  return s.type === 'backup' ? 'BACKUP' : 'BALLAS';
}

function sliceColor(s: WheelSlice, i: number): string {
  if (s.type === 'prize') return PRIZE_SHADES[i % 2];
  return s.type === 'backup' ? '#2f6db5' : COLORS.purple;
}

/** Turf War playback: spin the wheel to take Los Santos back block by block. */
export class TurfWarScene extends Container {
  private readonly wheel = new Container();
  private readonly blocks: { g: Graphics; name: Text; w: number; h: number }[] = [];
  private readonly status: Text;
  private readonly totalText: Text;
  private readonly backupText: Text;

  constructor(private readonly layout: Layout) {
    super();
    const { width: W, height: H } = layout;
    const portrait = layout.mode === 'portrait';
    const bg = new Graphics().rect(0, 0, W, H).fill('#120a1a');
    bg.eventMode = 'static';
    this.addChild(bg);

    // Wheel.
    const R = portrait ? 300 : 320;
    const g = new Graphics();
    TURF_WAR.wheel.forEach((s, i) => {
      const start = -Math.PI / 2 + i * SLICE_ANGLE;
      g.moveTo(0, 0).arc(0, 0, R, start, start + SLICE_ANGLE).closePath().fill(sliceColor(s, i)).stroke({ color: COLORS.background, width: 4 });
    });
    g.circle(0, 0, R).stroke({ color: COLORS.gold, width: 10 });
    g.circle(0, 0, 60).fill(COLORS.background).stroke({ color: COLORS.gold, width: 6 });
    this.wheel.addChild(g);
    TURF_WAR.wheel.forEach((s, i) => {
      const mid = -Math.PI / 2 + (i + 0.5) * SLICE_ANGLE;
      const t = new Text({ text: sliceLabel(s), style: textStyle(COLORS.text, s.type === 'prize' ? 44 : 30, { stroke: { color: COLORS.background, width: 5 } }) });
      t.anchor.set(0.5);
      t.position.set(Math.cos(mid) * R * 0.68, Math.sin(mid) * R * 0.68);
      t.rotation = mid + Math.PI / 2;
      this.wheel.addChild(t);
    });
    const wheelX = portrait ? W / 2 : W * 0.24;
    const wheelY = portrait ? H * 0.62 : H * 0.56;
    this.wheel.position.set(wheelX, wheelY);
    const pointer = new Graphics().poly([-30, -R - 40, 30, -R - 40, 0, -R + 20]).fill(COLORS.gold).stroke({ color: COLORS.background, width: 4 });
    pointer.position.set(wheelX, wheelY);
    this.addChild(this.wheel, pointer);

    // Map: 4 × 2 blocks, all held by the Ballas at the start.
    const cols = 4;
    const bw = 230;
    const bh = portrait ? 120 : 150;
    const gap = 14;
    const mapWidth = cols * bw + (cols - 1) * gap;
    const mapX = portrait ? (W - mapWidth) / 2 : W - mapWidth - 50;
    const mapY = portrait ? 300 : 280;
    TURF_WAR.territories.forEach((name, i) => {
      const block = new Container();
      const bgBlock = new Graphics();
      const label = new Text({ text: name, style: textStyle(COLORS.text, 30, { stroke: { color: COLORS.background, width: 5 } }) });
      label.anchor.set(0.5);
      label.position.set(bw / 2, bh / 2);
      label.scale.set(Math.min(1, (bw - 20) / label.width));
      block.addChild(bgBlock, label);
      block.position.set(mapX + (i % cols) * (bw + gap), mapY + Math.floor(i / cols) * (bh + gap));
      this.addChild(block);
      this.blocks.push({ g: bgBlock, name: label, w: bw, h: bh });
      this.paintBlock(i, false);
    });

    const title = new Text({ text: 'TURF WAR', style: textStyle(COLORS.gold, 110, { fontFamily: FONT_TAG, stroke: { color: COLORS.background, width: 10 } }) });
    title.anchor.set(0.5, 0);
    title.position.set(W / 2, portrait ? 110 : 20);
    const infoX = portrait ? W / 2 : mapX + mapWidth / 2;
    const infoY = portrait ? 590 : mapY + 2 * bh + gap + 70;
    this.status = new Text({ text: '', style: textStyle(COLORS.text, 46, { stroke: { color: COLORS.background, width: 6 } }) });
    this.status.anchor.set(0.5);
    this.status.position.set(infoX, infoY);
    this.backupText = new Text({ text: '', style: textStyle('#7fb6ff', 36) });
    this.backupText.anchor.set(0.5);
    this.backupText.position.set(infoX, infoY + 70);
    this.totalText = new Text({ text: '', style: textStyle(COLORS.gold, 72, { stroke: { color: COLORS.background, width: 8 } }) });
    this.totalText.anchor.set(0.5);
    this.totalText.position.set(infoX, portrait ? H - 90 : infoY + 170);
    this.addChild(title, this.status, this.backupText, this.totalText);
  }

  private paintBlock(i: number, ours: boolean): void {
    const b = this.blocks[i];
    b.g.clear().roundRect(0, 0, b.w, b.h, 16).fill(ours ? COLORS.grove : COLORS.purple).stroke({ color: ours ? COLORS.gold : '#3a1f4a', width: 4 });
  }

  private async spinWheelTo(slice: number): Promise<void> {
    const theta = (slice + 0.5) * SLICE_ANGLE;
    const base = this.wheel.rotation + Math.PI * 6;
    const offset = (((-theta - base) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    // Ticks slow down with the wheel.
    let ticking = true;
    void (async () => {
      for (let gap = 60; ticking && gap < 400; gap *= 1.12) {
        sound.play('wheelTick');
        await wait(gap);
      }
    })();
    await tween(this.wheel, { rotation: base + offset }, 2200, easeOutCubic);
    ticking = false;
  }

  async play(result: TurfWarResult, auto: boolean, onWin: (amount: number) => void): Promise<void> {
    const { width: W, height: H } = this.layout;
    const portrait = this.layout.mode === 'portrait';
    this.status.text = result.trigger === 'random' ? 'SURPRISE! THE BALLAS ROLLED UP' : 'TAKE THE HOOD BACK';
    this.totalText.text = `TOTAL ${euro(0)}`;

    let resolveTap: (() => void) | null = null;
    const spinButton = new Button({ width: 0, height: 0, radius: 85, label: 'SPIN', fontSize: 50, fill: COLORS.danger }, () => resolveTap?.());
    spinButton.position.set(portrait ? W - 150 : this.wheel.x + 400, portrait ? H - 260 : this.wheel.y + 250);
    this.addChild(spinButton);

    let total = 0;
    for (const spin of result.spins) {
      spinButton.setEnabled(true);
      await new Promise<void>((resolve) => {
        resolveTap = resolve;
        void wait(auto ? 600 : 8000).then(resolve);
      });
      resolveTap = null;
      spinButton.setEnabled(false);
      await this.spinWheelTo(spin.slice);

      if (spin.outcome === 'prize') {
        const i = spin.territory!;
        this.paintBlock(i, true);
        const block = this.blocks[i];
        block.name.parent!.scale.set(1.15);
        void tween(block.name.parent!, { 'scale.x': 1, 'scale.y': 1 }, 400, easeOutBack);
        total += spin.win;
        onWin(spin.win);
        sound.play('cheer');
        this.status.text = `${TURF_WAR.territories[i]} TAKEN! +${euro(spin.win)}`;
      } else if (spin.outcome === 'backup') {
        this.status.text = 'BACKUP! YOUR HOMIES GOT YOUR BACK';
      } else if (spin.outcome === 'blocked') {
        this.status.text = 'BACKUP HELD THE BALLAS OFF';
      } else {
        sound.play('siren');
        this.status.text = 'THE BALLAS PUSHED YOU BACK';
        this.status.style.fill = '#c58cf0';
      }
      this.backupText.text = spin.backups > 0 ? `BACKUP x${spin.backups}` : '';
      this.totalText.text = `TOTAL ${euro(total)}`;
      await wait(900);
    }
    spinButton.visible = false;

    if (result.turfBoss) {
      this.status.style.fill = COLORS.gold;
      this.status.text = `TURF BOSS! +${euro(result.turfBossWin)}`;
      total += result.turfBossWin;
      onWin(result.turfBossWin);
      this.totalText.text = `TOTAL ${euro(total)}`;
      await wait(1800);
    }
    this.status.style.fill = COLORS.text;
    this.status.text = `${result.territoriesTaken} OF ${TURF_WAR.territories.length} BLOCKS TAKEN`;
    await wait(1600);
  }
}
