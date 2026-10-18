import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:single`: the whole game (code, images, fonts) in one
// self-contained HTML file at dist-single/index.html.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist-single', assetsInlineLimit: Number.MAX_SAFE_INTEGER },
});
