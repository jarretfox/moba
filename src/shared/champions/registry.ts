import type { PlayerTeam } from '../constants';
import type { World } from '../sim/world';
import type { Champion } from './champion';
import { MARKSMAN_INFO, Marksman } from './marksman';
import type { ChampionId, ChampionInfo } from './types';

export const CHAMPION_INFO: Record<ChampionId, ChampionInfo> = {
  marksman: MARKSMAN_INFO,
};

const CONSTRUCTORS: Record<ChampionId, new (world: World, team: PlayerTeam) => Champion> = {
  marksman: Marksman,
};

export function createChampion(id: ChampionId, world: World, team: PlayerTeam): Champion {
  const Ctor = CONSTRUCTORS[id] ?? Marksman; // unknown ids from a remote client fall back rather than crash
  return new Ctor(world, team);
}
