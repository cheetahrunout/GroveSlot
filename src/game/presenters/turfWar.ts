import type { TurfWarResult } from '../../engine/features/turfWar';
import { TurfWarScene } from '../../view/scenes/TurfWarScene';
import { tween } from '../../view/tween';
import type { PresentContext } from './context';

export async function presentTurfWar(ctx: PresentContext, turf: TurfWarResult): Promise<void> {
  const { scene } = ctx;
  if (turf.trigger === 'symbols') {
    const palms = scene.reels.currentGrid.flatMap((column, reel) =>
      column.flatMap((s, row) => (s === 'TURF' ? [{ reel, row }] : [])),
    );
    scene.reels.highlight(palms);
    await scene.banner.show('TURF WAR!', 'Three Palm G on the block', 1100);
  } else {
    await scene.banner.show('TURF WAR!', 'The Ballas rolled up on you', 1100, '#c58cf0');
  }
  scene.reels.clearWins();

  const view = new TurfWarScene(scene.layout);
  view.alpha = 0;
  scene.overlay.addChild(view);
  await tween(view, { alpha: 1 }, 300);
  await view.play(turf, ctx.auto, (amount) => ctx.addWin(amount));
  await tween(view, { alpha: 0 }, 300);
  view.destroy({ children: true });
}
