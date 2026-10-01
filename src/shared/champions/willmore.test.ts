import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, lanePath } from '../map/mapData';
import { dist } from '../math';
import { Chud } from '../sim/chud';
import { Pickup } from '../sim/pickup';
import type { Unit } from '../sim/unit';
import { World } from '../sim/world';
import { Marksman } from './marksman';
import { learnAll } from './testing';
import { Willmore } from './willmore';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

/** Top lane, river side: open ground with the lane's edge 380 above. */
const LANE = { x: 5400, y: 1100 };

function setup() {
  const world = new World(MAP);
  const w = learnAll(world.add(new Willmore(world, TEAM.blue)));
  w.pos = { ...LANE };
  const foe = learnAll(world.add(new Marksman(world, TEAM.red)));
  foe.pos = { x: LANE.x + 400, y: LANE.y };
  world.step();
  return { world, w, foe };
}

/** Lets the cooldown pass so the same ability can be cast again. */
const refresh = (w: Willmore, slot: number) => (w.abilities[slot].readyAt = 0);

function hpLost(u: Unit, before: number): number {
  return before - u.hp;
}

describe('Junk Toss', () => {
  it('cycles Can, Sludge, Boot, and shows everyone what is next', () => {
    const { world, w, foe } = setup();
    const results: { lost: number; slowed: boolean; stunned: boolean }[] = [];
    for (let i = 0; i < 3; i++) {
      expect(w.snapshot(world).badge).toBe(['🥫', '🧪', '👢'][i]);
      foe.hp = foe.stats.maxHp;
      foe.clearStatus('slow');
      foe.clearStatus('stun');
      const before = foe.hp;
      refresh(w, 0);
      expect(w.tryCast(world, 0, foe.pos)).toBe(true);
      run(world, 0.6);
      results.push({ lost: hpLost(foe, before), slowed: foe.has('slow'), stunned: foe.has('stun') });
    }
    const [can, sludge, boot] = results;
    expect(can.lost).toBeGreaterThan(sludge.lost * 1.3);
    expect(sludge.slowed).toBe(true);
    expect(boot.stunned).toBe(true);
    expect(can.slowed || can.stunned).toBe(false);
    expect(w.snapshot(world).badge).toBe('🥫'); // and round again
  });
});

describe('Burrow', () => {
  it('hides him from enemies (not allies), speeds him up, and stops his attacks', () => {
    const { world, w, foe } = setup();
    const speed = w.moveSpeed;
    w.tryCast(world, 1, w.pos);
    world.step();
    expect(world.vision.canSee(TEAM.red, w)).toBe(false);
    expect(world.vision.canSee(TEAM.blue, w)).toBe(true);
    expect(w.moveSpeed).toBeGreaterThan(speed * 1.3);

    foe.pos = { x: w.pos.x + 120, y: w.pos.y };
    const before = foe.hp;
    w.commandAttack(foe);
    run(world, 1.5);
    expect(foe.hp).toBe(before);
  });

  it('surfaces on a second press, knocking up and hurting enemies nearby', () => {
    const { world, w, foe } = setup();
    w.tryCast(world, 1, w.pos);
    run(world, 0.5);
    foe.pos = { x: w.pos.x + 150, y: w.pos.y };
    const before = foe.hp;
    expect(w.tryCast(world, 1, w.pos)).toBe(true);
    expect(w.burrowed).toBe(false);
    expect(foe.has('stun')).toBe(true);
    expect(foe.has('airborne')).toBe(true);
    expect(foe.hp).toBeLessThan(before);
  });

  it('pops up on its own after 4 seconds (knocking up whoever is there), or when he casts something else', () => {
    const a = setup();
    a.w.tryCast(a.world, 1, a.w.pos);
    run(a.world, 3.9);
    expect(a.w.burrowed).toBe(true);
    a.foe.pos = { x: a.w.pos.x + 150, y: a.w.pos.y };
    run(a.world, 0.2);
    expect(a.w.burrowed).toBe(false);
    expect(a.foe.has('airborne')).toBe(true);

    const b = setup();
    b.w.tryCast(b.world, 1, b.w.pos);
    run(b.world, 0.5);
    b.w.tryCast(b.world, 0, b.foe.pos);
    expect(b.w.burrowed).toBe(false);
  });

  it("can't hide a bleeding Willmore", () => {
    const { world, w } = setup();
    w.tryCast(world, 1, w.pos);
    w.addStatus(world, 'bleed', 2);
    expect(world.vision.canSee(TEAM.red, w)).toBe(true);
  });
});

describe('Sewer Hook', () => {
  it('drags the first enemy hit to him', () => {
    const { world, w, foe } = setup();
    foe.pos = { x: w.pos.x + 550, y: w.pos.y };
    w.tryCast(world, 2, foe.pos);
    run(world, 0.9);
    expect(dist(foe.pos, w.pos)).toBeLessThan(w.radius + foe.radius + 40);
  });

  it('pulls him to a wall when it catches one instead', () => {
    const { world, w, foe } = setup();
    foe.pos = { x: w.pos.x + 2000, y: w.pos.y }; // out of the way
    const start = { ...w.pos };
    w.tryCast(world, 2, { x: w.pos.x, y: w.pos.y - 700 }); // straight at the lane's edge
    run(world, 1);
    expect(start.y - w.pos.y).toBeGreaterThan(250);
    expect(world.grid.isWalkable(w.pos)).toBe(true);
  });
});

describe('Down Below', () => {
  it('needs someone beside him to grab', () => {
    const { world, w, foe } = setup();
    foe.pos = { x: w.pos.x + 1000, y: w.pos.y };
    expect(w.tryCast(world, 3, { x: w.pos.x - 500, y: w.pos.y })).toBe(false);
    expect(w.abilities[3].readyAt).toBe(0); // no cooldown spent
  });

  it('drags them under, out of reach and sight, and comes up where he aimed', () => {
    const { world, w, foe } = setup();
    foe.pos = { x: w.pos.x + 150, y: w.pos.y };
    const exit = { x: w.pos.x - 550, y: w.pos.y };
    const before = foe.hp;
    expect(w.tryCast(world, 3, exit)).toBe(true);
    run(world, 0.5);
    expect(foe.isTargetable()).toBe(false);
    expect(world.vision.canSee(TEAM.blue, foe)).toBe(false);
    run(world, 1.1);
    expect(dist(foe.pos, exit)).toBeLessThan(60);
    expect(foe.hp).toBeLessThan(before);
    expect(foe.has('airborne')).toBe(true);
    expect(dist(w.pos, foe.pos)).toBeLessThan(150);
  });
});

describe('Scavenger', () => {
  function chudAt(world: World, team: PlayerTeam, x: number, y: number): Chud {
    const c = world.add(new Chud(world, team, 'melee', 'top', lanePath(world.map, team, 'top')));
    c.pos = { x, y };
    return c;
  }

  it('turns his Chud kills into scrap that heals him and stacks armor', () => {
    const { world, w } = setup();
    const victim = chudAt(world, TEAM.red, w.pos.x + 300, w.pos.y);
    world.damage(w, victim, 1e6, 'true');
    const scrap = world.all().find((e) => e instanceof Pickup);
    expect(scrap).toBeDefined();

    const armor = w.stats.armor;
    w.hp = 300;
    w.pos = { ...scrap!.pos };
    run(world, 0.1);
    expect(w.hp).toBeGreaterThan(300);
    expect(w.stats.armor).toBeGreaterThan(armor);
    expect(w.meSnapshot(world).passiveStacks).toBe(1);
  });

  it("can only be picked up by him, and doesn't last", () => {
    const { world, w, foe } = setup();
    const victim = chudAt(world, TEAM.red, w.pos.x + 300, w.pos.y);
    world.damage(w, victim, 1e6, 'true');
    const scrap = world.all().find((e) => e instanceof Pickup)!;
    foe.pos = { ...scrap.pos };
    run(world, 1);
    expect(scrap.removed).toBe(false);
    run(world, 10);
    expect(world.all().some((e) => e instanceof Pickup)).toBe(false);
  });

  it('ignores champion kills', () => {
    const { world, w, foe } = setup();
    world.damage(w, foe, 1e6, 'true');
    expect(world.all().some((e) => e instanceof Pickup)).toBe(false);
  });
});
