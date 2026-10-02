import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

/**
 * Dev only: `POST /__save?path=art-templates/scrimby/0/head.png` writes the body to that file, for the art
 * templates (render/artBake.ts). Only under art-templates/, public/art/ and public/audio/.
 */
function saves(): Plugin {
  const ALLOWED = ['art-templates/', 'public/art/', 'public/audio/'];
  return {
    name: 'dev-saves',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x');
        if (req.method !== 'POST' || !url.pathname.endsWith('/__save')) return next();
        const path = url.searchParams.get('path') ?? '';
        if (!ALLOWED.some((a) => path.startsWith(a)) || path.includes('..') || !/^[\w./-]+$/.test(path)) {
          res.statusCode = 400;
          return res.end('not allowed');
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const file = join(server.config.root, path);
          mkdirSync(dirname(file), { recursive: true });
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
  plugins: [shots(), saves()],
});
