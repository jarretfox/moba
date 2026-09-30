import { describe, expect, it } from 'vitest';
import { addBots } from './bots/lineup';
import { Champion } from './champions/champion';
import { TEAM, TICK_RATE } from './constants';
import { MAP } from './map/mapData';
import type { EntitySnap, Snapshot } from './protocol';
import { applyCommand } from './sim/commands';
import { Fountain } from './sim/fountain';
import { spawnStructures } from './sim/structure';
import { WaveSpawner } from './sim/waves';
import { World } from './sim/world';
import { SnapshotDecoder, SnapshotEncoder } from './snapshotCodec';

/** A bots-only match, yielding what blue would be sent every `every` ticks. */
function* blueSnapshots(minutes: number, every = 1): Generator<Snapshot> {
  const world = new World(MAP);
  spawnStructures(world);
  world.addSystem(new WaveSpawner());
  world.addSystem(new Fountain());
  const bots = [...addBots(world, TEAM.blue, 3), ...addBots(world, TEAM.red, 3)];
  const me = bots[0].champion as Champion;
  let ev: Snapshot['ev'] = [];
  for (let i = 0; i < minutes * 60 * TICK_RATE; i++) {
    for (const b of bots) for (const c of b.think(world)) applyCommand(world, b.champion, c);
    world.step();
    ev.push(...world.drainEvents().filter((e) => world.vision.canSeeEvent(TEAM.blue, e)));
    if (world.tick % every) continue;
    yield { tick: world.tick, time: world.time, ents: world.visibleTo(TEAM.blue), ev, me: me.meSnapshot(world), nextWave: 7 };
    ev = [];
  }
}

const canonical = (ents: EntitySnap[]) =>
  JSON.stringify([...ents].sort((a, b) => a.id - b.id).map((e) => Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined).sort())));

describe('snapshot deltas', () => {
  it('rebuild exactly what the host saw, tick after tick of a real match', () => {
    const enc = new SnapshotEncoder();
    const dec = new SnapshotDecoder();
    let checked = 0;
    for (const snap of blueSnapshots(3)) {
      const out = dec.decode(enc.encode(snap));
      expect(out.tick).toBe(snap.tick);
      expect(out.time).toBeCloseTo(snap.time, 9);
      expect(canonical(out.ents)).toBe(canonical(snap.ents));
      expect(out.ev).toEqual(snap.ev);
      expect(out.me).toEqual(snap.me);
      expect(out.nextWave).toBe(snap.nextWave);
      checked++;
    }
    expect(checked).toBe(3 * 60 * TICK_RATE);
  }, 60_000);

  it('clears fields that go away and forgets entities that leave', () => {
    const enc = new SnapshotEncoder();
    const dec = new SnapshotDecoder();
    const base = { tick: 1, time: 0, ev: [] };
    const rooted: EntitySnap = { id: 7, k: 'champion', tm: 2, x: 10, y: 20, f: 0, r: 35, st: ['root'] };
    dec.decode(enc.encode({ ...base, ents: [rooted] }));

    const free = dec.decode(enc.encode({ ...base, tick: 2, ents: [{ ...rooted, st: undefined, x: 15 }] }));
    expect(free.ents[0]).toEqual({ id: 7, k: 'champion', tm: 2, x: 15, y: 20, f: 0, r: 35 });

    const gone = dec.decode(enc.encode({ ...base, tick: 3, ents: [] }));
    expect(gone.ents).toEqual([]);
  });

  it('shrink what a friend downloads to a fraction of full updates', () => {
    const enc = new SnapshotEncoder();
    let fullBytes = 0;
    let deltaBytes = 0;
    let fullAt30 = 0;
    for (const snap of blueSnapshots(3)) fullAt30 += JSON.stringify(snap).length;
    for (const snap of blueSnapshots(3, 2)) {
      fullBytes += JSON.stringify(snap).length;
      deltaBytes += JSON.stringify(enc.encode(snap)).length;
    }
    const seconds = 3 * 60;
    const kb = (bytes: number) => (bytes / 1024 / seconds).toFixed(1);
    console.log(`per friend: full @30/s ${kb(fullAt30)} KB/s, full @15/s ${kb(fullBytes)} KB/s, deltas @15/s ${kb(deltaBytes)} KB/s`);

    expect(deltaBytes).toBeLessThan(fullBytes * 0.35);
    expect(deltaBytes / 1024 / seconds).toBeLessThan(20);
  }, 60_000);
});
