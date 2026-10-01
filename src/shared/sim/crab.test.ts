import { describe, expect, it } from 'vitest';
import type { Champion } from '../champions/champion';
import { Marksman } from '../champions/marksman';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { dist } from '../math';
import { CRAB, Crab, CrabSpawner, crabSpots } from './crab';
import { STARTING_GOLD } from './progression';
import { World } from './world';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

function setUp() {
  const world = new World(MAP);
  const spawner = world.addSystem(new CrabSpawner(world));
  return { world, spawner };
}

describe('the Sewer Crab', () => {
  it('turns up in each half of the river at 2:30, where you can walk to it', () => {
    const { world, spawner } = setUp();
    world.tick = Math.round((CRAB.firstAt - 1) * TICK_RATE);
    run(world, 0.5);
    expect(spawner.crabs()).toHaveLength(0);
    run(world, 1);
    expect(spawner.crabs()).toHaveLength(2);
    for (const spot of crabSpots(world)) {
      expect(world.grid.open[world.grid.cellY(spot.y) * world.grid.cols + world.grid.cellX(spot.x)]).toBe(1);
    }
  });

  it("wanders its stretch of river, never fights back, and runs when it's hit", () => {
    const { world, spawner } = setUp();
    world.tick = Math.round(CRAB.firstAt * TICK_RATE);
    run(world, 0.1);
    const crab = spawner.crabs()[0];
    const me: Champion = world.add(new Marksman(world, TEAM.blue));
    me.pos = { x: crab.pos.x - 150, y: crab.pos.y };
    const hp = me.hp;
    let furthest = 0;
    for (let t = 0; t < 8; t += 0.5) {
      run(world, 0.5);
      furthest = Math.max(furthest, dist(crab.pos, crab.home));
    }
    expect(furthest).toBeGreaterThan(100);
    expect(furthest).toBeLessThan(CRAB.wander + 120);
    expect(me.hp).toBe(hp);
    world.damage(me, crab, 50, 'physical');
    world.step();
    expect(crab.has('speed')).toBe(true);
  });

  it('pays whoever takes it, speeds them up, leaves their team an eye on the river, and comes back later', () => {
    const { world, spawner } = setUp();
    world.tick = Math.round(CRAB.firstAt * TICK_RATE);
    run(world, 0.1);
    const crab = spawner.crabs()[0];
    const me: Champion = world.add(new Marksman(world, TEAM.blue));
    me.pos = { x: crab.pos.x - 200, y: crab.pos.y };
    world.drainEvents();
    world.damage(me, crab, 1e6, 'true');
    expect(crab.dead).toBe(true);
    expect(me.gold).toBe(STARTING_GOLD + CRAB.gold);
    expect(me.has('speed')).toBe(true);
    const ward = world.all().find((e) => e.kind === 'ward');
    expect(ward?.team).toBe(TEAM.blue);
    expect(world.visibleTo(TEAM.blue).some((e) => e.k === 'ward')).toBe(true);
    expect(world.drainEvents().find((e) => e.e === 'kill')).toMatchObject({ killer: me.name, what: 'crab', team: TEAM.blue });

    run(world, 2);
    expect(spawner.crabs()).toHaveLength(1);
    expect(world.all().some((e) => e instanceof Crab && e === crab)).toBe(false); // the body's gone
    world.tick += Math.round(CRAB.respawn * TICK_RATE);
    run(world, 0.1);
    expect(spawner.crabs()).toHaveLength(2);
  });
});
