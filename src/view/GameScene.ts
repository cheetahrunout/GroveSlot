import { Container, Graphics, Text } from 'pixi.js';
import type { GameTextures } from './assets';
import { Banner } from './Banner';
import { FreeSpinsBar } from './FreeSpinsBar';
import { JackpotBar } from './JackpotBar';
import { WantedMeter } from './WantedMeter';
import { Toasts } from './Toast';
import { SKINS, type SkinId } from '../economy/achievements';
import { HUD, type HudHandlers } from './HUD';
import type { Layout } from './layout';
import { ReelsView } from './ReelsView';
import { COLORS, FONT_TAG, textStyle } from './theme';

/** Everything on screen, arranged for landscape or portrait. */
export class GameScene extends Container {
  readonly reels: ReelsView;
  readonly hud: HUD;
  readonly banner = new Banner();
  readonly freeSpinsBar = new FreeSpinsBar();
  readonly jackpots: JackpotBar;
  readonly wanted = new WantedMeter();
  readonly toasts = new Toasts();
  private skin: SkinId = 'classic';
  private mode: 'base' | 'freeSpins' = 'base';
  /** Full-screen layer for bonus games, above the reels and HUD. */
  readonly overlay = new Container();
  private readonly backdrop = new Graphics();
  private readonly title: Text;
  private readonly disclaimer: Text;
  layout!: Layout;

  constructor(readonly textures: GameTextures, handlers: HudHandlers) {
    super();
    this.reels = new ReelsView(textures);
    this.jackpots = new JackpotBar(textures.kingpin);
    this.hud = new HUD(handlers);
    this.title = new Text({
      text: 'GROVESLOT',
      style: textStyle(COLORS.text, 92, { fontFamily: FONT_TAG, stroke: { color: COLORS.grove, width: 8 } }),
    });
    this.title.anchor.set(0.5, 0);
    this.disclaimer = new Text({
      text: 'For fun only. Tokens have no real-money value and cannot be bought or cashed out.',
      style: textStyle(COLORS.muted, 24, { fontFamily: 'sans-serif', letterSpacing: 0 }),
    });
    this.disclaimer.anchor.set(0.5, 1);
    this.freeSpinsBar.visible = false;
    this.addChild(this.backdrop, this.title, this.jackpots, this.wanted, this.freeSpinsBar, this.reels, ...this.hud.all, this.disclaimer, this.overlay, this.banner, this.toasts);
  }

  setMode(mode: 'base' | 'freeSpins'): void {
    this.mode = mode;
    this.freeSpinsBar.visible = mode === 'freeSpins';
    this.jackpots.visible = mode === 'base';
    this.wanted.visible = mode === 'base';
    this.title.visible = mode === 'base' || this.layout.mode === 'portrait';
    this.drawBackdrop();
  }

  private drawBackdrop(): void {
    const { width: W, height: H } = this.layout;
    const color = this.mode === 'freeSpins' ? COLORS.night : SKINS[this.skin].backdrop;
    this.backdrop.clear().rect(0, 0, W, H).fill(color);
  }

  applySkin(skin: SkinId): void {
    this.skin = skin;
    this.reels.setFrameColor(SKINS[skin].frame);
    if (this.layout) this.drawBackdrop();
  }

  arrange(layout: Layout): void {
    this.layout = layout;
    this.scale.set(layout.scale);
    this.position.set(layout.offsetX, layout.offsetY);
    const { width: W, height: H } = layout;
    const hud = this.hud;
    this.drawBackdrop();
    this.title.position.set(W / 2, 14);
    this.disclaimer.position.set(W / 2, H - 14);
    this.banner.position.set(W / 2, H / 2 - 60);
    this.jackpots.arrange(layout.mode, W);
    this.toasts.areaWidth = W;

    if (layout.mode === 'landscape') {
      const spinColumn = 280;
      const left = (W - (ReelsView.outerWidth + spinColumn)) / 2 + 24;
      this.reels.scale.set(1);
      this.reels.position.set(left, 150);
      this.freeSpinsBar.scale.set(1);
      this.freeSpinsBar.position.set((W - FreeSpinsBar.barWidth) / 2, 4);
      hud.spin.position.set(left + ReelsView.outerWidth + spinColumn / 2 - 24, 150 + ReelsView.outerHeight / 2 - 24);
      this.wanted.scale.set(1);
      this.wanted.position.set(hud.spin.x, 260);
      hud.gamble.position.set(hud.spin.x - 110, hud.spin.y + 150);
      hud.menu.position.set(hud.spin.x - 85, 150 + ReelsView.outerHeight - 70 - 24);

      const y = 150 + ReelsView.outerHeight + 10;
      const gap = 24;
      const rowWidth = hud.balance.boxWidth + hud.bet.boxWidth + hud.win.boxWidth + 170 * 2 + gap * 4;
      let x = (W - rowWidth) / 2;
      for (const item of [hud.balance, hud.bet, hud.win]) {
        item.position.set(x, y);
        x += item.boxWidth + gap;
      }
      hud.auto.position.set(x, y);
      hud.turbo.position.set(x + 170 + gap, y);
      hud.autoMenu.position.set(x, y - 10);
    } else {
      const scale = (W - 80) / ReelsView.outerWidth;
      this.reels.scale.set(scale);
      this.reels.position.set(40 + 24 * scale, 360);
      this.wanted.scale.set(0.9);
      this.wanted.position.set(W / 2, 315);
      this.freeSpinsBar.scale.set((W - 40) / FreeSpinsBar.barWidth);
      this.freeSpinsBar.position.set(20, 160);
      const below = 360 + ReelsView.outerHeight * scale + 40;
      const colW = 380;
      const gap = 40;
      const leftX = (W - colW * 2 - gap) / 2;
      hud.balance.position.set(leftX, below);
      hud.win.position.set(leftX + colW + gap, below);
      hud.bet.position.set(leftX, below + 140);
      hud.auto.position.set(leftX + colW + gap, below + 140);
      hud.turbo.position.set(leftX + colW + gap + 170 + gap, below + 140);
      hud.autoMenu.position.set(leftX + colW + gap, below + 130);
      hud.spin.position.set(W / 2, below + 420);
      hud.gamble.position.set(W / 2 + 160, below + 378);
      hud.menu.position.set(W / 2 - 330, below + 385);
    }
  }
}
