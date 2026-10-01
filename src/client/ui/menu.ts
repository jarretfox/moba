import type { MatchMode } from '../../shared/protocol';
import { el } from './dom';
import { settingsPanel } from '../settings';
import { logo } from './logo';
import { showProfile } from './profileScreen';

export type MenuChoice = { kind: 'solo'; mode: MatchMode } | { kind: 'host' } | { kind: 'join'; code: string };

const NAME_KEY = 'moba.name';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return ''; // storage can be blocked; the name box just starts empty
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // not worth bothering the player about
  }
}

/** The first screen: your name, then play solo, host a lobby, or join one with a code. */
export function showMenu(root: HTMLElement, error?: string): Promise<{ choice: MenuChoice; name: string }> {
  return new Promise((resolve) => {
    const screen = el('div', 'menu');
    const gear = el('button', 'menu-gear', '⚙');
    gear.title = 'Settings';
    gear.addEventListener('click', () => {
      const box = el('div', 'menu-settings');
      const panel = el('div', 'esc-panel');
      const close = el('button', 'settings-close', 'Done');
      close.addEventListener('click', () => box.remove());
      box.addEventListener('click', (e) => {
        if (e.target === box) box.remove();
      });
      panel.append(el('div', 'esc-title', 'Settings'), settingsPanel(), close);
      close.style.marginTop = '16px';
      close.style.width = '100%';
      box.append(panel);
      root.append(box);
    });
    screen.append(gear);
    const profile = el('button', 'menu-profile', 'Profile');
    profile.title = 'Your record and titles';
    profile.addEventListener('click', () => showProfile(root));
    screen.append(profile);
    const nameInput = el('input', 'menu-name');
    nameInput.placeholder = 'Your name';
    nameInput.maxLength = 16;
    nameInput.value = savedName();

    const codeInput = el('input', 'menu-code');
    codeInput.placeholder = 'CODE';
    codeInput.maxLength = 5;
    codeInput.autocomplete = 'off';

    const done = (choice: MenuChoice) => {
      const name = nameInput.value.trim() || 'Player';
      saveName(name);
      screen.remove();
      resolve({ choice, name });
    };
    const join = () => {
      const code = codeInput.value.trim();
      if (code.length === 5) done({ kind: 'join', code });
      else codeInput.focus();
    };

    const button = (label: string, hint: string, onClick: () => void, extra = '') => {
      const b = el('button', `menu-button ${extra}`);
      b.append(el('div', 'menu-button-label', label), el('div', 'menu-button-hint', hint));
      b.addEventListener('click', onClick);
      return b;
    };

    const joinRow = el('div', 'menu-join');
    const joinButton = el('button', 'menu-join-button', 'Join');
    joinButton.addEventListener('click', join);
    codeInput.addEventListener('keydown', (e) => e.key === 'Enter' && join());
    joinRow.append(codeInput, joinButton);

    screen.append(
      logo(),
      nameInput,
      button('Play vs Bots', 'You and 2 bots against 3 bots', () => done({ kind: 'solo', mode: 'bots' }), 'primary'),
      button('Host a Lobby', 'Get a code for your friends; bots fill empty slots', () => done({ kind: 'host' })),
      el('div', 'menu-or', 'or join a friend'),
      joinRow,
      button('Practice Range', 'Just you, the Chud waves and training dummies', () => done({ kind: 'solo', mode: 'practice' })),
    );
    if (error) screen.append(el('div', 'menu-error', error));
    root.append(screen);
  });
}
