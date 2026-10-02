import { CHAMPION_INFO } from '../../shared/champions/registry';
import { TITLES } from '../../shared/titles';
import { earned, favourite, loadProfile, saveProfile } from '../profile';
import { portraitOf } from '../render/champions';
import { el } from './dom';

// Your profile, from the main menu: your record over every match played in this browser, and your titles.
// Pick one of the unlocked ones to wear under your name; the locked ones say how to earn them.

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, (now - at) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

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

  // The last few matches, newest first.
  const history = el('div', 'profile-history');
  if (!p.history.length) history.append(el('div', 'profile-sub', 'Your matches will show up here.'));
  for (const m of p.history) {
    const row = el('div', `history-row ${m.won ? 'won' : 'lost'}`);
    const face = el('img', 'history-face');
    face.src = portraitOf(m.champ, m.skin ?? 0) ?? '';
    face.alt = '';
    const what = el('div', 'history-what');
    what.append(el('b', '', CHAMPION_INFO[m.champ].name), el('span', '', `${m.map === 'aram' ? 'Howling Hollow' : 'The Rift'} · ${Math.floor(m.length / 60)}:${String(m.length % 60).padStart(2, '0')} · ${ago(m.at)}`));
    row.append(
      face,
      what,
      el('div', 'history-result', m.won ? 'Win' : 'Loss'),
      el('div', 'history-kda', `${m.k} / ${m.d} / ${m.a}`),
      el('div', 'history-cs', `${m.cs} CS`),
      el('div', 'history-mvp', m.mvp ? 'MVP' : ''),
    );
    history.append(row);
  }

  panel.append(
    el('div', 'esc-title', 'Your profile'),
    stats,
    favBox,
    el('div', 'profile-sub', 'Recent matches'),
    history,
    el('div', 'profile-sub', 'Titles (shown under your name; your pick is used from your next match)'),
    titles,
    close,
  );
  close.style.marginTop = '16px';
  close.style.width = '100%';
  box.append(panel);
  root.append(box);
}
