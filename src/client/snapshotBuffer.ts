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

/** How long a look back the clock takes at how snapshots have been arriving (seconds). */
const WINDOW = 3;
/** The longest the playback may lag the host to ride out a jittery link (seconds). */
export const MAX_DELAY = 0.4;
/** How much faster or slower than real time playback may run while it catches up or eases back. */
export const SLEW = 0.06;
/** Further off than this (a tab that slept, a long outage) and the clock just jumps. */
const SNAP_TO = 0.75;

/**
 * Plays host snapshots back slightly in the past so movement looks smooth even though updates come
 * in at 15–30 a second and not always evenly. Events fire when playback reaches them, which keeps
 * damage numbers in sync with the projectile that caused them.
 *
 * The playback clock: how far behind the host to play is worked out from how snapshots have been
 * arriving lately. The quickest arrivals set where "now" is; the spread of the slower ones (jitter) plus
 * one update's gap is how much to hold back, at least `minDelay` and at most MAX_DELAY. Playback never
 * jumps to follow that: it runs up to 6% fast or slow until it's there, so a late burst of snapshots
 * doesn't throw the world back and forth. (It used to reset whenever one came more than 0.25 s late.)
 */
export class SnapshotBuffer {
  private snaps: Snapshot[] = [];
  /** Recent arrivals: when (local seconds), and host time minus local time then. */
  private arrivals: { at: number; v: number }[] = [];
  /** Playback time minus local time, and when it was last moved. */
  private play: number | null = null;
  private playedAt = 0;
  private firedTick = -1;
  latest: Snapshot | null = null;
  /** How far behind the host playback is aiming to be right now (for the debug readout). */
  delay: number;

  constructor(private readonly minDelay: number) {
    this.delay = minDelay;
  }

  push(s: Snapshot, localNow: number): void {
    // How late it came counts toward the jitter, even if it's too late to use.
    this.arrivals.push({ at: localNow, v: s.time - localNow });
    while (this.arrivals.length && this.arrivals[0].at < localNow - WINDOW) this.arrivals.shift();
    // Older than one we have (it came late): playback has its successor already.
    if (this.latest && s.tick <= this.latest.tick) return;
    this.snaps.push(s);
    this.latest = s;
    while (this.snaps.length > MAX_BUFFERED) {
      const old = this.snaps.shift()!;
      this.firedTick = Math.max(this.firedTick, old.tick);
    }
  }

  /** Where playback is aiming: the quickest recent arrival, held back by the jitter and an update's gap. */
  private target(): number {
    const vs = this.arrivals.map((a) => a.v);
    const best = Math.max(...vs);
    const late = vs.map((v) => best - v).sort((a, b) => a - b);
    const jitter = late[Math.floor(late.length * 0.95)] ?? 0;
    const n = this.snaps.length;
    const gap = n > 1 ? (this.snaps[n - 1].time - this.snaps[0].time) / (n - 1) : 0;
    this.delay = Math.min(MAX_DELAY, Math.max(this.minDelay, jitter + gap + 0.01));
    return best - this.delay;
  }

  /** Interpolated entities at playback time, plus the events playback just passed. */
  sample(localNow: number): { ents: EntitySnap[]; events: GameEvent[] } {
    const snaps = this.snaps;
    if (!snaps.length || !this.arrivals.length) return { ents: [], events: [] };
    const want = this.target();
    if (this.play === null || Math.abs(want - this.play) > SNAP_TO) this.play = want;
    else {
      const step = SLEW * Math.max(0, localNow - this.playedAt);
      this.play += Math.max(-step, Math.min(step, want - this.play));
    }
    this.playedAt = localNow;
    const t = localNow + this.play;

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
