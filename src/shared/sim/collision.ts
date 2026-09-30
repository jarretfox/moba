import type { NavGrid } from '../map/navGrid';
import type { Unit } from './unit';
import type { World } from './world';

/** Separation passes per tick. Two lets small crowds settle without jitter. */
const PASSES = 2;
/** A unit standing still is this many times harder to shove than one walking past it, so walkers flow around. */
const STANDING_WEIGHT = 4;
/**
 * Pushing straight back cancels a walker's progress along the contact line, which is what makes it slide
 * around whoever is in the way. Dead-on collisions have no sideways component to slide along, so they get
 * a small deterministic nudge to one side.
 */
const HEAD_ON_COS = 0.97;
const HEAD_ON_NUDGE = 0.35;

/**
 * Pushes overlapping units apart after everyone has moved. Soft collision like League's: walkers give way
 * to units standing still, nobody gets shoved into a wall, and dashing units pass through.
 */
export function resolveUnitCollisions(world: World): void {
  const bodies = world.units().filter((u) => u.hasBody());
  const pushed = new Set<Unit>();
  for (let pass = 0; pass < PASSES; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) separate(bodies[i], bodies[j], world.grid, pushed);
    }
  }
  // A shove can knock a walker off the straight line to its next waypoint and into a wall corner.
  for (const u of pushed) {
    if (u.path.length && !world.grid.lineWalkable(u.pos, u.path[0])) u.path = world.findPath(u.pos, u.path[u.path.length - 1]);
  }
}

function separate(a: Unit, b: Unit, grid: NavGrid, pushed: Set<Unit>): void {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const minD = a.radius + b.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return;
  const wa = weight(a);
  const wb = weight(b);
  if (wa === Infinity && wb === Infinity) return;

  const d = Math.sqrt(d2);
  // Exactly stacked (e.g. spawned on the same spot): split along x, lower id to the left.
  const nx = d > 1e-6 ? dx / d : 1;
  const ny = d > 1e-6 ? dy / d : 0;
  const overlap = minD - d;
  const shareA = wa === Infinity ? 0 : wb === Infinity ? 1 : wb / (wa + wb);

  push(a, -nx * overlap * shareA, -ny * overlap * shareA, grid, pushed);
  push(b, nx * overlap * (1 - shareA), ny * overlap * (1 - shareA), grid, pushed);
  sidestepIfHeadOn(a, b, nx, ny, overlap, grid, pushed);
  sidestepIfHeadOn(b, a, -nx, -ny, overlap, grid, pushed);
}

function weight(u: Unit): number {
  if (u.immovable) return Infinity;
  return u.moveDir ? 1 : STANDING_WEIGHT;
}

/** (nx, ny) points from the mover toward the unit it walked into. */
function sidestepIfHeadOn(mover: Unit, other: Unit, nx: number, ny: number, overlap: number, grid: NavGrid, pushed: Set<Unit>): void {
  const m = mover.moveDir;
  if (!m || m.x * nx + m.y * ny < HEAD_ON_COS) return;
  const rx = -m.y; // the mover's right-hand side
  const ry = m.x;
  const step = overlap * HEAD_ON_NUDGE;
  if (!mover.immovable) {
    // Walkers always step to their own right, so two meeting head-on pass each other instead of mirroring.
    push(mover, rx * step, ry * step, grid, pushed);
  } else if (!other.immovable) {
    // Nothing moves an immovable walker, so whoever is in front steps out of its way instead of being
    // plowed ahead of it — to whichever side they're already leaning, or its right if dead center.
    const side = rx * nx + ry * ny >= 0 ? 1 : -1;
    push(other, rx * side * step, ry * side * step, grid, pushed);
  }
}

/** Move u by (x, y), sliding along walls rather than into them. */
function push(u: Unit, x: number, y: number, grid: NavGrid, pushed: Set<Unit>): void {
  if (x === 0 && y === 0) return;
  const tx = u.pos.x + x;
  const ty = u.pos.y + y;
  if (grid.isWalkable({ x: tx, y: ty })) u.pos = { x: tx, y: ty };
  else if (grid.isWalkable({ x: tx, y: u.pos.y })) u.pos = { x: tx, y: u.pos.y };
  else if (grid.isWalkable({ x: u.pos.x, y: ty })) u.pos = { x: u.pos.x, y: ty };
  else return;
  pushed.add(u);
}
