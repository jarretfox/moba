import { lerp, lerpAngle } from '../shared/math';
import type { EntitySnap, GameEvent, Snapshot } from '../shared/protocol';

/** About two seconds of history; anything older is dropped, events and all. */
const MAX_BUFFERED = 60;
/**
 * When playback runs past the newest snapshot (the host hiccuped, or a message came late), everything keeps
 * moving the way it was going for up to this long, rather than freezing and then jumping.
 */
export const MAX_EXTRAPOLATE = 0.1;
/** Further than this between two snapshots is a blink or a respawn, not a walk: never carried on. */
const TELEPORT = 120;

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

    return { ents: entsAt(snaps, t), events };
  }
}

/**
 * Entities at time `t` among `snaps` (in time order): they appear once they exist and glide toward where
 * they're next seen. Past the newest snapshot, they carry on briefly at the speed they had.
 */
export function entsAt(snaps: readonly Snapshot[], t: number): EntitySnap[] {
  if (!snaps.length) return [];
  let i = snaps.length - 1;
  while (i > 0 && snaps[i].time > t) i--;
  const s0 = snaps[i];
  const s1 = snaps[i + 1];
  if (!s1 && i > 0 && t > s0.time) return carriedOn(snaps[i - 1], s0, Math.min(t - s0.time, MAX_EXTRAPOLATE));
  if (!s1 || t <= s0.time) return s0.ents;
  const alpha = (t - s0.time) / (s1.time - s0.time);
  const next = new Map(s1.ents.map((e) => [e.id, e]));
  return s0.ents.map((e) => {
    const n = next.get(e.id);
    if (!n) return e;
    return { ...e, x: lerp(e.x, n.x, alpha), y: lerp(e.y, n.y, alpha), f: lerpAngle(e.f, n.f, alpha) };
  });
}

/** `s1`'s entities moved on by `ahead` seconds at the speed they had between `s0` and `s1`. */
function carriedOn(s0: Snapshot, s1: Snapshot, ahead: number): EntitySnap[] {
  const span = s1.time - s0.time;
  if (span <= 0 || ahead <= 0) return s1.ents;
  const k = ahead / span;
  const before = new Map(s0.ents.map((e) => [e.id, e]));
  return s1.ents.map((e) => {
    const p = before.get(e.id);
    if (!p || e.dead) return e;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    if (dx === 0 && dy === 0) return e;
    if (dx * dx + dy * dy > TELEPORT * TELEPORT) return e;
    return { ...e, x: e.x + dx * k, y: e.y + dy * k };
  });
}
