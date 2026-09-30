import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { MAP, lanePath } from '../map/mapData';
import { dist } from '../math';
import { Chud } from '../sim/chud';
import { applyCommand } from '../sim/commands';
import { Fountain } from '../sim/fountain';
import { World } from '../sim/world';
import { Marksman } from './marksman';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

function setup() {
  const world = new World(MAP);
  world.addSystem(new Fountain());
  const m = world.add(new Marksman(world, TEAM.blue));
  m.pos = { x: 3300, y: 3500 };
  return { world, m, home: world.map.spawns[TEAM.blue] };
}

describe('Recall', () => {
  it('takes you home after four seconds of channeling', () => {
    const { world, m, home } = setup();
    applyCommand(world, m, { k: 'recall' });
    run(world, 3.9);
    expect(m.recalling).toBe(true);
    expect(dist(m.pos, home)).toBeGreaterThan(1000);
    run(world, 0.2);
    expect(m.recalling).toBe(false);
    expect(m.pos).toEqual(home);
  });

  it('breaks when you take damage', () => {
    const { world, m } = setup();
    applyCommand(world, m, { k: 'recall' });
    run(world, 1);
    world.damage(null, m, 5, 'true');
    run(world, 4);
    expect(m.recalling).toBe(false);
    expect(m.pos).toEqual({ x: 3300, y: 3500 });
  });

  it('breaks when you give another order', () => {
    const { world, m } = setup();
    applyCommand(world, m, { k: 'recall' });
    run(world, 1);
    applyCommand(world, m, { k: 'move', x: 3400, y: 3500 });
    run(world, 4);
    expect(dist(m.pos, world.map.spawns[TEAM.blue])).toBeGreaterThan(1000);
  });
});

describe('the fountain', () => {
  it('heals champions standing in it', () => {
    const { world, m, home } = setup();
    m.pos = { ...home };
    m.hp = 100;
    m.mana = 0;
    run(world, 4);
    expect(m.hp).toBeGreaterThan(m.stats.maxHp * 0.5);
    expect(m.mana).toBeGreaterThan(m.stats.maxMana * 0.4);
  });
});

describe('the match clock', () => {
  it('makes death timers longer as the game goes on', () => {
    const early = setup();
    early.world.damage(null, early.m, 1e6, 'true');
    const lateWorld = setup();
    run(lateWorld.world, 20 * 60);
    lateWorld.world.damage(null, lateWorld.m, 1e6, 'true');

    expect(early.m.respawnAt - early.world.time).toBeCloseTo(6);
    expect(lateWorld.m.respawnAt - lateWorld.world.time).toBeCloseTo(36);
  });

  it('makes Chuds tougher as the game goes on', () => {
    const world = new World(MAP);
    const route = lanePath(world.map, TEAM.blue, 'top');
    const early = new Chud(world, TEAM.blue, 'melee', 'top', route);
    run(world, 10 * 60);
    const late = new Chud(world, TEAM.blue, 'melee', 'top', route);
    expect(late.stats.maxHp).toBeCloseTo(early.stats.maxHp * 1.4);
    expect(late.stats.ad).toBeCloseTo(early.stats.ad * 1.4);
  });
});
