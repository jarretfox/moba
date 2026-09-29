import { dist, type Vec2 } from '../math';
import type { MapData } from './mapData';
import { shapeContains } from './shapes';

/**
 * Walkability grid rasterized from the map shapes. Used for pathfinding, dash clamping,
 * and (later) vision and brush.
 */
export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly cellSize: number;
  /** Raw walkability straight from the map shapes. */
  readonly open: Uint8Array;
  /** Walkable with one cell of clearance from walls — what units actually move on. */
  readonly walkable: Uint8Array;

  constructor(map: MapData) {
    this.cellSize = map.cellSize;
    this.cols = Math.ceil(map.width / map.cellSize);
    this.rows = Math.ceil(map.height / map.cellSize);
    this.open = new Uint8Array(this.cols * this.rows);
    this.walkable = new Uint8Array(this.cols * this.rows);

    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = (cx + 0.5) * this.cellSize;
        const y = (cy + 0.5) * this.cellSize;
        const onGround = map.ground.some((g) => shapeContains(g.shape, x, y));
        const blocked = map.blockers.some((b) => shapeContains(b, x, y));
        this.open[cy * this.cols + cx] = onGround && !blocked ? 1 : 0;
      }
    }

    // Erode by one cell so unit bodies don't clip into walls.
    for (let cy = 1; cy < this.rows - 1; cy++) {
      for (let cx = 1; cx < this.cols - 1; cx++) {
        let ok = 1;
        for (let dy = -1; dy <= 1 && ok; dy++) {
          for (let dx = -1; dx <= 1 && ok; dx++) {
            ok = this.open[(cy + dy) * this.cols + cx + dx];
          }
        }
        this.walkable[cy * this.cols + cx] = ok;
      }
    }
  }

  cellX(x: number): number {
    return Math.floor(x / this.cellSize);
  }

  cellY(y: number): number {
    return Math.floor(y / this.cellSize);
  }

  isWalkableCell(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows && this.walkable[cy * this.cols + cx] === 1;
  }

  isWalkable(p: Vec2): boolean {
    return this.isWalkableCell(this.cellX(p.x), this.cellY(p.y));
  }

  cellCenter(cx: number, cy: number): Vec2 {
    return { x: (cx + 0.5) * this.cellSize, y: (cy + 0.5) * this.cellSize };
  }

  /** The closest walkable spot to p — p itself if it's already walkable. */
  nearestWalkable(p: Vec2, maxRings = 40): Vec2 | null {
    if (this.isWalkable(p)) return { x: p.x, y: p.y };
    const ox = this.cellX(p.x);
    const oy = this.cellY(p.y);
    for (let r = 1; r <= maxRings; r++) {
      let best: Vec2 | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring perimeter only
          if (!this.isWalkableCell(ox + dx, oy + dy)) continue;
          const c = this.cellCenter(ox + dx, oy + dy);
          const d = dist(c, p);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** True if a unit can walk in a straight line from a to b. */
  lineWalkable(a: Vec2, b: Vec2): boolean {
    const d = dist(a, b);
    const steps = Math.max(1, Math.ceil(d / (this.cellSize * 0.25)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isWalkable({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  }

  /** The furthest walkable point along a→b before hitting a wall. Used by dashes. */
  clampLine(a: Vec2, b: Vec2): Vec2 {
    const d = dist(a, b);
    const steps = Math.max(1, Math.ceil(d / (this.cellSize * 0.25)));
    let last = { x: a.x, y: a.y };
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      if (!this.isWalkable(p)) break;
      last = p;
    }
    return last;
  }
}
