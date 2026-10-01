import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { add, dist } from '../math';
import { World } from '../sim/world';
import type { Champion } from './champion';
import { LIONHEART, Logan, PRIDES_ROAR } from './logan';
import { Marksman } from './marksman';
import { learnAll } from './testing';
import { Willmore } from './willmore';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

const LANE = { x: 5000, y: 1100 };

function setup() {
  const world = new World(MAP);
  const logan = learnAll(world.add(new Logan(world, TEAM.blue)));
  logan.pos = { ...LANE };
  const foe = learnAll(world.add(new Marksman(world, TEAM.red)));
  foe.pos = { x: LANE.x + 250, y: LANE.y };
  world.step();
  return { world, logan, foe };
}

function ally(world: World, offset: { x: number; y: number }, as?: string): Champion {
  const a = world.add(new Marksman(world, TEAM.blue));
  a.pos = add(LANE, offset);
  if (as) Object.defineProperty(a, 'info', { value: { ...a.info, id: as } });
  return a;
}

describe('shields and fear', () => {
  it('shields soak damage before health, and run out', () => {
    const { world, foe } = setup();
    foe.addShield(world, 100, 2);
    world.damage(null, foe, 60, 'true');
    expect(foe.hp).toBe(foe.stats.maxHp);
    expect(foe.shield).toBe(40);
    world.damage(null, foe, 60, 'true');
    expect(foe.hp).toBe(foe.stats.maxHp - 20);
    foe.addShield(world, 100, 1);
    run(world, 1.1);
    expect(foe.shield).toBe(0);
  });

  it('fear sends you running from its source, unable to act', () => {
    const { world, logan, foe } = setup();
    const before = dist(foe.pos, logan.pos);
    foe.fear(world, logan.pos, 1);
    expect(foe.canAct(world)).toBe(false);
    expect(foe.tryCast(world, 0, logan.pos)).toBe(false);
    run(world, 0.9);
    expect(dist(foe.pos, logan.pos)).toBeGreaterThan(before + 200);
    run(world, 0.2);
    expect(foe.canAct(world)).toBe(true);
  });
});

describe('Lionheart', () => {
  it('shields and speeds him up when a nearby ally drops low, once in a while', () => {
    const { world, logan } = setup();
    const friend = ally(world, { x: -300, y: 0 });
    run(world, 0.1);
    const speed = logan.moveSpeed;
    friend.hp = friend.stats.maxHp * 0.25;
    run(world, 0.1);
    expect(logan.shield).toBeGreaterThan(0);
    expect(logan.moveSpeed).toBeGreaterThan(speed * 1.3);

    friend.hp = friend.stats.maxHp;
    run(world, LIONHEART.shieldFor + 0.5);
    friend.hp = friend.stats.maxHp * 0.25;
    run(world, 0.1);
    expect(logan.shield).toBe(0); // still on cooldown
  });

  it("ignores allies too far away, and for King Rix waits until he's really in trouble (Uneasy Alliance)", () => {
    const far = setup();
    const distant = ally(far.world, { x: -1500, y: 0 });
    run(far.world, 0.1);
    distant.hp = distant.stats.maxHp * 0.2;
    run(far.world, 0.1);
    expect(far.logan.shield).toBe(0);

    const { world, logan } = setup();
    const rix = ally(world, { x: -300, y: 0 }, 'kingrix');
    run(world, 0.1);
    rix.hp = rix.stats.maxHp * 0.25;
    run(world, 0.1);
    expect(logan.shield).toBe(0);
    rix.hp = rix.stats.maxHp * 0.1;
    run(world, 0.1);
    expect(logan.shield).toBeGreaterThan(0);
  });
});

describe('Pounce', () => {
  it('needs an enemy where he aims', () => {
    const { world, logan, foe } = setup();
    expect(logan.tryCast(world, 0, add(foe.pos, { x: 0, y: 300 }))).toBe(false);
    expect(logan.abilities[0].readyAt).toBe(0);
  });

  it('lands on them, and his next attack stuns and hits harder', () => {
    const { world, logan, foe } = setup();
    foe.pos = add(logan.pos, { x: 500, y: 0 });
    foe.stats.armor = 0;
    const before = foe.hp;
    expect(logan.tryCast(world, 0, foe.pos)).toBe(true);
    run(world, 0.8); // the leap, then the first attack's wind-up
    expect(dist(logan.pos, foe.pos)).toBeLessThan(logan.radius + foe.radius + 60);
    expect(foe.has('stun')).toBe(true);
    expect(before - foe.hp).toBeGreaterThan(logan.stats.ad + 20);
  });
});

describe('Thick Mane', () => {
  it('shields him, more with bonus health, and his attacks slow while it holds', () => {
    const { world, logan, foe } = setup();
    logan.tryCast(world, 1, logan.pos);
    const plain = logan.shield;
    expect(plain).toBeGreaterThan(0);

    const tanky = setup();
    tanky.logan.gold = 5000;
    tanky.logan.pos = { ...tanky.world.map.spawns[TEAM.blue] };
    tanky.logan.buy(tanky.world, 'plate');
    tanky.world.step();
    tanky.logan.tryCast(tanky.world, 1, tanky.logan.pos);
    expect(tanky.logan.shield).toBeGreaterThan(plain + 30);

    foe.pos = add(logan.pos, { x: 120, y: 0 });
    logan.commandAttack(foe);
    run(world, 0.6);
    expect(foe.has('slow')).toBe(true);
  });
});

describe('Maul', () => {
  it('makes them bleed over 3 seconds, and bleeding reveals a burrowed Willmore', () => {
    const { world, logan, foe } = setup();
    foe.pos = add(logan.pos, { x: 150, y: 0 });
    logan.tryCast(world, 2, foe.pos);
    run(world, 0.2);
    expect(foe.has('bleed')).toBe(true);
    world.drainEvents();
    run(world, 3.1);
    const bled = world
      .drainEvents()
      .filter((e) => e.e === 'dmg' && e.src === logan.id && e.target === foe.id)
      .reduce((sum, e) => sum + (e.e === 'dmg' ? e.amount : 0), 0);
    expect(bled).toBeGreaterThan(20); // 30 at rank 1, less armor

    const w = setup();
    const mole = learnAll(w.world.add(new Willmore(w.world, TEAM.red)));
    mole.pos = add(w.logan.pos, { x: 150, y: 0 });
    w.foe.pos = { x: 9000, y: 1100 };
    w.world.step();
    mole.tryCast(w.world, 1, mole.pos);
    w.world.step();
    expect(w.world.vision.canSee(TEAM.blue, mole)).toBe(false);
    w.logan.tryCast(w.world, 2, mole.pos);
    run(w.world, 0.2);
    expect(w.world.vision.canSee(TEAM.blue, mole)).toBe(true);
  });
});

describe("Pride's Roar", () => {
  it('scares enemies in front of him and shields and speeds up allies around him', () => {
    const { world, logan, foe } = setup();
    const friend = ally(world, { x: -200, y: 100 });
    const speed = friend.moveSpeed;
    logan.tryCast(world, 3, foe.pos);
    expect(foe.has('fear')).toBe(true);
    expect(friend.shield).toBeGreaterThan(0);
    run(world, 0.1);
    expect(friend.moveSpeed).toBeGreaterThan(speed * 1.2);
  });

  it("frightens King Rix's guards twice as long (the Royal Menagerie)", () => {
    const { world, logan, foe } = setup();
    Object.defineProperty(foe, 'fearsLions', { value: true });
    logan.tryCast(world, 3, foe.pos);
    run(world, PRIDES_ROAR.fear + 0.2);
    expect(foe.has('fear')).toBe(true);
    run(world, PRIDES_ROAR.fear);
    expect(foe.has('fear')).toBe(false);
  });
});

