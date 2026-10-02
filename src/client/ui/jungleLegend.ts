import type { PlayerTeam, Team } from '../../shared/constants';
import type { CampKind, MapData } from '../../shared/map/mapData';
import type { WardenStatus } from '../../shared/protocol';
import { CRAB } from '../../shared/sim/crab';
import { RELIC } from '../../shared/sim/relics';
import { BUFFS, CAMPS, EMBER, FIRST_CAMP_SPAWN, GLOWCAP, MONSTERS } from '../../shared/sim/jungle';
import { UNCHAINED, WARDEN } from '../../shared/sim/warden';
import { bestiaryPortrait, type BestiaryKey } from '../render/bestiary';
import { el } from './dom';

// The jungle legend: hold Tab (with the scoreboard) to see what lives in the jungle, what each one pays,
// the buffs the big ones give, and when each camp is back, as far as your team has seen.

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The monster that has to die for a camp to be cleared (its leader). */
const LEADER: Record<CampKind, BestiaryKey> = { gutterRats: 'ratKing', mossback: 'mossback', emberToad: 'emberToad', glowcap: 'glowcap' };

interface Entry {
  /** Its portrait in the bestiary (or `emoji` instead). */
  key?: BestiaryKey;
  emoji?: string;
  name: string;
  /** What it pays, in a line. */
  pays: string;
  /** Its buff, if it gives one. */
  buff?: string;
  /** How it comes back. */
  timing: string;
  camp?: CampKind;
}

function campGold(kind: CampKind): { gold: number; xp: number } {
  return CAMPS[kind].members.reduce((sum, [m]) => ({ gold: sum.gold + MONSTERS[m].gold, xp: sum.xp + MONSTERS[m].xp }), { gold: 0, xp: 0 });
}

function entries(): Entry[] {
  const camp = (kind: CampKind, key: BestiaryKey, name: string, buff?: string): Entry => {
    const { gold, xp } = campGold(kind);
    return { key, name, pays: `${gold} gold · ${xp} xp`, buff, timing: `back ${mmss(CAMPS[kind].respawn)} after it's cleared`, camp: kind };
  };
  return [
    camp('gutterRats', 'ratKing', 'Gutter Rats'),
    camp('mossback', 'mossback', 'Mossback'),
    camp('emberToad', 'emberToad', 'Ember Toad', `${BUFFS.ember.name}, ${BUFFS.ember.duration}s: attacks burn (${EMBER.damage(0)} + ${EMBER.damage(1) - EMBER.damage(0)}/level true) and slow ${Math.round(EMBER.slow * 100)}%`),
    camp('glowcap', 'glowcap', 'Glowcap', `${BUFFS.glowcap.name}, ${BUFFS.glowcap.duration}s: +${GLOWCAP.haste} ability haste, ${Math.round(GLOWCAP.manaRegenPct * 100)}% mana a second`),
    {
      key: 'crab',
      name: 'Sewer Crab',
      pays: `${CRAB.gold} gold · ${CRAB.xp} xp`,
      buff: `Speed, and sight of its stretch of river for ${CRAB.sightFor}s`,
      timing: `from ${mmss(CRAB.firstAt)}, back ${mmss(CRAB.respawn)} after it's taken`,
    },
    {
      key: 'warden',
      name: 'The Warden',
      pays: `${WARDEN.reward.gold} gold · ${WARDEN.reward.xp} xp to everyone on the team`,
      buff: `Unchained, ${UNCHAINED.duration}s: your Chuds +${Math.round(UNCHAINED.hpBonus * 100)}% health and damage (Willmore or HunnaG: a Brute in every wave too)`,
      timing: `wakes at ${mmss(WARDEN.spawnAt)}, back ${mmss(WARDEN.respawn)} after he falls`,
    },
  ];
}

/** The Howling Hollow has no jungle: just the pumpkins. */
function hollowEntries(): Entry[] {
  return [
    {
      emoji: '🎃',
      name: 'Pumpkins',
      pays: `${Math.round(RELIC.heal * 100)}% health and ${Math.round(RELIC.mana * 100)}% mana to whoever gets there first`,
      buff: 'No recalling on the Hollow: eat pumpkins to keep going, or walk home to the fountain',
      timing: `from ${mmss(RELIC.firstAt)}, back ${mmss(RELIC.respawn)} after one's eaten`,
    },
  ];
}

export class JungleLegend {
  private readonly root = el('div', 'jungle-legend');
  /** Each entry's status line, by name. */
  private readonly status = new Map<string, HTMLElement>();
  /** When each camp (by its index in the map) is back, as far as we've seen. */
  private readonly campBack = new Map<number, number>();
  private readonly list: Entry[];

  constructor(
    hudRoot: HTMLElement,
    private readonly map: MapData,
  ) {
    this.list = map.aram ? hollowEntries() : entries();
    this.root.hidden = true;
    this.root.append(el('div', 'legend-title', map.aram ? 'The Howling Hollow' : 'The Jungle'));
    for (const e of this.list) {
      const row = el('div', 'legend-row');
      let face: HTMLElement;
      if (e.key) {
        const img = el('img', 'legend-face') as HTMLImageElement;
        img.src = bestiaryPortrait(e.key) ?? '';
        img.alt = '';
        face = img;
      } else face = el('div', 'legend-face legend-emoji', e.emoji ?? '');
      const text = el('div', 'legend-text');
      const pays = el('div', 'legend-pays', e.pays);
      pays.append(el('span', 'legend-timing', ` · ${e.timing}`));
      text.append(el('div', 'legend-name', e.name), pays);
      if (e.buff) text.append(el('div', 'legend-buff', e.buff));
      const status = el('div', 'legend-status');
      text.append(status);
      this.status.set(e.name, status);
      row.append(face, text);
      this.root.append(row);
    }
    if (!map.aram) this.root.append(el('div', 'legend-foot', 'Kill whoever has a jungle buff to take it. Timers start when your team sees a camp cleared.'));
    hudRoot.append(this.root);
  }

  /** A monster we could see died at (x, y): if it was a camp's leader, note when the camp's back. */
  noteDeath(mon: string, x: number, y: number, time: number): void {
    this.map.camps.forEach((c, i) => {
      if (LEADER[c.kind] !== mon || Math.hypot(c.pos.x - x, c.pos.y - y) > 400) return;
      this.campBack.set(i, time + CAMPS[c.kind].respawn);
    });
  }

  update(show: boolean, time: number, myTeam: Team, warden: WardenStatus | undefined): void {
    this.root.hidden = !show;
    if (!show) return;
    // Each camp kind: ours and theirs.
    for (const e of this.list) {
      const line = this.status.get(e.name)!;
      let text = '';
      if (e.camp && time < FIRST_CAMP_SPAWN) {
        text = `Spawns in ${mmss(FIRST_CAMP_SPAWN - time)}`;
      } else if (e.camp) {
        const sides = this.map.camps.map((c, i) => ({ c, i })).filter(({ c }) => c.kind === e.camp);
        text = sides
          .sort((a, b) => (a.c.side === myTeam ? -1 : 0) - (b.c.side === myTeam ? -1 : 0))
          .map(({ c, i }) => `${c.side === (myTeam as PlayerTeam) ? 'Ours' : 'Theirs'}: ${this.campState(i, time)}`)
          .join(' · ');
      } else if (e.key === 'crab') {
        text = time < CRAB.firstAt ? `Arrives in ${mmss(CRAB.firstAt - time)}` : '';
      } else if (e.emoji === '🎃') {
        text = time < RELIC.firstAt ? `Grow in ${mmss(RELIC.firstAt - time)}` : '';
      } else if (e.key === 'warden') {
        text = warden?.alive ? 'Awake in his pit' : warden?.wakesIn !== undefined ? `Wakes in ${mmss(warden.wakesIn)}` : '';
      }
      if (line.textContent !== text) line.textContent = text;
      line.hidden = !text;
    }
  }

  private campState(i: number, time: number): string {
    const back = this.campBack.get(i);
    if (back !== undefined && back > time) return `back in ${mmss(back - time)}`;
    return 'up';
  }
}
