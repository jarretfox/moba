import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { HAZE_REVEAL } from '../sim/vision';
import { World } from '../sim/world';
import { CLOUD_NINE, Dabber, HOTBOX, LIGHT_IT_UP, RESIN, STICKY_ICKY } from './dabber';
import { Marksman } from './marksman';
import { learnAll } from './testing';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

const LANE = { x: 5000, y: 1100 };

function setup(foeAt = 400) {
  const world = new World(MAP);
  const rat = learnAll(world.add(new Dabber(world, TEAM.blue)));
  rat.pos = { ...LANE };
  const foe = learnAll(world.add(new Marksman(world, TEAM.red)));
  foe.pos = { x: LANE.x + foeAt, y: LANE.y };
  world.step();
  return { world, rat, foe };
}

describe('Sticky Resin', () => {
  it('stacks up with his attacks, smolders for true damage, and wears off', () => {
    const { world, rat, foe } = setup();
    rat.commandAttack(foe);
    run(world, 12);
    expect(rat.resinOn(foe)).toBe(RESIN.maxStacks);
    expect(foe.strongest('resin')).toBe(RESIN.maxStacks);
    rat.commandStop();
    foe.hp = foe.stats.maxHp;
    const hp = foe.hp;
    run(world, 1);
    // Two ticks of resin, less whatever the target regenerated in between.
    const burned = RESIN.maxStacks * RESIN.perStackPerSecond(1);
    expect(hp - foe.hp).toBeGreaterThan(burned - foe.stats.hpRegen);
    expect(hp - foe.hp).toBeLessThanOrEqual(burned + 0.01);
    run(world, RESIN.duration);
    expect(rat.resinOn(foe)).toBe(0);
  });
});

describe('Hotbox', () => {
  it('hides him from enemies after a moment, unless they get close', () => {
    const { world, rat, foe } = setup(HAZE_REVEAL + 200);
    expect(rat.tryCast(world, 0, rat.pos)).toBe(true);
    run(world, 0.2);
    expect(world.vision.canSee(TEAM.red, rat)).toBe(true); // not yet
    run(world, HOTBOX.delay);
    expect(world.vision.canSee(TEAM.red, rat)).toBe(false);
    foe.pos = { x: LANE.x + HAZE_REVEAL - 50, y: LANE.y };
    run(world, 0.1);
    expect(world.vision.canSee(TEAM.red, rat)).toBe(true);
  });

  it('ends when he attacks, with a burst of attack speed', () => {
    const { world, rat, foe } = setup(450);
    rat.tryCast(world, 0, rat.pos);
    run(world, HOTBOX.delay + 0.1);
    const speed = rat.stats.attackSpeed;
    rat.commandAttack(foe);
    run(world, 0.6);
    expect(rat.has('hazed')).toBe(false);
    expect(rat.stats.attackSpeed).toBeGreaterThan(speed * (1 + HOTBOX.attackSpeed[0] * 0.9));
  });
});

describe('Sticky Icky', () => {
  it('lands, slows, stacks resin, and keeps stacking from its puddle', () => {
    const { world, rat, foe } = setup(600);
    rat.tryCast(world, 1, foe.pos);
    run(world, STICKY_ICKY.castTime + STICKY_ICKY.flightTime + 0.05);
    expect(rat.resinOn(foe)).toBe(STICKY_ICKY.stacks);
    expect(foe.has('slow')).toBe(true);
    run(world, 2.1);
    expect(rat.resinOn(foe)).toBe(STICKY_ICKY.stacks + 2);
  });
});

describe('Light It Up', () => {
  it('burns the resin off for damage that grows with the stacks, and needs someone to burn', () => {
    const { world, rat, foe } = setup(600);
    expect(rat.tryCast(world, 2, rat.pos)).toBe(false);
    rat.applyResin(world, foe, 2);
    const other = learnAll(world.add(new Marksman(world, TEAM.red)));
    other.pos = { x: LANE.x - 600, y: LANE.y };
    rat.applyResin(world, other, 6);
    expect(rat.tryCast(world, 2, rat.pos)).toBe(true);
    const [a, b] = [foe.hp, other.hp];
    run(world, LIGHT_IT_UP.castTime + 0.05);
    expect(rat.resinOn(foe)).toBe(0);
    expect(rat.resinOn(other)).toBe(0);
    expect(b - other.hp).toBeGreaterThan(a - foe.hp);
  });

  it('only reaches so far', () => {
    const { world, rat, foe } = setup(LIGHT_IT_UP.range + 300);
    rat.applyResin(world, foe, 6);
    expect(rat.tryCast(world, 2, rat.pos)).toBe(false);
  });
});

describe('Cloud Nine', () => {
  it('reaches further and shoots through everyone in the line, coating them all', () => {
    const { world, rat, foe } = setup(700);
    const behind = learnAll(world.add(new Marksman(world, TEAM.red)));
    behind.pos = { x: LANE.x + 800, y: LANE.y + 10 };
    for (const a of rat.abilities) a.rank = 1;
    expect(rat.tryCast(world, 3, rat.pos)).toBe(true);
    run(world, 0.05);
    expect(rat.stats.attackRange).toBe(550 + CLOUD_NINE.range);
    rat.commandAttack(foe);
    run(world, 2);
    expect(rat.resinOn(foe)).toBeGreaterThan(0);
    expect(rat.resinOn(behind)).toBeGreaterThan(0);
    expect(rat.pos.x).toBeCloseTo(LANE.x, -1); // shot from where he stood
  });
});
