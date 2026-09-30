import { describe, expect, it } from 'vitest';
import { Marksman } from '../champions/marksman';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { dist, type Vec2 } from '../math';
import { Dummy } from './dummy';
import type { Unit } from './unit';
import { World } from './world';

// Open ground just through blue's back door: nothing but jungle floor between x=2950 and the pillar at x=3850.
const ROW_Y = 3500;

function champAt(world: World, x: number, y = ROW_Y): Marksman {
  const c = world.add(new Marksman(world, TEAM.blue));
  c.pos = { x, y };
  return c;
}

function dummyAt(world: World, x: number, y = ROW_Y): Dummy {
  return world.add(new Dummy(world, { x, y }, 'Dummy'));
}

function run(world: World, seconds: number, eachTick?: () => void): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    world.step();
    eachTick?.();
  }
}

const gap = (a: Unit, b: Unit) => dist(a.pos, b.pos) - a.radius - b.radius;

describe('unit collision', () => {
  it('walks around a dummy standing dead in its path and still arrives', () => {
    const world = new World(MAP);
    const dummy = dummyAt(world, 3300);
    const champ = champAt(world, 3000);
    const dest: Vec2 = { x: 3700, y: ROW_Y };

    champ.commandMove(world, dest);
    let worstOverlap = 0;
    run(world, 4, () => (worstOverlap = Math.min(worstOverlap, gap(champ, dummy))));

    expect(dist(champ.pos, dest)).toBeLessThan(1);
    expect(champ.order.kind).toBe('idle');
    expect(dummy.pos).toEqual({ x: 3300, y: ROW_Y });
    expect(worstOverlap).toBeGreaterThan(-1);
  });

  it('pushes units spawned on the same spot apart', () => {
    const world = new World(MAP);
    const a = champAt(world, 3300);
    const b = champAt(world, 3300);

    run(world, 0.1);

    expect(gap(a, b)).toBeGreaterThan(-0.5);
  });

  it('makes walkers flow around a unit standing still rather than bulldoze it', () => {
    const world = new World(MAP);
    const stander = champAt(world, 3300);
    const walker = champAt(world, 3000);
    const dest: Vec2 = { x: 3700, y: ROW_Y };

    walker.commandMove(world, dest);
    run(world, 4);

    expect(dist(walker.pos, dest)).toBeLessThan(1);
    expect(dist(stander.pos, { x: 3300, y: ROW_Y })).toBeLessThan(stander.radius);
  });

  it('steps out of the way of an immovable walker instead of being plowed ahead of it', () => {
    const world = new World(MAP);
    // Paces straight down x=3650, right through where the champion is standing.
    const pacer = world.add(new Dummy(world, { x: 3650, y: 2950 }, 'Pacer', [{ x: 3650, y: 2950 }, { x: 3650, y: 4050 }]));
    const stander = champAt(world, 3650);

    run(world, 6);

    expect(pacer.pos.x).toBe(3650);
    expect(Math.abs(stander.pos.y - ROW_Y)).toBeLessThan(150);
    expect(Math.abs(stander.pos.x - 3650)).toBeGreaterThan(75);
  });

  it('never shoves a unit into a wall', () => {
    const world = new World(MAP);
    const pinned = champAt(world, 3830); // backed up against the jungle pillar
    const pusher = champAt(world, 3500);

    pusher.commandMove(world, { x: 3900, y: ROW_Y });
    run(world, 3, () => {
      expect(world.grid.isWalkable(pinned.pos)).toBe(true);
      expect(world.grid.isWalkable(pusher.pos)).toBe(true);
    });
  });

  it('gives up on a destination someone is standing on', () => {
    const world = new World(MAP);
    const dummy = dummyAt(world, 3300);
    const champ = champAt(world, 3000);

    champ.commandMove(world, { x: 3300, y: ROW_Y });
    run(world, 2);

    expect(champ.order.kind).toBe('idle');
    expect(champ.path).toEqual([]);
    expect(gap(champ, dummy)).toBeLessThan(2);
  });

  it('lets dashes pass straight through other units', () => {
    const world = new World(MAP);
    const dasher = champAt(world, 3000);
    const bystander = champAt(world, 3150);

    expect(dasher.tryCast(world, 2, { x: 3600, y: ROW_Y })).toBe(true); // Roll, 325 units
    run(world, 0.3);

    expect(dasher.pos.x).toBeCloseTo(3325, 0);
    expect(dist(bystander.pos, { x: 3150, y: ROW_Y })).toBeLessThan(1);
  });
});
