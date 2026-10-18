import { FREE_SPINS } from '@lowrider/shared/config/features';
import { FREE_SPIN_REELS } from '@lowrider/shared/config/reels';
import type { FreeSpinsResult } from '@lowrider/shared/engine/features/freeSpins';
import { sound } from '../../audio/sound';
import { TRANSITION_COLORS, playTransition } from '../../view/Transition';
import { wait } from '../../view/tween';
import { euro } from '../../view/format';
import type { PresentContext } from './context';

export async function presentFreeSpins(ctx: PresentContext, fs: FreeSpinsResult): Promise<void> {
  const { scene, ui } = ctx;
  const { reels, banner } = scene;
  let pulse = 0;
  const bar = {
    update: (spin: number, total: number, multiplier: number, tags: number, maxed: boolean) =>
      ui.setFreeSpins({ spin, total, multiplier, tags, maxed, pulse }),
    pulseMultiplier: (spin: number, total: number, multiplier: number, tags: number, maxed: boolean) =>
      ui.setFreeSpins({ spin, total, multiplier, tags, maxed, pulse: ++pulse }),
  };
  const baseGrid = reels.currentGrid.map((c) => [...c]);
  const baseLabels = reels.currentLabels;

  let multiplier = 1;
  sound.play('bonus');
  await wait(900);
  ui.setMode('bonus');
  await playTransition(scene.overlay, scene.layout, {
    colors: TRANSITION_COLORS.freeSpins,
    title: 'FREE SPINS',
    sub: `${fs.initialSpins} GROVE STREET FREE SPINS`,
    onCovered: () => {
      reels.clearWins();
      scene.setMode('freeSpins');
      bar.update(1, fs.initialSpins, multiplier, 0, false);
    },
  });
  ui.setMode('freeSpins');

  for (const [i, spin] of fs.spins.entries()) {
    const totalSoFar = i + 1 + spin.spinsLeft - spin.addedSpins;
    bar.update(i + 1, totalSoFar, spin.multiplier, spin.tags - spin.evaluation.scatterCount, multiplier >= FREE_SPINS.maxMultiplier);
    // Free spins always use the quick reel stop to keep long runs moving.
    await reels.spinTo(spin.landed, spin.stops, FREE_SPIN_REELS, true);

    for (const reel of spin.expandedReels) await reels.expandReel(reel);

    if (spin.evaluation.scatterCount > 0) {
      reels.highlight(spin.evaluation.scatterPositions);
      sound.play('spray');
      bar.update(i + 1, totalSoFar, spin.multiplier, spin.tags, false);
      await wait(600);
      reels.clearWins();
    }

    if (spin.win > 0) {
      ctx.addWin(spin.win);
      await reels.presentWins(spin.evaluation, spin.multiplier);
    }

    if (spin.levelUp) {
      multiplier = fs.spins[i + 1]?.multiplier ?? fs.finalMultiplier;
      bar.pulseMultiplier(i + 1, totalSoFar, multiplier, spin.tags, multiplier >= FREE_SPINS.maxMultiplier);
      sound.play('cheer');
      const levelSpins = spin.addedSpins - (spin.retriggered ? FREE_SPINS.retrigger : 0);
      await banner.show(`x${multiplier} MULTIPLIER`, `HOOD TAGGED · +${levelSpins} SPINS`, 900);
    }
    if (spin.retriggered) {
      await banner.show('RETRIGGER!', `+${FREE_SPINS.retrigger} FREE SPINS`, 900);
    }
    await wait(spin.win > 0 ? 500 : 250);
  }

  reels.clearWins();
  ui.setMode('bonus');
  await playTransition(scene.overlay, scene.layout, {
    colors: TRANSITION_COLORS.freeSpins,
    title: 'FREE SPINS WIN',
    sub: euro(fs.totalWin),
    hold: 1300,
    onCovered: () => {
      scene.setMode('base');
      ui.setFreeSpins(null);
      reels.show(baseGrid, baseLabels);
    },
  });
  ui.setMode('base');
}
