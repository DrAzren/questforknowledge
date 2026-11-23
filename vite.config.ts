import { defineConfig } from 'vite';

// Relative base so the build runs from any folder (GitHub Pages, static hosts, local file servers).
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
