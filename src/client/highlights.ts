import type { ChampionId } from '../shared/champions/types';
import type { GameEvent, Snapshot } from '../shared/protocol';
import { entsAt } from './snapshotBuffer';

// Play of the Game. The client keeps the last several seconds of snapshots as they arrive; whenever
// something worth showing happens (a multi-kill, an ace, a Warden steal), it scores the moment and, once
// the dust settles, keeps the clip if it's the best yet. After Da Base falls the best clip plays back
// through the normal renderer, slowing down for each kill.

/** Seconds of history kept, so a clip can start before the action. */
const KEEP = 16;
/** A clip starts this long before its first kill and runs on this long after its last. */
const BEFORE = 5;
const AFTER = 2.5;
/** Kills by the same champion this close together are one play. */
const CHAIN = 10;

type Kill = Extract<GameEvent, { e: 'kill' }>;

export interface Highlight {
  score: number;
  /** "TRIPLE KILL", "ACE", "WARDEN STEAL"... */
  title: string;
  /** The star of the play: who the camera follows. */
  star: number;
  name: string;
  champ?: ChampionId;
  skin?: number;
  /** Match seconds the clip covers. */
  from: number;
  to: number;
  /** When each kill in it landed, for the slow motion. */
  kills: number[];
  snaps: Snapshot[];
}

interface Play {
  killer: string;
  star: number;
  champ?: ChampionId;
  skin?: number;
  kills: number[];
  champs: number;
  ace: boolean;
  shutdown: boolean;
  warden: boolean;
  uprising: boolean;
}

/** How good a play was, and what to call it. */
export function scorePlay(p: Pick<Play, 'champs' | 'ace' | 'shutdown' | 'warden' | 'uprising'>): { score: number; title: string } {
  let score = p.champs * 10 + Math.max(0, p.champs - 1) * 8 + (p.ace ? 15 : 0) + (p.shutdown ? 6 : 0) + (p.warden ? 30 + (p.uprising ? 10 : 0) : 0);
  const multi = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'QUADRA KILL', 'PENTA KILL'][Math.min(5, p.champs)];
  const title = p.warden ? (p.champs ? 'WARDEN AND A KILL' : p.uprising ? 'UPRISING' : 'WARDEN STEAL') : p.ace ? 'ACE' : multi || (p.shutdown ? 'SHUT DOWN' : 'TAKEDOWN');
  if (!p.champs && !p.warden) score = 0;
  return { score, title };
}

export class Highlights {
  best: Highlight | null = null;
  private recent: Snapshot[] = [];
  private play: Play | null = null;
  private last = 0;

  /** Every snapshot from the host, as it arrives. */
  record(snap: Snapshot): void {
    this.recent.push(snap);
    while (this.recent.length && this.recent[0].time < snap.time - KEEP) this.recent.shift();
    for (const ev of snap.ev) if (ev.e === 'kill') this.noteKill(ev, snap);
    // The play's over once a few seconds pass without another kill: keep it if it's the best so far.
    if (this.play && snap.time - this.last > AFTER) this.finish(snap.time);
  }

  private noteKill(ev: Kill, snap: Snapshot): void {
    if (ev.what !== 'champion' && ev.what !== 'warden') return;
    // Only plays we can actually see: the killer has to be in sight.
    const star = snap.ents.find((e) => e.k === 'champion' && e.name === ev.killer);
    if (!star) return;
    if (this.play && (this.play.killer !== ev.killer || snap.time - this.last > CHAIN)) this.finish(snap.time);
    this.play ??= { killer: ev.killer, star: star.id, champ: star.champ, skin: star.skin, kills: [], champs: 0, ace: false, shutdown: false, warden: false, uprising: false };
    const p = this.play;
    p.kills.push(snap.time);
    if (ev.what === 'champion') p.champs++;
    else {
      p.warden = true;
      p.uprising ||= ev.victim.includes('Uprising');
    }
    p.ace ||= !!ev.ace;
    p.shutdown ||= !!ev.shutdown;
    this.last = snap.time;
  }

  private finish(now: number): void {
    const p = this.play;
    this.play = null;
    if (!p) return;
    const { score, title } = scorePlay(p);
    if (score <= 0 || (this.best && this.best.score >= score)) return;
    const from = Math.max(p.kills[0] - BEFORE, this.recent[0]?.time ?? 0);
    const to = Math.min(p.kills[p.kills.length - 1] + AFTER, now);
    this.best = { score, title, star: p.star, name: p.killer, champ: p.champ, skin: p.skin, from, to, kills: p.kills, snaps: this.recent.filter((s) => s.time >= from - 0.2 && s.time <= to + 0.2) };
  }

  /** The match is over: wrap up a play still going on. */
  close(now: number): void {
    if (this.play) this.finish(now + AFTER);
  }
}

/** Plays a highlight back: full speed, slowing to a crawl around each kill. */
export class Replay {
  time: number;
  private fired: number;

  constructor(readonly clip: Highlight) {
    this.time = clip.from;
    this.fired = clip.from;
  }

  get done(): boolean {
    return this.time >= this.clip.to;
  }

  /** How fast the clip runs at time `t`: a third speed within a moment of a kill. */
  speedAt(t: number): number {
    const near = Math.min(...this.clip.kills.map((k) => Math.abs(t - k)));
    return near < 0.7 ? 0.35 : near < 1.2 ? 0.35 + ((near - 0.7) / 0.5) * 0.65 : 1;
  }

  /** Moves on by `dt` real seconds: where everyone is now, and the events just passed. */
  step(dt: number): { ents: Snapshot['ents']; events: GameEvent[] } {
    this.time = Math.min(this.clip.to, this.time + dt * this.speedAt(this.time));
    const events: GameEvent[] = [];
    for (const s of this.clip.snaps) if (s.time > this.fired && s.time <= this.time) events.push(...s.ev);
    this.fired = this.time;
    return { ents: entsAt(this.clip.snaps, this.time), events };
  }
}
