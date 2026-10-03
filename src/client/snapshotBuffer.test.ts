import { describe, expect, it } from 'vitest';
import type { EntitySnap, Snapshot } from '../shared/protocol';
import { MAX_EXTRAPOLATE, SnapshotBuffer, entsAt } from './snapshotBuffer';

const unit = (id: number, x: number, y = 0): EntitySnap => ({ id, x, y, f: 0 }) as unknown as EntitySnap;
const snap = (tick: number, ents: EntitySnap[]): Snapshot => ({ tick, time: tick / 30, ents, ev: [] }) as unknown as Snapshot;

describe('playing snapshots back', () => {
  const snaps = [snap(0, [unit(1, 0), unit(2, 500)]), snap(1, [unit(1, 10), unit(2, 500)])];

  it('glides between snapshots', () => {
    expect(entsAt(snaps, 0.5 / 30)[0].x).toBeCloseTo(5);
  });

  it('carries on moving briefly past the newest one instead of freezing, then holds', () => {
    // Half a tick past: half a step further.
    expect(entsAt(snaps, 1.5 / 30)[0].x).toBeCloseTo(15);
    // Standing still stays still.
    expect(entsAt(snaps, 1.5 / 30)[1].x).toBe(500);
    // No further than the cap, however late the next one is.
    expect(entsAt(snaps, 1 / 30 + 5)[0].x).toBeCloseTo(10 + 10 * MAX_EXTRAPOLATE * 30);
  });

  it("doesn't carry on a blink", () => {
    const blink = [snap(0, [unit(1, 0)]), snap(1, [unit(1, 600)])];
    expect(entsAt(blink, 1.5 / 30)[0].x).toBe(600);
  });
});

describe('the playback clock', () => {
  /** A seeded random, so the bad network is the same every run. */
  const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const SPEED = 300;

  /** A unit walking at SPEED, sent `rate` times a second over a link with `jitter` and a `stall` every few seconds; played back at 60 fps. */
  function run(minDelay: number, rate: number, jitter: number, stall: number) {
    const rand = seeded(7);
    const buf = new SnapshotBuffer(minDelay);
    const arrivals: { at: number; s: Snapshot }[] = [];
    for (let k = 0; k < 20 * rate; k++) {
      const time = k / rate;
      // Held up now and then (a lost packet resent), released with the ones behind it.
      const held = stall > 0 && time % 2.5 < stall ? 2.5 * Math.floor(time / 2.5) + stall - time : 0;
      arrivals.push({ at: time + 0.05 + rand() * jitter + held, s: snap(k, [unit(1, time * SPEED)]) });
      arrivals[arrivals.length - 1].s = { ...arrivals[arrivals.length - 1].s, time } as Snapshot;
    }
    arrivals.sort((a, b) => a.at - b.at);
    const xs: number[] = [];
    let i = 0;
    for (let f = 0; f < 20 * 60; f++) {
      const now = f / 60;
      while (i < arrivals.length && arrivals[i].at <= now) buf.push(arrivals[i++].s, now);
      const ents = buf.sample(now).ents;
      xs.push(ents.length ? ents[0].x : NaN);
    }
    // After a few seconds to settle: how each frame moved.
    const steps = xs.slice(4 * 60).map((x, k, a) => (k ? x - a[k - 1] : NaN)).slice(1);
    const want = SPEED / 60;
    return { back: steps.filter((d) => d < -0.01).length, rough: steps.filter((d) => Math.abs(d - want) > want * 0.1).length / steps.length, delay: buf.delay };
  }

  it('plays a jittery link smoothly: never backwards, and nearly every frame the right step', () => {
    const r = run(0.1, 15, 0.08, 0);
    expect(r.back).toBe(0);
    expect(r.rough).toBeLessThan(0.02);
  });

  it('rides out a resend stall every couple of seconds by holding back more, without jumping', () => {
    const r = run(0.1, 15, 0.05, 0.25);
    expect(r.back).toBe(0);
    expect(r.rough).toBeLessThan(0.05);
    // It held back more than it needs on a steady link; the rare worst case is covered by carrying motion on.
    expect(r.delay).toBeGreaterThan(0.13);
  });

  it('keeps a quiet local link close to the host', () => {
    const r = run(0.067, 30, 0.005, 0);
    expect(r.back).toBe(0);
    expect(r.rough).toBeLessThan(0.02);
    expect(r.delay).toBeLessThan(0.1);
  });
});
