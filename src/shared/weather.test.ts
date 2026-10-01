import { describe, expect, it } from 'vitest';
import { WEATHER_CHANCES, pickWeather } from './weather';

describe('match weather', () => {
  it('comes up in the stated proportions, and the chances add up', () => {
    expect(WEATHER_CHANCES.reduce((sum, [, c]) => sum + c, 0)).toBeCloseTo(1);
    const counts: Record<string, number> = {};
    const n = 1000;
    for (let i = 0; i < n; i++) {
      const w = pickWeather(() => (i + 0.5) / n);
      counts[w] = (counts[w] ?? 0) + 1;
    }
    for (const [w, chance] of WEATHER_CHANCES) expect(counts[w] / n).toBeCloseTo(chance, 2);
  });

  it('is always something, even for an unlucky roll', () => {
    expect(pickWeather(() => 0.999999)).toBe('mist');
  });
});
