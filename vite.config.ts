import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths → works on GitHub Pages / Vercel subpaths
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  server: { port: 5175 },
  preview: { port: 4173 },
});
