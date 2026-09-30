import { CHAMPION_INFO, createChampion } from '../champions/registry';
import type { ChampionId } from '../champions/types';
import type { PlayerTeam } from '../constants';
import type { Lane } from '../map/mapData';
import type { World } from '../sim/world';
import { Bot } from './bot';

/** Who fills a team's slots, in order: a solo top lane and a duo bot lane. Two champions exist, so repeats are allowed for now. */
const SLOTS: { lane: Lane; champion: ChampionId }[] = [
  { lane: 'top', champion: 'barbarian' },
  { lane: 'bot', champion: 'marksman' },
  { lane: 'bot', champion: 'barbarian' },
];

export const TEAM_SIZE = 3;

/** A lane for a bot taking over a champion mid-match: top if no bot of that team is there yet, else the duo lane. */
export function laneForNewBot(bots: Bot[], team: PlayerTeam): Lane {
  return bots.some((b) => b.champion.team === team && b.lane === 'top') ? 'bot' : 'top';
}

/** Adds `count` bot champions to a team, filling its slots in order. */
export function addBots(world: World, team: PlayerTeam, count: number): Bot[] {
  return SLOTS.slice(0, count).map(({ lane, champion }) => {
    const unit = world.add(createChampion(champion, world, team));
    unit.name = `Bot ${CHAMPION_INFO[champion].name}`;
    return new Bot(unit, lane, world);
  });
}
