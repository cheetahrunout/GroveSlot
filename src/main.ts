import { Application } from 'pixi.js';
import { Wallet } from './economy/wallet';
import { createRng } from './engine/rng';
import { GameController } from './game/GameController';
import { loadAssets } from './view/assets';
import { GameScene } from './view/GameScene';
import { computeLayout } from './view/layout';
import { COLORS } from './view/theme';

async function boot() {
  const app = new Application();
  await app.init({ resizeTo: window, background: COLORS.background, antialias: true });
  document.body.appendChild(app.canvas);

  const textures = await loadAssets();
  const controller = new GameController(new Wallet(), createRng());
  const scene = new GameScene(textures, {
    spin: () => void controller.spin(),
    betDown: () => controller.changeBet(-1),
    betUp: () => controller.changeBet(1),
    startAuto: (n) => controller.startAuto(n),
    stopAuto: () => controller.stopAuto(),
    toggleTurbo: () => controller.toggleTurbo(),
  });
  app.stage.addChild(scene);
  controller.attach(scene);

  const relayout = () => scene.arrange(computeLayout(app.screen.width, app.screen.height));
  app.renderer.on('resize', relayout);
  relayout();

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat) {
      e.preventDefault();
      void controller.spin();
    }
  });
}

boot();
