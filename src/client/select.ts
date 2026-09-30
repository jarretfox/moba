import { CHAMPION_INFO } from '../shared/champions/registry';
import type { ChampionId } from '../shared/champions/types';
import { SLOT_KEYS } from '../shared/constants';

/** Pre-game champion pick. Resolves with the chosen champion; the match doesn't start until then. */
export function pickChampion(root: HTMLElement): Promise<ChampionId> {
  return new Promise((resolve) => {
    const screen = el('div', 'select');
    screen.append(el('div', 'select-title', 'Choose your champion'));
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
        resolve(info.id);
      });
      cards.append(card);
    }
    screen.append(cards);
    root.append(screen);
  });
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
