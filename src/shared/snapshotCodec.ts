import { DT } from './constants';
import type { EntitySnap, GameEvent, MeSnap, Snapshot } from './protocol';

/** Only the fields that changed, plus the id. `null` means the field went away (e.g. a status wore off). */
export type EntityDelta = { id: number } & { [K in keyof EntitySnap]?: EntitySnap[K] | null };

/**
 * What actually goes over the wire. After the first message, each one only carries what changed since
 * the previous one for that player: new entities in full, changed fields of known ones, and the ids that
 * are gone (died, left vision). Over a reliable, ordered channel nothing is lost, so no acks are needed.
 */
export interface SnapshotDelta {
  tick: number;
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
}

/** Host side, one per player. */
export class SnapshotEncoder {
  private readonly known = new Map<number, EntitySnap>();
  private lastMe: string | undefined;
  private lastWave: number | undefined;
  private lastWarden: string | undefined;

  encode(snap: Snapshot): SnapshotDelta {
    const out: SnapshotDelta = { tick: snap.tick };
    const seen = new Set<number>();
    for (const e of snap.ents) {
      seen.add(e.id);
      const prev = this.known.get(e.id);
      if (!prev) (out.add ??= []).push(e);
      else {
        const d = diff(prev, e);
        if (d) (out.upd ??= []).push(d);
      }
      this.known.set(e.id, e);
    }
    for (const id of this.known.keys()) {
      if (seen.has(id)) continue;
      (out.del ??= []).push(id);
      this.known.delete(id);
    }
    if (snap.ev.length) out.ev = snap.ev;
    const me = JSON.stringify(snap.me ?? null);
    if (me !== this.lastMe) {
      out.me = snap.me ?? null;
      this.lastMe = me;
    }
    if (snap.nextWave !== this.lastWave) {
      out.nextWave = snap.nextWave;
      this.lastWave = snap.nextWave;
    }
    const warden = JSON.stringify(snap.warden ?? null);
    if (warden !== this.lastWarden) {
      out.warden = snap.warden;
      this.lastWarden = warden;
    }
    if (snap.winner) out.winner = snap.winner;
    return out;
  }
}

/** Client side: rebuilds full snapshots from deltas. Never mutates an entity it has already handed out. */
export class SnapshotDecoder {
  private readonly ents = new Map<number, EntitySnap>();
  private me: MeSnap | undefined;
  private nextWave: number | undefined;
  private warden: Snapshot['warden'];

  decode(d: SnapshotDelta): Snapshot {
    for (const id of d.del ?? []) this.ents.delete(id);
    for (const e of d.add ?? []) this.ents.set(e.id, e);
    for (const u of d.upd ?? []) {
      const prev = this.ents.get(u.id);
      if (!prev) continue;
      const next: Record<string, unknown> = { ...prev };
      for (const [k, v] of Object.entries(u)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      this.ents.set(u.id, next as unknown as EntitySnap);
    }
    if (d.me !== undefined) this.me = d.me ?? undefined;
    if (d.nextWave !== undefined) this.nextWave = d.nextWave;
    if ('warden' in d) this.warden = d.warden;
    return {
      tick: d.tick,
      time: d.tick * DT,
      ents: [...this.ents.values()],
      ev: d.ev ?? [],
      me: this.me,
      nextWave: this.nextWave,
      winner: d.winner,
      warden: this.warden,
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
