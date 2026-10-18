import '@fontsource/anton/400.css';
import '@fontsource/permanent-marker/400.css';
import './styles/base.css';
import { Application } from 'pixi.js';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import wildIcon from './assets/symbols/wild-trident-g.jpg';
import App from './App.vue';
import { sound } from './audio/sound';
import { applyTokens, TOKENS } from './design/tokens';
import { Progress } from './economy/progress';
import { GameController } from './game/GameController';
import { CONTROLLER, PROGRESS, SCENE } from './game/injection';
import { useGameStore } from './stores/game';
import { loadAssets } from './view/assets';
import { GameScene } from './view/GameScene';

async function boot(): Promise<void> {
  applyTokens();
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = wildIcon;
  document.head.appendChild(icon);

  // PixiJS draws the reels and bonus scenes on a full-window canvas behind the Vue layer.
  const app = new Application();
  await app.init({
    canvas: document.getElementById('game-canvas') as HTMLCanvasElement,
    resizeTo: window,
    background: TOKENS.color.background,
    antialias: true,
    // Sharp on high-density screens without overloading phones.
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  const textures = await loadAssets(app.renderer);
  const scene = new GameScene(textures);
  app.stage.addChild(scene);

  const vue = createApp(App);
  vue.use(createPinia());
  const store = useGameStore();
  const progress = new Progress();
  const controller = new GameController(store, scene, progress);
  vue.provide(SCENE, scene).provide(CONTROLLER, controller).provide(PROGRESS, progress);
  vue.mount('#app');

  // Browsers only start audio after a gesture.
  window.addEventListener('pointerdown', () => sound.unlock());
  window.addEventListener('keydown', () => sound.unlock());
  setInterval(() => {
    if (document.visibilityState === 'visible') progress.addPlayTime(30_000);
  }, 30_000);

  if (import.meta.env.DEV) {
    // Local play: __groveslot.controller.forceNext = 'freeSpins' (the server ignores it with the real casino).
    (window as unknown as Record<string, unknown>).__groveslot = { controller, store, app };
  }
  await controller.start();
}

void boot();
