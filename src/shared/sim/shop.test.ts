import { describe, expect, it } from 'vitest';
import { Bot } from '../bots/bot';
import { PROFILES } from '../bots/profiles';
import { nextPurchase } from '../bots/shopping';
import { Barbarian } from '../champions/barbarian';
import type { Champion } from '../champions/champion';
import { Marksman } from '../champions/marksman';
import { learnAll } from '../champions/testing';
import { TEAM, TICK_RATE } from '../constants';
import { ITEMS, afterBuying, partsUsed, priceFor, sellPrice, whyNot, type ItemId } from '../items';
import { MAP } from '../map/mapData';
import { dist } from '../math';
import { applyCommand } from './commands';
import { Fountain } from './fountain';
import { STARTING_GOLD } from './progression';
import { spawnStructures } from './structure';
import { World } from './world';

/** A champion standing in its fountain with plenty of gold. */
function shopper(kind: 'marksman' | 'barbarian' = 'marksman', gold = 10000) {
  const world = new World(MAP);
  const c: Champion = world.add(kind === 'marksman' ? new Marksman(world, TEAM.blue) : new Barbarian(world, TEAM.blue));
  c.gold = gold;
  world.step();
  return { world, c };
}

describe('the shop', () => {
  it('sells items for gold and adds their stats, topping up the new health', () => {
    const { world, c } = shopper();
    const before = { ad: c.stats.ad, maxHp: c.stats.maxHp, hp: c.hp };
    expect(c.buy(world, 'shiv')).toBe(true);
    expect(c.buy(world, 'loaf')).toBe(true);
    expect(c.gold).toBe(10000 - ITEMS.shiv.cost - ITEMS.loaf.cost);
    world.step();
    expect(c.stats.ad).toBeCloseTo(before.ad + 10);
    expect(c.stats.maxHp).toBeCloseTo(before.maxHp + 150);
    expect(c.hp).toBeCloseTo(before.hp + 150, 0);
  });

  it('only serves you in your fountain, or while dead', () => {
    const { world, c } = shopper();
    c.pos = { x: 3300, y: 3500 };
    expect(c.buy(world, 'shiv')).toBe(false);
    world.damage(null, c, 1e6, 'true');
    expect(c.buy(world, 'shiv')).toBe(true);
  });

  it('refuses when broke, full, doubling boots or doubling a core item, but basics stack', () => {
    const poor = shopper('marksman', 100);
    expect(poor.c.buy(poor.world, 'shiv')).toBe(false);

    const { world, c } = shopper();
    expect(c.buy(world, 'treads')).toBe(true);
    expect(c.buy(world, 'treads')).toBe(false); // one pair of boots
    expect(c.buy(world, 'fang')).toBe(true);
    expect(c.buy(world, 'fang')).toBe(false); // one of each core item
    expect(c.buy(world, 'shiv')).toBe(true);
    expect(c.buy(world, 'shiv')).toBe(true); // basics stack
    expect(c.buy(world, 'loaf')).toBe(false); // four slots
    expect(c.items).toEqual(['treads', 'fang', 'shiv', 'shiv']);
    // Full, but upgrading the boots uses them up, so there's room.
    expect(c.buy(world, 'striders')).toBe(true);
    expect(c.items).toEqual(['fang', 'shiv', 'shiv', 'striders']);
  });

  it('builds big items from their parts: cheaper by what you own, the parts used up', () => {
    const { world, c } = shopper();
    c.buy(world, 'shiv');
    c.buy(world, 'loaf');
    const gold = c.gold;
    // Warden's Link is a War Drum (from a Hearty Loaf) and a Rusty Shiv.
    expect(priceFor(c.items, 'link')).toBe(ITEMS.link.cost - ITEMS.shiv.cost - ITEMS.loaf.cost);
    expect(c.buy(world, 'link')).toBe(true);
    expect(c.items).toEqual(['link']);
    expect(c.gold).toBe(gold - (ITEMS.link.cost - ITEMS.shiv.cost - ITEMS.loaf.cost));
    // Parts of parts: two Shivs make most of a Bloodreaver (one into the Fang, one beside it).
    expect(partsUsed(['shiv', 'shiv'], 'reaver')).toEqual([0, 1]);
    expect(priceFor(['shiv', 'shiv'], 'reaver')).toBe(ITEMS.reaver.cost - 2 * ITEMS.shiv.cost);
    expect(afterBuying(['shiv', 'treads', 'shiv'], 'reaver')).toEqual(['treads', 'reaver']);
    // A Glowworm Lantern takes two Sagestones; one only knocks one off.
    expect(priceFor(['sagestone'], 'lantern')).toBe(ITEMS.lantern.cost - ITEMS.sagestone.cost);
    // Nothing to do with it: full price, nothing used.
    expect(partsUsed(['leather', 'bark'], 'reaver')).toEqual([]);
    // What you can afford counts the parts.
    expect(whyNot(['fang', 'shiv'], 1700, true, 'reaver')).toBeNull();
    expect(whyNot([], 1700, true, 'reaver')).toBe('Not enough gold');
  });

  it('takes back purchases and sales made this visit, with every coin and part, until you leave', () => {
    const { world, c } = shopper();
    c.buy(world, 'shiv');
    c.buy(world, 'fang');
    expect(c.items).toEqual(['fang']);
    expect(c.canUndo).toBe(true);
    expect(c.undo(world)).toBe(true);
    expect(c.items).toEqual(['shiv']);
    expect(c.gold).toBe(10000 - ITEMS.shiv.cost);
    expect(c.undo(world)).toBe(true);
    expect(c.items).toEqual([]);
    expect(c.gold).toBe(10000);
    expect(c.undo(world)).toBe(false);
    // A sale comes back too, into its slot.
    c.buy(world, 'shiv');
    c.buy(world, 'loaf');
    c.sell(world, 0);
    expect(c.undo(world)).toBe(true);
    expect(c.items).toEqual(['shiv', 'loaf']);
    expect(c.gold).toBe(10000 - ITEMS.shiv.cost - ITEMS.loaf.cost);
    // Walk out of the fountain and it's final.
    c.pos = { x: 3300, y: 3500 };
    world.step();
    c.pos = { ...world.map.spawns[TEAM.blue] };
    expect(c.canUndo).toBe(false);
    expect(c.undo(world)).toBe(false);
    // And it comes in over the network.
    c.buy(world, 'leather');
    applyCommand(world, c, { k: 'undo' });
    expect(c.items).toEqual(['shiv', 'loaf']);
    expect(c.meSnapshot(world).undo).toBeUndefined();
  });

  it('buys back part of the price and takes the stats away', () => {
    const { world, c } = shopper();
    const ad = c.stats.ad;
    c.buy(world, 'reaver');
    const gold = c.gold;
    expect(c.sell(world, 0)).toBe(true);
    world.step();
    expect(c.gold).toBe(gold + sellPrice('reaver'));
    expect(sellPrice('reaver')).toBe(2100);
    expect(c.items).toEqual([]);
    expect(c.stats.ad).toBeCloseTo(ad);
    expect(c.sell(world, 0)).toBe(false);
  });

  it("doesn't raise the Barbarian's Rage cap with mana items", () => {
    const { world, c } = shopper('barbarian');
    c.buy(world, 'lantern');
    world.step();
    expect(c.stats.maxMana).toBe(100);
  });

  it('checks commands from the network', () => {
    const { world, c } = shopper();
    applyCommand(world, c, { k: 'buy', item: '__proto__' as ItemId });
    applyCommand(world, c, { k: 'buy', item: 'nope' as ItemId });
    applyCommand(world, c, { k: 'sell', slot: -1 });
    applyCommand(world, c, { k: 'sell', slot: 0.5 });
    expect(c.items).toEqual([]);
    expect(c.gold).toBe(10000);
    applyCommand(world, c, { k: 'buy', item: 'shiv' });
    applyCommand(world, c, { k: 'sell', slot: 0 });
    expect(c.gold).toBe(10000 - ITEMS.shiv.cost + sellPrice('shiv'));
  });
});

describe('item stats', () => {
  it('ability haste shortens cooldowns: 100 haste halves them', () => {
    const { world, c } = shopper();
    learnAll(c);
    c.pos = { x: 3300, y: 3500 };
    c.tryCast(world, 0, { x: 3600, y: 3500 });
    const plain = c.abilities[0].readyAt - world.time;

    const hasty = shopper();
    learnAll(hasty.c);
    hasty.c.buy(hasty.world, 'drum'); // 15
    hasty.c.buy(hasty.world, 'lantern'); // 20
    hasty.c.pos = { x: 3300, y: 3500 };
    hasty.c.tryCast(hasty.world, 0, { x: 3600, y: 3500 });
    expect(hasty.c.abilities[0].readyAt - hasty.world.time).toBeCloseTo(plain * (100 / 135));
  });

  it('lifesteal heals on basic attacks, not on abilities or structures', () => {
    const { world, c } = shopper();
    c.buy(world, 'reaver');
    const enemy = world.add(new Marksman(world, TEAM.red));
    c.pos = { x: 5000, y: 3500 };
    enemy.pos = { x: 5300, y: 3500 };
    c.hp = 100;

    const dealt = world.damage(c, enemy, 200, 'physical', { basic: true });
    expect(c.hp).toBeCloseTo(100 + dealt * 0.15);

    c.hp = 100;
    world.damage(c, enemy, 200, 'physical');
    expect(c.hp).toBe(100);

    const tower = spawnStructures(world).find((s) => s.team === TEAM.red && s.role === 'outerShootie')!;
    expect(world.damage(c, tower, 200, 'physical', { basic: true })).toBeGreaterThan(0);
    expect(c.hp).toBe(100);
  });
});

describe('bot builds', () => {
  const walk = (build: ItemId[]) => {
    const items: ItemId[] = [];
    for (let i = 0; i < 20; i++) {
      const plan = nextPurchase(build, items);
      if (!plan) break;
      for (const slot of plan.sell) items.splice(slot, 1);
      items.splice(0, items.length, ...afterBuying(items, plan.item));
    }
    return items;
  };

  it('end with boots and the core items, building up from the parts and selling leftover basics', () => {
    expect(walk(PROFILES.marksman.build).sort()).toEqual(['link', 'longbow', 'reaver', 'striders']);
    expect(walk(PROFILES.barbarian.build).sort()).toEqual(['link', 'plate', 'reaver', 'treads']);
  });

  it('upgrade boots rather than stacking them, and never sell a part they need', () => {
    expect(nextPurchase(['treads', 'striders'], ['shiv', 'treads'])).toEqual({ item: 'striders', sell: [], net: ITEMS.striders.cost - ITEMS.treads.cost });
    // Full up: the part stays, a spare basic goes.
    const plan = nextPurchase(['leather', 'loaf', 'shiv', 'plate'], ['leather', 'loaf', 'shiv', 'treads']);
    expect(plan?.item).toBe('plate');
    expect(plan?.sell).toEqual([]);
    expect(plan?.net).toBe(ITEMS.plate.cost - ITEMS.leather.cost - ITEMS.loaf.cost);
    expect(sellPrice('treads')).toBeGreaterThan(0);
  });

  it('buy a starter item at the fountain, and head home to spend a full purse', () => {
    const world = new World(MAP);
    world.addSystem(new Fountain());
    spawnStructures(world);
    const m = world.add(new Marksman(world, TEAM.blue));
    const bot = new Bot(m, 'top', world);
    const tick = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
        for (const cmd of bot.think(world)) applyCommand(world, m, cmd);
        world.step();
      }
    };
    tick(1);
    expect(m.items).toEqual(['shiv']);
    expect(m.gold).toBe(STARTING_GOLD - ITEMS.shiv.cost);

    tick(20); // off to lane
    expect(dist(m.pos, world.map.spawns[TEAM.blue])).toBeGreaterThan(1500);
    m.gold = 2000;
    tick(15); // recall and shop
    // The Shiv went into the Fang and the Treads into the Swiftstriders, so the purse went further.
    expect(m.items).toEqual(['fang', 'striders']);
  });
});
