import { describe, expect, it } from 'vitest';
import type { EntitySnap, Snapshot } from '../shared/protocol';
import { MAX_EXTRAPOLATE, entsAt } from './snapshotBuffer';

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
