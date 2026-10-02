import { describe, expect, it } from 'vitest';
import { SelfPrediction } from './prediction';

const step = 1 / 60;

describe('your own champion, ahead of the host', () => {
  it('sets off the moment you order a walk, at your speed', () => {
    const p = new SelfPrediction(0.2);
    const here = { x: 0, y: 0 };
    p.walk([{ x: 300, y: 0 }]);
    let at = here;
    for (let i = 0; i < 30; i++) at = p.update(step, i * step, here, here, 300, true);
    expect(at.x).toBeCloseTo(150, 0);
    expect(p.heading).toBeCloseTo(0);
  });

  it('waits at the end for the host to catch up, then settles onto it', () => {
    const p = new SelfPrediction(0.2);
    p.walk([{ x: 100, y: 0 }]);
    let t = 0;
    let at = { x: 0, y: 0 };
    for (; t < 0.6; t += step) at = p.update(step, t, { x: 0, y: 0 }, { x: 0, y: 0 }, 300, true);
    expect(at.x).toBeCloseTo(100, 0);
    // The host's copy got there a little off (someone was standing on the spot).
    for (let i = 0; i < 120; i++, t += step) at = p.update(step, t, { x: 96, y: 4 }, { x: 96, y: 4 }, 300, true);
    expect(at.x).toBeCloseTo(96, 0);
    expect(at.y).toBeCloseTo(4, 0);
  });

  it('gives way to the host when it says something stopped us', () => {
    const p = new SelfPrediction(0.2);
    p.walk([{ x: 2000, y: 0 }]);
    let at = { x: 0, y: 0 };
    for (let i = 0; i < 120; i++) at = p.update(step, i * step, { x: 0, y: 0 }, { x: 0, y: 0 }, 300, true);
    // Two seconds in, the host still has us at the start: we were held in place.
    expect(at.x).toBeLessThan(300 * 0.35 + 60 + 100);
  });

  it('draws you where the host says while you can’t walk', () => {
    const p = new SelfPrediction(0.2);
    p.walk([{ x: 500, y: 0 }]);
    p.update(step, 0, { x: 0, y: 0 }, { x: 0, y: 0 }, 300, true);
    expect(p.update(step, step, { x: 10, y: 10 }, { x: 10, y: 10 }, 300, false)).toEqual({ x: 10, y: 10 });
    expect(p.walking).toBe(false);
  });
});
