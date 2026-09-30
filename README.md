# MOBA

3v3 browser MOBA for friends. See [DESIGN.md](DESIGN.md) for the game design, lore, and architecture.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. You spawn in Da Base as the Marksman; the practice dummies are through the back door into the jungle, to the right.

## Controls

| Input | Action |
|---|---|
| Right-click | Move / attack (hold to keep steering) |
| Q W E R | Hold to aim, release to cast (or left-click while aiming) |
| S | Stop |
| Space | Center camera (hold) |
| Y | Lock / unlock camera (unlocked: pan at screen edges) |
| Wheel | Zoom |
| `` ` `` | Nav grid overlay |

## Checks

```bash
npm test
```

Runs the headless sim tests (Vitest). No browser needed. The game logic runs the same in Node as in the host's Web Worker.

```bash
npm run build
```

Type-checks and builds to `dist/`.
