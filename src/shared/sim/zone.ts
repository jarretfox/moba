import type { Team } from '../constants';
import type { Vec2 } from '../math';
import type { EntitySnap } from '../protocol';
import type { Entity } from './entity';
import type { World } from './world';

/** A patch of ground that does something every tick while it lasts: HunnaG's sludge puddles and Mole Holes. */
export class Zone implements Entity {
  readonly kind = 'zone';
  readonly id: number;
  removed = false;
  private readonly expiresAt: number;

  constructor(
    world: World,
    public team: Team,
    public pos: Vec2,
    public radius: number,
    lifetime: number,
    private readonly vis: string,
    private readonly onTick: (world: World, zone: Zone) => void = () => {},
  ) {
    this.id = world.newId();
    this.expiresAt = world.time + lifetime;
  }

  update(world: World): void {
    if (world.time >= this.expiresAt) {
      this.removed = true;
      return;
    }
    this.onTick(world, this);
  }

  snapshot(): EntitySnap {
    return { id: this.id, k: 'zone', tm: this.team, x: Math.round(this.pos.x), y: Math.round(this.pos.y), f: 0, r: Math.round(this.radius), vis: this.vis };
  }
}
