import { CHAMPION_INFO } from '../../shared/champions/registry';
import { TITLES } from '../../shared/titles';
import { earned, favourite, loadProfile, saveProfile } from '../profile';
import { portraitOf } from '../render/champions';
import { el } from './dom';

// Your profile, from the main menu: your record over every match played in this browser, and your titles.
// Pick one of the unlocked ones to wear under your name; the locked ones say how to earn them.

export function showProfile(root: HTMLElement): void {
  const p = loadProfile();
  const unlocked = earned(p);
  const box = el('div', 'menu-settings');
  const panel = el('div', 'esc-panel profile-panel');
  const close = el('button', 'settings-close', 'Done');
  close.addEventListener('click', () => box.remove());
  box.addEventListener('click', (e) => {
    if (e.target === box) box.remove();
  });

  // The numbers.
  const stats = el('div', 'profile-stats');
  const stat = (label: string, value: string) => {
    const s = el('div', 'profile-stat');
    s.append(el('b', '', value), el('span', '', label));
    stats.append(s);
  };
  stat('Matches', String(p.games));
  stat('Wins', `${p.wins}${p.games ? ` (${Math.round((p.wins / p.games) * 100)}%)` : ''}`);
  stat('K / D / A', `${p.kills} / ${p.deaths} / ${p.assists}`);
  stat('Last hits', String(p.cs));
  stat('MVPs', String(p.mvps));
  const fav = favourite(p);
  const favBox = el('div', 'profile-fav');
  if (fav) {
    const img = el('img', 'profile-face');
    img.src = portraitOf(fav) ?? '';
    img.alt = '';
    const rec = p.champs[fav]!;
    favBox.append(img, el('div', 'profile-fav-text', `Favourite: ${CHAMPION_INFO[fav].name} · ${rec.games} played, ${rec.wins} won`));
  } else favBox.append(el('div', 'profile-fav-text', 'Play a match and your record starts here.'));

  // The titles.
  const titles = el('div', 'profile-titles');
  const draw = () => {
    titles.replaceChildren();
    for (const t of TITLES) {
      const open = unlocked.has(t.id);
      const b = el('button', `profile-title${open ? '' : ' locked'}${p.title === t.id ? ' on' : ''}`, t.name);
      b.title = open ? (p.title === t.id ? 'Wearing it' : 'Wear this one') : t.hint;
      b.disabled = !open;
      b.addEventListener('click', () => {
        p.title = t.id;
        saveProfile(p);
        draw();
      });
      titles.append(b);
    }
  };
  draw();

  panel.append(el('div', 'esc-title', 'Your profile'), stats, favBox, el('div', 'profile-sub', 'Titles (shown under your name; your pick is used from your next match)'), titles, close);
  close.style.marginTop = '16px';
  close.style.width = '100%';
  box.append(panel);
  root.append(box);
}
