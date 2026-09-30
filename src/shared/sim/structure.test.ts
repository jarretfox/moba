import { describe, expect, it } from 'vitest';
import { Marksman } from '../champions/marksman';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, type Lane, type StructureRole } from '../map/mapData';
import { dist } from '../math';
import { Dummy } from './dummy';
import { spawnStructures, type Structure } from './structure';
import { World, mitigate } from './world';

function setup() {
  const world = new World(MAP);
  const structures = spawnStructures(world);
  const find = (team: PlayerTeam, role: StructureRole, lane: Lane | null = null) =>
    structures.find((s) => s.team === team && s.role === role && s.lane === lane)!;
  return { world, structures, find };
}

function run(world: World, seconds: number, eachTick?: () => void): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    world.step();
    eachTick?.();
  }
}

function champ(world: World, team: PlayerTeam, x: number, y: number): Marksman {
  const c = world.add(new Marksman(world, team));
  c.pos = { x, y };
  return c;
}

const kill = (world: World, s: Structure) => s.die(world, null);

// Blue's outer top Shootie stands at (4300, 1100); the lane runs along y = 1100.
const LANE_Y = 1100;

describe('structure order', () => {
  it('starts with only the outer Shooties open to damage', () => {
    const { structures } = setup();
    for (const s of structures) expect(s.isTargetable(), `${s.name} team ${s.team} ${s.lane}`).toBe(s.role === 'outerShootie');
  });

  it('opens each structure once the one in front of it falls', () => {
    const { world, find } = setup();
    const chain: [StructureRole, Lane | null][] = [
      ['outerShootie', 'top'],
      ['innerShootie', 'top'],
      ['oakner', 'top'],
      ['baseShootie', null],
      ['daBase', null],
    ];
    for (let i = 0; i < chain.length - 1; i++) {
      const next = find(TEAM.red, ...chain[i + 1]);
      expect(next.isTargetable()).toBe(false);
      kill(world, find(TEAM.red, ...chain[i]));
      world.step();
      expect(next.isTargetable()).toBe(true);
    }
    // The other lane is untouched.
    expect(find(TEAM.red, 'innerShootie', 'bot').isTargetable()).toBe(false);
  });

  it('regrows a fallen Oakner after four minutes, which shields the base Shootie again', () => {
    const { world, find } = setup();
    const oakner = find(TEAM.blue, 'oakner', 'top');
    const guard = find(TEAM.blue, 'baseShootie');
    kill(world, find(TEAM.blue, 'outerShootie', 'top'));
    kill(world, find(TEAM.blue, 'innerShootie', 'top'));
    kill(world, oakner);
    world.step();
    expect(guard.isTargetable()).toBe(true);

    run(world, 239);
    expect(oakner.dead).toBe(true);
    run(world, 1.1);
    expect(oakner.dead).toBe(false);
    expect(oakner.hp).toBe(oakner.stats.maxHp);
    expect(guard.isTargetable()).toBe(false);
  });
});

describe('Shootie targeting', () => {
  it('shoots Chuds (dummies for now) before champions, even when the champion is closer', () => {
    const { world, find } = setup();
    const shootie = find(TEAM.blue, 'outerShootie', 'top');
    const redChamp = champ(world, TEAM.red, 4500, LANE_Y);
    const redDummy = world.add(new Dummy(world, { x: 4700, y: LANE_Y }, 'Stand-in Chud'));

    run(world, 3);

    expect(shootie.order).toEqual({ kind: 'attack', targetId: redDummy.id });
    expect(redDummy.hp).toBeLessThan(redDummy.stats.maxHp);
    expect(redChamp.hp).toBe(redChamp.stats.maxHp);
  });

  it('switches to an enemy champion who hurts an allied champion in range, and stays on them', () => {
    const { world, find } = setup();
    const shootie = find(TEAM.blue, 'outerShootie', 'top');
    const redDummy = world.add(new Dummy(world, { x: 4700, y: LANE_Y }, 'Stand-in Chud'));
    const redChamp = champ(world, TEAM.red, 4800, LANE_Y + 150);
    const blueChamp = champ(world, TEAM.blue, 4600, LANE_Y + 200);

    world.step();
    expect(shootie.order).toEqual({ kind: 'attack', targetId: redDummy.id });

    world.damage(redChamp, blueChamp, 10, 'physical');
    world.step();
    expect(shootie.order).toEqual({ kind: 'attack', targetId: redChamp.id });

    run(world, 1); // long after the call for help has gone stale
    expect(shootie.order).toEqual({ kind: 'attack', targetId: redChamp.id });
  });

  it('ignores a champion fight that happens outside its range', () => {
    const { world, find } = setup();
    const shootie = find(TEAM.blue, 'outerShootie', 'top');
    const redDummy = world.add(new Dummy(world, { x: 4700, y: LANE_Y }, 'Stand-in Chud'));
    const redChamp = champ(world, TEAM.red, 4800, LANE_Y);
    const farBlueChamp = champ(world, TEAM.blue, 5600, LANE_Y);

    world.step();
    world.damage(redChamp, farBlueChamp, 10, 'physical');
    world.step();
    expect(shootie.order).toEqual({ kind: 'attack', targetId: redDummy.id });
  });

  it('hits harder with each consecutive shot at the same champion', () => {
    const { world, find } = setup();
    find(TEAM.blue, 'outerShootie', 'top');
    const redChamp = champ(world, TEAM.red, 4600, LANE_Y);
    const hits: number[] = [];

    run(world, 4, () => {
      for (const ev of world.drainEvents()) if (ev.e === 'dmg' && ev.target === redChamp.id) hits.push(ev.amount);
    });

    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits[0]).toBe(Math.round(mitigate(150, redChamp.stats.armor)));
    expect(hits[1]).toBeGreaterThan(hits[0]);
    expect(hits[2]).toBeGreaterThan(hits[1]);
  });

  it('never shoots its own side', () => {
    const { world, find } = setup();
    const shootie = find(TEAM.blue, 'outerShootie', 'top');
    const blueChamp = champ(world, TEAM.blue, 4500, LANE_Y);

    run(world, 3);

    expect(shootie.order.kind).toBe('idle');
    expect(blueChamp.hp).toBe(blueChamp.stats.maxHp);
  });
});

describe('structures and movement', () => {
  it('makes units walk around a standing Shootie, and frees the lane once it falls', () => {
    const { world, find } = setup();
    const shootie = find(TEAM.blue, 'outerShootie', 'top');
    const walker = champ(world, TEAM.blue, 3900, LANE_Y);
    const dest = { x: 4700, y: LANE_Y };
    let closest = Infinity;

    walker.commandMove(world, dest);
    run(world, 4, () => (closest = Math.min(closest, dist(walker.pos, shootie.pos))));

    expect(dist(walker.pos, dest)).toBeLessThan(1);
    expect(closest).toBeGreaterThanOrEqual(shootie.radius + walker.radius - 1);

    expect(world.grid.isWalkable(shootie.pos)).toBe(false);
    kill(world, shootie);
    expect(world.grid.isWalkable(shootie.pos)).toBe(true);
  });

  it('lets skillshots fly over structures', () => {
    const { world, find } = setup();
    const redOuter = find(TEAM.red, 'outerShootie', 'top');
    const shooter = champ(world, TEAM.blue, redOuter.pos.x - 500, LANE_Y);

    expect(shooter.tryCast(world, 0, redOuter.pos)).toBe(true); // Piercing Bolt straight through it
    run(world, 1);

    expect(redOuter.hp).toBe(redOuter.stats.maxHp);
  });
});
