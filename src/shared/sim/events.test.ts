import { describe, expect, it } from 'vitest';
import type { Champion } from '../champions/champion';
import { Marksman } from '../champions/marksman';
import { DT, TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, type EventSite } from '../map/mapData';
import { add, dist, lerpVec, type Vec2 } from '../math';
import type { EventKind, GameEvent, Snapshot } from '../protocol';
import { SnapshotDecoder, SnapshotEncoder } from '../snapshotCodec';
import { DEEP_POCKETS, ROYAL_FAVOR, WICKS_FAVOR } from './eventBuffs';
import { BossEvent, CART, CaptureEvent, COAT, Coat, EVENTS, EVENT_NAMES, EscortEvent, LooseChud, MapEvents, STALL, rollSchedule } from './events';
import { STARTING_GOLD } from './progression';
import { World } from './world';

type Evt = Extract<GameEvent, { e: 'evt' }>;

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

/** Steps until an event cue `k` turns up (or `seconds` pass). */
function until(world: World, k: Evt['k'], seconds: number): Evt | undefined {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    world.step();
    const hit = world.drainEvents().find((e): e is Evt => e.e === 'evt' && e.k === k);
    if (hit) return hit;
  }
  return undefined;
}

function setUp() {
  const world = new World(MAP);
  const events = world.addSystem(new MapEvents(world, () => 0.5));
  return { world, events };
}

/** Starts an event of this kind right now, at its first (top) site. */
function force(world: World, events: MapEvents, kind: EventKind) {
  events.force(world, kind, 0, () => 0);
  world.step();
  world.drainEvents();
  return events.current!;
}

function champ(world: World, team: PlayerTeam, pos: Vec2): Champion {
  const c = world.add(new Marksman(world, team));
  c.pos = { ...pos };
  return c;
}

const topSite = (kind: EventKind): EventSite => MAP.eventSites!.find((s) => s.kind === kind)!;

/** A seeded little generator for the schedule. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe('the schedule', () => {
  it('rolls two events a match, of different kinds, inside their windows, at sites of their kind', () => {
    for (let seed = 1; seed < 40; seed++) {
      const plan = rollSchedule(MAP.eventSites!, seeded(seed));
      expect(plan).toHaveLength(2);
      expect(plan[0].kind).not.toBe(plan[1].kind);
      plan.forEach((p, i) => {
        const [from, to] = EVENTS.windows[i];
        expect(p.at).toBeGreaterThanOrEqual(from);
        expect(p.at).toBeLessThanOrEqual(to);
        expect(p.site.kind).toBe(p.kind);
      });
    }
    // Different seeds, different matches.
    const kinds = new Set(Array.from({ length: 30 }, (_, i) => rollSchedule(MAP.eventSites!, seeded(i + 1)).map((p) => p.kind).join()));
    expect(kinds.size).toBeGreaterThan(2);
  });

  it('gives a map without sites no events, and a map with one kind of site only that kind', () => {
    expect(rollSchedule([], Math.random)).toEqual([]);
    const bossOnly = MAP.eventSites!.filter((s) => s.kind === 'boss');
    const plan = rollSchedule(bossOnly, seeded(3));
    expect(plan.map((p) => p.kind)).toEqual(['boss', 'boss']);
    const world = new World({ ...MAP, eventSites: undefined });
    const events = world.addSystem(new MapEvents(world));
    expect(events.plan).toEqual([]);
    expect(events.status(world)).toBeUndefined();
  });

  it('announces each event half a minute ahead, to everyone, then starts it on time', () => {
    const { world, events } = setUp();
    const first = events.plan[0];
    world.tick = Math.round((first.at - EVENTS.lead - 1) * TICK_RATE);
    run(world, 0.5);
    expect(events.status(world)).toBeUndefined();
    const soon = until(world, 'soon', 2)!;
    expect(soon).toMatchObject({ kind: first.kind, x: first.site.pos.x, y: first.site.pos.y, all: true });
    expect(soon.dur).toBe(EVENTS.lead);
    expect(world.vision.canSeeEvent(TEAM.red, soon)).toBe(true);
    expect(events.status(world)).toMatchObject({ kind: first.kind, name: EVENT_NAMES[first.kind], phase: 'soon', left: EVENTS.lead });
    const start = until(world, 'start', EVENTS.lead + 1)!;
    expect(start.kind).toBe(first.kind);
    expect(Math.abs(world.time - first.at)).toBeLessThan(0.1);
    expect(events.current?.kind).toBe(first.kind);
    expect(events.status(world)?.phase).toBe('live');
  });

  it('still gives an event its full warning when the one before it ran past its time', () => {
    const { world, events } = setUp();
    const first = events.plan[0];
    world.tick = Math.round((first.at - 5) * TICK_RATE);
    // A forced event jumps the queue and runs past the first one's time.
    const ev = force(world, events, 'capture') as CaptureEvent;
    run(world, 10);
    expect(events.current).toBe(ev);
    expect(world.time).toBeGreaterThan(first.at);
    // It ends: the overdue one is announced now, and starts a full lead later, not at once.
    champ(world, TEAM.blue, ev.pos);
    ev.bars[1] = 0.999;
    world.drainEvents();
    run(world, 0.2);
    expect(events.current).toBeNull();
    const ev2 = world.drainEvents().filter((e): e is Evt => e.e === 'evt');
    expect(ev2.some((e) => e.k === 'won')).toBe(true);
    expect(ev2.find((e) => e.k === 'soon')).toMatchObject({ kind: first.kind, dur: EVENTS.lead });
    expect(ev2.some((e) => e.k === 'start')).toBe(false);
    // The HUD shows the result for a moment, then the warning for the next one, with the rest of its lead.
    expect(events.status(world)).toMatchObject({ phase: 'done', kind: 'capture' });
    run(world, EVENTS.linger + 0.1);
    expect(events.status(world)).toMatchObject({ phase: 'soon', kind: first.kind });
    expect(events.status(world)!.left).toBeLessThanOrEqual(EVENTS.lead - EVENTS.linger);
    run(world, EVENTS.lead - EVENTS.linger - 1.4);
    expect(events.current).toBeNull();
    run(world, 1.5);
    expect(events.current?.kind).toBe(first.kind);
  });
});

describe('Three Chuds in a Coat', () => {
  function awake() {
    const { world, events } = setUp();
    const ev = force(world, events, 'boss') as BossEvent;
    return { world, events, ev, boss: ev.boss, site: topSite('boss') };
  }

  it('arrives at its site, under its full name, and ambles its path when left alone', () => {
    const { world, boss, site } = awake();
    expect(dist(boss.pos, site.pos)).toBeLessThan(15); // one tick's amble at most
    expect(boss.name).toBe('Three Chuds in a Coat');
    expect(boss.snapshot(world)).toMatchObject({ k: 'monster', mon: 'coat', tm: TEAM.neutral });
    let furthest = 0;
    for (let i = 0; i < 4 * TICK_RATE; i++) {
      world.step();
      furthest = Math.max(furthest, dist(boss.pos, site.pos));
    }
    expect(furthest).toBeGreaterThan(100);
    expect(furthest).toBeLessThan(COAT.leash);
  });

  it('leaves passers-by alone, fights whoever hits it near its site, ignores snipers further off, and heals when calm', () => {
    const { world, boss, site } = awake();
    const bystander = champ(world, TEAM.blue, add(site.pos, { x: -300, y: 0 }));
    run(world, 3);
    expect(bystander.hp).toBe(bystander.stats.maxHp);
    world.damage(bystander, boss, 50, 'physical');
    run(world, 4);
    expect(bystander.hp).toBeLessThan(bystander.stats.maxHp);

    const sniper = champ(world, TEAM.red, add(site.pos, { x: COAT.leash + 300, y: 0 }));
    bystander.pos = { x: 500, y: 500 }; // the first one leaves
    world.damage(sniper, boss, 1000, 'true');
    const hurt = boss.hp;
    run(world, 10);
    expect(sniper.hp).toBe(sniper.stats.maxHp);
    expect(boss.hp).toBeGreaterThan(hurt + 500);
  });

  it('topples along a telegraphed strip: in it you are hurt and thrown; out of it you are fine; then it lies there, easier to hit', () => {
    const { world, boss, site } = awake();
    const inside = champ(world, TEAM.blue, add(site.pos, { x: -320, y: 0 }));
    const outside = champ(world, TEAM.blue, add(site.pos, { x: -320, y: 120 }));
    for (const c of [inside, outside]) world.damage(c, boss, 10, 'physical');
    const mark = until(world, 'topple', COAT.topple.every + 1)!;
    expect(mark).toBeDefined();
    expect(mark.all).toBeUndefined();
    expect(world.vision.canSeeEvent(TEAM.blue, mark)).toBe(true);
    expect(world.vision.canSeeEvent(TEAM.red, mark)).toBe(false); // red has nobody there to see it
    const from = { x: mark.x, y: mark.y };
    const to = { x: mark.x2!, y: mark.y2! };
    inside.pos = lerpVec(from, to, 0.5);
    const across = { x: -(to.y - from.y), y: to.x - from.x };
    const len = Math.hypot(across.x, across.y) || 1;
    outside.pos = add(lerpVec(from, to, 0.5), { x: (across.x / len) * (mark.r! + 300), y: (across.y / len) * (mark.r! + 300) });
    // It can't swing while it winds up, so nothing but the crash touches them from here.
    const insideHp = inside.hp;
    const outsideHp = outside.hp;
    const crash = until(world, 'crash', mark.dur! + 0.2)!;
    expect(crash).toBeDefined();
    expect(inside.hp).toBeLessThan(insideHp - 50);
    expect(inside.has('stun')).toBe(true);
    expect(inside.has('airborne')).toBe(true);
    expect(outside.hp).toBeGreaterThanOrEqual(outsideHp);
    expect(outside.has('stun')).toBe(false);
    // Face down: stunned, and taking more damage until it gets up.
    expect(boss.has('stun')).toBe(true);
    const before = boss.hp;
    world.damage(outside, boss, 100, 'true');
    expect(before - boss.hp).toBeCloseTo(100 * (1 + COAT.topple.exposed), 5);
    run(world, COAT.topple.down + 0.1);
    expect(boss.has('stun')).toBe(false);
    const up = boss.hp;
    world.damage(outside, boss, 100, 'true');
    expect(up - boss.hp).toBeCloseTo(100, 5);
  });

  it('loses a Chud at each third of its health, which fights nearby champions for a while, and the coat gets shorter', () => {
    const { world, boss, site } = awake();
    const hitter = champ(world, TEAM.blue, add(site.pos, { x: -250, y: 0 }));
    hitter.hp = 1e5;
    const adds = () => world.units().filter((u): u is LooseChud => u instanceof LooseChud && !u.dead);
    world.drainEvents();
    world.damage(hitter, boss, boss.stats.maxHp * 0.4, 'true');
    expect(boss.name).toBe('Two Chuds in a Coat');
    expect(boss.snapshot(world).name).toBe('Two Chuds in a Coat');
    expect(adds()).toHaveLength(1);
    expect(world.drainEvents().find((e) => e.e === 'evt' && e.k === 'add')).toMatchObject({ kind: 'boss', text: 'Two Chuds in a Coat' });
    world.damage(hitter, boss, boss.stats.maxHp * 0.3, 'true');
    expect(boss.name).toBe('One Chud in a Coat');
    expect(adds()).toHaveLength(2);
    // The loose Chuds go for the champion by the site.
    const hp = hitter.hp;
    run(world, 3);
    expect(hitter.hp).toBeLessThan(hp);
    // Killing one pays a little.
    const gold = hitter.gold;
    world.damage(hitter, adds()[0], 1e6, 'true');
    expect(hitter.gold).toBe(gold + COAT.add.reward.gold);
    // The other gives up after a while.
    run(world, COAT.add.lasts + 1);
    expect(adds()).toHaveLength(0);
  });

  it('loses its patience after a while: faster and harder, and says so', () => {
    const { world, boss } = awake();
    const base = boss.stats.attackSpeed;
    run(world, COAT.enrageAt - 1);
    expect(boss.enraged).toBe(false);
    world.drainEvents();
    run(world, 1.1);
    expect(boss.enraged).toBe(true);
    expect(boss.stats.attackSpeed).toBeCloseTo(base * COAT.enrage.attackSpeed);
    expect(boss.snapshot(world).badge).toBe('😤');
    expect(world.drainEvents().some((e) => e.e === 'evt' && e.k === 'enrage')).toBe(true);
  });

  it('wanders off if nobody finishes it, paying nobody; the result lingers in the HUD a moment', () => {
    const { world, events, boss } = awake();
    const blue = champ(world, TEAM.blue, { x: 500, y: 500 });
    const red = champ(world, TEAM.red, { x: 11500, y: 500 });
    run(world, COAT.leavesAt - 1);
    expect(events.current).not.toBeNull();
    world.drainEvents();
    run(world, 1.1);
    expect(events.current).toBeNull();
    expect(world.units().includes(boss)).toBe(false);
    expect(world.drainEvents().find((e) => e.e === 'evt' && e.k === 'over')).toMatchObject({ kind: 'boss', all: true });
    expect(blue.gold).toBe(red.gold); // passive income only, the same on both sides
    expect(blue.has('deepPockets')).toBe(false);
    expect(events.status(world)).toMatchObject({ kind: 'boss', phase: 'done' });
    expect(events.status(world)?.team).toBeUndefined();
    run(world, EVENTS.linger + 0.1);
    expect(events.status(world)).toBeUndefined();
  });

  it('pays the killing team, puts it in the kill feed, and gives them Deep Pockets: gold every second, kept through deaths, not stolen', () => {
    const { world, events, boss, site } = awake();
    const killer = champ(world, TEAM.blue, add(site.pos, { x: -250, y: 0 }));
    const teammate = champ(world, TEAM.blue, { x: 1500, y: 3500 });
    const enemy = champ(world, TEAM.red, { x: 10500, y: 3500 });
    world.drainEvents();
    world.damage(killer, boss, 1e6, 'true');
    expect(boss.dead).toBe(true);
    expect(killer.gold).toBe(STARTING_GOLD + COAT.reward.gold);
    expect(teammate.gold).toBe(STARTING_GOLD + COAT.reward.gold);
    expect(enemy.gold).toBe(STARTING_GOLD);
    const ev = world.drainEvents();
    expect(ev.find((e) => e.e === 'kill')).toMatchObject({ killer: killer.name, victim: 'Three Chuds in a Coat', team: TEAM.blue, what: 'event' });
    expect(ev.find((e) => e.e === 'evt' && e.k === 'won')).toMatchObject({ kind: 'boss', team: TEAM.blue, text: killer.name, all: true });
    world.step();
    expect(events.current).toBeNull();
    expect(events.status(world)).toMatchObject({ phase: 'done', team: TEAM.blue });
    expect(killer.has('deepPockets')).toBe(true);
    expect(teammate.has('deepPockets')).toBe(true);
    expect(enemy.has('deepPockets')).toBe(false);
    expect(killer.buffsLeft(world).map((b) => b.kind)).toEqual(['deepPockets']);

    // Two gold a second.
    const paid = teammate.gold;
    run(world, 5.05);
    expect(teammate.gold - paid).toBeGreaterThanOrEqual(DEEP_POCKETS.goldPerSecond * 5);
    expect(teammate.gold - paid).toBeLessThanOrEqual(DEEP_POCKETS.goldPerSecond * 6);

    // Death doesn't lose it (back on respawn), and an enemy killing you doesn't take it.
    enemy.pos = add(killer.pos, { x: 100, y: 0 });
    world.damage(enemy, killer, 1e6, 'true');
    expect(killer.dead).toBe(true);
    expect(enemy.has('deepPockets')).toBe(false);
    run(world, 6);
    expect(killer.dead).toBe(false);
    expect(killer.has('deepPockets')).toBe(true);

    // And it runs out.
    run(world, DEEP_POCKETS.duration);
    expect(killer.has('deepPockets')).toBe(false);
    expect(teammate.has('deepPockets')).toBe(false);
  });
});

describe("Old Wick's cart", () => {
  function rolling() {
    const { world, events } = setUp();
    const ev = force(world, events, 'escort') as EscortEvent;
    return { world, events, ev, site: topSite('escort') };
  }

  it('runs along a path you can walk, starting in the middle', () => {
    const { world, ev, site } = rolling();
    for (const s of MAP.eventSites!.filter((s) => s.kind === 'escort')) {
      const path = s.path!;
      for (let i = 1; i < path.length; i++) {
        const n = Math.ceil(dist(path[i - 1], path[i]) / 50);
        for (let k = 0; k <= n; k++) expect(world.grid.isWalkable(lerpVec(path[i - 1], path[i], k / n))).toBe(true);
      }
    }
    expect(ev.pos).toEqual(site.pos);
    expect(ev.progress).toBeCloseTo(ev.length / 2, 0);
    expect(ev.end(TEAM.blue)).toEqual(site.path![0]);
    expect(ev.end(TEAM.red)).toEqual(site.path![site.path!.length - 1]);
  });

  it('goes toward the side with more champions beside it, and stalls when both sides are there', () => {
    const { world, events, ev } = rolling();
    const blue = champ(world, TEAM.blue, add(ev.pos, { x: 0, y: 100 }));
    run(world, 2);
    expect(ev.pushing).toBe(TEAM.blue);
    expect(ev.progress).toBeLessThan(ev.length / 2 - CART.speed * 1.5);
    expect(ev.pos.x).toBeLessThan(MAP.width / 2 - CART.speed * 1.5);
    expect(events.status(world)).toMatchObject({ kind: 'escort', phase: 'live', team: TEAM.blue, blue: 1, red: 0 });
    expect(events.status(world)!.progress).toBeLessThan(0.5);

    const red = champ(world, TEAM.red, add(ev.pos, { x: 0, y: -100 }));
    const where = ev.progress;
    run(world, 2);
    expect(ev.progress).toBe(where);
    expect(ev.pushing).toBeNull();
    expect(events.status(world)?.team).toBeUndefined();

    // Two reds to one blue: back it goes.
    champ(world, TEAM.red, add(ev.pos, { x: 50, y: -100 }));
    blue.pos = { ...blue.pos };
    red.pos = { ...red.pos };
    run(world, 1);
    expect(ev.progress).toBeGreaterThan(where);
  });

  it("pays the team whose end it reaches, with Wick's Favor", () => {
    const { world, events, ev } = rolling();
    ev.progress = 50;
    ev.pos = ev.end(TEAM.blue);
    const pusher = champ(world, TEAM.blue, add(ev.pos, { x: 60, y: 0 }));
    const far = champ(world, TEAM.blue, { x: 1500, y: 3500 });
    const enemy = champ(world, TEAM.red, { x: 10500, y: 3500 });
    const speed = pusher.stats.moveSpeed;
    const armor = pusher.stats.armor;
    world.drainEvents();
    run(world, 1);
    expect(events.current).toBeNull();
    expect(ev.winner).toBe(TEAM.blue);
    expect(pusher.gold).toBe(STARTING_GOLD + CART.reward.gold);
    expect(far.gold).toBe(STARTING_GOLD + CART.reward.gold);
    expect(enemy.gold).toBe(STARTING_GOLD);
    expect(world.drainEvents().find((e) => e.e === 'evt' && e.k === 'won')).toMatchObject({ kind: 'escort', team: TEAM.blue, all: true });
    expect(pusher.has('wicksFavor')).toBe(true);
    expect(pusher.stats.moveSpeed).toBeCloseTo(speed * (1 + WICKS_FAVOR.speed));
    expect(pusher.stats.armor).toBe(armor + WICKS_FAVOR.armor);
    expect(enemy.has('wicksFavor')).toBe(false);
  });

  it('breaks down when time runs out: a little for the side it was on, nothing if it never left the middle', () => {
    const { world, events } = rolling();
    const blue = champ(world, TEAM.blue, { x: 1500, y: 3500 });
    const red = champ(world, TEAM.red, { x: 10500, y: 3500 });
    world.drainEvents();
    run(world, CART.timeout + 0.1);
    expect(events.current).toBeNull();
    expect(blue.gold).toBe(red.gold); // passive income only, the same on both sides
    const over = world.drainEvents().find((e) => e.e === 'evt' && e.k === 'over');
    expect(over).toMatchObject({ kind: 'escort', all: true });
    expect(over && 'team' in over ? over.team : undefined).toBeUndefined();

    const again = force(world, events, 'escort') as EscortEvent;
    again.progress = again.length * 0.8;
    run(world, CART.timeout + 0.1);
    expect(red.gold - blue.gold).toBeCloseTo(CART.partial, 5);
    expect(red.has('wicksFavor')).toBe(false);
  });
});

describe('the Royal Tax Stall', () => {
  function open() {
    const { world, events } = setUp();
    const ev = force(world, events, 'capture') as CaptureEvent;
    return { world, events, ev, site: topSite('capture') };
  }

  it('fills the bar of a team alone in it, pays the holders as they stand there, and the first full bar takes it all with Royal Favor', () => {
    const { world, events, ev, site } = open();
    expect(ev.pos).toEqual(site.pos);
    const holder = champ(world, TEAM.blue, add(site.pos, { x: 80, y: 0 }));
    const far = champ(world, TEAM.blue, { x: 1500, y: 3500 });
    const enemy = champ(world, TEAM.red, { x: 10500, y: 3500 });
    const ad = holder.stats.ad;
    world.drainEvents();
    run(world, STALL.fillTime / 2);
    expect(ev.bars[1]).toBeCloseTo(0.5, 1);
    expect(events.status(world)).toMatchObject({ kind: 'capture', phase: 'live', team: TEAM.blue, red: 0 });
    expect(events.status(world)!.blue).toBeCloseTo(0.5, 1);
    const collects = world.drainEvents().filter((e): e is Evt => e.e === 'evt' && e.k === 'collect');
    expect(collects.length).toBeGreaterThanOrEqual(9);
    expect(collects[0]).toMatchObject({ kind: 'capture', team: TEAM.blue });
    expect(collects[0].all).toBeUndefined();
    const soFar = holder.gold - STARTING_GOLD;
    expect(soFar).toBeGreaterThanOrEqual(STALL.holdGold * 9);
    expect(far.gold).toBe(STARTING_GOLD); // only those standing there collect

    run(world, STALL.fillTime / 2 + 0.1);
    expect(events.current).toBeNull();
    expect(ev.winner).toBe(TEAM.blue);
    expect(holder.gold).toBeGreaterThanOrEqual(STARTING_GOLD + STALL.reward.gold + STALL.holdGold * 19);
    expect(far.gold).toBe(STARTING_GOLD + STALL.reward.gold);
    expect(enemy.gold).toBe(STARTING_GOLD);
    expect(world.drainEvents().find((e) => e.e === 'evt' && e.k === 'won')).toMatchObject({ kind: 'capture', team: TEAM.blue, all: true });
    expect(holder.has('royalFavor')).toBe(true);
    expect(far.has('royalFavor')).toBe(true);
    expect(holder.stats.ad).toBe(ad + ROYAL_FAVOR.ad);
    expect(holder.stats.ap).toBe(ROYAL_FAVOR.ap);
  });

  it('freezes while both teams stand in it, and drains the other bar while one team holds it', () => {
    const { world, ev, site } = open();
    const blue = champ(world, TEAM.blue, add(site.pos, { x: 80, y: 0 }));
    const red = champ(world, TEAM.red, add(site.pos, { x: -80, y: 0 }));
    run(world, 5);
    expect(ev.bars).toEqual({ 1: 0, 2: 0 });
    expect(ev.holder).toBeNull();
    red.pos = { x: 500, y: 500 };
    run(world, STALL.fillTime / 2);
    expect(ev.bars[1]).toBeCloseTo(0.5, 1);
    blue.pos = { x: 500, y: 600 };
    red.pos = add(site.pos, { x: -80, y: 0 });
    run(world, STALL.fillTime / 2);
    expect(ev.bars[2]).toBeCloseTo(0.5, 1);
    expect(ev.bars[1]).toBeCloseTo(0.5 - 0.5 * STALL.drain, 1);
  });

  it('packs up when time runs out: the team past halfway takes it, otherwise nobody', () => {
    const { world, events, ev } = open();
    const blue = champ(world, TEAM.blue, { x: 1500, y: 3500 });
    const red = champ(world, TEAM.red, { x: 10500, y: 3500 });
    world.drainEvents();
    run(world, STALL.timeout + 0.1);
    expect(events.current).toBeNull();
    expect(ev.winner).toBeNull();
    expect(blue.gold).toBe(red.gold); // passive income only, the same on both sides
    expect(world.drainEvents().find((e) => e.e === 'evt' && e.k === 'over')).toMatchObject({ kind: 'capture', all: true });

    const again = force(world, events, 'capture') as CaptureEvent;
    again.bars[1] = 0.6;
    run(world, STALL.timeout + 0.1);
    expect(again.winner).toBe(TEAM.blue);
    expect(blue.gold - red.gold).toBeCloseTo(STALL.reward.gold, 5);
    expect(blue.has('royalFavor')).toBe(true);
  });
});

describe('over the wire', () => {
  it('sends the event status only when it changes, and the decoder keeps it', () => {
    const enc = new SnapshotEncoder();
    const dec = new SnapshotDecoder();
    const base: Snapshot = { tick: 1, time: DT, ents: [], ev: [] };
    const event: Snapshot['event'] = { kind: 'capture', name: EVENT_NAMES.capture, phase: 'live', left: 100, x: 6000, y: 1650, blue: 0.2, red: 0, team: 1 };
    expect(enc.encode(base).event).toBeUndefined();
    const first = enc.encode({ ...base, tick: 2, event });
    expect(first.event).toEqual(event);
    expect(dec.decode(first)!.event).toEqual(event);
    const same = enc.encode({ ...base, tick: 3, event: { ...event } });
    expect('event' in same).toBe(false);
    expect(dec.decode(same)!.event).toEqual(event);
    const changed = enc.encode({ ...base, tick: 4, event: { ...event, left: 99 } });
    expect(changed.event?.left).toBe(99);
    const gone = enc.encode({ ...base, tick: 5 });
    expect('event' in gone).toBe(true);
    expect(gone.event).toBeUndefined();
    expect(dec.decode(gone)!.event).toBeUndefined();
  });

  it('keeps the Coat where the team can see it, like any neutral monster, but tells everyone the result', () => {
    const { world, events } = setUp();
    const ev = force(world, events, 'boss') as BossEvent;
    expect(world.visibleTo(TEAM.blue).some((e) => e.id === ev.boss.id)).toBe(false);
    champ(world, TEAM.blue, add(ev.pos, { x: -400, y: 0 }));
    run(world, 0.2); // fog is worked out a few times a second
    expect(world.visibleTo(TEAM.blue).some((e) => e.id === ev.boss.id)).toBe(true);
    expect(world.visibleTo(TEAM.red).some((e) => e.id === ev.boss.id)).toBe(false);
    expect(ev.boss instanceof Coat).toBe(true);
  });
});
