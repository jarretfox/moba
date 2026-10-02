import { describe, expect, it } from 'vitest';
import { masterTake, synthFor, takeFile } from './soundBench';

const RATE = 1000;

describe('the sound bench', () => {
  it('masters a take: mono, the silence trimmed, faded, normalized', () => {
    // Half a second of silence, then a 0.2 s burst at 0.1 in one ear only, then silence.
    const left = new Float32Array(1000);
    const right = new Float32Array(1000);
    for (let i = 500; i < 700; i++) left[i] = i % 2 ? 0.1 : -0.1;
    const out = masterTake([left, right], RATE, 2);
    // Starts 3 ms before the sound, ends 30 ms after.
    expect(out.length).toBe(200 + 3 + 30);
    // Fades in from silence.
    expect(out[0]).toBe(0);
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    // A dense square wave is capped by its loudness, not its peak.
    expect(peak).toBeCloseTo(0.25, 2);
  });

  it('cuts a long take short with a fade', () => {
    const long = new Float32Array(5000).map((_, i) => Math.sin(i) * 0.05);
    const out = masterTake([long], RATE, 1);
    expect(out.length).toBe(1000);
    expect(Math.abs(out[out.length - 1])).toBeLessThan(0.01);
  });

  it('knows which synthesized sound each key stands for', () => {
    expect(synthFor('atkBow')).toBe('atkBow');
    expect(synthFor('cast:marksman:0')).toBe('castStamp');
    expect(synthFor('fx:steamBurst')).toBe('whoosh');
    expect(synthFor('fx:steamBurst+hiss')).toBe('whoosh');
    expect(synthFor('hit:logan')).toBe('hit');
    expect(synthFor('nonsense')).toBeNull();
    expect(takeFile('fx:steamBurst+hiss', 2)).toBe('fx-steamBurst-hiss-2.mp3');
  });
});
