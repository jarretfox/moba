import type { Team } from '../constants';
import type { Vec2 } from '../math';
import type { EntitySnap } from '../protocol';
import type { Entity } from './entity';
import type { World } from './world';

/** A patch of ground that does something every tick while it lasts: HunnaG's sludge puddles, Mole Holes and mushroom patches. */
export class Zone implements Entity {
  readonly kind = 'zone';
  readonly id: number;
  removed = false;
  private expiresAt: number;
  /** Fading out: shown to everyone with how long it has left. */
  private fading = false;

  constructor(
    private readonly world: World,
    public team: Team,
    public pos: Vec2,
    public radius: number,
    lifetime: number,
    public vis: string,
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

  /** Ends it `seconds` from now (sooner if it was due to end anyway), fading out meanwhile. */
  fadeOut(seconds: number): void {
    this.expiresAt = Math.min(this.expiresAt, this.world.time + seconds);
    this.fading = true;
  }

  snapshot(): EntitySnap {
    const snap: EntitySnap = { id: this.id, k: 'zone', tm: this.team, x: Math.round(this.pos.x), y: Math.round(this.pos.y), f: 0, r: Math.round(this.radius), vis: this.vis };
    if (this.fading) snap.regrow = Math.max(0, Math.round((this.expiresAt - this.world.time) * 10) / 10);
    return snap;
  }
}
