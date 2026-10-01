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

describe('the light on a figure', () => {
  it('comes from a lantern when close to one, and from the moon (stronger at night) when not', async () => {
    const { lightAmong } = await import('./lighting');
    const { MAP } = await import('../../shared/map/mapData');
    const { propLights, propSpots } = await import('./props');
    const lights = [propLights(propSpots(MAP))];
    const lighting = { lightAt: (x: number, y: number, night: number) => lightAmong(lights, x, y, night) };
    const lantern = propSpots(MAP).lanterns[0];
    // Just to the left of a lantern: lit warm, from the right.
    const near = lighting.lightAt(lantern.x - 60, lantern.y, 0);
    expect(near.k).toBeGreaterThan(0.3);
    expect(near.dx).toBeGreaterThan(0.9);
    expect(near.color).toBe(0xffc070);
    // Far out in the middle of nowhere: the moon, from the upper left.
    const dusk = lighting.lightAt(MAP.width / 2, 300, 0);
    const night = lighting.lightAt(MAP.width / 2, 300, 1);
    expect(night.dx).toBeLessThan(0);
    expect(night.dy).toBeLessThan(0);
    expect(night.k).toBeGreaterThan(dusk.k);
    expect(dusk.k).toBe(0);
  });
});
