import type { MapId } from '../map/mapData';
import { MAPS } from '../map/maps';
import { CrabSpawner } from './crab';
import { MapEvents } from './events';
import { Fountain } from './fountain';
import { Jungle } from './jungle';
import { RelicGarden } from './relics';
import { spawnStructures } from './structure';
import { WardenLair } from './warden';
import { WaveSpawner } from './waves';
import { World } from './world';

/** ARAM's pace: more gold and experience, quicker deaths, everyone starting at level 3 with more gold. */
export const ARAM = { rates: { gold: 1.35, xp: 1.3, respawn: 0.7 }, startLevel: 3, startGold: 1400 };

/**
 * A new match, not started. On the Rift: the structures, the fountains, the jungle, the crabs, the waves,
 * the Warden and the map events. On the Howling Hollow (ARAM): the structures, the fountains, one lane of
 * waves and the pumpkins. The host and the balance simulator both start from here, so they play the same
 * game.
 */
export function freshMatch(mapId: MapId = 'rift'): { world: World; waves: WaveSpawner; lair: WardenLair | null; events: MapEvents } {
  const map = MAPS[mapId];
  const world = new World(map);
  const waves = world.addSystem(new WaveSpawner());
  const lair = map.aram ? null : world.addSystem(new WardenLair());
  spawnStructures(world);
  world.addSystem(new Fountain());
  if (map.camps.length) world.addSystem(new Jungle(world));
  if (!map.aram) world.addSystem(new CrabSpawner(world));
  const events = world.addSystem(new MapEvents(world));
  if (map.relics?.length) world.addSystem(new RelicGarden(world));
  if (map.aram) world.rates = { ...ARAM.rates };
  return { world, waves, lair, events };
}
