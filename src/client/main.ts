import { Application } from 'pixi.js';
import { GameClient } from './game';
import type { Connection } from './net/connection';
import { HostWorker } from './net/hostWorker';
import { PeerHost, PeerLink, normalizeCode } from './net/peer';
import { LobbyScreen } from './ui/lobby';
import { showMenu, type MenuChoice } from './ui/menu';
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
  const hudRoot = document.getElementById('hud')!;

  // Menu until we have a working connection: joining can fail (bad code, host gone).
  let error: string | undefined;
  let conn: Connection;
  let choice: MenuChoice;
  let name: string;
  let code: string | undefined;
  for (;;) {
    ({ choice, name } = await showMenu(hudRoot, error));
    try {
      if (choice.kind === 'join') {
        conn = await PeerLink.connect(choice.code);
        code = normalizeCode(choice.code);
      } else {
        const host = new HostWorker();
        conn = host.localLink();
        if (choice.kind === 'host') code = await new PeerHost(host).open();
      }
      break;
    } catch (err) {
      error = (err as Error).message;
    }
  }

  const game = new GameClient(app, conn, hudRoot);
  if (import.meta.env.DEV) Object.assign(window, { game }); // poke at it from devtools
  game.setTitle(choice.kind === 'solo' && choice.mode === 'practice' ? 'Practice Range' : choice.kind === 'solo' ? 'Match vs Bots' : `Lobby ${code}`);

  const lobby = new LobbyScreen(hudRoot, {
    solo: choice.kind === 'solo' ? choice.mode : undefined,
    code: choice.kind === 'host' ? code : undefined,
    onPick: (pick) => conn.send({ t: 'pick', ...pick }),
    onStart: (mode) => conn.send({ t: 'start', mode }),
  });

  conn.listen((msg) => {
    if (msg.t === 'lobby') {
      if (msg.lobby.phase === 'lobby') lobby.update(msg.lobby, msg.you);
    } else if (msg.t === 'refused') {
      lobby.close();
      game.showNotice("Couldn't join", msg.reason);
    } else {
      if (msg.t === 'welcome') lobby.close();
      game.handle(msg);
    }
  });
  conn.onClose((reason) => {
    lobby.close();
    game.showNotice('Disconnected', reason);
  });
  conn.send({ t: 'hello', name });
}

void boot();
