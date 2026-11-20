import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  base: './',
  publicDir: 'public',
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  server: {
    host: true,
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
});
