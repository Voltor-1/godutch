import { defineConfig } from 'vite';

export default defineConfig({
  root: 'frontend',
  publicDir: 'public',
  build: {
    outDir: '../dist-frontend',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/sessions': 'http://localhost:8787',
      '/health': 'http://localhost:8787',
    },
  },
});
