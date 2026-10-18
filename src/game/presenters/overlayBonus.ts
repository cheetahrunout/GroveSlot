import type { Container } from 'pixi.js';
import { sound, type SfxName } from '../../audio/sound';
import type { Position } from '../../engine/evaluate';
import { playTransition } from '../../view/Transition';
import { wait } from '../../view/tween';
import type { PresentContext } from './context';

export interface OverlayBonus<V extends Container> {
  /** Cells that triggered the bonus, lit up before the transition. */
  trigger: readonly Position[];
  triggerSound?: SfxName;
  colors: readonly string[];
  title: string;
  sub: string;
  createView(): V;
  play(view: V): Promise<void>;
}

/**
 * Opens a full-screen bonus behind the Lowrider paint-stripe transition,
 * plays it, and sweeps back to the reels.
 */
export async function presentOverlayBonus<V extends Container>(ctx: PresentContext, bonus: OverlayBonus<V>): Promise<void> {
  const { scene } = ctx;
  if (bonus.trigger.length > 0) scene.reels.highlight(bonus.trigger);
  sound.play(bonus.triggerSound ?? 'bonus');
  await wait(900);

  let view!: V;
  let playing!: Promise<void>;
  await playTransition(scene.overlay, scene.layout, {
    colors: bonus.colors,
    title: bonus.title,
    sub: bonus.sub,
    onCovered: () => {
      scene.reels.clearWins();
      view = bonus.createView();
      // Below the transition, which sits on top of the overlay layer.
      scene.overlay.addChildAt(view, 0);
      // Start now so the reveal already shows the finished scene.
      playing = bonus.play(view);
    },
  });
  await playing;
  await playTransition(scene.overlay, scene.layout, {
    colors: bonus.colors,
    onCovered: () => view.destroy({ children: true }),
  });
}
