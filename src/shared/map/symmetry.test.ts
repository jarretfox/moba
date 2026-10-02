import { describe, expect, it } from 'vitest';
import { TEAM } from '../constants';
import { spawnStructures } from '../sim/structure';
import { World } from '../sim/world';
import { MAP } from './mapData';
import { NavGrid } from './navGrid';

const mirror = (p: { x: number; y: number }) => ({ x: MAP.width - p.x, y: p.y });

describe('the map is fair to both sides', () => {
  it('is walkable in mirror image', () => {
    const g = new NavGrid(MAP);
    let off = 0;
    for (let cy = 0; cy < g.rows; cy++) for (let cx = 0; cx < g.cols; cx++) if (g.isWalkableCell(cx, cy) !== g.isWalkableCell(g.cols - 1 - cx, cy)) off++;
    expect(off).toBe(0);
  });

  it('walks each side to its own structures (blocked goals) by mirrored routes of the same length', () => {
    const world = new World(MAP);
    const structures = spawnStructures(world);
    const length = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      let d = 0;
      let at = from;
      for (const q of world.findPath(from, to)) {
        d += Math.hypot(q.x - at.x, q.y - at.y);
        at = q;
      }
      return d;
    };
    const blue = MAP.spawns[TEAM.blue];
    const red = MAP.spawns[TEAM.red];
    expect(mirror(blue)).toEqual(red);
    for (const s of structures.filter((u) => u.team === TEAM.blue)) {
      const twin = structures.find((u) => u.team === TEAM.red && u.pos.x === MAP.width - s.pos.x && u.pos.y === s.pos.y)!;
      expect(twin).toBeDefined();
      // From each side's fountain, and from out in the lane (equal-cost grid routes can differ by a hair once they're straightened).
      expect(Math.abs(length(red, twin.pos) - length(blue, s.pos))).toBeLessThan(5);
      const lane = { x: MAP.width * 0.42, y: s.pos.y };
      expect(Math.abs(length(mirror(lane), twin.pos) - length(lane, s.pos))).toBeLessThan(length(lane, s.pos) * 0.01);
      // The spot it stops at mirrors too.
      const a = world.grid.nearestWalkable(s.pos)!;
      const b = world.grid.nearestWalkable(twin.pos)!;
      expect(b.x).toBeCloseTo(MAP.width - a.x, 3);
      expect(b.y).toBeCloseTo(a.y, 3);
    }
    // The Warden's pit, from either fountain.
    const center = { x: MAP.width / 2, y: MAP.height / 2 };
    expect(Math.abs(length(red, center) - length(blue, center))).toBeLessThan(5);
  });
});
