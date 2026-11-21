import { defineConfig } from 'vite';

// base relativa: o build roda em qualquer pasta (GitHub Pages, Artifact, servidor local)
export default defineConfig({
  base: './',
  publicDir: 'public',
  build: { target: 'es2020', chunkSizeWarningLimit: 1200, assetsInlineLimit: 0 },
  server: { host: true },
});
