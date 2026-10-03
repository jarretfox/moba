import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { learnAll } from '../champions/testing';
import { Marksman } from '../champions/marksman';
import type { Champion } from '../champions/champion';
import { BLOODFILL, HAMHOCK, HAT_AP, ITEMS, MOSSHEART, OATH, PRIDE, RECIPES, ROT_BURN, ROYAL_PAUSE, SPELLBLADE, STATIC, SUNDER, THORNS, WOUNDS, ITEM_IDS, type ItemId, ITEM_ACTIVES_ON } from '../items';
import { MAP } from '../map/mapData';
import type { GameEvent } from '../protocol';
import { World } from './world';

function run(world: World, seconds: number): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    world.step();
    out.push(...world.drainEvents());
  }
  return out;
}

/** Two champions face to face in the middle of the map: `me` (blue) owns `items`, `foe` (red) owns `theirs`. */
function duel(items: ItemId[] = [], theirs: ItemId[] = []) {
  const world = new World(MAP);
  const me: Champion = world.add(new Marksman(world, TEAM.blue));
  const foe: Champion = world.add(new Marksman(world, TEAM.red));
  for (const [c, list] of [[me, items], [foe, theirs]] as const) {
    c.gold = 100000;
    for (const id of list) expect(c.buy(world, id)).toBe(true);
  }
  me.pos = { x: 6000, y: 1300 };
  foe.pos = { x: 6150, y: 1300 };
  world.step();
  world.drainEvents();
  return { world, me, foe };
}

/** Damage `src` dealt `target` in these events. */
const dealt = (events: GameEvent[], src: number, target: number) =>
  events.reduce((sum, e) => sum + (e.e === 'dmg' && e.src === src && e.target === target ? e.amount : 0), 0);

describe('the item tree', () => {
  it('builds every recipe from items that exist, each part cheaper than the whole', () => {
    for (const id of ITEM_IDS) {
      for (const part of RECIPES[id] ?? []) {
        expect(ITEMS[part]).toBeDefined();
        expect(ITEMS[part].cost).toBeLessThan(ITEMS[id].cost);
      }
      const parts = (RECIPES[id] ?? []).reduce((sum, p) => sum + ITEMS[p].cost, 0);
      expect(parts).toBeLessThan(ITEMS[id].cost);
    }
  });

  it('builds legendaries from epics, and epics from basics', () => {
    for (const id of ITEM_IDS) {
      const tier = ITEMS[id].tier;
      for (const part of RECIPES[id] ?? []) {
        if (tier === 'epic') expect(ITEMS[part].tier).toBe('basic');
        if (tier === 'core') expect(['basic', 'epic']).toContain(ITEMS[part].tier);
      }
      if (tier === 'core') expect((RECIPES[id] ?? []).some((p) => ITEMS[p].tier === 'epic')).toBe(true);
    }
  });
});

describe('item passives', () => {
  it('Royal Plate hits back at a champion who hits you, and wounds them; an Ironbark Vest just hits back', () => {
    const { world, me, foe } = duel([], ['plate']);
    world.damage(me, foe, 50, 'physical', { basic: true });
    const events = world.drainEvents();
    expect(dealt(events, foe.id, me.id)).toBeGreaterThanOrEqual(Math.round((THORNS.plate * 100) / (100 + me.stats.mr)) - 1);
    expect(me.has('wounds')).toBe(true);
    const vest = duel([], ['vest']);
    vest.world.damage(vest.me, vest.foe, 50, 'physical', { basic: true });
    expect(dealt(vest.world.drainEvents(), vest.foe.id, vest.me.id)).toBeGreaterThan(0);
    expect(vest.me.has('wounds')).toBe(false);
    // Abilities don't set them off.
    const spell = duel([], ['plate']);
    spell.world.damage(spell.me, spell.foe, 50, 'physical');
    expect(dealt(spell.world.drainEvents(), spell.foe.id, spell.me.id)).toBe(0);
  });

  it('Wounds cut healing', () => {
    const { world, me } = duel();
    me.hp = 100;
    me.heal(world, 100);
    expect(me.hp).toBe(200);
    me.addStatus(world, 'wounds', WOUNDS.duration, WOUNDS.cut);
    me.heal(world, 100);
    expect(me.hp).toBeCloseTo(200 + 100 * (1 - WOUNDS.cut));
  });

  it("the Rotten Fork wounds champions it hits", () => {
    const { world, me, foe } = duel(['fork']);
    world.damage(me, foe, 30, 'physical', { basic: true });
    expect(foe.has('wounds')).toBe(true);
  });

  it("the Warden's Link sunders armor a little each hit, up to its cap, and physical hits land harder", () => {
    const { world, me, foe } = duel(['link']);
    const before = world.damage(me, foe, 100, 'physical');
    for (let i = 0; i < 8; i++) world.damage(me, foe, 1, 'physical', { basic: true });
    expect(foe.strongest('sundered')).toBeCloseTo(SUNDER.max);
    const after = world.damage(me, foe, 100, 'physical');
    expect(after).toBeGreaterThan(before);
  });

  it('a Spellblade item makes the next attack after a cast hit harder, once', () => {
    const { world, me, foe } = duel(['trident']);
    learnAll(me);
    world.damage(me, foe, 10, 'physical', { basic: true });
    const plain = dealt(world.drainEvents(), me.id, foe.id);
    expect(me.tryCast(world, 0, foe.pos)).toBe(true);
    world.drainEvents();
    world.damage(me, foe, 10, 'physical', { basic: true });
    const charged = world.drainEvents();
    expect(charged.some((e) => e.e === 'fx' && e.fx === 'spellblade')).toBe(true);
    expect(dealt(charged, me.id, foe.id)).toBeGreaterThan(plain + me.baseAd * SPELLBLADE.trident * 0.5);
    world.damage(me, foe, 10, 'physical', { basic: true });
    expect(dealt(world.drainEvents(), me.id, foe.id)).toBeLessThan(plain + 5);
  });

  it('the Pride Longbow adds magic damage to every third attack on the same champion', () => {
    const { world, me, foe } = duel(['longbow']);
    const hits = [0, 1, 2].map(() => {
      world.damage(me, foe, 10, 'physical', { basic: true });
      return dealt(world.drainEvents(), me.id, foe.id);
    });
    expect(hits[2]).toBeGreaterThan(hits[0] + PRIDE.damage * 0.5);
    expect(hits[1]).toBe(hits[0]);
  });

  it('the Stormstring chains lightning every fifth landed attack', () => {
    const { world, me, foe } = duel(['stormstring']);
    const other = world.add(new Marksman(world, TEAM.red));
    other.pos = { x: 6300, y: 1350 };
    world.step();
    world.drainEvents();
    let events: GameEvent[] = [];
    for (let i = 0; i < STATIC.every; i++) {
      world.damage(me, foe, 10, 'physical', { basic: true });
      events = world.drainEvents();
      if (i < STATIC.every - 1) expect(events.some((e) => e.e === 'fx' && e.fx === 'static')).toBe(false);
    }
    expect(events.filter((e) => e.e === 'fx' && e.fx === 'static').length).toBe(2);
    expect(dealt(events, me.id, other.id)).toBeGreaterThan(0);
  });

  it('the Rotroot Staff sets what your abilities hit burning, and basic attacks don’t', () => {
    const { world, me, foe } = duel(['staff']);
    world.damage(me, foe, 10, 'physical', { basic: true });
    expect(foe.has('burning')).toBe(false);
    world.damage(me, foe, 10, 'magic');
    expect(foe.has('burning')).toBe(true);
    world.drainEvents();
    const burn = dealt(run(world, ROT_BURN.duration + 0.5), me.id, foe.id);
    const tick = (foe.stats.maxHp * ROT_BURN.perSecond * 100) / (100 + foe.stats.mr);
    expect(burn).toBeGreaterThan(tick * (ROT_BURN.duration - 0.5));
    expect(burn).toBeLessThan(tick * (ROT_BURN.duration + 1));
  });

  it('the Great Glowcap Hat multiplies ability power', () => {
    const { me } = duel(['hat']);
    expect(me.stats.ap).toBeCloseTo(ITEMS.hat.stats.ap! * (1 + HAT_AP));
  });

  it('an Oath of the Old Guard softens damage to allies near its holder, not further off', () => {
    const { world, me, foe } = duel();
    const guard = world.add(new Marksman(world, TEAM.blue));
    guard.gold = 100000;
    guard.buy(world, 'oath');
    guard.pos = { x: me.pos.x - 200, y: me.pos.y };
    world.step();
    const near = world.damage(foe, me, 100, 'true');
    guard.pos = { x: me.pos.x - OATH.radius - 300, y: me.pos.y };
    world.step();
    const far = world.damage(foe, me, 100, 'true');
    expect(near).toBeCloseTo(far * (1 - OATH.reduction));
  });

  it('Mossheart makes heals and shields on you stronger', () => {
    const { world, me } = duel(['mossheart']);
    me.hp = 100;
    me.heal(world, 100);
    expect(me.hp).toBeCloseTo(100 + 100 * (1 + MOSSHEART));
    expect(me.addShield(world, 100, 5).amount).toBeCloseTo(100 * (1 + MOSSHEART));
  });

  it("Ogre's Hamhock heals you fast once you've been out of the fight a while", () => {
    const { world, me, foe } = duel(['hamhock']);
    world.damage(foe, me, 400, 'true');
    const hurt = me.hp;
    run(world, HAMHOCK.calmAfter - 1);
    const early = me.hp - hurt;
    run(world, 2);
    expect(me.hp - hurt - early).toBeGreaterThan(me.stats.maxHp * HAMHOCK.regen);
  });

  it('Ironshod Boots soften basic attacks; Sewer Waders shorten stuns', () => {
    const { world, me, foe } = duel([], ['ironshod']);
    const basic = world.damage(me, foe, 100, 'true', { basic: true });
    const spell = world.damage(me, foe, 100, 'true');
    expect(basic).toBeLessThan(spell);
    const waders = duel([], ['waders']);
    waders.foe.addStatus(waders.world, 'stun', 1);
    run(waders.world, 0.8);
    expect(waders.foe.has('stun')).toBe(false);
  });

  it.skipIf(!ITEM_ACTIVES_ON)('the Royal Hourglass stops time for you: untouchable and stuck, then back to normal', () => {
    const { world, me, foe } = duel(['hourglass']);
    expect(me.useItem(world, me.items.indexOf('hourglass'), me.pos)).toBe(true);
    expect(world.damage(foe, me, 300, 'true')).toBe(0);
    expect(me.isTargetable()).toBe(false);
    expect(me.canAct(world)).toBe(false);
    run(world, ROYAL_PAUSE.duration + 0.1);
    expect(me.isTargetable()).toBe(true);
    expect(world.damage(foe, me, 300, 'true')).toBeGreaterThan(0);
  });

  it('the Bloodreaver banks lifesteal past full health as a shield, up to its cap', () => {
    const { world, me, foe } = duel(['reaver']);
    expect(me.hp).toBe(me.stats.maxHp);
    for (let i = 0; i < 40; i++) world.damage(me, foe, 200, 'physical', { basic: true });
    expect(me.shield).toBeGreaterThan(0);
    expect(me.shield).toBeLessThanOrEqual(BLOODFILL.base + BLOODFILL.perLevel * me.level + 1e-6);
  });
});
