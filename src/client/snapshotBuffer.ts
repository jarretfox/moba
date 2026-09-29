import { lerp, lerpAngle } from '../shared/math';
import type { EntitySnap, GameEvent, Snapshot } from '../shared/protocol';

/** About two seconds of history; anything older is dropped, events and all. */
const MAX_BUFFERED = 60;

/**
 * Plays host snapshots back slightly in the past so movement looks smooth even though the host
 * only sends 30 updates a second. Events fire when playback reaches them, which keeps damage
 * numbers in sync with the projectile that caused them.
 */
export class SnapshotBuffer {
  private snaps: Snapshot[] = [];
  /** Host time minus local time. */
  private offset: number | null = null;
  private firedTick = -1;
  latest: Snapshot | null = null;

  constructor(private readonly delay: number) {}

  push(s: Snapshot, localNow: number): void {
    this.snaps.push(s);
    this.latest = s;
    const sample = s.time - localNow;
    if (this.offset === null || Math.abs(sample - this.offset) > 0.25) this.offset = sample;
    else this.offset += (sample - this.offset) * 0.05;
    while (this.snaps.length > MAX_BUFFERED) {
      const old = this.snaps.shift()!;
      this.firedTick = Math.max(this.firedTick, old.tick);
    }
  }

  /** Interpolated entities at playback time, plus the events playback just passed. */
  sample(localNow: number): { ents: EntitySnap[]; events: GameEvent[] } {
    const snaps = this.snaps;
    if (!snaps.length || this.offset === null) return { ents: [], events: [] };
    const t = localNow + this.offset - this.delay;

    const events: GameEvent[] = [];
    for (const s of snaps) {
      if (s.tick > this.firedTick && s.time <= t) {
        events.push(...s.ev);
        this.firedTick = s.tick;
      }
    }

    let i = snaps.length - 1;
    while (i > 0 && snaps[i].time > t) i--;
    const s0 = snaps[i];
    const s1 = snaps[i + 1];
    if (!s1 || t <= s0.time) return { ents: s0.ents, events };

    // Entities appear once they exist in s0 and glide toward where they are in s1.
    const alpha = (t - s0.time) / (s1.time - s0.time);
    const next = new Map(s1.ents.map((e) => [e.id, e]));
    const ents = s0.ents.map((e) => {
      const n = next.get(e.id);
      if (!n) return e;
      return { ...e, x: lerp(e.x, n.x, alpha), y: lerp(e.y, n.y, alpha), f: lerpAngle(e.f, n.f, alpha) };
    });
    return { ents, events };
  }
}
