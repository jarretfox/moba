import { DT, type Team } from '../constants';
import { add, angleOf, dirTo, dist, scale, segmentDistance, sub, type Vec2 } from '../math';
import type { EntitySnap } from '../protocol';
import type { Entity } from './entity';
import type { Unit } from './unit';
import type { World } from './world';

/** Chases one unit until it lands. Used for ranged basic attacks. */
export class HomingProjectile implements Entity {
  readonly kind = 'projectile';
  readonly id: number;
  team: Team;
  pos: Vec2;
  radius = 8;
  removed = false;
  private facing: number;
  private readonly targetId: number;

  constructor(
    world: World,
    owner: Unit,
    target: Unit,
    private readonly speed: number,
    private readonly vis: string,
    private readonly onHit: (world: World, target: Unit) => void,
  ) {
    this.id = world.newId();
    this.team = owner.team;
    this.targetId = target.id;
    const dir = dirTo(owner.pos, target.pos);
    this.pos = add(owner.pos, scale(dir, owner.radius));
    this.facing = angleOf(dir);
  }

  update(world: World): void {
    const target = world.getUnit(this.targetId);
    if (!target || !target.isTargetable()) {
      this.removed = true;
      return;
    }
    const step = this.speed * DT;
    this.facing = angleOf(sub(target.pos, this.pos));
    if (dist(this.pos, target.pos) - target.radius <= step) {
      this.removed = true;
      this.onHit(world, target);
      return;
    }
    this.pos = add(this.pos, scale(dirTo(this.pos, target.pos), step));
  }

  snapshot(): EntitySnap {
    return snap(this, this.facing, this.vis);
  }
}

export interface LineShot {
  from: Vec2;
  dir: Vec2;
  speed: number;
  range: number;
  width: number;
  vis: string;
  /** Keep flying through everything it hits, or stop at the first. */
  pierce: boolean;
  canHit?: (u: Unit) => boolean;
  /** hitIndex counts up from 0 in the order targets were struck. */
  onHit: (world: World, target: Unit, hitIndex: number) => void;
  /** Reached the end of its range without hitting anything (non-piercing shots only). */
  onMiss?: (world: World, at: Vec2) => void;
}

/** A skillshot: flies in a straight line and hits whatever enemy it passes through. */
export class LineProjectile implements Entity {
  readonly kind = 'projectile';
  readonly id: number;
  team: Team;
  pos: Vec2;
  radius: number;
  removed = false;
  private traveled = 0;
  private readonly hit = new Set<number>();

  constructor(world: World, owner: Unit, private readonly shot: LineShot) {
    this.id = world.newId();
    this.team = owner.team;
    this.pos = { ...shot.from };
    this.radius = shot.width / 2;
  }

  update(world: World): void {
    const s = this.shot;
    const step = Math.min(s.speed * DT, s.range - this.traveled);
    const from = this.pos;
    const to = add(from, scale(s.dir, step));

    // Skillshots fly over structures, like League's.
    const hits = world
      .units()
      .filter((u) => u.team !== this.team && u.kind !== 'structure' && u.isTargetable() && !this.hit.has(u.id) && (s.canHit?.(u) ?? true))
      .map((u) => ({ u, ...segmentDistance(u.pos, from, to) }))
      .filter((h) => h.d <= this.radius + h.u.radius)
      .sort((a, b) => a.t - b.t);

    for (const h of hits) {
      this.hit.add(h.u.id);
      s.onHit(world, h.u, this.hit.size - 1);
      if (!s.pierce) {
        this.removed = true;
        return;
      }
    }

    this.pos = to;
    this.traveled += step;
    if (this.traveled >= s.range - 1e-6) {
      this.removed = true;
      if (!s.pierce && this.hit.size === 0) s.onMiss?.(world, this.pos);
    }
  }

  snapshot(): EntitySnap {
    return snap(this, angleOf(this.shot.dir), this.shot.vis);
  }

  /** If it would hit someone standing still at `p` (radius `r`) within `horizon` seconds, how soon (bots dodge with this). */
  threatTo(p: Vec2, r: number, horizon: number): number | null {
    const s = this.shot;
    const rx = p.x - this.pos.x;
    const ry = p.y - this.pos.y;
    const along = rx * s.dir.x + ry * s.dir.y;
    if (along < 0 || along > s.range - this.traveled + r) return null;
    if (Math.abs(rx * s.dir.y - ry * s.dir.x) > this.radius + r) return null;
    const t = along / s.speed;
    return t <= horizon ? t : null;
  }

  /** Which way it's flying. */
  get heading(): Vec2 {
    return this.shot.dir;
  }
}

function snap(p: Entity, facing: number, vis: string): EntitySnap {
  return {
    id: p.id,
    k: 'projectile',
    tm: p.team,
    x: Math.round(p.pos.x),
    y: Math.round(p.pos.y),
    f: Math.round(facing * 100) / 100,
    r: p.radius,
    vis,
  };
}
