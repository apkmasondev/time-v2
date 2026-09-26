import { defineConfig } from 'vite';
export default defineConfig({
  // relative URLs: the site works from any sub-path (GitHub Pages serves it under /time-v2/)
  base: './',
  server: { host: '127.0.0.1' },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200, emptyOutDir: true },
});
