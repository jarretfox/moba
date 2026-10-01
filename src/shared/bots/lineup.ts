import { CHAMPION_INFO, createChampion } from '../champions/registry';
import type { ChampionId } from '../champions/types';
import type { PlayerTeam } from '../constants';
import type { Lane } from '../map/mapData';
import type { World } from '../sim/world';
import { Bot } from './bot';

/**
 * Who fills a team's slots, in order: a solo top lane, then a duo bot lane (a carry and a partner). Each
 * slot lists the champions that suit it; a bot takes one its team doesn't have yet.
 */
const SLOTS: { lane: Lane; picks: ChampionId[] }[] = [
  { lane: 'top', picks: ['barbarian', 'willmore', 'logan'] },
  { lane: 'bot', picks: ['marksman', 'kingrix', 'hunnag'] },
  { lane: 'bot', picks: ['hunnag', 'logan', 'kingrix', 'willmore'] },
];

export const TEAM_SIZE = 3;

/** A lane for a bot taking over a champion mid-match: top if no bot of that team is there yet, else the duo lane. */
export function laneForNewBot(bots: Bot[], team: PlayerTeam): Lane {
  return bots.some((b) => b.champion.team === team && b.lane === 'top') ? 'bot' : 'top';
}

/**
 * Adds `count` bot champions to a team, filling its slots in order, never repeating a champion the team
 * already has (`taken` lists the humans' picks). `random` picks among the suitable ones; tests leave it at
 * "always the first".
 */
export function addBots(world: World, team: PlayerTeam, count: number, taken: readonly ChampionId[] = [], random: () => number = () => 0): Bot[] {
  const have = new Set(taken);
  return SLOTS.slice(0, count).map(({ lane, picks }) => {
    let options = picks.filter((id) => !have.has(id));
    if (!options.length) options = (Object.keys(CHAMPION_INFO) as ChampionId[]).filter((id) => !have.has(id));
    if (!options.length) options = picks; // every champion is taken: a repeat beats an empty slot
    const champion = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
    have.add(champion);
    const unit = world.add(createChampion(champion, world, team));
    unit.name = `Bot ${CHAMPION_INFO[champion].name}`;
    return new Bot(unit, lane, world);
  });
}
