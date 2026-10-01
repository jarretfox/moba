import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { dist } from '../math';
import { World } from '../sim/world';
import { DOUBLE_ACT, Daltonomo, JUGGLING_KNIVES, NOW_YOU_SEE_ME, SURPRISE_BOX } from './daltonomo';
import { Marksman } from './marksman';
import { learnAll } from './testing';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

const LANE = { x: 5000, y: 1100 };

/** Daltonomo at the lane spot; an enemy `foeAt` to his right, looking right (away from him) unless told otherwise. */
function setup(foeAt = 150, foeFacing = 0) {
  const world = new World(MAP);
  const jester = learnAll(world.add(new Daltonomo(world, TEAM.blue)));
  jester.pos = { ...LANE };
  const foe = learnAll(world.add(new Marksman(world, TEAM.red)));
  foe.pos = { x: LANE.x + foeAt, y: LANE.y };
  foe.facing = foeFacing;
  world.step();
  return { world, jester, foe };
}

const firstHit = (foeFacing: number) => {
  const { world, jester, foe } = setup(150, foeFacing);
  jester.commandAttack(foe);
  run(world, 0.5);
  return foe.stats.maxHp - foe.hp;
};

describe('Punchline', () => {
  it('hits harder from behind', () => {
    expect(firstHit(0)).toBeGreaterThan(firstHit(Math.PI) + 10);
  });
});

describe('Now You See Me', () => {
  it('blinks him away and hides him, until he strikes, and that strike is a big one', () => {
    const { world, jester, foe } = setup(600, Math.PI);
    expect(jester.tryCast(world, 0, { x: LANE.x + 500, y: LANE.y })).toBe(true);
    expect(dist(jester.pos, LANE)).toBeCloseTo(NOW_YOU_SEE_ME.blink, -1);
    run(world, 0.1);
    expect(world.vision.canSee(TEAM.red, jester)).toBe(false);
    const plain = firstHit(Math.PI);
    jester.commandAttack(foe);
    run(world, 0.5);
    expect(jester.has('vanished')).toBe(false);
    expect(foe.stats.maxHp - foe.hp).toBeGreaterThan(plain + NOW_YOU_SEE_ME.bonus[0]);
  });
});

describe('Surprise Box', () => {
  it('waits unseen, then springs on whoever comes near: fear, then shots', () => {
    const { world, jester, foe } = setup(2000);
    jester.tryCast(world, 1, { x: LANE.x + 300, y: LANE.y });
    run(world, SURPRISE_BOX.armTime + 0.1);
    const box = world.all().find((e) => e.kind === 'trap')!;
    // In plain sight of an enemy, but not close enough to set it off: still unseen.
    foe.pos = { x: LANE.x + 300 + SURPRISE_BOX.trigger + 150, y: LANE.y };
    run(world, 0.1);
    expect(world.vision.canSee(TEAM.red, foe)).toBe(true);
    expect(world.vision.canSee(TEAM.red, box)).toBe(false);
    foe.pos = { x: LANE.x + 450, y: LANE.y };
    run(world, 0.1);
    expect(foe.has('fear')).toBe(true);
    expect(world.vision.canSee(TEAM.red, box)).toBe(true);
    const hp = foe.hp;
    run(world, 1.5);
    expect(foe.hp).toBeLessThan(hp);
    run(world, SURPRISE_BOX.shootFor);
    expect(box.removed).toBe(true);
  });

  it('keeps only so many out at once', () => {
    const { world, jester } = setup(3000);
    for (let i = 0; i < 3; i++) {
      jester.abilities[1].readyAt = 0;
      jester.tryCast(world, 1, { x: LANE.x + 100 + i * 100, y: LANE.y + 200 });
      run(world, 0.1);
    }
    expect(world.all().filter((e) => e.kind === 'trap' && !e.removed).length).toBe(SURPRISE_BOX.maxActive);
  });
});

describe('Juggling Knives', () => {
  it('needs a target, and cuts deeper into the wounded', () => {
    const knife = (hpShare: number) => {
      const { world, jester, foe } = setup(500);
      foe.hp = foe.stats.maxHp * hpShare;
      const hp = foe.hp;
      expect(jester.tryCast(world, 2, foe.pos)).toBe(true);
      run(world, 0.6);
      return hp - foe.hp;
    };
    expect(knife(0.25)).toBeGreaterThan(knife(0.9) * (1 + JUGGLING_KNIVES.lowHealthBonus) * 0.9);
    const { world, jester } = setup(2000);
    expect(jester.tryCast(world, 2, { x: LANE.x + 300, y: LANE.y })).toBe(false);
  });

  it('makes his basic attacks slow', () => {
    const { world, jester, foe } = setup(150);
    jester.commandAttack(foe);
    run(world, 0.5);
    expect(foe.has('slow')).toBe(true);
  });
});

describe('Double Act', () => {
  it('brings out a double that passes for him, takes extra damage, and explodes when it dies', () => {
    const { world, jester, foe } = setup(220);
    for (const a of jester.abilities) a.rank = 1;
    jester.tryCast(world, 3, jester.pos);
    expect(jester.isTargetable()).toBe(false); // a blink of vanishing
    const double = jester.double!;
    const look = double.snapshot(world);
    expect(look).toMatchObject({ k: 'champion', champ: 'daltonomo', name: jester.name, tm: jester.team });
    const hp = double.hp;
    world.damage(foe, double, 100, 'true');
    expect(hp - double.hp).toBeCloseTo(100 * DOUBLE_ACT.takes);
    const foeHp = foe.hp;
    foe.pos = { x: double.pos.x + 100, y: double.pos.y };
    world.damage(foe, double, 99999, 'true');
    expect(foe.hp).toBeLessThan(foeHp);
    run(world, 0.5);
    expect(double.removed).toBe(true);
  });

  it('ends with a bang when its time is up', () => {
    const { world, jester, foe } = setup(3000);
    for (const a of jester.abilities) a.rank = 1;
    jester.tryCast(world, 3, jester.pos);
    const double = jester.double!;
    foe.pos = { x: double.pos.x + 150, y: double.pos.y };
    run(world, 0.1);
    foe.pos = { x: double.pos.x + 150, y: double.pos.y };
    const foeHp = foe.hp;
    run(world, DOUBLE_ACT.duration);
    expect(double.dead).toBe(true);
    expect(foe.hp).toBeLessThan(foeHp);
  });
});
