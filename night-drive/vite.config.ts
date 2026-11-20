import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: { three: ['three'], postprocessing: ['postprocessing'] } },
    },
  },
  resolve: { dedupe: ['three'] },
  optimizeDeps: { include: ['three', 'postprocessing'] },
  server: { host: true, port: 5173 },
});
