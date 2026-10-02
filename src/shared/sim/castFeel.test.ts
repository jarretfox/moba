import { describe, expect, it } from 'vitest';
import { KingRix } from '../champions/kingrix';
import { Logan } from '../champions/logan';
import { Marksman } from '../champions/marksman';
import { learnAll } from '../champions/testing';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { CAST_QUEUE } from '../protocol';
import { add, dist } from '../math';
import { Chud } from './chud';
import { applyCommand } from './commands';
import { World } from './world';

// How the game answers a player's input: casts pressed a moment early go off when they can, casts on
// someone out of reach walk in to them, casts with nobody to land on say so, and attack-move fights its
// way to where it's going.

const run = (world: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
};

function duel() {
  const world = new World(MAP);
  const logan = learnAll(world.add(new Logan(world, TEAM.blue)));
  const foe = world.add(new Marksman(world, TEAM.red));
  logan.pos = { x: 2600, y: 1100 };
  foe.pos = add(logan.pos, { x: 400, y: 0 });
  world.vision.update();
  return { world, logan, foe };
}

describe('a cast pressed a moment early', () => {
  it('goes off as soon as its cooldown is up', () => {
    const { world, logan } = duel();
    logan.abilities[1].readyAt = world.time + CAST_QUEUE - 0.1;
    applyCommand(world, logan, { k: 'cast', slot: 1, x: logan.pos.x, y: logan.pos.y }, true);
    expect(logan.shield).toBe(0);
    run(world, CAST_QUEUE);
    expect(logan.shield).toBeGreaterThan(0);
  });

  it('is dropped if it was pressed too early, and bots never queue', () => {
    const { world, logan } = duel();
    logan.abilities[1].readyAt = world.time + CAST_QUEUE + 0.5;
    applyCommand(world, logan, { k: 'cast', slot: 1, x: logan.pos.x, y: logan.pos.y }, true);
    run(world, CAST_QUEUE + 1);
    expect(logan.shield).toBe(0);
    logan.abilities[1].readyAt = world.time + 0.1;
    applyCommand(world, logan, { k: 'cast', slot: 1, x: logan.pos.x, y: logan.pos.y });
    run(world, 0.5);
    expect(logan.shield).toBe(0);
  });

  it('is forgotten when the player gives another order', () => {
    const { world, logan } = duel();
    logan.abilities[1].readyAt = world.time + 0.2;
    applyCommand(world, logan, { k: 'cast', slot: 1, x: logan.pos.x, y: logan.pos.y }, true);
    applyCommand(world, logan, { k: 'stop' }, true);
    run(world, 0.5);
    expect(logan.shield).toBe(0);
  });
});

describe('a cast on someone out of reach', () => {
  it('walks in and casts it once they are close enough', () => {
    const { world, logan, foe } = duel();
    foe.pos = add(logan.pos, { x: 950, y: 0 });
    world.vision.update();
    applyCommand(world, logan, { k: 'cast', slot: 0, x: foe.pos.x, y: foe.pos.y }, true);
    expect(logan.meSnapshot(world).queued).toBe(0);
    expect(logan.abilities[0].readyAt).toBe(0);
    run(world, 2);
    expect(logan.abilities[0].readyAt).toBeGreaterThan(0); // Pounce went off
    expect(dist(logan.pos, foe.pos)).toBeLessThan(logan.radius + foe.radius + 80);
  });

  it('with nobody there, tells the player instead', () => {
    const { world, logan } = duel();
    world.drainEvents();
    applyCommand(world, logan, { k: 'cast', slot: 0, x: logan.pos.x - 400, y: logan.pos.y }, true);
    expect(world.drainEvents()).toContainEqual({ e: 'castFail', src: logan.id, slot: 0, why: 'target' });
    const rix = learnAll(world.add(new KingRix(world, TEAM.blue)));
    rix.abilities[3].rank = 1;
    applyCommand(world, rix, { k: 'cast', slot: 3, x: 100, y: 100 }, true);
    const [fail] = world.drainEvents().filter((e) => e.e === 'castFail');
    expect(fail).toMatchObject({ src: rix.id, slot: 3 });
    expect(world.vision.canSeeEvent(TEAM.blue, fail)).toBe(true);
    expect(world.vision.canSeeEvent(TEAM.red, fail)).toBe(false);
  });
});

describe('attack-move', () => {
  it('fights the first enemy in reach on the way, then carries on to where it was going', () => {
    const world = new World(MAP);
    const me = world.add(new Marksman(world, TEAM.blue));
    me.pos = { x: 3000, y: 1100 };
    const chud = world.add(new Chud(world, TEAM.red, 'melee', 'top', [{ x: 3500, y: 1100 }]));
    chud.hp = 30;
    world.vision.update();
    applyCommand(world, me, { k: 'attackMove', x: 4400, y: 1100 }, true);
    run(world, 4);
    expect(chud.dead || chud.removed).toBe(true);
    run(world, 4);
    expect(dist(me.pos, { x: 4400, y: 1100 })).toBeLessThan(80);
  });

  it('leaves jungle monsters alone', () => {
    const world = new World(MAP);
    const me = world.add(new Marksman(world, TEAM.blue));
    const camp = MAP.camps[0].pos;
    me.pos = add(camp, { x: -500, y: 0 });
    world.vision.update();
    applyCommand(world, me, { k: 'attackMove', x: camp.x + 300, y: camp.y + 250 }, true);
    run(world, 0.5);
    expect(me.order.kind).not.toBe('attack');
  });
});
