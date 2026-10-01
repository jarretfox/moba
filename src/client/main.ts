import { Application } from 'pixi.js';
import { CHAMPION_INFO } from '../shared/champions/registry';
import type { ChampionId } from '../shared/champions/types';
import { GameClient } from './game';
import { PORTRAITS, renderPortraits } from './render/champions';
import { renderIcons } from './render/icons';
import { MenuBackdrop } from './render/backdrop';
import type { Connection } from './net/connection';
import { HostWorker } from './net/hostWorker';
import { PeerHost, PeerLink, normalizeCode } from './net/peer';
import { LobbyScreen } from './ui/lobby';
import { showMenu, type MenuChoice } from './ui/menu';
import './style.css';

/** Waits (briefly) for the game's web fonts, so text drawn on the canvas doesn't start in a fallback font. */
async function loadFonts(): Promise<void> {
  const wait = Promise.all(['24px "Lilita One"', '700 16px Nunito', '800 16px Nunito'].map((f) => document.fonts.load(f)));
  await Promise.race([wait.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 2500))]);
}

async function boot(): Promise<void> {
  const fonts = loadFonts();
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x121811,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });
  document.getElementById('stage')!.appendChild(app.canvas);
  Object.assign(PORTRAITS, renderPortraits(app.renderer, Object.keys(CHAMPION_INFO) as ChampionId[]));
  renderIcons(app.renderer);
  await fonts;
  const hudRoot = document.getElementById('hud')!;
  // The map at dusk behind the menu, until the match screen takes over.
  const backdrop = new MenuBackdrop(app);

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

  backdrop.destroy();
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
