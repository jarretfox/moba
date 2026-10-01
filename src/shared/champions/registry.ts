import type { PlayerTeam } from '../constants';
import type { World } from '../sim/world';
import { BARBARIAN_INFO, Barbarian } from './barbarian';
import type { Champion } from './champion';
import { MARKSMAN_INFO, Marksman } from './marksman';
import type { ChampionId, ChampionInfo } from './types';
import { HUNNAG_INFO, HunnaG } from './hunnag';
import { KING_RIX_INFO, KingRix } from './kingrix';
import { LOGAN_INFO, Logan } from './logan';
import { WILLMORE_INFO, Willmore } from './willmore';
import { DONGMASTER_INFO, Dongmaster } from './dongmaster';

export const CHAMPION_INFO: Record<ChampionId, ChampionInfo> = {
  marksman: MARKSMAN_INFO,
  barbarian: BARBARIAN_INFO,
  willmore: WILLMORE_INFO,
  hunnag: HUNNAG_INFO,
  logan: LOGAN_INFO,
  kingrix: KING_RIX_INFO,
  dongmaster: DONGMASTER_INFO,
};

const CONSTRUCTORS: Record<ChampionId, new (world: World, team: PlayerTeam) => Champion> = {
  marksman: Marksman,
  barbarian: Barbarian,
  willmore: Willmore,
  hunnag: HunnaG,
  logan: Logan,
  kingrix: KingRix,
  dongmaster: Dongmaster,
};

export function createChampion(id: ChampionId, world: World, team: PlayerTeam): Champion {
  const Ctor = Object.hasOwn(CONSTRUCTORS, id) ? CONSTRUCTORS[id] : Marksman; // unknown ids from a remote client fall back rather than crash
  return new Ctor(world, team);
}
