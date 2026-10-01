import { CHAMPION_INFO } from '../shared/champions/registry';
import { TEAM, type Team } from '../shared/constants';
import { ITEMS } from '../shared/items';
import type { ScoreRow } from '../shared/protocol';
import { portraitOf } from './render/champions';
import { iconEl } from './render/icons';
import { el } from './ui/dom';

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * The match's most valuable player: the best showing on the winning team (or anyone, if nobody won),
 * counting kills and assists, damage to champions and structures, and holding deaths against them.
 */
export function pickMvp(rows: readonly ScoreRow[], winner: Team | undefined): ScoreRow | undefined {
  const pool = winner !== undefined && rows.some((r) => r.team === winner) ? rows.filter((r) => r.team === winner) : rows;
  const value = (r: ScoreRow) => r.k * 3 + r.a * 1.5 - r.d * 1.5 + r.dmg / 600 + r.tdmg / 1500;
  return [...pool].sort((a, b) => value(b) - value(a))[0];
}

/** A card for the end screen: the MVP's portrait, name and numbers. */
export function mvpCard(r: ScoreRow): HTMLElement {
  const card = el('div', 'mvp');
  const face = el('img', 'mvp-face');
  face.src = portraitOf(r.champ, r.skin ?? 0) ?? '';
  face.alt = '';
  const who = el('div', 'mvp-who');
  who.append(el('div', 'mvp-badge', 'MVP'), el('div', 'mvp-name', r.name), el('div', 'mvp-line', `${CHAMPION_INFO[r.champ].name} · ${r.k} / ${r.d} / ${r.a} · ${k(r.dmg)} damage`));
  card.append(face, who);
  return card;
}

/** Both teams side by side: champion, level, K/D/A, CS, damage to champions, gold and items. Your team first. */
export function scoreTables(rows: readonly ScoreRow[], myTeam: Team, meId: number): HTMLElement {
  const wrap = el('div', 'score-tables');
  const teams = myTeam === TEAM.red ? [TEAM.red, TEAM.blue] : [TEAM.blue, TEAM.red];
  for (const team of teams) {
    const mine = rows.filter((r) => r.team === team);
    const kills = mine.reduce((n, r) => n + r.k, 0);
    const table = el('div', `score-team ${team === myTeam ? 'ours' : 'theirs'}`);
    table.append(el('div', 'score-head', `${team === myTeam ? 'Your team' : 'Enemy team'} · ${kills} kills`));
    for (const r of mine) {
      const row = el('div', `score-row${r.id === meId ? ' you' : ''}`);
      const face = el('img', 'score-face');
      face.src = portraitOf(r.champ, r.skin ?? 0) ?? '';
      face.alt = '';
      const who = el('div', 'score-who');
      who.append(el('b', '', r.name), el('span', '', `${CHAMPION_INFO[r.champ].name} · Lv ${r.lv}`));
      const items = el('div', 'score-items');
      for (const id of r.items) {
        const it = el('span', `score-item tier-${ITEMS[id].tier}`);
        it.append(iconEl(ITEMS[id].icon));
        it.title = ITEMS[id].name;
        items.append(it);
      }
      row.append(face, who, el('div', 'score-kda', `${r.k} / ${r.d} / ${r.a}`), el('div', 'score-num', `${r.cs} CS`), el('div', 'score-num', `${k(r.dmg)} dmg`), el('div', 'score-num gold', `${k(r.gold)}g`), items);
      table.append(row);
    }
    wrap.append(table);
  }
  return wrap;
}

/**
 * The match in plain text, made for pasting back to whoever's balancing the game: who played what,
 * who won, and each champion's numbers.
 */
export function matchReport(rows: readonly ScoreRow[], winner: Team | undefined, time: number): string {
  const lines = [`Blokes match report · ${new Date().toISOString().slice(0, 10)} · ${mmss(time)} · ${winner === TEAM.blue ? 'Blue won' : winner === TEAM.red ? 'Red won' : 'unfinished'}`];
  for (const team of [TEAM.blue, TEAM.red]) {
    lines.push(`${team === TEAM.blue ? 'BLUE' : 'RED'}${winner === team ? ' (won)' : ''}`);
    for (const r of rows.filter((x) => x.team === team)) {
      const items = r.items.map((id) => ITEMS[id].name).join(', ') || 'no items';
      lines.push(
        `  ${r.name} (${CHAMPION_INFO[r.champ].name}) Lv${r.lv} ${r.k}/${r.d}/${r.a} · CS ${r.cs} · dmg ${k(r.dmg)} · taken ${k(r.taken)} · towers ${k(r.tdmg)} · gold ${k(r.gold)} · ${items}`,
      );
    }
  }
  return lines.join('\n');
}
