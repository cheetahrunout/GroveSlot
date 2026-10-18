import type { TurfWarResult } from '../../engine/features/turfWar';
import { TurfWarScene } from '../../view/scenes/TurfWarScene';
import { TRANSITION_COLORS } from '../../view/Transition';
import type { PresentContext } from './context';
import { presentOverlayBonus } from './overlayBonus';

export function presentTurfWar(ctx: PresentContext, turf: TurfWarResult): Promise<void> {
  const grid = ctx.scene.reels.currentGrid;
  const bySymbols = turf.trigger === 'symbols';
  return presentOverlayBonus(ctx, {
    trigger: bySymbols ? grid.flatMap((column, reel) => column.flatMap((s, row) => (s === 'TURF' ? [{ reel, row }] : []))) : [],
    triggerSound: bySymbols ? 'bonus' : 'siren',
    colors: TRANSITION_COLORS.turfWar,
    title: 'TURF WAR',
    sub: bySymbols ? 'Three Palm G on the block' : 'The Ballas rolled up on you',
    createView: () => new TurfWarScene(ctx.scene.layout),
    play: (view) => view.play(turf, ctx.auto, (amount) => ctx.addWin(amount)),
  });
}
