import { describe, expect, it } from 'vitest';
import type { Champion } from '../champions/champion';
import { Logan } from '../champions/logan';
import { Marksman } from '../champions/marksman';
import { learnAll } from '../champions/testing';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP } from '../map/mapData';
import { dist } from '../math';
import type { GameEvent } from '../protocol';
import { BARRIER, CLARITY, EXHAUST, FLASH, HEAL, IGNITE, SMITE, SUMMONERS, TELEPORT, byLevel, fixSummoners, summonersFor, type SummonerId } from '../summoners';
import { applyCommand } from './commands';
import { Crab } from './crab';
import { spawnStructures } from './structure';
import { World } from './world';

const run = (world: World, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
};

/** Out in the top lane, between the outer Shooties. */
const LANE = { x: 5600, y: 1100 };

function champ(world: World, team: PlayerTeam, x: number, y: number, spells: [SummonerId, SummonerId] = ['flash', 'heal'], Kind: typeof Logan | typeof Marksman = Marksman): Champion {
  const c = learnAll(world.add(new Kind(world, team)));
  c.pos = { x, y };
  c.summoners = spells;
  return c;
}

function setup(spells: [SummonerId, SummonerId]) {
  const world = new World(MAP);
  const me = champ(world, TEAM.blue, LANE.x, LANE.y, spells);
  const foe = champ(world, TEAM.red, LANE.x + 400, LANE.y);
  world.vision.update();
  world.drainEvents();
  return { world, me, foe };
}

const press = (world: World, me: Champion, slot: number, at: { x: number; y: number }) => applyCommand(world, me, { k: 'spell', slot, x: at.x, y: at.y }, true);
const fails = (events: GameEvent[]) => events.filter((e) => e.e === 'castFail');
/** True damage `target` has taken since events were last drained. */
const burnt = (world: World, target: Champion) => world.drainEvents().reduce((sum, e) => sum + (e.e === 'dmg' && e.target === target.id && e.type === 'true' ? e.amount : 0), 0);

describe('picking summoner spells', () => {
  it('keeps two different spells the map allows, filling in from Flash and Heal', () => {
    expect(fixSummoners(['ignite', 'teleport'], 'rift')).toEqual(['ignite', 'teleport']);
    expect(fixSummoners(['ignite', 'ignite'], 'rift')).toEqual(['ignite', 'flash']);
    expect(fixSummoners(['nonsense', 42], 'rift')).toEqual(['flash', 'heal']);
    expect(fixSummoners(undefined, 'aram')).toEqual(['flash', 'heal']);
    // League's rules: no Smite or Teleport in ARAM, and Clarity and Mark only there.
    expect(fixSummoners(['smite', 'teleport'], 'aram')).toEqual(['flash', 'heal']);
    expect(fixSummoners(['mark', 'clarity'], 'rift')).toEqual(['flash', 'heal']);
    expect(fixSummoners(['mark', 'clarity'], 'aram')).toEqual(['mark', 'clarity']);
    expect(summonersFor('rift')).toEqual(['flash', 'ghost', 'heal', 'barrier', 'exhaust', 'ignite', 'cleanse', 'teleport', 'smite']);
    expect(summonersFor('aram')).toEqual(['flash', 'ghost', 'heal', 'barrier', 'exhaust', 'ignite', 'cleanse', 'clarity', 'mark']);
  });
});

describe('summoner spells', () => {
  it('Flash blinks you up to its range toward the cursor, then waits out its cooldown', () => {
    const { world, me } = setup(['flash', 'heal']);
    const from = { ...me.pos };
    press(world, me, 0, { x: me.pos.x - 2000, y: me.pos.y });
    expect(dist(me.pos, from)).toBeGreaterThan(FLASH.range - 60);
    expect(dist(me.pos, from)).toBeLessThanOrEqual(FLASH.range + 60);
    expect(me.summonerReady[0]).toBeCloseTo(world.time + SUMMONERS.flash.cooldown);
    // Again straight away: nothing, and you hear why.
    const at = { ...me.pos };
    press(world, me, 0, { x: me.pos.x + 300, y: me.pos.y });
    expect(me.pos).toEqual(at);
    expect(fails(world.drainEvents())).toEqual([{ e: 'castFail', src: me.id, slot: 0, sum: 0, why: 'cooldown' }]);
  });

  it('Flash keeps you walking where you were going, and works while rooted but not stunned', () => {
    const { world, me } = setup(['flash', 'heal']);
    const dest = { x: LANE.x - 800, y: LANE.y };
    applyCommand(world, me, { k: 'move', ...dest }, true);
    world.step();
    press(world, me, 0, { x: LANE.x - 400, y: LANE.y });
    run(world, 2);
    expect(dist(me.pos, dest)).toBeLessThan(40);

    const stunned = setup(['flash', 'heal']);
    stunned.me.addStatus(stunned.world, 'stun', 1);
    const at = { ...stunned.me.pos };
    press(stunned.world, stunned.me, 0, { x: at.x + 300, y: at.y });
    expect(stunned.me.pos).toEqual(at);
    stunned.me.clearStatus('stun');
    stunned.me.addStatus(stunned.world, 'root', 1);
    press(stunned.world, stunned.me, 0, { x: at.x + 300, y: at.y });
    expect(stunned.me.pos.x).toBeGreaterThan(at.x + 200);
  });

  it('Ghost speeds you up and lets you through other units', () => {
    const { world, me } = setup(['ghost', 'heal']);
    const before = me.moveSpeed;
    press(world, me, 0, me.pos);
    world.step();
    expect(me.moveSpeed).toBeGreaterThan(before * 1.2);
    expect(me.hasBody()).toBe(false);
  });

  it('Heal heals you and the most hurt ally nearby, not one far off', () => {
    const { world, me } = setup(['heal', 'flash']);
    const near = champ(world, TEAM.blue, LANE.x + 200, LANE.y + 100);
    const far = champ(world, TEAM.blue, LANE.x - 2000, LANE.y);
    for (const c of [me, near, far]) c.hp = c.stats.maxHp - 400;
    press(world, me, 0, me.pos);
    const amount = byLevel(HEAL.amount[0], HEAL.amount[1], me.level);
    expect(me.hp).toBeCloseTo(me.stats.maxHp - 400 + amount);
    expect(near.hp).toBeCloseTo(near.stats.maxHp - 400 + amount);
    expect(far.hp).toBe(far.stats.maxHp - 400);
  });

  it('Barrier shields you, more at higher levels', () => {
    const { world, me } = setup(['barrier', 'flash']);
    press(world, me, 0, me.pos);
    expect(me.shield).toBeCloseTo(BARRIER.shield[0]);
    expect(byLevel(BARRIER.shield[0], BARRIER.shield[1], 13)).toBe(BARRIER.shield[1]);
    run(world, BARRIER.duration + 0.1);
    expect(me.shield).toBe(0);
  });

  it('Exhaust slows and weakens the enemy champion at the cursor, and needs one there', () => {
    const { world, me, foe } = setup(['exhaust', 'flash']);
    press(world, me, 0, { x: LANE.x - 300, y: LANE.y + 300 }); // nobody there
    expect(fails(world.drainEvents())[0]).toMatchObject({ sum: 0, why: 'target' });
    expect(me.summonerReady[0]).toBe(0); // a miss costs nothing
    press(world, me, 0, { x: foe.pos.x + 60, y: foe.pos.y });
    expect(foe.strongest('slow')).toBe(EXHAUST.slow);
    expect(foe.strongest('weaken')).toBe(EXHAUST.weaken);
  });

  it('Ignite burns for true damage over its time and cuts healing; Cleanse puts it out', () => {
    const { world, me, foe } = setup(['ignite', 'flash']);
    press(world, me, 0, foe.pos);
    expect(foe.strongest('wounds')).toBe(IGNITE.wounds);
    run(world, IGNITE.duration + 0.1);
    expect(burnt(world, foe)).toBeCloseTo(IGNITE.damage[0], 0);

    const again = setup(['ignite', 'flash']);
    again.foe.summoners = ['cleanse', 'flash'];
    press(again.world, again.me, 0, again.foe.pos);
    run(again.world, 1.1);
    press(again.world, again.foe, 0, again.foe.pos);
    run(again.world, IGNITE.duration);
    expect(burnt(again.world, again.foe)).toBeCloseTo(IGNITE.damage[0] / IGNITE.duration, 0);
  });

  it('Cleanse breaks a stun (pressed while stunned), and the next one is shorter', () => {
    const { world, me } = setup(['cleanse', 'flash']);
    me.addStatus(world, 'stun', 2);
    me.addStatus(world, 'slow', 2, 0.5);
    press(world, me, 0, me.pos);
    expect(me.has('stun')).toBe(false);
    expect(me.has('slow')).toBe(false);
    me.addStatus(world, 'stun', 1);
    run(world, 0.5);
    expect(me.has('stun')).toBe(false); // 65% shorter: 0.35s
  });

  it('Teleport channels, then puts you beside the allied Shootie nearest the cursor, with a marker there meanwhile', () => {
    const world = new World(MAP);
    spawnStructures(world);
    const me = champ(world, TEAM.blue, 900, 3500, ['teleport', 'flash']);
    const shootie = { x: 4300, y: 1100 }; // blue's top outer
    press(world, me, 0, { x: shootie.x + 200, y: shootie.y + 100 });
    expect(me.has('teleport')).toBe(true);
    const marker = world.all().find((e) => e.snapshot(world).vis === 'teleport');
    expect(marker).toBeDefined();
    run(world, TELEPORT.channel - 0.2);
    expect(dist(me.pos, shootie)).toBeGreaterThan(2000);
    run(world, 0.4);
    expect(dist(me.pos, shootie)).toBeLessThan(250);
    expect(marker!.removed).toBe(true);
    expect(me.has('teleport')).toBe(false);
  });

  it('Teleport is called off by moving, and comes back sooner', () => {
    const world = new World(MAP);
    spawnStructures(world);
    const me = champ(world, TEAM.blue, 900, 3500, ['teleport', 'flash']);
    press(world, me, 0, { x: 4300, y: 1200 });
    run(world, 1);
    applyCommand(world, me, { k: 'move', x: 1000, y: 3500 }, true);
    expect(me.has('teleport')).toBe(false);
    run(world, TELEPORT.channel);
    expect(dist(me.pos, { x: 4300, y: 1100 })).toBeGreaterThan(2000);
    expect(me.summonerReady[0] - world.time).toBeLessThanOrEqual(TELEPORT.cutShort);
    // Nobody near the cursor to go to: it doesn't start.
    run(world, TELEPORT.cutShort);
    world.drainEvents();
    press(world, me, 0, { x: 6000, y: 3500 });
    expect(me.has('teleport')).toBe(false);
  });

  it('Smite hits a monster at the cursor for true damage, but not a champion', () => {
    const { world, me, foe } = setup(['smite', 'flash']);
    const crab = world.add(new Crab(world, { x: LANE.x, y: LANE.y + 300 }));
    world.vision.update();
    press(world, me, 0, foe.pos);
    expect(foe.hp).toBe(foe.stats.maxHp);
    press(world, me, 0, crab.pos);
    expect(crab.stats.maxHp - crab.hp).toBeCloseTo(SMITE.damage[0]);
  });

  it('Clarity fills your mana halfway, and nearby allies a quarter', () => {
    const { world, me } = setup(['clarity', 'flash']);
    const ally = champ(world, TEAM.blue, LANE.x + 150, LANE.y);
    me.mana = 0;
    ally.mana = 0;
    press(world, me, 0, me.pos);
    expect(me.mana).toBeCloseTo(me.stats.maxMana * CLARITY.self);
    expect(ally.mana).toBeCloseTo(ally.stats.maxMana * CLARITY.allies);
  });

  it('Mark throws a snowball that marks the first enemy it hits, and a second press dashes to them', () => {
    const { world, me, foe } = setup(['mark', 'flash']);
    const hp = foe.hp;
    press(world, me, 0, foe.pos);
    run(world, 0.5);
    expect(foe.hp).toBeLessThan(hp);
    expect(foe.has('marked')).toBe(true);
    expect(me.meSnapshot(world).sums[0].armed).toBe(true);
    press(world, me, 0, foe.pos);
    run(world, 0.5);
    expect(dist(me.pos, foe.pos)).toBeLessThan(me.radius + foe.radius + 40);
    expect(me.order).toEqual({ kind: 'attack', targetId: foe.id });
  });

  it('show up in your snapshot with their cooldowns', () => {
    const { world, me } = setup(['flash', 'ignite']);
    press(world, me, 0, { x: me.pos.x + 300, y: me.pos.y });
    const sums = me.meSnapshot(world).sums;
    expect(sums.map((s) => s.id)).toEqual(['flash', 'ignite']);
    expect(sums[0].cd).toBeCloseTo(SUMMONERS.flash.cooldown, 0);
    expect(sums[1].cd).toBe(0);
  });

  it('can be cast while recalling, which ends the recall', () => {
    const { world, me } = setup(['barrier', 'flash']);
    me.pos = { x: LANE.x - 3000, y: LANE.y };
    applyCommand(world, me, { k: 'recall' }, true);
    expect(me.recalling).toBe(true);
    press(world, me, 0, me.pos);
    expect(me.recalling).toBe(false);
  });
});

describe('Logan with Flash', () => {
  it('works for any champion, melee too', () => {
    const world = new World(MAP);
    const logan = champ(world, TEAM.blue, LANE.x, LANE.y, ['flash', 'ignite'], Logan);
    press(world, logan, 0, { x: LANE.x + 1000, y: LANE.y });
    expect(logan.pos.x).toBeGreaterThan(LANE.x + FLASH.range - 60);
  });
});
