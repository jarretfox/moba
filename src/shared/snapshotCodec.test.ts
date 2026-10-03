import { describe, expect, it } from 'vitest';
import { runBots } from './bots/bot';
import { addBots } from './bots/lineup';
import { Champion } from './champions/champion';
import { TEAM, TICK_RATE } from './constants';
import { MAP } from './map/mapData';
import type { EntitySnap, Snapshot } from './protocol';
import { Fountain } from './sim/fountain';
import { Jungle } from './sim/jungle';
import { spawnStructures } from './sim/structure';
import { scoreRows } from './sim/score';
import { WardenLair } from './sim/warden';
import { WaveSpawner } from './sim/waves';
import { World } from './sim/world';
import { SnapshotDecoder, SnapshotEncoder } from './snapshotCodec';

/** A bots-only match, yielding what blue would be sent every `every` ticks. */
function* blueSnapshots(minutes: number, every = 1): Generator<Snapshot> {
  const world = new World(MAP);
  spawnStructures(world);
  world.addSystem(new WaveSpawner());
  world.addSystem(new Fountain());
  world.addSystem(new Jungle(world));
  const lair = world.addSystem(new WardenLair());
  const bots = [...addBots(world, TEAM.blue, 3), ...addBots(world, TEAM.red, 3)];
  const me = bots[0].champion as Champion;
  let ev: Snapshot['ev'] = [];
  let scores = scoreRows(world);
  for (let i = 0; i < minutes * 60 * TICK_RATE; i++) {
    runBots(world, bots);
    world.step();
    ev.push(...world.drainEvents().filter((e) => world.vision.canSeeEvent(TEAM.blue, e)));
    if (world.tick % every) continue;
    yield { tick: world.tick, time: world.time, ents: world.visibleTo(TEAM.blue), ev, me: me.meSnapshot(world), nextWave: 7, warden: lair.status(world), scores: world.tick % 60 === 0 ? (scores = scoreRows(world)) : scores };
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
      const out = dec.decode(enc.encode(snap))!;
      expect(out.tick).toBe(snap.tick);
      expect(out.time).toBeCloseTo(snap.time, 9);
      expect(canonical(out.ents)).toBe(canonical(snap.ents));
      expect(out.ev).toEqual(snap.ev);
      expect(out.me).toEqual(snap.me);
      expect(out.nextWave).toBe(snap.nextWave);
      expect(out.warden).toEqual(snap.warden);
      expect(out.scores).toEqual(snap.scores);
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

    const free = dec.decode(enc.encode({ ...base, tick: 2, ents: [{ ...rooted, st: undefined, x: 15 }] }))!;
    expect(free.ents[0]).toEqual({ id: 7, k: 'champion', tm: 2, x: 15, y: 20, f: 0, r: 35 });

    const gone = dec.decode(enc.encode({ ...base, tick: 3, ents: [] }))!;
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

describe('over a lossy link (acked deltas)', () => {
  /** A seeded random, so the bad network is the same every run. */
  const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

  it('rebuild exactly what the host saw from whatever arrives, late, lost or out of order, and play every event once', () => {
    const rand = seeded(42);
    const enc = new SnapshotEncoder(true);
    const dec = new SnapshotDecoder();
    // Messages in flight: [arrives at (ms), what].
    let toClient: [number, { delta: ReturnType<SnapshotEncoder['encode']>; truth: Snapshot }][] = [];
    let toHost: [number, number][] = [];
    const sentEvents: string[] = [];
    const playedEvents: string[] = [];
    let decoded = 0;
    let lost = 0;
    let bytes = 0;
    for (const snap of blueSnapshots(2, 2)) {
      const now = snap.time * 1000;
      for (const e of snap.ev) sentEvents.push(JSON.stringify(e));
      const delta = enc.encode(snap);
      bytes += JSON.stringify(delta).length;
      // 15% lost; the rest take 40–260 ms, so they often overtake each other.
      if (rand() < 0.15) lost++;
      else toClient.push([now + 40 + rand() * 220, { delta, truth: snap }]);
      // Deliver what's due, oldest-arriving first.
      const due = toClient.filter(([at]) => at <= now).sort((a, b) => a[0] - b[0]);
      toClient = toClient.filter(([at]) => at > now);
      for (const [, { delta: d, truth }] of due) {
        const out = dec.decode(d);
        if (!out) continue;
        decoded++;
        expect(canonical(out.ents)).toBe(canonical(truth.ents));
        expect(out.me).toEqual(truth.me);
        expect(out.scores).toEqual(truth.scores);
        expect(out.warden).toEqual(truth.warden);
        for (const e of out.ev) playedEvents.push(JSON.stringify(e));
        // The ack: also lost sometimes, also late.
        if (rand() > 0.15) toHost.push([now + 40 + rand() * 220, out.tick]);
      }
      for (const [, tick] of toHost.filter(([at]) => at <= now)) enc.ack(tick);
      toHost = toHost.filter(([at]) => at > now);
    }
    // Every event was played (bar the last moment's, still in flight), exactly once, in order.
    expect(playedEvents.length).toBeGreaterThan(sentEvents.length * 0.97);
    expect(playedEvents).toEqual(sentEvents.slice(0, playedEvents.length));
    expect(decoded).toBeGreaterThan(1000);
    expect(lost).toBeGreaterThan(100);
    // Still a modest download, even resending events until they're acked.
    expect(bytes / 1024 / 120).toBeLessThan(25);
  }, 60_000);

  it('start from a full snapshot, and send full ones again if the acks stop for long', () => {
    const enc = new SnapshotEncoder(true);
    const base = { time: 0, ev: [] };
    const one: EntitySnap = { id: 1, k: 'chud', tm: 1, x: 0, y: 0, f: 0, r: 20 };
    expect(enc.encode({ ...base, tick: 2, ents: [one] }).base).toBe(-1);
    enc.ack(2);
    expect(enc.encode({ ...base, tick: 4, ents: [{ ...one, x: 5 }] }).base).toBe(2);
    // No ack for longer than the window: everything again.
    expect(enc.encode({ ...base, tick: 400, ents: [{ ...one, x: 9 }] }).base).toBe(-1);
  });
});
