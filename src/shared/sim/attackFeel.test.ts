import { describe, expect, it } from 'vitest';
import { Logan } from '../champions/logan';
import { Marksman } from '../champions/marksman';
import { learnAll } from '../champions/testing';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import { add } from '../math';
import type { GameEvent } from '../protocol';
import { World } from './world';

// What the clients are told about basic attacks, so what they show matches what happens: when each blow
// will land, when a swing is cut short, and which hits were basic attacks.

function duel() {
  const world = new World(MAP);
  const logan = learnAll(world.add(new Logan(world, TEAM.blue)));
  const foe = world.add(new Marksman(world, TEAM.red));
  logan.pos = { x: 2600, y: 1100 };
  foe.pos = add(logan.pos, { x: 150, y: 0 });
  world.vision.update();
  world.drainEvents();
  return { world, logan, foe };
}

/** Steps until `pick` finds an event (or `seconds` pass), returning it with the time it came. */
function until<T extends GameEvent>(world: World, seconds: number, pick: (ev: GameEvent) => ev is T, seen: GameEvent[] = []): { ev: T; time: number } | null {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    world.step();
    for (const ev of world.drainEvents()) {
      seen.push(ev);
      if (pick(ev)) return { ev, time: world.time };
    }
  }
  return null;
}

const isAttack = (ev: GameEvent): ev is Extract<GameEvent, { e: 'attack' }> => ev.e === 'attack';

describe('basic attacks, as the clients hear about them', () => {
  it('say when the blow will land, and it lands then', () => {
    const { world, logan, foe } = duel();
    logan.commandAttack(foe);
    const swing = until(world, 1, isAttack);
    expect(swing?.ev.src).toBe(logan.id);
    expect(swing!.ev.w).toBeCloseTo(0.2 / logan.stats.attackSpeed, 2);
    const hit = until(world, 1, (ev): ev is Extract<GameEvent, { e: 'dmg' }> => ev.e === 'dmg' && ev.src === logan.id && ev.b === 1);
    expect(hit).not.toBeNull();
    expect(Math.abs(hit!.time - swing!.time - swing!.ev.w!)).toBeLessThanOrEqual(1 / TICK_RATE + 1e-6);
  });

  it('say when a swing is cut short, and no blow lands', () => {
    const { world, logan, foe } = duel();
    logan.commandAttack(foe);
    until(world, 1, isAttack);
    logan.commandMove(world, add(logan.pos, { x: -400, y: 0 }));
    const seen: GameEvent[] = [];
    const stop = until(world, 0.5, (ev): ev is Extract<GameEvent, { e: 'attackStop' }> => ev.e === 'attackStop', seen);
    expect(stop?.ev.src).toBe(logan.id);
    until(world, 0.5, (_ev): _ev is GameEvent => false, seen);
    expect(seen.some((ev) => ev.e === 'dmg' && ev.src === logan.id)).toBe(false);
  });

  it('tell everyone of the stop before the next swing starts', () => {
    const { world, logan, foe } = duel();
    logan.commandAttack(foe);
    until(world, 1, isAttack);
    // Straight onto someone else: the old swing stops, then the new one starts.
    const other = world.add(new Marksman(world, TEAM.red));
    other.pos = add(logan.pos, { x: 0, y: 140 });
    world.vision.update();
    logan.commandAttack(other);
    const seen: GameEvent[] = [];
    until(world, 1, isAttack, seen);
    const order = seen.filter((ev) => (ev.e === 'attack' || ev.e === 'attackStop') && ev.src === logan.id).map((ev) => ev.e);
    expect(order).toEqual(['attackStop', 'attack']);
  });

  it('mark which hits were basic attacks (not spells, not on-hit procs)', () => {
    const { world, logan, foe } = duel();
    world.damage(logan, foe, 10, 'physical', { basic: true });
    world.damage(logan, foe, 10, 'magic');
    world.damage(logan, foe, 10, 'magic', { basic: true, proc: true });
    const dmg = world.drainEvents().filter((ev) => ev.e === 'dmg');
    expect(dmg.map((ev) => ev.e === 'dmg' && ev.b)).toEqual([1, undefined, undefined]);
  });
});
