import type { HoldAndSpinResult } from '../../engine/features/holdAndSpin';
import { HoldAndSpinScene } from '../../view/scenes/HoldAndSpinScene';
import { tween } from '../../view/tween';
import type { PresentContext } from './context';

export async function presentHoldAndSpin(ctx: PresentContext, cash: HoldAndSpinResult): Promise<void> {
  const { scene } = ctx;
  scene.reels.highlight(cash.initialBags);
  await scene.banner.show('CASH RUN!', `${cash.initialBags.length} CASH BAGS · HOLD & SPIN`, 1100);
  scene.reels.clearWins();

  const view = new HoldAndSpinScene(scene.layout, scene.textures.kingpin);
  view.alpha = 0;
  scene.overlay.addChild(view);
  await tween(view, { alpha: 1 }, 300);
  await view.play(cash, (amount) => ctx.addWin(amount));
  await tween(view, { alpha: 0 }, 300);
  view.destroy({ children: true });
}
