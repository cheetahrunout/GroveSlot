import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The page as one self-contained HTML file (code, images, fonts) at
// dist-single/index.html; the game server serves it.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-single', assetsInlineLimit: Number.MAX_SAFE_INTEGER },
});
