import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { host: '0.0.0.0', port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), viewer: resolve(__dirname, 'viewer.html') },
    },
  },
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
});
