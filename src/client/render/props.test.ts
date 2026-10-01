import { describe, expect, it } from 'vitest';
import { MAP } from '../../shared/map/mapData';
import { shapeContains } from '../../shared/map/shapes';
import { flickerAt, propLights, propSpots } from './props';

const onGround = (x: number, y: number, style?: string) => MAP.ground.some((p) => (!style || p.style === style) && shapeContains(p.shape, x, y));

describe('map props', () => {
  it('line the lanes with lanterns, never standing on the path itself', () => {
    const { lanterns } = propSpots(MAP);
    expect(lanterns.length).toBeGreaterThan(12);
    for (const l of lanterns) {
      expect(onGround(l.x, l.y)).toBe(false);
      // ...but right beside a lane.
      expect(MAP.ground.some((p) => p.style === 'lane' && [[-80, 0], [80, 0], [0, -80], [0, 80]].some(([dx, dy]) => shapeContains(p.shape, l.x + dx, l.y + dy)))).toBe(true);
    }
  });

  it('ring both bases with braziers and keep the mushrooms in the jungle', () => {
    const { braziers, mushrooms } = propSpots(MAP);
    expect(braziers.filter((b) => b.x < MAP.width / 2).length).toBe(braziers.filter((b) => b.x > MAP.width / 2).length);
    for (const b of braziers) expect(onGround(b.x, b.y, 'base')).toBe(true);
    expect(mushrooms.length).toBeGreaterThan(8);
    for (const m of mushrooms) expect(onGround(m.x, m.y, 'jungle')).toBe(true);
  });

  it('are the same every time, so every screen agrees', () => {
    expect(propSpots(MAP)).toBe(propSpots(MAP));
    const fresh = propSpots({ ...MAP });
    expect(fresh.lanterns).toEqual(propSpots(MAP).lanterns);
  });

  it('flicker, but never go dark or past full', () => {
    for (const l of propLights(propSpots(MAP)).slice(0, 10)) {
      for (let t = 0; t < 5; t += 0.37) {
        const a = flickerAt(l, t);
        expect(a).toBeGreaterThan(l.base * (1 - l.flicker) - 1e-9);
        expect(a).toBeLessThanOrEqual(l.base + 1e-9);
      }
    }
  });
});
