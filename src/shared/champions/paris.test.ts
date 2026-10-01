import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { World } from '../sim/world';
import { Marksman } from './marksman';
import { CAFE_BREAK, ENCORE, FLECHE, Paris, RIPOSTE, TOUCHE } from './paris';
import { learnAll } from './testing';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

const LANE = { x: 5000, y: 1100 };

function setup(foeAt = 170) {
  const world = new World(MAP);
  const paris = learnAll(world.add(new Paris(world, TEAM.blue)));
  paris.pos = { ...LANE };
  const foe = learnAll(world.add(new Marksman(world, TEAM.red)));
  foe.pos = { x: LANE.x + foeAt, y: LANE.y };
  world.step();
  return { world, paris, foe };
}

/** Damage events on `target` from now on. */
function hitsOn(world: World, target: { id: number }): () => number[] {
  const seen: number[] = [];
  const drain = world.drainEvents.bind(world);
  world.drainEvents = () => {
    const ev = drain();
    for (const e of ev) if (e.e === 'dmg' && e.target === target.id) seen.push(e.amount);
    return ev;
  };
  return () => {
    world.drainEvents();
    return seen;
  };
}

describe('Riposte', () => {
  it('strikes twice on every fourth attack in a row', () => {
    const { world, paris, foe } = setup();
    const hits = hitsOn(world, foe);
    paris.commandAttack(foe);
    // Through the fourth attack and its second strike, but not the fifth attack.
    run(world, (RIPOSTE.every - 0.5) / paris.stats.attackSpeed + 0.4);
    const amounts = hits();
    expect(amounts.length).toBe(RIPOSTE.every + 1);
    expect(amounts[amounts.length - 1]).toBeCloseTo(amounts[0] * RIPOSTE.secondHit, -1);
  });
});

describe('Flèche', () => {
  it('flashes between enemies near the target, untouchable while it does', () => {
    const { world, paris, foe } = setup(450);
    const second = learnAll(world.add(new Marksman(world, TEAM.red)));
    second.pos = { x: LANE.x + 650, y: LANE.y + 150 };
    const [a, b] = [foe.hp, second.hp];
    expect(paris.tryCast(world, 0, foe.pos)).toBe(true);
    expect(paris.isTargetable()).toBe(false);
    run(world, FLECHE.step * FLECHE.hits[0] + 0.1);
    expect(foe.hp).toBeLessThan(a);
    expect(second.hp).toBeLessThan(b);
    expect(paris.isTargetable()).toBe(true);
  });

  it('needs someone to aim at, and comes back sooner the more he attacks', () => {
    const { world, paris, foe } = setup(150);
    expect(paris.tryCast(world, 0, { x: LANE.x - 500, y: LANE.y })).toBe(false);
    paris.tryCast(world, 0, foe.pos);
    run(world, 1);
    const ready = paris.abilities[0].readyAt;
    paris.commandAttack(foe);
    run(world, 3);
    expect(paris.abilities[0].readyAt).toBeLessThan(ready - FLECHE.attackRefund);
  });
});

describe('Café Break', () => {
  it('heals him and cuts the damage he takes, until he does anything else', () => {
    const { world, paris, foe } = setup(1500);
    paris.hp = 200;
    paris.tryCast(world, 1, paris.pos);
    const hp = paris.hp;
    world.damage(foe, paris, 100, 'true');
    expect(hp - paris.hp).toBeCloseTo(100 * (1 - CAFE_BREAK.reduction[0]));
    const hurt = paris.hp;
    run(world, 1);
    expect(paris.hp - hurt).toBeGreaterThan(CAFE_BREAK.healPerSecond[0] * 0.9);
    paris.commandMove(world, { x: LANE.x + 300, y: LANE.y });
    expect(paris.has('meditating')).toBe(false);
    const after = paris.hp;
    world.damage(foe, paris, 100, 'true');
    expect(after - paris.hp).toBeCloseTo(100);
  });
});

describe('Touché', () => {
  it('adds true damage to his attacks for a while', () => {
    const { world, paris, foe } = setup();
    const hits = hitsOn(world, foe);
    paris.commandAttack(foe);
    run(world, 1 / paris.stats.attackSpeed);
    const plain = hits().length;
    paris.tryCast(world, 2, paris.pos);
    run(world, 2 / paris.stats.attackSpeed);
    // Every attack now lands as two numbers: the hit and the true damage on top.
    expect(hits().length - plain).toBeGreaterThanOrEqual(4);
    expect(TOUCHE.trueDamage[0]).toBeGreaterThan(0);
  });
});

describe('Encore', () => {
  it('speeds him up, shrugs off slows, and stretches on takedowns while cutting his cooldowns', () => {
    const { world, paris, foe } = setup(170);
    paris.level = 5;
    run(world, 0.02);
    const [speed, as] = [paris.moveSpeed, paris.stats.attackSpeed];
    paris.tryCast(world, 3, paris.pos);
    run(world, 0.05);
    expect(paris.stats.attackSpeed).toBeCloseTo(as * (1 + ENCORE.attackSpeed[0]), 2);
    paris.addStatus(world, 'slow', 2, 0.5);
    expect(paris.moveSpeed).toBeGreaterThan(speed);
    paris.tryCast(world, 2, paris.pos);
    const cd = paris.abilities[2].readyAt - world.time;
    foe.hp = 1;
    world.damage(paris, foe, 50, 'true');
    expect(paris.abilities[2].readyAt - world.time).toBeCloseTo(cd * (1 - ENCORE.cooldownCut), 1);
    run(world, ENCORE.duration + 1);
    expect(paris.encoreOn(world)).toBe(true); // the takedown bought him more time
  });
});
