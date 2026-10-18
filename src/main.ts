import { Application } from 'pixi.js';
import { sound } from './audio/sound';
import { Progress } from './economy/progress';
import { Wallet } from './economy/wallet';
import { createRng } from './engine/rng';
import { GameController } from './game/GameController';
import { LocalLeaderboard } from './leaderboard/leaderboard';
import { loadAssets } from './view/assets';
import { showBigWin } from './view/BigWin';
import { GameScene } from './view/GameScene';
import { computeLayout } from './view/layout';
import { COLORS } from './view/theme';

async function boot() {
  const app = new Application();
  await app.init({ resizeTo: window, background: COLORS.background, antialias: true });
  document.body.appendChild(app.canvas);

  const textures = await loadAssets(app.renderer);
  const progress = new Progress();
  const controller = new GameController(new Wallet(), createRng(), progress, new LocalLeaderboard());
  const scene = new GameScene(textures, {
    spin: () => void controller.spin(),
    betDown: () => controller.changeBet(-1),
    betUp: () => controller.changeBet(1),
    startAuto: (n) => controller.startAuto(n),
    stopAuto: () => controller.stopAuto(),
    toggleTurbo: () => controller.toggleTurbo(),
    gamble: () => void controller.gamble(),
    menu: () => void controller.openMenu(),
  });
  app.stage.addChild(scene);
  const relayout = () => scene.arrange(computeLayout(app.screen.width, app.screen.height));
  app.renderer.on('resize', relayout);
  relayout();
  controller.attach(scene);

  if (import.meta.env.DEV) {
    // Debug hook for testing: __groveslot.controller.forceNext = 'freeSpins'
    (window as unknown as Record<string, unknown>).__groveslot = {
      controller,
      app,
      bigWin: (amount: number) => showBigWin(scene.overlay, scene.layout, amount, 20),
    };
  }

  // Count time played while the tab is visible.
  setInterval(() => {
    if (document.visibilityState === 'visible') progress.addPlayTime(30_000);
  }, 30_000);

  // Browsers only start audio after a gesture.
  window.addEventListener('pointerdown', () => sound.unlock());
  window.addEventListener('keydown', () => sound.unlock());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      void controller.spin();
    }
  });
}

boot();
