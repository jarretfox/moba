import { describe, expect, it } from 'vitest';
import { heartbeat } from './views';

/** Seconds between the start of one beat and the next, found by sampling. */
function period(health: number): number {
  const peaks: number[] = [];
  let prev = 0;
  let rising = false;
  for (let t = 0; t < 6; t += 0.005) {
    const v = heartbeat(t, health);
    if (v > prev) rising = true;
    else if (rising && prev > 0.9) {
      peaks.push(t);
      rising = false;
    } else rising = false;
    prev = v;
  }
  return peaks[1] - peaks[0];
}

describe("Da Base's heartbeat", () => {
  it('stays between 0 and 1', () => {
    for (let t = 0; t < 5; t += 0.01) {
      const v = heartbeat(t, 0.3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('beats faster the lower its health', () => {
    expect(period(0.1)).toBeLessThan(period(0.45));
  });
});
