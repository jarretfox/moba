import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { MAP, lanePath } from '../map/mapData';
import { add, dist } from '../math';
import { Chud } from '../sim/chud';
import { applyCommand } from '../sim/commands';
import { World } from '../sim/world';
import { BigWhale, MAKE_IT_RAIN, SPLASH_ZONE, TIPPING } from './bigwhale';
import { Marksman } from './marksman';
import { EXPRESS_TRAIN, Scrimby } from './scrimby';
import { learnAll } from './testing';

const run = (world: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
};

function duel<T extends Scrimby | BigWhale>(make: (w: World) => T) {
  const world = new World(MAP);
  const me = learnAll(world.add(make(world)));
  const foe = world.add(new Marksman(world, TEAM.red));
  me.pos = { x: 2600, y: 1100 };
  foe.pos = add(me.pos, { x: 500, y: 0 });
  world.vision.update();
  return { world, me, foe };
}

describe('Scrimby', () => {
  it('slows with the hot dog and knocks people up with the manhole', () => {
    const { world, me, foe } = duel((w) => new Scrimby(w, TEAM.blue));
    const hp = foe.hp;
    expect(me.tryCast(world, 0, foe.pos)).toBe(true);
    run(world, 0.6);
    expect(foe.hp).toBeLessThan(hp);
    expect(foe.has('slow')).toBe(true);
    run(world, 2);
    expect(me.tryCast(world, 1, foe.pos)).toBe(true);
    run(world, 0.85);
    expect(foe.has('airborne')).toBe(true);
  });

  it('becomes the express train: right-clicks steer it, it throws Chuds aside, and it crashes into the first champion', () => {
    const { world, me, foe } = duel((w) => new Scrimby(w, TEAM.blue));
    foe.pos = add(me.pos, { x: 1200, y: 0 });
    const chud = world.add(new Chud(world, TEAM.red, 'melee', 'top', [{ x: me.pos.x + 400, y: me.pos.y }]));
    world.vision.update();
    expect(me.tryCast(world, 3, foe.pos)).toBe(true);
    run(world, EXPRESS_TRAIN.castTime + 0.1);
    expect(me.riding).toBe(true);
    expect(me.has('express')).toBe(true);
    // Unstoppable while it runs.
    me.addStatus(world, 'stun', 1);
    expect(me.has('stun')).toBe(false);
    run(world, 2);
    expect(me.riding).toBe(false);
    expect(foe.has('airborne')).toBe(true);
    expect(dist(chud.pos, { x: 3000, y: 1100 })).toBeGreaterThan(50); // shoved off the tracks
    expect(dist(me.pos, foe.pos)).toBeLessThan(me.radius + foe.radius + 60);
  });

  it('steers toward right-clicks, and the brake ends it early', () => {
    const { world, me } = duel((w) => new Scrimby(w, TEAM.blue));
    me.tryCast(world, 3, add(me.pos, { x: 1000, y: 0 }));
    run(world, EXPRESS_TRAIN.castTime + 0.05);
    const start = { ...me.pos };
    applyCommand(world, me, { k: 'move', x: Math.round(me.pos.x), y: Math.round(me.pos.y + 900) }, true);
    run(world, 0.6);
    expect(me.pos.y).toBeGreaterThan(start.y + 30); // turned toward the click
    applyCommand(world, me, { k: 'cast', slot: 3, x: 0, y: 0 }, true);
    expect(me.riding).toBe(false);
  });
});

describe('Big Whale', () => {
  it('tips allies near him for their last hits', () => {
    const world = new World(MAP);
    const whale = world.add(new BigWhale(world, TEAM.blue));
    const ally = world.add(new Marksman(world, TEAM.blue));
    whale.pos = { x: 3000, y: 1100 };
    ally.pos = { x: 3100, y: 1100 };
    const chud = world.add(new Chud(world, TEAM.red, 'melee', 'top', lanePath(world.map, TEAM.red, 'top')));
    chud.pos = { x: 3200, y: 1100 };
    const before = ally.gold;
    world.damage(ally, chud, 1e6, 'true');
    expect(ally.gold - before).toBeGreaterThanOrEqual(TIPPING.gold);
    const far = world.add(new Marksman(world, TEAM.blue));
    far.pos = { x: 9000, y: 1100 };
    const chud2 = world.add(new Chud(world, TEAM.red, 'melee', 'top', lanePath(world.map, TEAM.red, 'top')));
    chud2.pos = { x: 9100, y: 1100 };
    const g0 = far.gold;
    world.damage(far, chud2, 1e6, 'true');
    const plain = far.gold - g0;
    expect(ally.gold - before - plain).toBe(TIPPING.gold);
  });

  it('makes it rain, throws a party, files paperwork, and lands with a splash', () => {
    const { world, me, foe } = duel((w) => new BigWhale(w, TEAM.blue));
    const friend = world.add(new Marksman(world, TEAM.blue));
    friend.pos = add(me.pos, { x: -200, y: 0 });
    me.tryCast(world, 0, foe.pos);
    run(world, MAKE_IT_RAIN.castTime + MAKE_IT_RAIN.delay + 0.1);
    expect(foe.has('slow')).toBe(true);
    me.tryCast(world, 1, friend.pos);
    expect(me.shield).toBeGreaterThan(0);
    expect(friend.shield).toBeGreaterThan(0);
    run(world, 1);
    me.tryCast(world, 2, foe.pos);
    run(world, 0.6);
    expect(foe.has('stun')).toBe(true);
    run(world, 2);
    friend.hp = friend.stats.maxHp * 0.5;
    friend.pos = add(foe.pos, { x: -100, y: 0 });
    const hurt = friend.hp;
    me.tryCast(world, 3, foe.pos);
    run(world, SPLASH_ZONE.castTime + SPLASH_ZONE.flight + 0.1);
    expect(dist(me.pos, foe.pos)).toBeLessThan(SPLASH_ZONE.radius);
    expect(foe.has('airborne')).toBe(true);
    expect(friend.hp).toBeGreaterThan(hurt);
  });
});
