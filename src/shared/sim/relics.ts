import { Champion } from '../champions/champion';
import { TEAM } from '../constants';
import { dist, type Vec2 } from '../math';
import type { EntitySnap } from '../protocol';
import type { Entity } from './entity';
import type { World, WorldSystem } from './world';

// ─── Tuning: health relics ────────────────────────────────────────────────────

/**
 * ARAM's health relics: glowing pumpkins along the lane. The first champion (either side) to walk over one
 * eats it: back comes a share of health and mana. Another grows in the same spot a while later.
 */
export const RELIC = {
  firstAt: 60,
  respawn: 40,
  radius: 40,
  heal: 0.15,
  mana: 0.15,
};

/** One pumpkin on the ground. Anyone can see it; the first champion to touch it takes it. */
export class Relic implements Entity {
  readonly kind = 'pickup';
  readonly team = TEAM.neutral;
  readonly id: number;
  removed = false;

  constructor(
    world: World,
    readonly pos: Vec2,
    private readonly onTaken: () => void,
  ) {
    this.id = world.newId();
  }

  get radius(): number {
    return RELIC.radius;
  }

  update(world: World): void {
    const eater = world.units().find((u) => u.kind === 'champion' && !u.dead && u.isTargetable() && dist(u.pos, this.pos) <= RELIC.radius + u.radius);
    if (!eater) return;
    this.removed = true;
    eater.heal(world, eater.stats.maxHp * RELIC.heal);
    if (eater instanceof Champion) eater.score.pumpkins++;
    if (eater.stats.maxMana > 0 && (eater as { info?: { resource: string } }).info?.resource === 'mana') eater.mana = Math.min(eater.stats.maxMana, eater.mana + eater.stats.maxMana * RELIC.mana);
    world.emit({ e: 'fx', fx: 'relic', x: Math.round(this.pos.x), y: Math.round(this.pos.y), team: eater.team });
    this.onTaken();
  }

  snapshot(): EntitySnap {
    return { id: this.id, k: 'pickup', tm: TEAM.neutral, x: Math.round(this.pos.x), y: Math.round(this.pos.y), f: 0, r: RELIC.radius, vis: 'pumpkin' };
  }
}

/** Grows the map's relics (if it has any spots for them) and regrows each a while after it's eaten. */
export class RelicGarden implements WorldSystem {
  private readonly spots: { at: Vec2; nextAt: number; relic: Relic | null }[];

  constructor(world: World) {
    this.spots = (world.map.relics ?? []).map((at) => ({ at, nextAt: RELIC.firstAt, relic: null }));
  }

  update(world: World): void {
    for (const s of this.spots) {
      if (s.relic || world.time < s.nextAt) continue;
      s.relic = world.add(
        new Relic(world, s.at, () => {
          s.relic = null;
          s.nextAt = world.time + RELIC.respawn;
        }),
      );
    }
  }
}
