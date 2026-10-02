import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Dev only: `POST /__shot?name=x` with a PNG body saves it as `.shots/x.png`, so the game's picture can be
 * checked from outside the browser (`window.shot('x')` in a dev build posts the stage).
 */
function shots(): Plugin {
  return {
    name: 'dev-shots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x');
        if (req.method !== 'POST' || !url.pathname.endsWith('/__shot')) return next();
        const name = (url.searchParams.get('name') ?? 'shot').replace(/[^\w.-]/g, '_');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = join(server.config.root, '.shots');
          mkdirSync(dir, { recursive: true });
          const file = join(dir, `${name}.png`);
          writeFileSync(file, Buffer.concat(chunks));
          res.end(file);
        });
      });
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the build works wherever it's served — including GitHub Pages'
  // https://<user>.github.io/<repo>/ sub-path.
  base: './',
  server: { port: 5173 },
  worker: { format: 'es' },
  plugins: [shots()],
});
