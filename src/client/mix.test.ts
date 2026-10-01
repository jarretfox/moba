import { describe, expect, it } from 'vitest';
import { BUS_DEFAULTS, RateLimiter, VOICE_CAP, busLevels, distanceCues, impulseResponse, pitchJitter, resolveInfo } from './mix';

describe('the mix', () => {
  it('leaves near sounds alone and dulls and wets the far ones', () => {
    const here = distanceCues(0);
    expect(here.lowpass).toBeGreaterThan(16000);
    expect(here.send).toBe(0);
    expect(distanceCues(0.15).lowpass).toBeGreaterThan(16000);
    const mid = distanceCues(0.6);
    const far = distanceCues(1);
    expect(mid.lowpass).toBeLessThan(here.lowpass);
    expect(far.lowpass).toBeLessThan(mid.lowpass);
    expect(far.lowpass).toBeCloseTo(1200);
    expect(far.send).toBeGreaterThan(mid.send);
    expect(far.send).toBeCloseTo(0.35);
  });

  it('wobbles pitch within the range given, and not at all when told not to', () => {
    expect(pitchJitter(0, () => 0.99)).toBe(1);
    expect(pitchJitter(40, () => 1)).toBeCloseTo(2 ** (40 / 1200));
    expect(pitchJitter(40, () => 0)).toBeCloseTo(2 ** (-40 / 1200));
    expect(pitchJitter(40, () => 0.5)).toBeCloseTo(1);
  });

  it('fills a sound in from its bus, letting the sound have the last word', () => {
    expect(resolveInfo({ bus: 'fx' })).toMatchObject({ ...BUS_DEFAULTS.fx, bus: 'fx' });
    expect(resolveInfo({ bus: 'ui', send: 0.3 })).toMatchObject({ bus: 'ui', send: 0.3, priority: true, pitch: 0 });
    expect(resolveInfo({ bus: 'fx', duck: 0.5, gap: 0.2 })).toMatchObject({ duck: 0.5, gap: 0.2, priority: false });
  });

  it('follows the sliders and the mute', () => {
    const lv = busLevels({ master: 0.5, music: 0.25, effects: 1 }, false);
    expect(lv.master).toBeCloseTo(0.3);
    expect(lv.music).toBe(0.25);
    expect(lv.fx).toBe(1);
    expect(lv.ambience).toBe(1);
    expect(busLevels({ master: 1, music: 1, effects: 1 }, true).master).toBe(0);
    expect(busLevels({ master: 1, music: 1, effects: 0 }, false)).toMatchObject({ fx: 0, ui: 0, voice: 0, ambience: 0, music: 1 });
  });

  describe('the crowd limit', () => {
    it("won't restart a sound inside its gap", () => {
      const r = new RateLimiter();
      expect(r.allow('swing', 10, 0.06)).toBe(true);
      expect(r.allow('swing', 10.03, 0.06)).toBe(false);
      expect(r.allow('hit', 10.03, 0.06)).toBe(true);
      expect(r.allow('swing', 10.07, 0.06)).toBe(true);
    });

    it('caps how many start in a quarter second, except priority sounds', () => {
      const r = new RateLimiter();
      for (let i = 0; i < VOICE_CAP; i++) expect(r.allow(`s${i}`, 1 + i * 0.001, 0)).toBe(true);
      expect(r.allow('late', 1.1, 0)).toBe(false);
      expect(r.allow('announcer', 1.1, 0, true)).toBe(true);
      // The window moves on.
      expect(r.allow('late', 1.4, 0)).toBe(true);
    });

    it('holds priority sounds to their own gap all the same', () => {
      const r = new RateLimiter();
      expect(r.allow('click', 5, 0.02, true)).toBe(true);
      expect(r.allow('click', 5.01, 0.02, true)).toBe(false);
    });
  });

  describe('the room', () => {
    const rand = (() => {
      let s = 12345;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    })();
    const [left, right] = impulseResponse(8000, 1.5, rand);
    const energy = (d: Float32Array, from: number, to: number) => {
      let e = 0;
      for (let i = from; i < to; i++) e += d[i] * d[i];
      return e / (to - from);
    };

    it('is stereo, the right length, and silent through the pre-delay', () => {
      expect(left.length).toBe(12000);
      expect(right.length).toBe(12000);
      expect(left.slice(0, 90).every((v) => v === 0)).toBe(true);
      expect(left).not.toEqual(right);
    });

    it('dies away: louder early than late', () => {
      const early = energy(left, 100, 1200);
      const mid = energy(left, 5000, 6000);
      const late = energy(left, 10800, 12000);
      expect(early).toBeGreaterThan(mid * 4);
      expect(mid).toBeGreaterThan(late);
      expect(Math.abs(left[11999])).toBeLessThan(1e-3);
    });
  });
});
