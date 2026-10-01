import type { Team } from '../constants';
import { clamp, dist, type Vec2 } from '../math';
import type { Unit } from './unit';
import type { World } from './world';

/** What an ability can hit: anything alive on the other side except structures, which abilities don't damage. */
export function hittableEnemies(world: World, team: Team): Unit[] {
  return world.units().filter((u) => u.team !== team && u.kind !== 'structure' && u.isTargetable());
}

/** Enemies whose body overlaps a circle. */
export function enemiesInRadius(world: World, team: Team, center: Vec2, radius: number): Unit[] {
  return hittableEnemies(world, team).filter((u) => dist(u.pos, center) <= radius + u.radius);
}

/** Enemies whose body pokes into a wedge from `origin` along `dir` (a unit vector), `halfAngle` radians either side. */
export function enemiesInCone(world: World, team: Team, origin: Vec2, dir: Vec2, range: number, halfAngle: number): Unit[] {
  return hittableEnemies(world, team).filter((u) => {
    const dx = u.pos.x - origin.x;
    const dy = u.pos.y - origin.y;
    const d = Math.hypot(dx, dy);
    if (d - u.radius > range) return false;
    if (d <= u.radius) return true; // standing on top of us
    const angle = Math.acos(clamp((dx * dir.x + dy * dir.y) / d, -1, 1));
    return angle <= halfAngle + Math.asin(u.radius / d);
  });
}

/**
 * Enemies whose body touches a strip `width` wide running `range` from `from` along `dir` (a unit vector),
 * nearest first.
 */
export function enemiesAlongLine(world: World, team: Team, from: Vec2, dir: Vec2, range: number, width: number): Unit[] {
  return hittableEnemies(world, team)
    .map((u) => {
      const along = (u.pos.x - from.x) * dir.x + (u.pos.y - from.y) * dir.y;
      const across = Math.abs((u.pos.x - from.x) * dir.y - (u.pos.y - from.y) * dir.x);
      return { u, along, across };
    })
    .filter(({ u, along, across }) => along >= -u.radius && along <= range + u.radius && across <= width / 2 + u.radius)
    .sort((a, b) => a.along - b.along)
    .map(({ u }) => u);
}
