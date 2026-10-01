import { CHAMPION_INFO } from '../shared/champions/registry';
import type { ChampionId } from '../shared/champions/types';
import type { Team } from '../shared/constants';
import type { ScoreRow } from '../shared/protocol';
import { portraitOf } from './render/champions';
import { el } from './ui/dom';

// The match intro: both teams side by side, a "VS" slammed down between them, and a word from anyone with
// a score to settle. It sits over the map for a few seconds as the match starts (any key or click skips it).

/** How long the intro stays up, in seconds. */
export const INTRO_TIME = 4.6;

export interface IntroLine {
  /** Who says it (missing for the narrator). */
  champ?: ChampionId;
  text: string;
}

/** Logan and King Rix have words for each other when they meet across the map. */
const RIVALRY: [IntroLine, IntroLine][] = [
  [
    { champ: 'logan', text: 'Your crown comes off today, Rix.' },
    { champ: 'kingrix', text: 'Back in your cage, kitten.' },
  ],
  [
    { champ: 'kingrix', text: 'You forget who fed you, lion.' },
    { champ: 'logan', text: 'I remember the bars. Every one.' },
  ],
  [
    { champ: 'logan', text: 'No more chains, Rix.' },
    { champ: 'kingrix', text: 'Every lion has a master.' },
  ],
];

/**
 * What gets said as the match opens, if anything: the rivals trading words when they're on opposite
 * sides, a remark on a mirror match, or a warning from the Deep. `n` picks among the options.
 */
export function introLines(rows: readonly ScoreRow[], n: number): IntroLine[] {
  const on = (champ: ChampionId) => new Set(rows.filter((r) => r.champ === champ).map((r) => r.team));
  const logan = on('logan');
  const rix = on('kingrix');
  const opposed = [...logan].some((team) => [...rix].some((other) => other !== team));
  if (opposed) return RIVALRY[n % RIVALRY.length];
  const mirror = rows.find((r) => rows.some((o) => o.champ === r.champ && o.team !== r.team));
  if (mirror) return [{ text: `Two ${CHAMPION_INFO[mirror.champ].name}s? This map isn’t big enough.` }];
  if (rows.some((r) => r.champ === 'willmore' || r.champ === 'hunnag')) return [{ text: 'Somewhere under the river, the Warden stirs...' }];
  return [];
}

/** Shows the intro over `root`. Calls `onDone` once it's gone, whether it ran out or was skipped. */
export function showIntro(root: HTMLElement, rows: readonly ScoreRow[], myTeam: Team, meId: number, n: number, onDone: () => void): () => void {
  const box = el('div', 'intro');
  const side = (ours: boolean) => {
    const col = el('div', `intro-side ${ours ? 'ours' : 'theirs'}`);
    col.append(el('div', 'intro-team', ours ? 'Your team' : 'Enemy team'));
    const cards = el('div', 'intro-cards');
    rows
      .filter((r) => (r.team === myTeam) === ours)
      .forEach((r, i) => {
        const card = el('div', `intro-card${r.id === meId ? ' you' : ''}`);
        card.style.animationDelay = `${0.15 + i * 0.14}s`;
        const face = el('img', 'intro-face');
        face.src = portraitOf(r.champ, r.skin ?? 0) ?? '';
        face.alt = '';
        const info = CHAMPION_INFO[r.champ];
        card.append(face, el('div', 'intro-champ', info.name), el('div', 'intro-title', info.title), el('div', 'intro-player', r.id === meId ? `${r.name} (you)` : r.name));
        cards.append(card);
      });
    col.append(cards);
    return col;
  };
  const vs = el('div', 'intro-vs', 'VS');
  const said = el('div', 'intro-said');
  introLines(rows, n).forEach((line, i) => {
    const row = el('div', `intro-line${line.champ ? '' : ' narrator'}`);
    row.style.animationDelay = `${1.5 + i * 1.1}s`;
    if (line.champ) {
      const face = el('img', 'intro-line-face');
      face.src = portraitOf(line.champ, rows.find((r) => r.champ === line.champ)?.skin ?? 0) ?? '';
      face.alt = '';
      row.append(face, el('b', '', `${CHAMPION_INFO[line.champ].name}:`), el('span', '', `“${line.text}”`));
    } else row.append(el('span', '', line.text));
    said.append(row);
  });
  box.append(side(true), vs, side(false), said, el('div', 'intro-skip', 'Click or press any key to skip'));
  root.append(box);

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    window.removeEventListener('keydown', finish, true);
    box.removeEventListener('pointerdown', finish);
    box.style.pointerEvents = 'none';
    box.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(1.04)' }], { duration: 450, easing: 'ease-in', fill: 'forwards' });
    setTimeout(() => box.remove(), 500);
    onDone();
  };
  const timer = setTimeout(finish, INTRO_TIME * 1000);
  window.addEventListener('keydown', finish, true);
  box.addEventListener('pointerdown', finish);
  return finish;
}
