import { describe, expect, it } from 'vitest';
import type { EntitySnap, GameEvent, Snapshot } from '../shared/protocol';
import { Highlights, Replay, scorePlay } from './highlights';

const champ = (id: number, name: string, x = 0): EntitySnap => ({ id, k: 'champion', tm: 1, x, y: 0, f: 0, r: 40, name, champ: 'logan' });
const kill = (killer: string, victim: string, extra: Partial<Extract<GameEvent, { e: 'kill' }>> = {}): GameEvent => ({ e: 'kill', killer, victim, team: 1, what: 'champion', ...extra });

/** A second-by-second match from 0 to `until`, with kills at the given times, Ann always in sight. */
function match(until: number, kills: Record<number, GameEvent[]>, seen = true): Snapshot[] {
  const out: Snapshot[] = [];
  for (let t = 0; t <= until; t += 0.5) out.push({ tick: t * 2, time: t, ents: seen ? [champ(7, 'Ann', t * 10)] : [], ev: kills[t] ?? [] });
  return out;
}

const run = (snaps: Snapshot[]) => {
  const h = new Highlights();
  for (const s of snaps) h.record(s);
  return h;
};

describe('play of the game', () => {
  it('scores bigger plays higher and names them', () => {
    const one = scorePlay({ champs: 1, ace: false, shutdown: false, warden: false, uprising: false });
    const two = scorePlay({ champs: 2, ace: false, shutdown: false, warden: false, uprising: false });
    const ace = scorePlay({ champs: 3, ace: true, shutdown: false, warden: false, uprising: false });
    expect(two.score).toBeGreaterThan(one.score);
    expect(ace.score).toBeGreaterThan(two.score);
    expect([one.title, two.title, ace.title]).toEqual(['TAKEDOWN', 'DOUBLE KILL', 'ACE']);
    expect(scorePlay({ champs: 0, ace: false, shutdown: false, warden: true, uprising: false }).title).toBe('WARDEN STEAL');
    expect(scorePlay({ champs: 0, ace: false, shutdown: false, warden: false, uprising: false }).score).toBe(0);
  });

  it('keeps the best play, as a clip from a little before to a little after', () => {
    const h = run(match(40, { 10: [kill('Ann', 'Bo')], 25: [kill('Ann', 'Cy')], 27: [kill('Ann', 'Di')] }));
    expect(h.best?.title).toBe('DOUBLE KILL');
    expect(h.best?.star).toBe(7);
    expect(h.best?.from).toBe(20);
    expect(h.best?.to).toBe(29.5);
    expect(h.best?.kills).toEqual([25, 27]);
    expect(h.best!.snaps[0].time).toBeLessThanOrEqual(20);
    expect(h.best!.snaps[h.best!.snaps.length - 1].time).toBeGreaterThanOrEqual(29.5);
  });

  it('ignores plays it never saw, and keeps an earlier better one over a later worse one', () => {
    expect(run(match(20, { 5: [kill('Ann', 'Bo')] }, false)).best).toBe(null);
    const h = run(match(60, { 10: [kill('Ann', 'Bo'), kill('Ann', 'Cy')], 40: [kill('Ann', 'Di')] }));
    expect(h.best?.title).toBe('DOUBLE KILL');
  });

  it('wraps up a play still going when the match ends', () => {
    const h = new Highlights();
    for (const s of match(12, { 11: [kill('Ann', 'Bo', { ace: true })] })) h.record(s);
    expect(h.best).toBe(null);
    h.close(12);
    expect(h.best?.title).toBe('ACE');
  });
});

describe('replaying it', () => {
  it('runs at full speed, slows down for each kill, and fires every event once', () => {
    const h = run(match(40, { 25: [kill('Ann', 'Cy')], 27: [kill('Ann', 'Di')] }));
    const r = new Replay(h.best!);
    expect(r.speedAt(r.clip.from)).toBe(1);
    expect(r.speedAt(25.2)).toBeLessThan(0.5);
    let kills = 0;
    let steps = 0;
    while (!r.done && steps < 10000) {
      kills += r.step(1 / 60).events.filter((e) => e.e === 'kill').length;
      steps++;
    }
    expect(kills).toBe(2);
    // Slower than real time: longer than the clip itself.
    expect(steps / 60).toBeGreaterThan(r.clip.to - r.clip.from);
    expect(r.step(1 / 60).ents[0].id).toBe(7);
  });
});
