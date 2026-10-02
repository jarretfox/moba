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

/** Rivals have words for each other when they meet across the map: Logan and King Rix above all. */
const RIVALRIES: { pair: [ChampionId, ChampionId]; lines: [IntroLine, IntroLine][] }[] = [
  {
    pair: ['logan', 'kingrix'],
    lines: [
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
    ],
  },
  {
    pair: ['daltonomo', 'kingrix'],
    lines: [
      [
        { champ: 'kingrix', text: 'I had you thrown into the Deep.' },
        { champ: 'daltonomo', text: 'And I brought back souvenirs, Your Majesty!' },
      ],
    ],
  },
  {
    pair: ['daltonomo', 'marksman'],
    lines: [
      [
        { champ: 'marksman', text: 'No running, no jumping, no clowning.' },
        { champ: 'daltonomo', text: 'Three out of three, then!' },
      ],
    ],
  },
  {
    pair: ['marksman', 'willmore'],
    lines: [
      [
        { champ: 'marksman', text: 'A Chud. Out of the gutter. Unlicensed.' },
        { champ: 'willmore', text: 'Heh. Wanna see my license? It’s a boot.' },
      ],
    ],
  },
  {
    pair: ['marksman', 'hunnag'],
    lines: [
      [
        { champ: 'marksman', text: 'That fungus is a code violation.' },
        { champ: 'hunnag', text: 'Breathe deep, little rule-keeper.' },
      ],
    ],
  },
  {
    pair: ['havarti', 'dabber'],
    lines: [
      [
        { champ: 'dabber', text: 'Is that... cheese? Hehehe.' },
        { champ: 'havarti', text: 'Touch me and perish, vermin.' },
      ],
      [
        { champ: 'havarti', text: 'I smell rat.' },
        { champ: 'dabber', text: 'I smell lunch.' },
      ],
    ],
  },
  {
    pair: ['havarti', 'hunnag'],
    lines: [
      [
        { champ: 'hunnag', text: 'Six hundred years old? You must be ripe.' },
        { champ: 'havarti', text: 'Aged, not rotten. Learn the difference.' },
      ],
    ],
  },
  {
    pair: ['paris', 'kingrix'],
    lines: [
      [
        { champ: 'kingrix', text: 'You dare raise a blade to your king?' },
        { champ: 'paris', text: 'You were never my king. Merely my worst student.' },
      ],
      [
        { champ: 'paris', text: 'En garde, Your Majesty.' },
        { champ: 'kingrix', text: 'Guards! Seize the fencing teacher!' },
      ],
    ],
  },
  {
    pair: ['dongmaster', 'barbarian'],
    lines: [
      [
        { champ: 'barbarian', text: 'Nobody’s jaw is that square. Who’s funding you?' },
        { champ: 'dongmaster', text: 'Discipline, brother.' },
      ],
      [
        { champ: 'dongmaster', text: 'Nice chains. Do you even lift them?' },
        { champ: 'barbarian', text: 'Chains are how THEY control you!' },
      ],
    ],
  },
];

/**
 * What gets said as the match opens, if anything: the rivals trading words when they're on opposite
 * sides, a remark on a mirror match, or a warning from the Deep. `n` picks among the options.
 */
export function introLines(rows: readonly ScoreRow[], n: number): IntroLine[] {
  const on = (champ: ChampionId) => new Set(rows.filter((r) => r.champ === champ).map((r) => r.team));
  for (const { pair, lines } of RIVALRIES) {
    const [a, b] = pair.map(on);
    if ([...a].some((team) => [...b].some((other) => other !== team))) return lines[n % lines.length];
  }
  const mirror = rows.find((r) => rows.some((o) => o.champ === r.champ && o.team !== r.team));
  if (mirror) return [{ text: `Two ${CHAMPION_INFO[mirror.champ].name.replace(/^The /, '')}s? This map isn’t big enough.` }];
  if (rows.some((r) => r.champ === 'willmore' || r.champ === 'hunnag')) return [{ text: 'Somewhere under the river, the Warden stirs...' }];
  return [];
}

/** Shows the intro over `root`. Calls `onDone` once it's gone, whether it ran out or was skipped. */
export function showIntro(root: HTMLElement, rows: readonly ScoreRow[], myTeam: Team, meId: number, n: number, onDone: () => void): () => void {
  // More than three a side (ARAM): smaller cards, so all five fit.
  const big = Math.max(...[true, false].map((ours) => rows.filter((r) => (r.team === myTeam) === ours).length)) > 3;
  const box = el('div', `intro${big ? ' big' : ''}`);
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
