import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { dist } from '../math';
import { World } from '../sim/world';
import { ASCENSION, CHIN_CHECK, Dongmaster, GAINS, MEWING, MOG, SIGMA_STARE } from './dongmaster';
import { Marksman } from './marksman';
import { learnAll } from './testing';
import { Dummy } from '../sim/dummy';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

const LANE = { x: 5000, y: 1100 };

function setup(foeAt = 300) {
  const world = new World(MAP);
  const chad = learnAll(world.add(new Dongmaster(world, TEAM.blue)));
  chad.pos = { ...LANE };
  const foe = learnAll(world.add(new Marksman(world, TEAM.red)));
  foe.pos = { x: LANE.x + foeAt, y: LANE.y };
  world.step();
  return { world, chad, foe };
}

describe('Mog', () => {
  it('makes enemy champions near him hit softer, and only near him', () => {
    const { world, chad, foe } = setup(300);
    run(world, 0.1);
    expect(foe.strongest('weaken')).toBeCloseTo(MOG.weaken);
    const hp = chad.hp;
    world.damage(foe, chad, 100, 'true');
    expect(hp - chad.hp).toBeCloseTo(100 * (1 - MOG.weaken));
    foe.pos = { x: LANE.x + MOG.radius + 200, y: LANE.y };
    run(world, 0.4);
    expect(foe.strongest('weaken')).toBe(0);
  });
});

describe('Chin Check', () => {
  it('charges into the first enemy, knocks them back, and earns a stack of Gains', () => {
    const { world, chad, foe } = setup(300);
    const maxHp = chad.stats.maxHp;
    const hp = foe.hp;
    expect(chad.tryCast(world, 0, foe.pos)).toBe(true);
    const before = { ...foe.pos };
    run(world, 0.5);
    expect(foe.hp).toBeLessThan(hp);
    expect(dist(foe.pos, before)).toBeGreaterThan(CHIN_CHECK.knockback * 0.8);
    expect(chad.gains).toBe(1);
    run(world, 0.05);
    expect(chad.stats.maxHp).toBe(maxHp + GAINS.perStack);
  });

  it('stops at the first enemy rather than running through, and a whiff grants nothing', () => {
    const { world, chad, foe } = setup(250);
    chad.tryCast(world, 0, { x: LANE.x + 400, y: LANE.y });
    run(world, 0.3);
    expect(chad.pos.x).toBeLessThan(foe.pos.x);
    const lonely = setup(2000);
    lonely.chad.tryCast(lonely.world, 0, { x: LANE.x + 400, y: LANE.y });
    run(lonely.world, 0.5);
    expect(lonely.chad.pos.x).toBeGreaterThan(LANE.x + CHIN_CHECK.range * 0.9);
    expect(lonely.chad.gains).toBe(0);
  });

  it('only grows from champions, not from punching training dummies', () => {
    const { world, chad } = setup(3000);
    const dummy = world.add(new Dummy(world, { x: LANE.x + 250, y: LANE.y }, 'Dummy'));
    chad.tryCast(world, 0, dummy.pos);
    run(world, 0.5);
    expect(dummy.hp).toBeLessThan(dummy.stats.maxHp);
    expect(chad.gains).toBe(0);
  });
});

describe('Mewing', () => {
  it('shields him, shortens stuns, and heals him with what is left of the shield', () => {
    const { world, chad } = setup(2000);
    chad.hp = 300;
    chad.tryCast(world, 1, chad.pos);
    const shield = MEWING.shield[0] + MEWING.maxHpRatio * chad.stats.maxHp;
    expect(chad.shield).toBeCloseTo(shield);
    chad.addStatus(world, 'stun', 1);
    run(world, 0.85);
    expect(chad.has('stun')).toBe(false); // 20% tenacity: 0.8s, not 1s
    const hp = chad.hp;
    run(world, MEWING.duration);
    expect(chad.hp - hp).toBeGreaterThan(shield * MEWING.healShare * 0.9);
  });
});

describe('Sigma Stare', () => {
  it('hurts and frightens enemies in front of him, not behind', () => {
    const { world, chad, foe } = setup(300);
    const behind = learnAll(world.add(new Marksman(world, TEAM.red)));
    behind.pos = { x: LANE.x - 300, y: LANE.y };
    chad.tryCast(world, 2, foe.pos);
    run(world, SIGMA_STARE.castTime + 0.05);
    expect(foe.has('fear')).toBe(true);
    expect(foe.hp).toBeLessThan(foe.stats.maxHp);
    expect(behind.has('fear')).toBe(false);
  });
});

describe('Ascension', () => {
  it('knocks up whoever is close, makes him bigger and tougher, and splashes his attacks', () => {
    const { world, chad, foe } = setup(200);
    const other = learnAll(world.add(new Marksman(world, TEAM.red)));
    other.pos = { x: LANE.x + 300, y: LANE.y + 60 };
    for (const a of chad.abilities) a.rank = 1;
    chad.level = 5;
    run(world, 0.02);
    const maxHp = chad.stats.maxHp;
    chad.tryCast(world, 3, chad.pos);
    expect(foe.has('stun')).toBe(true);
    run(world, 0.05);
    expect(chad.radius).toBeGreaterThan(40);
    expect(chad.stats.maxHp).toBe(maxHp + ASCENSION.bonusHp[0]);
    const otherHp = other.hp;
    chad.commandAttack(foe);
    run(world, 2);
    expect(other.hp).toBeLessThan(otherHp); // splashed
    run(world, ASCENSION.duration[0]);
    expect(chad.radius).toBe(40);
    expect(chad.stats.maxHp).toBe(maxHp);
  });
});
