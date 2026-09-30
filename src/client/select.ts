import { CHAMPION_INFO } from '../shared/champions/registry';
import type { ChampionId } from '../shared/champions/types';
import { SLOT_KEYS } from '../shared/constants';
import type { MatchMode } from '../shared/protocol';

const MODES: { mode: MatchMode; label: string; hint: string }[] = [
  { mode: 'bots', label: 'Match vs Bots', hint: 'You and 2 bots against 3 bots' },
  { mode: 'practice', label: 'Practice Range', hint: 'Just you, the Chud waves and training dummies' },
];

/** Pre-game screen: pick a mode and a champion. The match doesn't start until you do. */
export function pickChampion(root: HTMLElement): Promise<{ champion: ChampionId; mode: MatchMode }> {
  return new Promise((resolve) => {
    let mode: MatchMode = 'bots';
    const screen = el('div', 'select');

    const modes = el('div', 'select-modes');
    const modeButtons = MODES.map((m) => {
      const b = el('button', 'select-mode');
      b.append(el('div', 'select-mode-label', m.label), el('div', 'select-mode-hint', m.hint));
      b.addEventListener('click', () => {
        mode = m.mode;
        modeButtons.forEach((other, i) => other.classList.toggle('active', MODES[i].mode === mode));
      });
      modes.append(b);
      return b;
    });
    modeButtons[0].classList.add('active');

    const cards = el('div', 'select-cards');
    for (const info of Object.values(CHAMPION_INFO)) {
      const card = el('button', `select-card ${info.resource}`);
      card.append(
        el('div', 'select-name', info.name),
        el('div', 'select-sub', `${info.title} · ${info.resource === 'rage' ? 'Rage' : 'Mana'}`),
        el('div', 'select-passive', `Passive — ${info.passive.name}`),
      );
      const list = el('div', 'select-abilities');
      info.abilities.forEach((a, i) => {
        const row = el('div', 'select-ability');
        row.append(el('kbd', '', SLOT_KEYS[i]), document.createTextNode(` ${a.name}`));
        list.append(row);
      });
      card.append(list);
      card.addEventListener('click', () => {
        screen.remove();
        resolve({ champion: info.id, mode });
      });
      cards.append(card);
    }

    screen.append(modes, el('div', 'select-title', 'Choose your champion'), cards);
    root.append(screen);
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
