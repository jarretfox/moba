import { describe, expect, it } from 'vitest';
import { KILLER_TIME, Spectator } from './spectate';

const all = () => true;

describe('watching while dead', () => {
  it('follows your killer for a few seconds, then a teammate', () => {
    const s = new Spectator();
    s.start(9, 10);
    expect(s.pick(10.5, all, [3, 4])).toBe(9);
    expect(s.onKiller).toBe(true);
    expect(s.pick(10 + KILLER_TIME + 0.1, all, [3, 4])).toBe(3);
    expect(s.onKiller).toBe(false);
  });

  it('moves straight to a teammate when the killer slips out of sight', () => {
    const s = new Spectator();
    s.start(9, 10);
    expect(s.pick(10.5, (id) => id !== 9, [3, 4])).toBe(3);
  });

  it('flips through teammates with Space, and stays on the one picked', () => {
    const s = new Spectator();
    s.start(null, 0);
    expect(s.pick(1, all, [3, 4, 5])).toBe(3);
    s.next([3, 4, 5]);
    expect(s.pick(2, all, [3, 4, 5])).toBe(4);
    expect(s.pick(9, all, [3, 4, 5])).toBe(4);
    s.next([3, 4, 5]);
    s.next([3, 4, 5]);
    expect(s.pick(10, all, [3, 4, 5])).toBe(3);
  });

  it('skips Space past your killer to a teammate', () => {
    const s = new Spectator();
    s.start(9, 0);
    expect(s.pick(0.5, all, [3, 4])).toBe(9);
    s.next([3, 4]);
    expect(s.pick(1, all, [3, 4])).toBe(3);
  });

  it('finds someone else when the teammate being watched falls, and nobody when all are down', () => {
    const s = new Spectator();
    s.start(null, 0);
    expect(s.pick(1, all, [3, 4])).toBe(3);
    expect(s.pick(2, all, [4])).toBe(4);
    expect(s.pick(3, all, [])).toBe(null);
  });
});
