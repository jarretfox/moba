import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { add, dist } from '../math';
import { STARTING_GOLD } from '../sim/progression';
import { holdsGrudge } from '../sim/warden';
import { World } from '../sim/world';
import { Zone } from '../sim/zone';
import { HunnaG, MushroomTotem, ROT } from './hunnag';
import { Marksman } from './marksman';
import { learnAll } from './testing';
import { Willmore } from './willmore';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

/** Top lane near the river: open ground. */
const LANE = { x: 5000, y: 1100 };

function setup() {
  const world = new World(MAP);
  const h = learnAll(world.add(new HunnaG(world, TEAM.blue)));
  h.pos = { ...LANE };
  const foe = learnAll(world.add(new Marksman(world, TEAM.red)));
  foe.pos = { x: LANE.x + 500, y: LANE.y };
  world.step();
  return { world, h, foe };
}

const holes = (world: World) => world.all().filter((e): e is Zone => e instanceof Zone && e.snapshot().vis === 'molehole');

describe('Rot', () => {
  it('eats away every half second and wears off', () => {
    const { world, h, foe } = setup();
    h.applyRot(world, foe, 2);
    expect(h.rotStacks(foe)).toBe(2);
    expect(foe.has('rot')).toBe(true);
    const before = foe.hp;
    run(world, 0.45);
    expect(foe.hp).toBe(before);
    run(world, 0.1);
    expect(foe.hp).toBeLessThan(before);
    run(world, ROT.duration);
    expect(h.rotStacks(foe)).toBe(0);
    const after = foe.hp;
    run(world, 1);
    expect(foe.hp).toBeCloseTo(Math.min(foe.stats.maxHp, after + foe.stats.hpRegen), 0);
  });

  it('bursts on the 4th stack, slowing and starting over', () => {
    const { world, h, foe } = setup();
    h.applyRot(world, foe, 3);
    const before = foe.hp;
    h.applyRot(world, foe);
    expect(before - foe.hp).toBeGreaterThan(30);
    expect(foe.has('slow')).toBe(true);
    expect(h.rotStacks(foe)).toBe(0);
    expect(foe.has('rot')).toBe(false);
  });
});

describe('Sludge Lob', () => {
  it('lands after a moment, hits and rots everything there, and leaves a slowing puddle', () => {
    const { world, h, foe } = setup();
    const before = foe.hp;
    h.tryCast(world, 0, foe.pos);
    run(world, 0.2 + 0.4); // cast time + most of the flight
    expect(foe.hp).toBe(before);
    run(world, 0.15);
    expect(foe.hp).toBeLessThan(before);
    expect(h.rotStacks(foe)).toBe(1);
    expect(world.all().some((e) => e instanceof Zone)).toBe(true);
    foe.clearStatus('slow');
    run(world, 0.1);
    expect(foe.moveSpeed).toBeLessThan(foe.stats.moveSpeed);
    run(world, 3);
    expect(world.all().some((e) => e instanceof Zone)).toBe(false);
  });
});

describe('Mushroom Totem', () => {
  function plant() {
    const s = setup();
    s.h.tryCast(s.world, 1, add(s.h.pos, { x: 300, y: 0 }));
    run(s.world, 0.3);
    const totem = s.world.units().find((u): u is MushroomTotem => u instanceof MushroomTotem)!;
    return { ...s, totem };
  }

  it('heals allied champions and rots enemies around it every 1.5 seconds', () => {
    const { world, h, foe, totem } = plant();
    h.pos = add(totem.pos, { x: -100, y: 0 });
    foe.pos = add(totem.pos, { x: 150, y: 0 });
    h.hp = 200;
    run(world, 1.6);
    expect(h.hp).toBeGreaterThan(205);
    expect(h.rotStacks(foe)).toBe(1);
  });

  it('gives vision, and enemies can knock it down for a little gold', () => {
    const { world, h, foe, totem } = plant();
    h.pos = { x: 1000, y: 3500 }; // far away, so only the totem can see
    foe.pos = add(totem.pos, { x: 400, y: 0 });
    world.vision.update(true);
    expect(world.vision.canSee(TEAM.blue, foe)).toBe(true);
    world.damage(foe, totem, 1e6, 'physical');
    expect(totem.dead).toBe(true);
    expect(foe.gold).toBeGreaterThan(STARTING_GOLD);
  });

  it('withers when its time is up, and only one stands at a time', () => {
    const { world, h, totem } = plant();
    h.abilities[1].readyAt = 0;
    h.tryCast(world, 1, add(h.pos, { x: -300, y: 0 }));
    run(world, 0.3);
    expect(totem.dead).toBe(true);
    const second = world.units().find((u) => u instanceof MushroomTotem && !u.dead)!;
    run(world, 16);
    expect(second.dead).toBe(true);
  });
});

describe('Mole Hole', () => {
  function dig() {
    const s = setup();
    const start = { ...s.h.pos };
    const end = { x: s.h.pos.x - 600, y: s.h.pos.y };
    s.h.tryCast(s.world, 2, end);
    return { ...s, start, end };
  }

  it('takes her through straight away, and leaves both holes open', () => {
    const { world, h, end } = dig();
    expect(dist(h.pos, end)).toBeLessThan(120);
    expect(holes(world)).toHaveLength(2);
    run(world, 5.1);
    expect(holes(world)).toHaveLength(0);
  });

  it('lets allies walk in one hole and out the other, but not enemies', () => {
    const { world, start, end } = dig();
    const ally = world.add(new Marksman(world, TEAM.blue));
    ally.pos = { ...start };
    const enemy = world.add(new Marksman(world, TEAM.red));
    enemy.pos = { x: start.x, y: start.y + 10 };
    run(world, 0.1);
    expect(dist(ally.pos, end)).toBeLessThan(180);
    expect(dist(enemy.pos, start)).toBeLessThan(30);
    // And it doesn't bounce them straight back, even if they come out right on top of the other hole...
    ally.pos = { ...end };
    run(world, 0.5);
    expect(dist(ally.pos, end)).toBeLessThan(30);
    // ...though once they've stepped off, walking back in works.
    ally.pos = add(end, { x: 0, y: 200 });
    run(world, 1);
    ally.pos = { ...end };
    run(world, 0.1);
    expect(dist(ally.pos, start)).toBeLessThan(180);
  });

  it("lets any burrowed Willmore through, even the enemy's (Kin of the Deep)", () => {
    const { world, start, end } = dig();
    const willmore = learnAll(world.add(new Willmore(world, TEAM.red)));
    willmore.pos = { x: start.x + 300, y: start.y };
    world.step();
    willmore.pos = { ...start };
    run(world, 0.1);
    expect(dist(willmore.pos, start)).toBeLessThan(30); // not burrowed: no entry

    willmore.pos = { x: start.x + 300, y: start.y };
    willmore.tryCast(world, 1, willmore.pos);
    world.step();
    willmore.pos = { ...start };
    run(world, 0.1);
    expect(dist(willmore.pos, end)).toBeLessThan(180);
  });
});

describe('The Deep Calls', () => {
  it('marks the ground, then roots everyone inside and bursts their Rot', () => {
    const { world, h, foe } = setup();
    const before = foe.hp;
    h.tryCast(world, 3, foe.pos);
    run(world, 0.7);
    expect(foe.hp).toBe(before);
    expect(foe.has('root')).toBe(false);
    run(world, 0.1);
    expect(foe.has('root')).toBe(true);
    expect(foe.has('slow')).toBe(true); // the Rot burst
    expect(before - foe.hp).toBeGreaterThan(100);
  });
});

describe('lore', () => {
  it('the Warden holds a grudge against her', () => {
    const { h } = setup();
    expect(holdsGrudge(h)).toBe(true);
  });
});
