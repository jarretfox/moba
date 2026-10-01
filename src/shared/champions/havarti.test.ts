import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { World } from '../sim/world';
import { AGED, DIVINE_FONDUE, FONDUE_BLESSING, HOLY_WHEEL, Havarti, RIND_BLADE } from './havarti';
import { Marksman } from './marksman';
import { learnAll } from './testing';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

const LANE = { x: 5000, y: 1100 };

function setup(foeAt = 200, level = 1) {
  const world = new World(MAP);
  const cheese = learnAll(world.add(new Havarti(world, TEAM.blue)));
  cheese.pos = { ...LANE };
  cheese.level = level;
  const foe = learnAll(world.add(new Marksman(world, TEAM.red)));
  foe.pos = { x: LANE.x + foeAt, y: LANE.y };
  world.step();
  return { world, cheese, foe };
}

describe('Aged to Perfection', () => {
  it('starts in melee and reaches from the first tier on', () => {
    expect(setup().cheese.stats.attackRange).toBe(175);
    expect(setup(200, AGED.tiers[0]).cheese.stats.attackRange).toBe(AGED.rangedRange);
  });

  it('ripens with every attack: faster hands, and faster feet when fully ripe', () => {
    const { world, cheese, foe } = setup();
    const [as, ms] = [cheese.stats.attackSpeed, cheese.moveSpeed];
    cheese.commandAttack(foe);
    run(world, 8);
    expect(cheese.ripeness(world)).toBe(AGED.ripeness.max);
    expect(cheese.stats.attackSpeed).toBeCloseTo(as * (1 + AGED.ripeness.max * AGED.ripeness.perStack), 2);
    expect(cheese.moveSpeed).toBeGreaterThan(ms);
    cheese.commandStop();
    run(world, AGED.ripeness.duration + 0.5);
    expect(cheese.ripeness(world)).toBe(0);
  });

  it('from the second tier, sends a wave through whoever stands behind the target', () => {
    const { world, cheese, foe } = setup(300, AGED.tiers[1]);
    const behind = learnAll(world.add(new Marksman(world, TEAM.red)));
    behind.pos = { x: LANE.x + 500, y: LANE.y + 20 };
    cheese.commandAttack(foe);
    run(world, 2);
    expect(behind.hp).toBeLessThan(behind.stats.maxHp);
  });

  it('is always fully ripe at the last tier', () => {
    const { world, cheese } = setup(2000, AGED.tiers[2]);
    expect(cheese.ripeness(world)).toBe(AGED.ripeness.max);
  });
});

describe('Holy Wheel', () => {
  it('hits the first enemy in line, slows it, and curdles its resists', () => {
    const { world, cheese, foe } = setup(500);
    cheese.tryCast(world, 0, foe.pos);
    run(world, HOLY_WHEEL.castTime + 0.4);
    expect(foe.hp).toBeLessThan(foe.stats.maxHp);
    expect(foe.has('slow')).toBe(true);
    expect(foe.strongest('curdled')).toBe(HOLY_WHEEL.curdle);
    // Curdled armor lets more of a physical hit through.
    const hp = foe.hp;
    world.damage(null, foe, 100, 'physical');
    const curdledHit = hp - foe.hp;
    run(world, HOLY_WHEEL.curdleFor + 0.1);
    const hp2 = foe.hp;
    world.damage(null, foe, 100, 'physical');
    expect(curdledHit).toBeGreaterThan(hp2 - foe.hp);
  });
});

describe('Fondue Blessing', () => {
  it('heals her and the most hurt ally nearby, and speeds them both up', () => {
    const { world, cheese } = setup(3000);
    const hurt = world.add(new Marksman(world, TEAM.blue));
    hurt.pos = { x: LANE.x + 300, y: LANE.y };
    const fine = world.add(new Marksman(world, TEAM.blue));
    fine.pos = { x: LANE.x - 300, y: LANE.y };
    world.step();
    hurt.hp = 100;
    fine.hp = fine.stats.maxHp - 10;
    cheese.hp = 200;
    cheese.tryCast(world, 1, cheese.pos);
    expect(hurt.hp).toBeCloseTo(100 + FONDUE_BLESSING.heal[0]);
    expect(cheese.hp).toBeCloseTo(200 + FONDUE_BLESSING.heal[0]);
    expect(fine.has('speed')).toBe(false);
    expect(hurt.has('speed')).toBe(true);
  });
});

describe('Rind Blade', () => {
  it('adds magic damage to her attacks, and the empowered one bites into missing health', () => {
    const { world, cheese, foe } = setup(150);
    foe.hp = foe.stats.maxHp * 0.3;
    // One plain attack first, to compare against.
    cheese.commandAttack(foe);
    run(world, 0.5);
    const plain = foe.stats.maxHp * 0.3 - foe.hp;
    cheese.commandStop();
    run(world, 1.6);
    foe.hp = foe.stats.maxHp * 0.3;
    const hp = foe.hp;
    cheese.tryCast(world, 2, cheese.pos);
    expect(cheese.stats.attackRange).toBe(175); // the extra reach shows up next tick
    run(world, 0.05);
    expect(cheese.stats.attackRange).toBe(175 + RIND_BLADE.extraRange);
    cheese.commandAttack(foe);
    run(world, 0.5);
    // The empowered hit is bigger by about the missing-health bite (less magic resist).
    const missing = foe.stats.maxHp * 0.7 * RIND_BLADE.missing[0];
    expect(hp - foe.hp - plain).toBeGreaterThan(missing * 0.6);
    expect(cheese.has('rindBlade')).toBe(false);
  });
});

describe('Divine Fondue', () => {
  it('makes an ally untouchable, then erupts around them', () => {
    const { world, cheese, foe } = setup(3000);
    const ally = world.add(new Marksman(world, TEAM.blue));
    ally.pos = { x: LANE.x + 400, y: LANE.y };
    foe.pos = { x: LANE.x + 600, y: LANE.y };
    for (const a of cheese.abilities) a.rank = 1;
    world.step();
    cheese.tryCast(world, 3, ally.pos);
    run(world, DIVINE_FONDUE.castTime + 0.05);
    const hp = ally.hp;
    world.damage(foe, ally, 500, 'true');
    expect(ally.hp).toBe(hp);
    const foeHp = foe.hp;
    run(world, DIVINE_FONDUE.duration[0]);
    expect(foe.hp).toBeLessThan(foeHp);
    world.damage(foe, ally, 50, 'true');
    expect(ally.hp).toBeLessThan(hp);
  });

  it('falls back to herself when nobody is where she aimed', () => {
    const { world, cheese } = setup(3000);
    for (const a of cheese.abilities) a.rank = 1;
    cheese.tryCast(world, 3, { x: LANE.x + 800, y: LANE.y });
    run(world, DIVINE_FONDUE.castTime + 0.05);
    expect(cheese.has('blessed')).toBe(true);
  });
});
