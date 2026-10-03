import { describe, expect, it } from 'vitest';
import type { Champion } from '../champions/champion';
import { Marksman } from '../champions/marksman';
import { learnAll } from '../champions/testing';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { ACTIVES, AEGIS_WARD, DRUM_BEAT, ITEM_ACTIVES_ON, LANTERN_LIGHT, activeSlots, type ItemId } from '../items';
import { MAP } from '../map/mapData';
import { dist } from '../math';
import { applyCommand } from './commands';
import { World } from './world';

// A brush patch sits at (3150, 2150), with open jungle round it.
const BRUSH = { x: 3150, y: 2150 };

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

function champ(world: World, team: PlayerTeam, x: number, y: number, items: ItemId[] = []): Champion {
  const c = learnAll(world.add(new Marksman(world, team)));
  c.pos = { x, y };
  c.items.push(...items);
  return c;
}

const sees = (world: World, team: PlayerTeam, id: number) => world.visibleTo(team).some((e) => e.id === id);

describe('item actives, while they are off', () => {
  it('leave every item without one, so nothing answers a use', () => {
    expect(Object.keys(ACTIVES)).toEqual([]);
    const world = new World(MAP);
    const me = champ(world, TEAM.blue, 3000, 2200, ['lantern', 'aegis', 'hourglass', 'drum']);
    for (let slot = 0; slot < 4; slot++) expect(me.useItem(world, slot, me.pos)).toBe(false);
    expect(activeSlots(me.items)).toEqual([]);
  });
});

// (Shelved with the actives: these run again once ITEM_ACTIVES_ON is back on.)
describe.skipIf(!ITEM_ACTIVES_ON)('item actives', () => {
  it('the Glowworm Lantern lights up a spot, brush and all, for a while, and only its team knows', () => {
    const world = new World(MAP);
    const blue = champ(world, TEAM.blue, 3150, 2450, ['lantern']);
    const red = champ(world, TEAM.red, BRUSH.x + 70, BRUSH.y);
    run(world, 0.2);
    expect(sees(world, TEAM.blue, red.id)).toBe(false);

    // Thrown just outside the patch: it still sees in.
    expect(blue.useItem(world, 0, { x: BRUSH.x, y: BRUSH.y + 200 })).toBe(true);
    run(world, 0.2);
    expect(sees(world, TEAM.blue, red.id)).toBe(true);
    // The light itself: there for blue, not for red.
    const ward = world.visibleTo(TEAM.blue).find((e) => e.k === 'ward');
    expect(ward?.vis).toBe('lantern');
    expect(world.visibleTo(TEAM.red).some((e) => e.k === 'ward')).toBe(false);
    // On cooldown now.
    expect(blue.useItem(world, 0, BRUSH)).toBe(false);
    expect(blue.meSnapshot(world).itemCd?.[0]).toBeGreaterThan(ACTIVES.lantern!.cooldown - 1);

    run(world, LANTERN_LIGHT.duration);
    expect(sees(world, TEAM.blue, red.id)).toBe(false);
    expect(world.all().some((e) => e.kind === 'ward')).toBe(false);
  });

  it('throws the light no further than its range', () => {
    const world = new World(MAP);
    const blue = champ(world, TEAM.blue, 3000, 2200, ['lantern']);
    blue.useItem(world, 0, { x: 9000, y: 2200 });
    const ward = world.all().find((e) => e.kind === 'ward')!;
    expect(dist(ward.pos, blue.pos)).toBeCloseTo(LANTERN_LIGHT.range, 0);
  });

  it("the Aegis shields you and allies close by, and the Drum speeds them up; nobody further off", () => {
    const world = new World(MAP);
    const me = champ(world, TEAM.blue, 3000, 2200, ['aegis', 'drum']);
    const near = champ(world, TEAM.blue, 3300, 2200);
    const far = champ(world, TEAM.blue, 3000 + AEGIS_WARD.radius + DRUM_BEAT.radius, 2200);
    const foe = champ(world, TEAM.red, 3200, 2200);
    expect(activeSlots(me.items)).toEqual([0, 1]);

    applyCommand(world, me, { k: 'use', slot: 0, x: 0, y: 0 });
    expect(me.shield).toBeCloseTo(AEGIS_WARD.shield + AEGIS_WARD.maxHpShare * me.stats.maxHp);
    expect(near.shield).toBeGreaterThan(AEGIS_WARD.shield);
    expect([far.shield, foe.shield]).toEqual([0, 0]);

    const speed = near.moveSpeed;
    applyCommand(world, me, { k: 'use', slot: 1, x: 0, y: 0 });
    expect(near.moveSpeed).toBeCloseTo(speed * (1 + DRUM_BEAT.speed));
    expect(far.has('speed') || foe.has('speed')).toBe(false);
    run(world, DRUM_BEAT.duration + 0.1);
    expect(near.has('speed')).toBe(false);
  });

  it("does nothing for items without an active, or for the dead, or the stunned", () => {
    const world = new World(MAP);
    const me = champ(world, TEAM.blue, 3000, 2200, ['shiv', 'drum']);
    expect(me.useItem(world, 0, me.pos)).toBe(false);
    expect(me.useItem(world, 5, me.pos)).toBe(false);
    me.addStatus(world, 'stun', 1);
    expect(me.useItem(world, 1, me.pos)).toBe(false);
    run(world, 1.1);
    expect(me.useItem(world, 1, me.pos)).toBe(true);
    // Only the items with actives get the D and F keys.
    expect(activeSlots(['shiv', 'drum', 'loaf', 'aegis'])).toEqual([1, 3]);
  });
});
