import { MAP, type MapData } from '../map/mapData';
import { CrabSpawner } from './crab';
import { MapEvents } from './events';
import { Fountain } from './fountain';
import { Jungle } from './jungle';
import { spawnStructures } from './structure';
import { WardenLair } from './warden';
import { WaveSpawner } from './waves';
import { World } from './world';

/**
 * A new match, not started: the map's structures, the fountains, the jungle, the crabs, the waves, the
 * Warden and the map events. The host and the balance simulator both start from here, so they play the
 * same game.
 */
export function freshMatch(map: MapData = MAP): { world: World; waves: WaveSpawner; lair: WardenLair; events: MapEvents } {
  const world = new World(map);
  const waves = world.addSystem(new WaveSpawner());
  const lair = world.addSystem(new WardenLair());
  spawnStructures(world);
  world.addSystem(new Fountain());
  world.addSystem(new Jungle(world));
  world.addSystem(new CrabSpawner(world));
  const events = world.addSystem(new MapEvents(world));
  return { world, waves, lair, events };
}
