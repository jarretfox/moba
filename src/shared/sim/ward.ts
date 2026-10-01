import type { Team } from '../constants';
import type { Vec2 } from '../math';
import type { EntitySnap } from '../protocol';
import type { Entity } from './entity';
import type { World } from './world';

/**
 * Sight left on the map for a while, for one team: the Glowworm Lantern's light (which sees into brush
 * and over walls) and the vision the Sewer Crab leaves behind. Its radius is how far it sees. Only its own
 * team knows it's there.
 */
export class Ward implements Entity {
  readonly kind = 'ward';
  readonly id: number;
  removed = false;
  private readonly expiresAt: number;

  constructor(
    world: World,
    public team: Team,
    public pos: Vec2,
    /** How far it sees. */
    public radius: number,
    lifetime: number,
    /** 'lantern' sees into brush and past walls; 'crab' is ordinary sight. */
    readonly vis: 'lantern' | 'crab',
  ) {
    this.id = world.newId();
    this.expiresAt = world.time + lifetime;
  }

  /** Sees into brush and over walls. */
  get pierce(): boolean {
    return this.vis === 'lantern';
  }

  update(world: World): void {
    if (world.time >= this.expiresAt) this.removed = true;
  }

  snapshot(world: World): EntitySnap {
    return {
      id: this.id,
      k: 'ward',
      tm: this.team,
      x: Math.round(this.pos.x),
      y: Math.round(this.pos.y),
      f: 0,
      r: Math.round(this.radius),
      vis: this.vis,
      // Seconds left, for the look (it fades out at the end).
      regrow: Math.max(0, Math.round((this.expiresAt - world.time) * 10) / 10),
    };
  }
}
