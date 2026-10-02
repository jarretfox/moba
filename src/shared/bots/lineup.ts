import { CHAMPION_INFO, createChampion } from '../champions/registry';
import type { ChampionId } from '../champions/types';
import type { PlayerTeam } from '../constants';
import type { Lane } from '../map/mapData';
import type { World } from '../sim/world';
import { Bot } from './bot';

/**
 * Who fills a team's slots, in order: a solo top lane, a bot lane carry, and a jungler (who helps the bot
 * lane while the camps are down). Each slot lists the champions that suit it (an empty list: anyone); a bot
 * takes one its team doesn't have yet. The lists are spread so every champion turns up about as often as
 * any other.
 */
const SLOTS: { lane: Lane; picks: ChampionId[]; jungle?: boolean }[] = [
  { lane: 'top', picks: ['barbarian', 'willmore', 'logan', 'dongmaster', 'paris', 'daltonomo'] },
  { lane: 'bot', picks: ['marksman', 'dabber', 'hunnag', 'kingrix', 'havarti', 'scrimby', 'bigwhale'] },
  { lane: 'bot', picks: [], jungle: true },
];

export const TEAM_SIZE = 3;

/** A lane for a bot taking over a champion mid-match: top if no bot of that team is there yet, else the duo lane (ARAM: the one lane). */
export function laneForNewBot(bots: Bot[], team: PlayerTeam, aram = false): Lane {
  if (aram) return 'mid';
  return bots.some((b) => b.champion.team === team && b.lane === 'top') ? 'bot' : 'top';
}

/**
 * Adds `count` bot champions to a team, filling its slots in order, never repeating a champion the team
 * already has (`taken` lists the humans' picks). `random` picks among the suitable ones; tests leave it at
 * "always the first".
 */
export function addBots(world: World, team: PlayerTeam, count: number, taken: readonly ChampionId[] = [], random: () => number = () => 0): Bot[] {
  const have = new Set(taken);
  // ARAM: everyone in the one lane, any champion at all.
  const slots: { lane: Lane; picks: ChampionId[]; jungle?: boolean }[] = world.map.aram ? Array.from({ length: count }, () => ({ lane: 'mid' as Lane, picks: [] as ChampionId[] })) : SLOTS.slice(0, count);
  return slots.map(({ lane, picks, jungle }) => {
    let options = (picks.length ? picks : (Object.keys(CHAMPION_INFO) as ChampionId[])).filter((id) => !have.has(id));
    if (!options.length) options = (Object.keys(CHAMPION_INFO) as ChampionId[]).filter((id) => !have.has(id));
    if (!options.length) options = picks.length ? picks : (Object.keys(CHAMPION_INFO) as ChampionId[]); // every champion is taken: a repeat beats an empty slot
    const champion = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
    have.add(champion);
    const unit = world.add(createChampion(champion, world, team));
    unit.name = `Bot ${CHAMPION_INFO[champion].name.replace(/^The /, '')}`; // "Bot Oak", not "Bot The Oak"
    // The jungle slot only jungles when the whole team is bots (with people on it, they might want to).
    return new Bot(unit, lane, world, !!jungle && count >= SLOTS.length && world.map.camps.length > 0);
  });
}
