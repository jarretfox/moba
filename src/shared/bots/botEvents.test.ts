import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { add, dist, type Vec2 } from '../math';
import type { EventKind } from '../protocol';
import { BossEvent, CaptureEvent, EscortEvent, MapEvents, STALL } from '../sim/events';
import { Fountain } from '../sim/fountain';
import { World } from '../sim/world';
import { Bot, runBots } from './bot';
import { addBots } from './lineup';

function match() {
  const world = new World(MAP);
  world.addSystem(new Fountain());
  const events = world.addSystem(new MapEvents(world, () => 0.5));
  return { world, events };
}

function run(world: World, bots: Bot[], seconds: number, eachTick?: () => void): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    runBots(world, bots);
    world.step();
    world.drainEvents();
    eachTick?.();
  }
}

/** Starts an event now, at its first (top) site. */
function start(world: World, events: MapEvents, kind: EventKind) {
  events.force(world, kind, 0, () => 0);
  world.step();
  return events.current!;
}

const at = (bot: Bot, p: Vec2) => (bot.champion.pos = { ...p });

describe('bots and the map events', () => {
  it('go and hit Three Chuds in a Coat when it turns up close by', () => {
    const { world, events } = match();
    const ev = start(world, events, 'boss') as BossEvent;
    const [bot] = addBots(world, TEAM.blue, 1);
    at(bot, add(ev.pos, { x: -900, y: 0 }));
    let swung = false;
    run(world, [bot], 8, () => {
      if (bot.champion.order.kind === 'attack' && bot.champion.order.targetId === ev.boss.id) swung = true;
    });
    expect(swung).toBe(true);
    expect(ev.boss.hp).toBeLessThan(ev.boss.stats.maxHp);
  });

  it('walk into the Royal Tax Stall and stand there', () => {
    const { world, events } = match();
    const ev = start(world, events, 'capture') as CaptureEvent;
    const [bot] = addBots(world, TEAM.blue, 1);
    at(bot, add(ev.pos, { x: -1500, y: 350 }));
    run(world, [bot], 12);
    expect(dist(bot.champion.pos, ev.pos)).toBeLessThan(STALL.radius);
    expect(ev.bars[1]).toBeGreaterThan(0);
  });

  it("stand by Old Wick's cart, on their own side of it, and push it home", () => {
    const { world, events } = match();
    const ev = start(world, events, 'escort') as EscortEvent;
    const [bot] = addBots(world, TEAM.blue, 1);
    at(bot, add(ev.pos, { x: -700, y: 250 }));
    const middle = ev.progress;
    run(world, [bot], 12);
    expect(ev.progress).toBeLessThan(middle - 300);
    expect(bot.champion.pos.x).toBeLessThan(ev.pos.x + 60); // between the cart and home
  });

  it("don't leave their lane for an event far away, or when they're hurt", () => {
    const { world, events } = match();
    const ev = start(world, events, 'capture') as CaptureEvent;
    const [far] = addBots(world, TEAM.blue, 1);
    at(far, { x: 2200, y: 1100 }); // the top lane by its own Shooties, a long way off
    run(world, [far], 6);
    expect(dist(far.champion.pos, ev.pos)).toBeGreaterThan(2600);

    const { world: w2, events: e2 } = match();
    const boss = start(w2, e2, 'boss') as BossEvent;
    const [hurt] = addBots(w2, TEAM.red, 1);
    at(hurt, add(boss.pos, { x: 900, y: 0 }));
    hurt.champion.hp = hurt.champion.stats.maxHp * 0.4;
    let swung = false;
    run(w2, [hurt], 6, () => {
      if (hurt.champion.order.kind === 'attack' && hurt.champion.order.targetId === boss.boss.id) swung = true;
    });
    expect(swung).toBe(false);
    expect(boss.boss.hp).toBe(boss.boss.stats.maxHp);
  });

  it('send two of a team at most, so the lanes are never both left empty', () => {
    const { world, events } = match();
    const ev = start(world, events, 'capture') as CaptureEvent;
    const bots = addBots(world, TEAM.blue, 3);
    bots.forEach((b, i) => at(b, add(ev.pos, { x: -1200 - i * 60, y: 300 + i * 80 })));
    let most = 0;
    run(world, bots, 14, () => {
      most = Math.max(most, bots.filter((b) => dist(b.champion.pos, ev.pos) < STALL.radius).length);
    });
    expect(most).toBeGreaterThanOrEqual(1);
    expect(most).toBeLessThanOrEqual(2);
    expect(bots.filter((b) => dist(b.champion.pos, ev.pos) > 1400)).toHaveLength(1);
  });

  it('still fight a contesting champion they can take, instead of standing politely in the circle', () => {
    const { world, events } = match();
    const ev = start(world, events, 'capture') as CaptureEvent;
    const [bot] = addBots(world, TEAM.blue, 1);
    at(bot, add(ev.pos, { x: -100, y: 0 }));
    const [foe] = addBots(world, TEAM.red, 1);
    at(foe, add(ev.pos, { x: 150, y: 0 }));
    foe.champion.hp = foe.champion.stats.maxHp * 0.25;
    foe.think = () => [];
    let fought = false;
    run(world, [bot, foe], 4, () => {
      if (bot.champion.order.kind === 'attack' && bot.champion.order.targetId === foe.champion.id) fought = true;
    });
    expect(fought).toBe(true);
  });
});
