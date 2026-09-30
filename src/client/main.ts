import { Application } from 'pixi.js';
import { LocalHostConnection } from './connection';
import { GameClient } from './game';
import { pickChampion } from './select';
import './style.css';

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x121811,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  document.getElementById('stage')!.appendChild(app.canvas);

  // This tab is the host. M2 adds "host a lobby" / "join with a code" in front of this.
  const conn = new LocalHostConnection();
  const hudRoot = document.getElementById('hud')!;
  const game = new GameClient(app, conn, hudRoot);
  if (import.meta.env.DEV) Object.assign(window, { game }); // poke at it from devtools

  const champion = await pickChampion(hudRoot);
  conn.send({ t: 'join', name: 'You', champion });
}

void boot();
