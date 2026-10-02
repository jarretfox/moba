import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, lanePath } from '../map/mapData';
import { dist } from '../math';
import type { GameEvent } from '../protocol';
import { Chud } from '../sim/chud';
import { Dummy } from '../sim/dummy';
import { spawnStructures } from '../sim/structure';
import { World } from '../sim/world';
import { Barbarian } from './barbarian';
import { Marksman } from './marksman';
import { learnAll } from './testing';

// Open jungle floor through blue's back door.
const Y = 3500;

function run(world: World, seconds: number, onEvents?: (events: GameEvent[]) => void): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    world.step();
    const ev = world.drainEvents();
    onEvents?.(ev);
  }
}

function barbAt(world: World, x: number, y = Y): Barbarian {
  const b = learnAll(world.add(new Barbarian(world, TEAM.blue)));
  b.pos = { x, y };
  return b;
}

const dummyAt = (world: World, x: number, y = Y) => world.add(new Dummy(world, { x, y }, 'Dummy'));

function redChampAt(world: World, x: number, y = Y): Marksman {
  const c = learnAll(world.add(new Marksman(world, TEAM.red as PlayerTeam)));
  c.pos = { x, y };
  return c;
}

function redChudAt(world: World, x: number, y = Y): Chud {
  const c = world.add(new Chud(world, TEAM.red, 'melee', 'top', lanePath(world.map, TEAM.red, 'top')));
  c.pos = { x, y };
  return c;
}

/** Damage numbers dealt to one unit while `during` runs. */
function damageTo(world: World, id: number, seconds: number): number[] {
  const out: number[] = [];
  run(world, seconds, (ev) => {
    for (const e of ev) if (e.e === 'dmg' && e.target === id) out.push(e.amount);
  });
  return out;
}

describe('Blood Rage', () => {
  it('builds Rage from basic attacks and burns it off out of combat', () => {
    const world = new World(MAP);
    const barb = barbAt(world, 3300);
    const dummy = dummyAt(world, 3420);
    expect(barb.mana).toBe(0);

    barb.commandAttack(dummy);
    run(world, 3); // hits land at ~0.3s and ~1.7s
    const built = barb.mana;
    expect(built).toBeGreaterThanOrEqual(16);

    barb.commandStop();
    run(world, 4);
    expect(barb.mana).toBe(built); // under 6s since the last hit: still in combat
    run(world, 3);
    expect(barb.mana).toBeLessThan(built);
    run(world, 15);
    expect(barb.mana).toBe(0);
  });

  it('makes the next ability Brutal at full Rage, spending it all', () => {
    const cleaveDamage = (brutal: boolean) => {
      const world = new World(MAP);
      const barb = barbAt(world, 3300);
      const dummy = dummyAt(world, 3450);
      if (brutal) barb.mana = 100;
      barb.tryCast(world, 0, dummy.pos);
      const hits = damageTo(world, dummy.id, 0.3);
      return { hits, rageAfter: barb.mana };
    };
    const normal = cleaveDamage(false);
    const brutal = cleaveDamage(true);
    expect(normal.hits).toHaveLength(1);
    expect(brutal.hits[0]).toBeCloseTo(normal.hits[0] * 1.5, -1);
    expect(brutal.rageAfter).toBeLessThan(10); // spent, then 5 back for the hit
  });

  it('keeps a Brutal cast Brutal even if Rage burns off during the wind-up', () => {
    const world = new World(MAP);
    const barb = barbAt(world, 3300);
    const dummy = dummyAt(world, 3450);
    run(world, 7); // well out of combat, so Rage is actively burning off
    barb.mana = 100;

    barb.tryCast(world, 0, dummy.pos); // Cleave has a 0.15s wind-up
    const hits = damageTo(world, dummy.id, 0.3);

    const normal = new World(MAP);
    const b2 = barbAt(normal, 3300);
    const d2 = dummyAt(normal, 3450);
    b2.tryCast(normal, 0, d2.pos);
    const normalHits = damageTo(normal, d2.id, 0.3);
    expect(hits[0]).toBeGreaterThan(normalHits[0] * 1.4);
  });
});

describe('Cleave', () => {
  it('hits what is in front, not behind, and heals more for champions', () => {
    const world = new World(MAP);
    const barb = barbAt(world, 3300);
    const front = dummyAt(world, 3480);
    const behind = redChudAt(world, 3150);
    barb.hp = 300;
    const heals: number[] = [];
    const hit = new Set<number>();

    barb.tryCast(world, 0, { x: 3600, y: Y });
    run(world, 0.3, (ev) => {
      for (const e of ev) {
        if (e.e === 'dmg' && e.src === barb.id) hit.add(e.target);
        if (e.e === 'heal' && e.target === barb.id) heals.push(e.amount);
      }
    });

    expect(hit.has(front.id)).toBe(true);
    expect(hit.has(behind.id)).toBe(false);
    expect(heals).toEqual([25]);
  });

  it("doesn't damage structures", () => {
    const world = new World(MAP);
    const structures = spawnStructures(world);
    const redOuter = structures.find((s) => s.team === TEAM.red && s.role === 'outerShootie' && s.lane === 'top')!;
    const barb = barbAt(world, redOuter.pos.x - 200, redOuter.pos.y);

    barb.tryCast(world, 0, redOuter.pos);
    run(world, 0.3);

    expect(redOuter.hp).toBe(redOuter.stats.maxHp);
  });
});

describe('War Cry', () => {
  it('slows nearby enemies and makes them hit softer', () => {
    const world = new World(MAP);
    const barb = barbAt(world, 3300);
    const chud = redChudAt(world, 3380);
    const unweakened = damageTo(world, barb.id, 1.5);

    barb.tryCast(world, 1, barb.pos);
    world.step();
    expect(chud.moveSpeed).toBeCloseTo(325 * 0.7);
    expect(chud.strongest('weaken')).toBe(0.2);
    const weakened = damageTo(world, barb.id, 1.5);

    expect(Math.max(...weakened)).toBeLessThan(Math.max(...unweakened));
  });
});

describe('Leap', () => {
  it('lands where aimed, hurting and slowing enemies there', () => {
    const world = new World(MAP);
    const barb = barbAt(world, 3200);
    const foe = redChampAt(world, 3700);

    barb.tryCast(world, 2, { x: 3640, y: Y });
    run(world, 0.2);
    expect(barb.has('airborne')).toBe(true);
    run(world, 0.35);

    expect(dist(barb.pos, foe.pos)).toBeLessThan(barb.radius + foe.radius + 5);
    expect(foe.hp).toBeLessThan(foe.stats.maxHp);
    expect(foe.has('slow')).toBe(true);
    expect(foe.has('stun')).toBe(false);
  });

  it('stuns instead when Brutal', () => {
    const world = new World(MAP);
    const barb = barbAt(world, 3200);
    const foe = redChampAt(world, 3700);
    barb.mana = 100;

    barb.tryCast(world, 2, { x: 3640, y: Y });
    run(world, 0.55);

    expect(foe.has('stun')).toBe(true);
  });

  it('clears walls', () => {
    const world = new World(MAP);
    // North of the wall chunk that runs x 3300–4300, y 2450–2800.
    const barb = barbAt(world, 3800, 2300);
    expect(world.grid.lineWalkable(barb.pos, { x: 3800, y: 2950 })).toBe(false);

    barb.tryCast(world, 2, { x: 3800, y: 2950 });
    run(world, 0.6);

    expect(barb.pos.y).toBeGreaterThan(2850);
    expect(world.grid.isWalkable(barb.pos)).toBe(true);
  });
});

describe('Berserk', () => {
  it('shortens crowd control', () => {
    const world = new World(MAP);
    const barb = barbAt(world, 3300);
    barb.tryCast(world, 3, barb.pos);
    world.step();

    barb.addStatus(world, 'stun', 1);
    run(world, 0.5);
    expect(barb.has('stun')).toBe(true);
    run(world, 0.2);
    expect(barb.has('stun')).toBe(false);
  });

  it('splashes basic attacks onto enemies around the target', () => {
    const world = new World(MAP);
    const barb = barbAt(world, 3300);
    const target = dummyAt(world, 3420);
    const beside = dummyAt(world, 3470, Y + 110);
    barb.tryCast(world, 3, barb.pos);

    barb.commandAttack(target);
    const splashed = damageTo(world, beside.id, 2);

    expect(splashed.length).toBeGreaterThan(0);
  });

  it('lasts longer with each takedown', () => {
    const world = new World(MAP);
    const barb = barbAt(world, 3300);
    const victim = dummyAt(world, 3420);
    barb.tryCast(world, 3, barb.pos);
    world.step();

    world.damage(barb, victim, 1e6, 'true');
    run(world, 7); // past the normal 6s

    expect(barb.snapshot(world).st).toContain('berserk');
    run(world, 1.2);
    expect(barb.snapshot(world).st ?? []).not.toContain('berserk');
  });
});
