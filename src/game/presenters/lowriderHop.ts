import type { LowriderHopResult } from '../../engine/features/lowriderHop';
import { LowriderHopScene } from '../../view/scenes/LowriderHopScene';
import { sound } from '../../audio/sound';
import { tween } from '../../view/tween';
import type { PresentContext } from './context';

export async function presentLowriderHop(ctx: PresentContext, hop: LowriderHopResult): Promise<void> {
  const { scene } = ctx;
  scene.reels.highlight(findLowriders(scene.reels.currentGrid));
  sound.play('bonus');
  await scene.banner.show('LOWRIDER HOP!', 'Three lowriders in the hood', 1100);
  scene.reels.clearWins();

  const view = new LowriderHopScene(scene.layout);
  view.alpha = 0;
  scene.overlay.addChild(view);
  await tween(view, { alpha: 1 }, 300);
  await view.play(hop, ctx.auto, (win) => ctx.addWin(win));
  await tween(view, { alpha: 0 }, 300);
  view.destroy({ children: true });
}

function findLowriders(grid: readonly (readonly string[])[]) {
  return grid.flatMap((column, reel) => column.flatMap((s, row) => (s === 'BONUS' ? [{ reel, row }] : [])));
}
