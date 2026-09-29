import { Application } from 'pixi.js';
import { LocalHostConnection } from './connection';
import { GameClient } from './game';
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

  // M0: this tab is the host. M2 adds "host a lobby" / "join with a code" in front of this.
  const conn = new LocalHostConnection();
  const game = new GameClient(app, conn, document.getElementById('hud')!);
  conn.send({ t: 'join', name: 'You', champion: 'marksman' });
  if (import.meta.env.DEV) Object.assign(window, { game }); // poke at it from devtools
}

void boot();
