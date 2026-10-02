import { Application } from 'pixi.js';
import { CHAMPION_INFO } from '../shared/champions/registry';
import type { ChampionId } from '../shared/champions/types';
import { GameClient } from './game';
import { PORTRAITS, renderPortraits } from './render/champions';
import { renderIcons } from './render/icons';
import { installInkUi } from './ui/ink';
import { MenuBackdrop } from './render/backdrop';
import { getSound } from './audio';
import { onSettings } from './settings';
import type { Connection } from './net/connection';
import { HostWorker } from './net/hostWorker';
import { PeerHost, PeerLink, normalizeCode } from './net/peer';
import { ChatBox } from './ui/chat';
import { loadProfile } from './profile';
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
  // Dev only: shot('name', scale) saves the game's picture (not the HTML interface) to .shots/name.png.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      shot: async (name = 'shot', scale = 0.6) => {
        app.render();
        const canvas = app.renderer.extract.canvas({ target: app.stage, frame: app.screen, resolution: scale, clearColor: '#121811' }) as HTMLCanvasElement;
        const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
        return blob ? (await fetch(`__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob })).text() : 'no picture';
      },
    });
  }
  Object.assign(PORTRAITS, renderPortraits(app.renderer, Object.keys(CHAMPION_INFO) as ChampionId[]));
  renderIcons(app.renderer);
  installInkUi();
  await fonts;
  onSettings((s) => {
    if (s.quality === 'low' && app.renderer.resolution !== 1) app.renderer.resize(app.screen.width, app.screen.height, 1);
    document.documentElement.style.setProperty('--ui', String(s.uiScale));
    document.documentElement.classList.toggle('colorblind', s.colorblind);
  });
  // Soft ticks as the pointer moves over things you can click, and a click when you do.
  const clickable = (t: EventTarget | null) => (t instanceof Element ? t.closest('button, .select-card, .skin-dot, .menu-gear') : null);
  let hovered: Element | null = null;
  document.addEventListener('pointerover', (e) => {
    const c = clickable(e.target);
    if (c && c !== hovered) getSound().playIfReady('hover', 0.6);
    hovered = c;
  });
  document.addEventListener('click', (e) => {
    if (clickable(e.target)) getSound().play('click', 0.4);
  });
  // The loading splash fades away now that everything's ready.
  const splash = document.getElementById('splash');
  if (splash) {
    splash.classList.add('done');
    setTimeout(() => splash.remove(), 700);
  }
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
        if (import.meta.env.DEV) Object.assign(window, { hostWorker: host }); // e.g. hostWorker.worker.postMessage({ conn: 'local', devWin: 1 })
        conn = host.localLink();
        if (choice.kind === 'host') code = await new PeerHost(host).open();
      }
      break;
    } catch (err) {
      error = (err as Error).message;
    }
  }

  backdrop.destroy();
  const title = choice.kind === 'solo' && choice.mode === 'practice' ? 'Practice Range' : choice.kind === 'solo' ? 'Match vs Bots' : `Lobby ${code}`;
  const newGame = () => {
    const g = new GameClient(app, conn, hudRoot);
    if (import.meta.env.DEV) Object.assign(window, { game: g }); // poke at it from devtools
    g.setTitle(title);
    g.onRematch = (swap) => {
      getSound().play('rematch', 0.6);
      conn.send({ t: 'rematch', swap });
    };
    return g;
  };
  const newLobby = () =>
    new LobbyScreen(hudRoot, {
      solo: choice.kind === 'solo' ? choice.mode : undefined,
      code: choice.kind === 'host' ? code : undefined,
      onPick: (pick) => conn.send({ t: 'pick', ...pick }),
      onStart: (mode) => conn.send({ t: 'start', mode }),
      onSettings: (settings) => conn.send({ t: 'settings', settings }),
    });
  let game = newGame();
  let lobby = newLobby();
  /** A match has been played on this screen: the next lobby is a rematch, on a fresh one. */
  let played = false;

  // Team and all chat, for the whole session (over the HUD, so it outlasts the match screens).
  const chat = new ChatBox(document.body, (text, all) => conn.send({ t: 'chat', text, all }));
  chat.onLine = () => getSound().playIfReady('chat', 0.5);

  conn.listen((msg) => {
    if (msg.t === 'chat') {
      chat.add(msg);
    } else if (msg.t === 'lobby') {
      const me = msg.lobby.players.find((p) => p.id === msg.you);
      if (me) chat.setTeam(me.team);
      game.setHost(!!me?.host);
      if (msg.lobby.phase === 'lobby') {
        if (played) {
          // Rematch: a fresh match screen and lobby, picks and settings as they were.
          played = false;
          game.destroy();
          lobby.close();
          hudRoot.replaceChildren();
          game = newGame();
          game.setHost(!!me?.host);
          lobby = newLobby();
        }
        lobby.update(msg.lobby, msg.you);
      }
    } else if (msg.t === 'rematch') {
      game.rematchVotes(msg.votes, msg.of);
    } else if (msg.t === 'refused') {
      lobby.close();
      game.showNotice("Couldn't join", msg.reason);
    } else {
      if (msg.t === 'welcome') {
        lobby.close();
        played = true;
        if (msg.team === 1 || msg.team === 2) chat.setTeam(msg.team);
      }
      game.handle(msg);
    }
  });
  conn.onClose((reason) => {
    lobby.close();
    game.showNotice('Disconnected', reason);
  });
  conn.send({ t: 'hello', name, title: loadProfile().title });
}

void boot();
