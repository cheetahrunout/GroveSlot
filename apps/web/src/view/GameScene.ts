import { Container, Graphics } from 'pixi.js';
import { SKINS, type SkinId } from '../economy/achievements';
import type { GameTextures } from './assets';
import { Banner } from './Banner';
import { computeLayout, type Layout } from './layout';
import { ReelsView } from './ReelsView';
import { COLORS } from './theme';

/** The part of the screen the Vue layout leaves for the reels, in CSS pixels. */
export interface StageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The PixiJS canvas: backdrop, reels, bonus scenes and effects. Menus, the
 * HUD and every button live in Vue on top of it.
 */
export class GameScene extends Container {
  readonly reels: ReelsView;
  /** Full-screen layer for bonus games and effects, in design coordinates. */
  readonly overlay = new Container();
  readonly banner = new Banner();
  private readonly backdrop = new Graphics();
  private readonly designRoot = new Container();
  private skin: SkinId = 'classic';
  private mode: 'base' | 'freeSpins' = 'base';
  /** Design-space layout of the whole viewport, used by the bonus scenes. */
  layout!: Layout;
  private viewport = { width: 1920, height: 1080 };

  constructor(readonly textures: GameTextures) {
    super();
    this.reels = new ReelsView(textures);
    this.designRoot.addChild(this.overlay, this.banner);
    this.addChild(this.backdrop, this.reels, this.designRoot);
  }

  setMode(mode: 'base' | 'freeSpins'): void {
    this.mode = mode;
    this.drawBackdrop();
  }

  applySkin(skin: SkinId): void {
    this.skin = skin;
    this.reels.setFrameColor(SKINS[skin].frame);
    this.drawBackdrop();
  }

  private drawBackdrop(): void {
    const color = this.mode === 'freeSpins' ? COLORS.night : SKINS[this.skin].backdrop;
    this.backdrop.clear().rect(0, 0, this.viewport.width, this.viewport.height).fill(color);
  }

  /** `viewport` is the canvas size and `stage` the free area for the reels, both in CSS pixels. */
  arrange(viewport: { width: number; height: number }, stage: StageRect): void {
    this.viewport = viewport;
    this.drawBackdrop();

    // Reels: as large as fits the stage, centred.
    const scale = Math.max(0.1, Math.min(stage.width / ReelsView.outerWidth, stage.height / ReelsView.outerHeight));
    const pad = ReelsView.framePad * scale;
    this.reels.scale.set(scale);
    this.reels.position.set(
      stage.x + (stage.width - ReelsView.outerWidth * scale) / 2 + pad,
      stage.y + (stage.height - ReelsView.outerHeight * scale) / 2 + pad,
    );

    // Bonus scenes and effects work in a fixed design resolution, letterboxed.
    this.layout = computeLayout(viewport.width, viewport.height);
    this.designRoot.scale.set(this.layout.scale);
    this.designRoot.position.set(this.layout.offsetX, this.layout.offsetY);
    // Announcements sit over the reels.
    const cx = (stage.x + stage.width / 2 - this.layout.offsetX) / this.layout.scale;
    const cy = (stage.y + stage.height / 2 - this.layout.offsetY) / this.layout.scale;
    this.banner.position.set(cx, cy - 60);
  }
}
