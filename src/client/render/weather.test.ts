import { describe, expect, it } from 'vitest';
import { MAP } from '../../shared/map/mapData';
import { WeatherView } from './weather';
import { Wind } from './wind';

const cam = { x: 3000, y: 2000, zoom: 1 };

describe('autumn', () => {
  it('turns the canopy, strews the ground with leaves, and blows more across the view', () => {
    const autumn = new WeatherView('autumn', MAP);
    expect(autumn.kind).toBe('autumn');
    expect(autumn.ground.children.length).toBeGreaterThan(0);
    expect(autumn.wetness).toBe(0);
    expect(autumn.snowy).toBe(false);
    const wind = new Wind();
    wind.setWeather('autumn');
    expect(wind.strength).toBeGreaterThan(1);
    for (let t = 0; t < 2; t += 1 / 30) autumn.update(1 / 30, 1280, 720, cam, wind);
    const leaves = (autumn as unknown as { leaves: { x: number; vx: number }[] }).leaves;
    expect(leaves.length).toBeGreaterThan(10);
    // Blowing with the wind, left to right.
    expect(leaves.every((l) => l.vx > 0)).toBe(true);
    // Plain rain has none of it.
    const rain = new WeatherView('rain', MAP);
    expect(rain.canopyFilter).toBeNull();
    expect(rain.ground.children.length).toBe(0);
  });

  it('settles snow on the treetops only when it snows', () => {
    const rain = new WeatherView('rain', MAP);
    rain.dustTrees([{ x: 100, y: 100, r: 80, deep: false }]);
    expect(rain.treetops.context.instructions.length).toBe(0);
  });
});
