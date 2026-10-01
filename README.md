# MOBA

3v3 browser MOBA for friends. **Play it: https://jarretfox.github.io/moba/**

See [DESIGN.md](DESIGN.md) for the game design, lore, and architecture.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173:

- **Play vs Bots:** you and 2 bots against 3 bots. Destroy their Da Base.
- **Host a Lobby:** you get a 5-letter code. Friends open the game, type it under "or join a friend", pick teams and champions, and you start the match. Bots fill any empty slots.
- **Practice Range:** just you, the Chud waves, and training dummies through the back door into the jungle.

Friends can only reach your lobby once the game is hosted online (see DESIGN.md); on `localhost`, two browser tabs on your own machine work for testing.

## Put it online (GitHub Pages)

`.github/workflows/deploy.yml` tests, builds and publishes the game on every push to `main`. One-time setup:

1. Create an empty repository on GitHub (no README or license). It needs to be public for free GitHub Pages.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push this project to it. The game appears at `https://<your-username>.github.io/<repo-name>/` a minute or two later.

Friends just open that link. Whoever clicks **Host a Lobby** runs the match in their browser; everyone else joins with the code.

## Controls

| Input | Action |
|---|---|
| Right-click | Move / attack (hold to keep steering) |
| Q W E R | Hold to aim, release to cast (or left-click while aiming) |
| Shift+Q W E R | Level up an ability (or click the + above it) |
| S | Stop |
| B | Recall home (4s channel, breaks if you take damage) |
| P | Shop (buy and sell in your fountain, or while dead) |
| M | Mute / unmute sound |
| Tab | Scoreboard (hold) |
| Space | Center camera (hold) |
| Y | Lock / unlock camera (unlocked: pan at screen edges) |
| Wheel | Zoom |
| `` ` `` | Nav grid overlay |

## Balance simulator

Runs bots-only matches with random lineups on every CPU core and prints win rates (with 95% ranges), K/D/A, CS, damage, gold and level per champion:

```bash
npm run sim -- --games 240 --seed 1
```

Options: `--games`, `--seed` (first seed; the same seed replays the same match), `--workers`, `--minutes` (time limit per match), `--json results.json` (every match, for digging deeper). Bots aren't people, so treat it as a way to spot outliers.

## Checks

```bash
npm test
```

Runs the headless sim tests (Vitest). No browser needed. The game logic runs the same in Node as in the host's Web Worker.

```bash
npm run build
```

Type-checks and builds to `dist/`.
