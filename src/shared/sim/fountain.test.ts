import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { Marksman } from '../champions/marksman';
import { Fountain, FOUNTAIN_RADIUS, FOUNTAIN_ZAP } from './fountain';
import { World } from './world';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

function setup() {
  const world = new World(MAP);
  world.addSystem(new Fountain());
  const home = world.map.spawns[TEAM.blue];
  const friend = world.add(new Marksman(world, TEAM.blue));
  const foe = world.add(new Marksman(world, TEAM.red));
  friend.pos = { ...home };
  foe.pos = { x: home.x + FOUNTAIN_RADIUS + 400, y: home.y };
  return { world, home, friend, foe };
}

describe('The fountain', () => {
  it('heals its own team on the platform', () => {
    const { world, friend } = setup();
    friend.hp = 100;
    run(world, 2);
    expect(friend.hp).toBeGreaterThan(100 + friend.stats.maxHp * 0.2);
  });

  it('zaps an enemy champion standing on the platform until they die', () => {
    const { world, home, foe } = setup();
    foe.pos = { x: home.x + FOUNTAIN_RADIUS - 50, y: home.y };
    run(world, 0.1);
    expect(foe.hp).toBeLessThan(foe.stats.maxHp * (1 - FOUNTAIN_ZAP.maxHpShare) + 1);
    expect(world.drainEvents().some((e) => e.e === 'zap')).toBe(true);
    run(world, 4);
    expect(foe.dead).toBe(true);
  });

  it('leaves an enemy just off the platform alone', () => {
    const { world, foe } = setup();
    run(world, 3);
    expect(foe.hp).toBe(foe.stats.maxHp);
  });

  it('goes after an enemy who hits someone on the platform from outside it, and lets them go after a while', () => {
    const { world, home, friend, foe } = setup();
    world.damage(foe, friend, 10, 'physical');
    run(world, 0.1);
    expect(foe.hp).toBeLessThan(foe.stats.maxHp);
    // Off out of its reach until the grudge is over, then back where they shot from: left alone.
    foe.pos = { x: home.x + FOUNTAIN_ZAP.guard + 300, y: home.y };
    run(world, FOUNTAIN_ZAP.grudge + 0.5);
    const later = foe.hp;
    foe.pos = { x: home.x + FOUNTAIN_RADIUS + 400, y: home.y };
    run(world, 2);
    expect(foe.dead).toBe(false);
    expect(foe.hp).toBeGreaterThanOrEqual(later);
  });
});
