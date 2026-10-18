import type { LowriderHopResult } from '@lowrider/shared/engine/features/lowriderHop';
import { LowriderHopScene } from '../../view/scenes/LowriderHopScene';
import { TRANSITION_COLORS } from '../../view/Transition';
import type { PresentContext } from './context';
import { presentOverlayBonus } from './overlayBonus';

export function presentLowriderHop(ctx: PresentContext, hop: LowriderHopResult): Promise<void> {
  const grid = ctx.scene.reels.currentGrid;
  return presentOverlayBonus(ctx, {
    trigger: grid.flatMap((column, reel) => column.flatMap((s, row) => (s === 'BONUS' ? [{ reel, row }] : []))),
    colors: TRANSITION_COLORS.lowriderHop,
    title: 'LOWRIDER HOP',
    sub: 'Three lowriders in the hood',
    createView: (ask) => new LowriderHopScene(ctx.scene.layout, ask),
    play: (view) => view.play(hop, ctx.auto, (win) => ctx.addWin(win)),
  });
}
