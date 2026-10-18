import type { HoldAndSpinResult } from '../../engine/features/holdAndSpin';
import { HoldAndSpinScene } from '../../view/scenes/HoldAndSpinScene';
import { TRANSITION_COLORS } from '../../view/Transition';
import type { PresentContext } from './context';
import { presentOverlayBonus } from './overlayBonus';

export function presentHoldAndSpin(ctx: PresentContext, cash: HoldAndSpinResult): Promise<void> {
  return presentOverlayBonus(ctx, {
    trigger: cash.initialBags,
    colors: TRANSITION_COLORS.holdAndSpin,
    title: 'CASH RUN',
    sub: `${cash.initialBags.length} CASH BAGS · HOLD & SPIN`,
    createView: () => new HoldAndSpinScene(ctx.scene.layout, ctx.scene.textures.kingpin),
    play: (view) => view.play(cash, (amount) => ctx.addWin(amount)),
  });
}
