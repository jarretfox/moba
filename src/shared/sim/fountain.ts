import { Champion } from '../champions/champion';
import { DT, type PlayerTeam } from '../constants';
import { dist } from '../math';
import type { World, WorldSystem } from './world';

/** How close to your spawn point counts as standing in the fountain. */
export const FOUNTAIN_RADIUS = 500;
/** Share of max health (and mana) restored per second in the fountain. */
const FOUNTAIN_REGEN = 0.12;

/** Champions standing in their own fountain heal up fast. Rage isn't refilled; it's earned in fights. */
export class Fountain implements WorldSystem {
  update(world: World): void {
    for (const u of world.units()) {
      if (!(u instanceof Champion) || u.dead) continue;
      if (dist(u.pos, world.map.spawns[u.team as PlayerTeam]) > FOUNTAIN_RADIUS) continue;
      u.hp = Math.min(u.stats.maxHp, u.hp + u.stats.maxHp * FOUNTAIN_REGEN * DT);
      if (u.info.resource === 'mana') u.mana = Math.min(u.stats.maxMana, u.mana + u.stats.maxMana * FOUNTAIN_REGEN * DT);
    }
  }
}
