import { FREE_SPINS } from '../../config/features';
import { FREE_SPIN_REELS } from '../../config/reels';
import type { FreeSpinsResult } from '../../engine/features/freeSpins';
import { wait } from '../../view/tween';
import { fmt, type PresentContext } from './context';

export async function presentFreeSpins(ctx: PresentContext, fs: FreeSpinsResult): Promise<void> {
  const { scene } = ctx;
  const { reels, freeSpinsBar: bar, banner } = scene;
  const baseGrid = reels.currentGrid.map((c) => [...c]);
  const baseLabels = reels.currentLabels;

  await banner.show('FREE SPINS!', `${fs.initialSpins} GROVE STREET FREE SPINS`, 1300);
  scene.setMode('freeSpins');
  let multiplier = 1;
  bar.update(1, fs.initialSpins, multiplier, 0, false);

  for (const [i, spin] of fs.spins.entries()) {
    const totalSoFar = i + 1 + spin.spinsLeft - spin.addedSpins;
    bar.update(i + 1, totalSoFar, spin.multiplier, spin.tags - spin.evaluation.scatterCount, multiplier >= FREE_SPINS.maxMultiplier);
    // Free spins always use the quick reel stop to keep long runs moving.
    await reels.spinTo(spin.landed, spin.stops, FREE_SPIN_REELS, true);

    for (const reel of spin.expandedReels) await reels.expandReel(reel);

    if (spin.evaluation.scatterCount > 0) {
      reels.highlight(spin.evaluation.scatterPositions);
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
      bar.update(i + 1, totalSoFar, multiplier, spin.tags, multiplier >= FREE_SPINS.maxMultiplier);
      void bar.pulseMultiplier();
      const levelSpins = spin.addedSpins - (spin.retriggered ? FREE_SPINS.retrigger : 0);
      await banner.show(`×${multiplier} MULTIPLIER`, `HOOD TAGGED · +${levelSpins} SPINS`, 900);
    }
    if (spin.retriggered) {
      await banner.show('RETRIGGER!', `+${FREE_SPINS.retrigger} FREE SPINS`, 900);
    }
    await wait(spin.win > 0 ? 500 : 250);
  }

  reels.clearWins();
  await banner.show('FREE SPINS WIN', fmt(fs.totalWin), 1500);
  scene.setMode('base');
  reels.show(baseGrid, baseLabels);
}
