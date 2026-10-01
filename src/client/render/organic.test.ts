import { describe, expect, it } from 'vitest';
import { segmentDistance } from '../../shared/math';
import { blob, fbm, inflate, insidePoly, inkOf, mix, noise2, roughen, shade, shapeOutline, smooth } from './organic';

const points = (pts: number[]) => Array.from({ length: pts.length / 2 }, (_, i) => ({ x: pts[i * 2], y: pts[i * 2 + 1] }));

describe('organic noise', () => {
  it('is deterministic, stays in range, and changes smoothly', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37;
      const y = i * 0.91;
      const v = noise2(x, y, 3);
      expect(v).toBe(noise2(x, y, 3));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Math.abs(noise2(x + 0.001, y, 3) - v)).toBeLessThan(0.01);
      const f = fbm(x, y, 4, 9);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
    // Different seeds give different fields.
    expect(noise2(1.5, 2.5, 1)).not.toBe(noise2(1.5, 2.5, 2));
  });
});

describe('organic colors', () => {
  it('mixes channel by channel and shades toward ink or light', () => {
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mix(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
    expect(mix(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
    const lum = (c: number) => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    expect(lum(shade(0x808080, 0.5))).toBeLessThan(lum(0x808080));
    expect(lum(shade(0x808080, -0.5))).toBeGreaterThan(lum(0x808080));
    expect(lum(inkOf(0x66aa44))).toBeLessThan(lum(0x66aa44) / 2);
  });
});

describe('organic outlines', () => {
  it('trace each map shape along its edge, grown as asked', () => {
    for (const p of points(shapeOutline({ type: 'circle', x: 100, y: 50, r: 80 }, 10, 5))) expect(Math.hypot(p.x - 100, p.y - 50)).toBeCloseTo(85, 5);
    const cap = { type: 'capsule' as const, ax: 0, ay: 0, bx: 300, by: 120, r: 40 };
    for (const p of points(shapeOutline(cap, 12))) expect(segmentDistance(p, { x: cap.ax, y: cap.ay }, { x: cap.bx, y: cap.by }).d).toBeCloseTo(40, 5);
    const rect = { type: 'rect' as const, x: 10, y: 20, w: 200, h: 100 };
    for (const round of [0, 0.3]) {
      const pts = points(shapeOutline(rect, 15, 0, round));
      for (const p of pts) {
        const onEdge = Math.min(Math.abs(p.x - 10), Math.abs(p.x - 210), Math.abs(p.y - 20), Math.abs(p.y - 120));
        if (round === 0) expect(onEdge).toBeCloseTo(0, 5);
        expect(p.x).toBeGreaterThanOrEqual(10 - 1e-6);
        expect(p.x).toBeLessThanOrEqual(210 + 1e-6);
        expect(p.y).toBeGreaterThanOrEqual(20 - 1e-6);
        expect(p.y).toBeLessThanOrEqual(120 + 1e-6);
      }
      // Rounded corners pull the outline in from the very corner.
      const nearest = Math.min(...pts.map((p) => Math.hypot(p.x - 10, p.y - 20)));
      if (round > 0) expect(nearest).toBeGreaterThan(8);
      else expect(nearest).toBeCloseTo(0, 5);
    }
  });

  it('roughen strays no further than its amplitude, and grows outward for either winding', () => {
    const circle = shapeOutline({ type: 'circle', x: 0, y: 0, r: 200 }, 8);
    const rough = roughen(circle, 30, 1 / 50, 4);
    let moved = 0;
    for (const p of points(rough)) {
      const d = Math.hypot(p.x, p.y);
      expect(Math.abs(d - 200)).toBeLessThanOrEqual(30 + 1e-6);
      moved = Math.max(moved, Math.abs(d - 200));
    }
    expect(moved).toBeGreaterThan(3);
    const reversed: number[] = [];
    for (let i = circle.length - 2; i >= 0; i -= 2) reversed.push(circle[i], circle[i + 1]);
    for (const pts of [circle, reversed]) for (const p of points(inflate(pts, 10))) expect(Math.hypot(p.x, p.y)).toBeCloseTo(210, 0);
  });

  it('blobs are the same for the same seed, lumpy, and round about their size', () => {
    const a = blob(50, 50, 40, 40, 7, 0.25);
    expect(blob(50, 50, 40, 40, 7, 0.25)).toEqual(a);
    expect(blob(50, 50, 40, 40, 8, 0.25)).not.toEqual(a);
    const radii = points(a).map((p) => Math.hypot(p.x - 50, p.y - 50));
    expect(Math.min(...radii)).toBeGreaterThan(40 * 0.75 - 1e-6);
    expect(Math.max(...radii)).toBeLessThan(40 * 1.25 + 1e-6);
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(1);
  });

  it('smooth keeps a closed shape closed and inside its corners', () => {
    const square = [0, 0, 100, 0, 100, 100, 0, 100];
    const s = smooth(square, true, 2);
    expect(s.length).toBe(square.length * 4);
    for (const p of points(s)) expect(insidePoly(square, p.x * 0.999 + 0.05, p.y * 0.999 + 0.05)).toBe(true);
    expect(insidePoly(square, 50, 50)).toBe(true);
    expect(insidePoly(square, 150, 50)).toBe(false);
  });
});
