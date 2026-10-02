import { describe, expect, it } from 'vitest';
import type { Champion } from '../champions/champion';
import { Marksman } from '../champions/marksman';
import { learnAll } from '../champions/testing';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, lanePath, type CampKind } from '../map/mapData';
import { add, dist } from '../math';
import { Chud } from './chud';
import { BUFFS, CAMPS, EMBER, FIRST_CAMP_SPAWN, Jungle, LEASH, MONSTERS, Monster, RESET_PATIENCE, type Camp } from './jungle';
import { STARTING_GOLD } from './progression';
import { spawnStructures } from './structure';
import { World } from './world';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

function setup() {
  const world = new World(MAP);
  const jungle = world.addSystem(new Jungle(world));
  run(world, FIRST_CAMP_SPAWN + 0.1);
  const camp = (kind: CampKind, side: PlayerTeam = TEAM.blue, top = true) =>
    jungle.camps.find((c) => c.kind === kind && c.spot.side === side && c.spot.pos.y < MAP.height / 2 === top)
    ?? jungle.camps.find((c) => c.kind === kind && c.spot.side === side)!;
  return { world, jungle, camp };
}

/** A Marksman standing just outside a camp, facing it. */
function hunter(world: World, camp: Camp, team: PlayerTeam = TEAM.blue): Champion {
  const m = world.add(new Marksman(world, team));
  m.pos = add(camp.spot.pos, { x: -350, y: 0 });
  learnAll(m);
  return m;
}

/** Hits the camp's first monster until it dies (or the time runs out). */
function killCamp(world: World, camp: Camp, m: Champion, seconds = 60): void {
  for (let i = 0; i < seconds * TICK_RATE && camp.alive(); i++) {
    const target = camp.members.find((x) => !x.dead);
    if (target) m.commandAttack(target);
    m.hp = m.stats.maxHp; // the test is about the camp, not whether we survive it
    world.step();
  }
}

describe('jungle camps', () => {
  it('appear at 1:15, one of each kind on each side, all on walkable ground', () => {
    const world = new World(MAP);
    const jungle = world.addSystem(new Jungle(world));
    run(world, FIRST_CAMP_SPAWN - 1);
    expect(jungle.camps.every((c) => !c.alive())).toBe(true);
    run(world, 1.1);
    for (const side of [TEAM.blue, TEAM.red]) {
      expect(jungle.camps.filter((c) => c.spot.side === side).map((c) => c.kind).sort()).toEqual(['emberToad', 'glowcap', 'gutterRats', 'mossback']);
    }
    for (const c of jungle.camps) {
      expect(c.members).toHaveLength(CAMPS[c.kind].members.length);
      for (const m of c.members) expect(world.grid.isWalkable(m.pos)).toBe(true);
    }
  });

  it("stand still until hit, then the whole camp fights back", () => {
    const { world, camp } = setup();
    const rats = camp('gutterRats');
    const m = hunter(world, rats);
    run(world, 3);
    expect(m.hp).toBe(m.stats.maxHp);
    expect(rats.members.every((r) => dist(r.pos, r.camp.spot.pos) < 120)).toBe(true);

    world.damage(m, rats.members[1], 10, 'physical');
    run(world, 4);
    expect(m.hp).toBeLessThan(m.stats.maxHp);
    expect(rats.members.every((r) => r.order.kind === 'attack' && r.order.targetId === m.id)).toBe(true);
  });

  it('give up past the leash: walk home, untouchable, and heal to full', () => {
    const { world, camp } = setup();
    const toad = camp('emberToad');
    const m = hunter(world, toad);
    m.pos = add(toad.spot.pos, { x: -700, y: 0 }); // at the edge of the leash, so the toad has to come out
    world.damage(m, toad.members[0], 300, 'true');
    run(world, 1.5);
    const monster = toad.members[0];
    expect(dist(monster.pos, toad.spot.pos)).toBeGreaterThan(300);
    m.pos = add(toad.spot.pos, { x: -(LEASH + 300), y: 0 }); // flee
    run(world, 0.2);
    expect(monster.resetting).toBe(true);
    expect(monster.isTargetable()).toBe(false);
    run(world, 5);
    expect(monster.resetting).toBe(false);
    expect(monster.hp).toBe(monster.stats.maxHp);
    expect(dist(monster.pos, toad.spot.pos)).toBeLessThan(40);
  });

  it("wait a moment for a foe who's gone untargetable, rather than heal to full", () => {
    const { world, camp } = setup();
    const moss = camp('mossback');
    const m = hunter(world, moss);
    const monster = moss.members[0];
    world.damage(m, monster, 600, 'true');
    run(world, 0.5);
    const hurt = monster.hp;
    m.addStatus(world, 'untargetable', 1); // a dodge, a blink
    run(world, 0.8);
    expect(monster.resetting).toBe(false);
    expect(monster.hp).toBe(hurt);
    run(world, 0.5);
    world.damage(m, monster, 10, 'true');
    run(world, 0.5);
    expect(monster.order.kind === 'attack' && monster.order.targetId).toBe(m.id);
    // One who stays out of reach too long: the camp gives up.
    m.addStatus(world, 'untargetable', RESET_PATIENCE + 2);
    run(world, RESET_PATIENCE + 0.5);
    expect(monster.resetting || monster.hp === monster.stats.maxHp).toBe(true);
  });

  it('also give up when dragged past the leash themselves', () => {
    const { world, camp } = setup();
    const toad = camp('emberToad');
    const m = hunter(world, toad);
    world.damage(m, toad.members[0], 100, 'true');
    run(world, 0.5);
    toad.members[0].pos = add(toad.spot.pos, { x: LEASH + 50, y: 0 }); // e.g. shoved by a crowd
    run(world, 0.2);
    expect(toad.members[0].resetting).toBe(true);
  });

  it('pay their gold and experience to the killer, and come back later', () => {
    const { world, camp } = setup();
    const moss = camp('mossback', TEAM.blue, false);
    const m = hunter(world, moss);
    killCamp(world, moss, m);
    expect(moss.alive()).toBe(false);
    expect(m.gold).toBeGreaterThanOrEqual(STARTING_GOLD + MONSTERS.mossback.gold);
    expect(m.level * 1000 + m.xp).toBeGreaterThanOrEqual(1000 + MONSTERS.mossback.xp - 1);

    run(world, CAMPS.mossback.respawn - 1);
    expect(moss.alive()).toBe(false);
    run(world, 1.5);
    expect(moss.alive()).toBe(true);
  });

  it('are ignored by Chuds and Shooties', () => {
    const world = new World(MAP);
    const structures = spawnStructures(world);
    const jungle = world.addSystem(new Jungle(world));
    run(world, FIRST_CAMP_SPAWN + 0.1);
    const rats = jungle.camps.find((c) => c.kind === 'gutterRats' && c.spot.side === TEAM.blue)!;
    const rat = rats.members[1];
    // A lost red Chud right next to the camp, and a red Shootie close enough to shoot it.
    const chud = world.add(new Chud(world, TEAM.red, 'melee', 'top', lanePath(world.map, TEAM.red, 'top')));
    chud.pos = add(rat.pos, { x: 90, y: 0 });
    const shootie = structures.find((s) => s.team === TEAM.red && s.role === 'outerShootie')!;
    shootie.pos = add(rat.pos, { x: 0, y: -400 });
    world.drainEvents();
    run(world, 3);
    // (Checked by damage dealt: a camp hit by something it can't fight back heals itself right away.)
    const ratIds = new Set(rats.members.map((r) => r.id));
    expect(world.drainEvents().filter((e) => e.e === 'dmg' && ratIds.has(e.target))).toEqual([]);
  });

  it('grow tougher as the match goes on', () => {
    const { world, jungle } = setup();
    const early = jungle.camps.find((c) => c.kind === 'mossback')!.members[0];
    run(world, 10 * 60);
    const later = new Monster(world, early.camp, 'mossback', early.pos);
    expect(later.stats.maxHp).toBeGreaterThan(early.stats.maxHp * 1.25);
  });
});

describe('jungle buffs', () => {
  it("go to whoever kills the buff monster, and do what they say", () => {
    const { world, camp } = setup();
    const toad = camp('emberToad');
    const m = hunter(world, toad);
    killCamp(world, toad, m);
    expect(m.buffsLeft(world).map((b) => b.kind)).toEqual(['ember']);
    expect(m.buffsLeft(world)[0].left).toBeCloseTo(BUFFS.ember.duration, 0);

    // Ember: basic attacks burn and slow.
    const dummy = world.add(new Marksman(world, TEAM.red));
    dummy.pos = add(m.pos, { x: 300, y: 0 });
    const hp = dummy.hp;
    const dealt = world.damage(m, dummy, 50, 'physical', { basic: true });
    expect(hp - dummy.hp).toBeCloseTo(dealt + EMBER.damage(m.level));
    expect(dummy.moveSpeed).toBeLessThan(dummy.stats.moveSpeed);

    // Glowcap: shorter cooldowns.
    const cap = camp('glowcap', TEAM.blue, false);
    const g = hunter(world, cap);
    killCamp(world, cap, g);
    expect(g.haste).toBe(20);
  });

  it('change hands when their holder is killed', () => {
    const { world, camp } = setup();
    const toad = camp('emberToad');
    const holder = hunter(world, toad);
    killCamp(world, toad, holder);
    run(world, 10);
    const killer = world.add(new Marksman(world, TEAM.red));
    killer.pos = add(holder.pos, { x: 300, y: 0 });
    world.damage(killer, holder, 1e6, 'true');
    const got = killer.buffsLeft(world);
    expect(got.map((b) => b.kind)).toEqual(['ember']);
    expect(got[0].left).toBeCloseTo(BUFFS.ember.duration - 10, 0);
  });

  it('run out', () => {
    const { world, camp } = setup();
    const toad = camp('emberToad');
    const m = hunter(world, toad);
    killCamp(world, toad, m);
    run(world, BUFFS.ember.duration + 1);
    expect(m.buffsLeft(world)).toEqual([]);
  });
});
