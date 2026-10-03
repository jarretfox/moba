import { DT } from './constants';
import type { EntitySnap, GameEvent, MeSnap, Snapshot } from './protocol';

/** Only the fields that changed, plus the id. `null` means the field went away (e.g. a status wore off). */
export type EntityDelta = { id: number } & { [K in keyof EntitySnap]?: EntitySnap[K] | null };

/**
 * What actually goes over the wire: only what changed since a snapshot the player already has (new
 * entities in full, changed fields of known ones, and the ids that are gone: died, left vision).
 * - Over a reliable, ordered link (the default), that's the previous one, and nothing's ever lost.
 * - Acked (friends over the internet): the newest one the player has confirmed getting (`base`; −1 for
 *   none: a full snapshot). Then a message can be lost, late or out of order and nothing breaks: the next
 *   one is complete against what they have, a stale one is ignored, and nobody waits for a resend.
 *   Events ride along in `evt`, by tick, from the base on, so a lost message's events come in the next
 *   one and none are played twice.
 */
export interface SnapshotDelta {
  tick: number;
  /** Acked: the tick this is a delta from (−1: from nothing, a full snapshot). Absent: from the previous one. */
  base?: number;
  /** Acked: the events of each tick after the base, oldest first. */
  evt?: [number, GameEvent[]][];
  add?: EntitySnap[];
  upd?: EntityDelta[];
  del?: number[];
  ev?: GameEvent[];
  /** Present when it changed; null when you no longer have a champion. */
  me?: MeSnap | null;
  nextWave?: number;
  winner?: Snapshot['winner'];
  /** Present when it changed. */
  warden?: Snapshot['warden'];
  /** Present when it changed. */
  scores?: Snapshot['scores'];
  /** Present when it changed (the map event). */
  event?: Snapshot['event'];
}

/** What a player has as of one tick: the baseline a delta is worked out from. */
interface Sent {
  ents: Map<number, EntitySnap>;
  me: string;
  wave: number | undefined;
  warden: string;
  scores: string;
  event: string;
}

const EMPTY: Sent = { ents: new Map(), me: 'null', wave: undefined, warden: 'null', scores: 'null', event: 'null' };

/** How far back (ticks) an acked baseline may be before we give up on it and send everything. */
export const ACK_WINDOW = 120;

/** Host side, one per player. `acked`: deltas from what they've confirmed (see SnapshotDelta). */
export class SnapshotEncoder {
  /** Reliable: what they have now. */
  private last: Sent = EMPTY;
  /** Acked: what each recent snapshot gave them, by tick, and the newest they've confirmed. */
  private readonly history = new Map<number, Sent>();
  private acked = -1;
  /** Acked: the events of each tick they haven't confirmed yet. */
  private events: [number, GameEvent[]][] = [];

  constructor(readonly ackedMode = false) {}

  /** They've got the snapshot of `tick` (acked mode). */
  ack(tick: number): void {
    if (tick <= this.acked || !this.history.has(tick)) return;
    this.acked = tick;
    for (const t of this.history.keys()) if (t < tick) this.history.delete(t);
    this.events = this.events.filter(([t]) => t > tick);
  }

  encode(snap: Snapshot): SnapshotDelta {
    let base = this.last;
    const out: SnapshotDelta = { tick: snap.tick };
    if (this.ackedMode) {
      // From the newest snapshot they've confirmed, if it's recent; otherwise everything.
      const from = this.acked >= 0 && snap.tick - this.acked <= ACK_WINDOW ? this.history.get(this.acked) : undefined;
      base = from ?? EMPTY;
      out.base = from ? this.acked : -1;
      if (snap.ev.length) this.events.push([snap.tick, snap.ev]);
      // Events too old to matter if they've never arrived (a long outage) are dropped.
      this.events = this.events.filter(([t]) => snap.tick - t <= ACK_WINDOW);
      if (this.events.length) out.evt = this.events.slice();
    } else if (snap.ev.length) out.ev = snap.ev;

    const ents = new Map<number, EntitySnap>();
    for (const e of snap.ents) {
      ents.set(e.id, e);
      const prev = base.ents.get(e.id);
      if (!prev) (out.add ??= []).push(e);
      else {
        const d = diff(prev, e);
        if (d) (out.upd ??= []).push(d);
      }
    }
    for (const id of base.ents.keys()) if (!ents.has(id)) (out.del ??= []).push(id);
    const now: Sent = { ents, me: JSON.stringify(snap.me ?? null), wave: snap.nextWave, warden: JSON.stringify(snap.warden ?? null), scores: JSON.stringify(snap.scores ?? null), event: JSON.stringify(snap.event ?? null) };
    if (now.me !== base.me) out.me = snap.me ?? null;
    if (now.wave !== base.wave) out.nextWave = snap.nextWave;
    if (now.warden !== base.warden) out.warden = snap.warden;
    if (now.scores !== base.scores) out.scores = snap.scores;
    if (now.event !== base.event) out.event = snap.event;
    if (snap.winner) out.winner = snap.winner;
    if (this.ackedMode) {
      this.history.set(snap.tick, now);
      for (const t of this.history.keys()) if (snap.tick - t > ACK_WINDOW) this.history.delete(t);
    } else this.last = now;
    return out;
  }
}

/** What the client has rebuilt as of one tick. */
interface Held {
  ents: Map<number, EntitySnap>;
  me: MeSnap | undefined;
  nextWave: number | undefined;
  warden: Snapshot['warden'];
  scores: Snapshot['scores'];
  event: Snapshot['event'];
}

const NOTHING: Held = { ents: new Map(), me: undefined, nextWave: undefined, warden: undefined, scores: undefined, event: undefined };

/** Client side: rebuilds full snapshots from deltas. Never mutates an entity it has already handed out. */
export class SnapshotDecoder {
  /** Reliable: what we have now. */
  private now: Held = NOTHING;
  /** Acked: what each recent tick rebuilt to (the host builds on one of them), the newest tick, and the newest events played. */
  private readonly held = new Map<number, Held>();
  private newest = -1;
  private eventsTo = -1;

  /**
   * The full snapshot a delta rebuilds to, or null if there's nothing to show: it's older than one we
   * already have (late, out of order), or built on a tick we no longer have. Acked: tell the host about
   * each one that comes back (`ack`).
   */
  decode(d: SnapshotDelta): Snapshot | null {
    const acked = d.base !== undefined;
    if (acked && d.tick <= this.newest) return null;
    const from = !acked ? this.now : d.base! < 0 ? NOTHING : this.held.get(d.base!);
    if (!from) return null;
    const ents = new Map(from.ents);
    for (const id of d.del ?? []) ents.delete(id);
    for (const e of d.add ?? []) ents.set(e.id, e);
    for (const u of d.upd ?? []) {
      const prev = ents.get(u.id);
      if (!prev) continue;
      const next: Record<string, unknown> = { ...prev };
      for (const [k, v] of Object.entries(u)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      ents.set(u.id, next as unknown as EntitySnap);
    }
    const h: Held = {
      ents,
      me: d.me !== undefined ? (d.me ?? undefined) : from.me,
      nextWave: d.nextWave !== undefined ? d.nextWave : from.nextWave,
      warden: 'warden' in d ? d.warden : from.warden,
      scores: 'scores' in d ? d.scores : from.scores,
      event: 'event' in d ? d.event : from.event,
    };
    let ev = d.ev ?? [];
    if (acked) {
      this.held.set(d.tick, h);
      this.newest = d.tick;
      for (const t of this.held.keys()) if (d.tick - t > ACK_WINDOW * 1.5) this.held.delete(t);
      // Only the ticks' events we haven't played yet (an earlier message may have brought some of them).
      ev = (d.evt ?? []).filter(([t]) => t > this.eventsTo).flatMap(([, e]) => e);
      this.eventsTo = d.tick;
    } else this.now = h;
    return {
      tick: d.tick,
      time: d.tick * DT,
      ents: [...ents.values()],
      ev,
      me: h.me,
      nextWave: h.nextWave,
      winner: d.winner,
      warden: h.warden,
      scores: h.scores,
      event: h.event,
    };
  }
}

function diff(prev: EntitySnap, next: EntitySnap): EntityDelta | null {
  let d: Record<string, unknown> | null = null;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<keyof EntitySnap>;
  for (const k of keys) {
    const a = prev[k];
    const b = next[k];
    if (a === b) continue;
    if (Array.isArray(a) && Array.isArray(b) && a.join() === b.join()) continue;
    (d ??= { id: next.id })[k] = b === undefined ? null : b;
  }
  return d as EntityDelta | null;
}
