import { describe, expect, it } from 'vitest';
import { nextTake, parseAudioIndex } from './samples';

describe('the recordings index', () => {
  it('keeps what makes sense and drops the rest', () => {
    const index = parseAudioIndex({
      sounds: { castHonk: { files: ['sfx/scrimby/honk-1.mp3', 'sfx/scrimby/honk-2.mp3', '../x.mp3'], gain: 0.8 }, 'fx:steamBurst': { files: ['a.ogg'], over: true }, hit: ['sfx/hit-1.mp3'], empty: { files: [] }, loud: { files: ['a.mp3'], gain: 99 } },
      voices: { scrimby: { taunt: ['voice/scrimby/taunt-1.mp3', 'voice/scrimby/taunt-2.mp3'], shout: ['x.mp3'] }, nobody: {} },
      announcer: { 'First blood!': 'voice/announcer/first-blood.mp3', bad: 42 },
    });
    expect(index.sounds.castHonk).toEqual({ files: ['sfx/scrimby/honk-1.mp3', 'sfx/scrimby/honk-2.mp3'], gain: 0.8 });
    expect(index.sounds.hit.files).toEqual(['sfx/hit-1.mp3']);
    expect(index.sounds['fx:steamBurst']).toEqual({ files: ['a.ogg'], gain: 1, over: true });
    expect(index.sounds.empty).toBeUndefined();
    expect(index.sounds.loud.gain).toBe(1);
    expect(index.voices.scrimby).toEqual({ taunt: ['voice/scrimby/taunt-1.mp3', 'voice/scrimby/taunt-2.mp3'] });
    expect(index.voices).not.toHaveProperty('nobody');
    expect(index.announcer).toEqual({ 'First blood!': 'voice/announcer/first-blood.mp3' });
  });

  it('never plays the same take twice running, when there’s a choice', () => {
    let last = -1;
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const t = nextTake(4, last);
      expect(t).not.toBe(last);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(4);
      seen.add(t);
      last = t;
    }
    expect(seen.size).toBe(4);
    expect(nextTake(1, 0)).toBe(0);
  });
});
