import { describe, expect, it } from 'vitest';
import { MAP } from '../../shared/map/mapData';
import { shapeContains } from '../../shared/map/shapes';
import { NightLife, catching, duskAt } from './nightlife';
import { propLights, propSpots } from './props';

const view = { x: MAP.width / 2, y: MAP.height / 2, w: 1600, h: 900 };

describe('night coming on', () => {
  it('lights the lanterns one by one as dusk falls, each sputtering before it catches', () => {
    expect(duskAt(0)).toBe(0);
    expect(duskAt(300)).toBe(0);
    expect(duskAt(2000)).toBe(1);
    expect(catching(-1)).toBe(0);
    expect(catching(5)).toBe(1);
    // Sputtering: on and off in the first moments.
    const early = Array.from({ length: 40 }, (_, i) => catching(i * 0.02));
    expect(Math.max(...early)).toBeGreaterThan(0.5);
    expect(Math.min(...early)).toBeLessThan(0.2);

    const lights = propLights(propSpots(MAP)).slice(0, propSpots(MAP).lanterns.length);
    const night = new NightLife(MAP, lights);
    const run = (time: number, seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 30) night.update(1 / 30, time, 0, view);
    };
    // The golden evening: all dark.
    run(120, 1);
    expect(night.lit.every((l) => l === 0)).toBe(true);
    expect(lights.every((l) => l.lit === 0)).toBe(true);
    // Halfway into dusk: some lit, some not yet.
    run(480, 2);
    const some = night.lit.filter((l) => l === 1).length;
    expect(some).toBeGreaterThan(0);
    expect(some).toBeLessThan(night.lit.length);
    // Night: every one of them, and the light map's lanterns with them.
    run(1000, 2);
    expect(night.lit.every((l) => l === 1)).toBe(true);
    expect(lights.every((l) => l.lit === 1)).toBe(true);
  });

  it('shows the moon in the river once it\'s night, where you can see it', () => {
    const night = new NightLife(MAP);
    const moon = () => (night as unknown as { moonAlpha: number; moon: { x: number; y: number } | null });
    for (let t = 0; t < 3; t += 1 / 30) night.update(1 / 30, 200, 0, view);
    expect(moon().moonAlpha).toBeLessThan(0.01);
    for (let t = 0; t < 4; t += 1 / 30) night.update(1 / 30, 1080, 1, view);
    expect(moon().moonAlpha).toBeGreaterThan(0.5);
    const { x, y } = moon().moon!;
    expect(MAP.ground.some((p) => p.style === 'river' && shapeContains(p.shape, x, y))).toBe(true);
    expect(Math.hypot(x - view.x, y - view.y)).toBeLessThan(view.w);
    // Up and to the left of the middle of the screen, where the moonlight comes from.
    expect(y).toBeLessThan(view.y);
    // Far from the river, it isn't there.
    const far = { x: 600, y: 600, w: 1000, h: 600 };
    for (let t = 0; t < 4; t += 1 / 30) night.update(1 / 30, 1080, 1, far);
    expect(moon().moonAlpha).toBeLessThan(0.1);
  });
});
