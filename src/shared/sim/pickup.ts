import type { Team } from '../constants';
import { dist, type Vec2 } from '../math';
import type { EntitySnap } from '../protocol';
import type { Entity } from './entity';
import type { Unit } from './unit';
import type { World } from './world';

/** Something on the ground that one unit can collect by walking over it, e.g. Willmore's scrap. */
export class Pickup implements Entity {
  readonly kind = 'pickup';
  readonly id: number;
  removed = false;
  private readonly expiresAt: number;

  constructor(
    world: World,
    readonly ownerId: number,
    public team: Team,
    public pos: Vec2,
    public radius: number,
    lifetime: number,
    private readonly vis: string,
    private readonly onPickup: (world: World, owner: Unit) => void,
  ) {
    this.id = world.newId();
    this.expiresAt = world.time + lifetime;
  }

  update(world: World): void {
    if (world.time >= this.expiresAt) {
      this.removed = true;
      return;
    }
    const owner = world.getUnit(this.ownerId);
    if (!owner || owner.dead || dist(owner.pos, this.pos) > this.radius + owner.radius) return;
    this.removed = true;
    this.onPickup(world, owner);
  }

  snapshot(): EntitySnap {
    return { id: this.id, k: 'pickup', tm: this.team, x: Math.round(this.pos.x), y: Math.round(this.pos.y), f: 0, r: this.radius, vis: this.vis };
  }
}
