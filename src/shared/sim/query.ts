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
