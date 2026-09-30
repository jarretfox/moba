import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works wherever it's served — including GitHub Pages'
  // https://<user>.github.io/<repo>/ sub-path.
  base: './',
  server: { port: 5173 },
  worker: { format: 'es' },
});
