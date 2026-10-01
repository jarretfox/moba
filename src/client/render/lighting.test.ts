import { describe, expect, it } from 'vitest';
import { nightAt, skyAt } from './lighting';

const brightness = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);

describe('the sky over a match', () => {
  it('starts golden and darkens into night as the match goes on', () => {
    const times = [0, 120, 300, 480, 700, 900, 1080, 2000];
    const levels = times.map((t) => brightness(skyAt(t)));
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1]);
    expect(levels[0]).toBeGreaterThan(levels[levels.length - 1]);
    // Warm at the start (more red than blue), cool at night (more blue than red).
    expect(skyAt(0) >> 16).toBeGreaterThan(skyAt(0) & 255);
    expect(skyAt(2000) & 255).toBeGreaterThan(skyAt(2000) >> 16);
  });

  it('says how far into the night it is', () => {
    expect(nightAt(0)).toBe(0);
    expect(nightAt(480)).toBe(0);
    expect(nightAt(780)).toBeCloseTo(0.5);
    expect(nightAt(5000)).toBe(1);
  });
});
