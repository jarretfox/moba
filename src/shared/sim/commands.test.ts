import { describe, expect, it } from 'vitest';
import { Marksman } from '../champions/marksman';
import { TEAM, TICK_RATE } from '../constants';
import { MAP } from '../map/mapData';
import type { Command, GameEvent } from '../protocol';
import { PING_LIMIT, PING_WINDOW, applyCommand } from './commands';
import { World } from './world';

const pings = (events: GameEvent[]) => events.filter((e) => e.e === 'ping');

describe('pings', () => {
  it('mark a spot for the pinger’s team only', () => {
    const world = new World(MAP);
    const me = world.add(new Marksman(world, TEAM.blue));
    applyCommand(world, me, { k: 'ping', kind: 'danger', x: 5000, y: 2000 });
    const [ping] = pings(world.drainEvents());
    expect(ping).toMatchObject({ kind: 'danger', x: 5000, y: 2000, from: me.id, name: me.name, team: TEAM.blue });
    expect(world.vision.canSeeEvent(TEAM.blue, ping)).toBe(true);
    expect(world.vision.canSeeEvent(TEAM.red, ping)).toBe(false);
  });

  it('work while dead, and ignore made-up kinds', () => {
    const world = new World(MAP);
    const me = world.add(new Marksman(world, TEAM.blue));
    me.dead = true;
    applyCommand(world, me, { k: 'ping', kind: 'omw', x: 100, y: 100 });
    applyCommand(world, me, { k: 'ping', kind: 'nuke', x: 100, y: 100 } as unknown as Command);
    expect(pings(world.drainEvents()).map((p) => p.kind)).toEqual(['omw']);
  });

  it('are limited to a few at a time, so nobody can spam their team', () => {
    const world = new World(MAP);
    const me = world.add(new Marksman(world, TEAM.blue));
    for (let i = 0; i < PING_LIMIT + 3; i++) applyCommand(world, me, { k: 'ping', kind: 'look', x: 100, y: 100 });
    expect(pings(world.drainEvents())).toHaveLength(PING_LIMIT);
    for (let i = 0; i < Math.ceil(PING_WINDOW * TICK_RATE); i++) world.step();
    applyCommand(world, me, { k: 'ping', kind: 'look', x: 100, y: 100 });
    expect(pings(world.drainEvents())).toHaveLength(1);
  });
});
