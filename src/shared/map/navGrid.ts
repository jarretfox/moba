import { dist, type Vec2 } from '../math';
import type { MapData } from './mapData';
import { shapeContains } from './shapes';

/** Distances this close are a tie (mirror images differ by rounding). */
const TIE = 1e-6;
/** How much open ground a cell's center needs round it to be walked on: about a body's width from walls. */
export const CLEARANCE = 30;
const CLEARANCE_RING: readonly (readonly [number, number])[] = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return [Math.cos(a) * CLEARANCE, Math.sin(a) * CLEARANCE] as const;
});

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
  /** How many live obstacles (structures) cover each cell. Anything above zero blocks it. */
  private readonly obstacles: Uint16Array;

  constructor(map: MapData) {
    this.cellSize = map.cellSize;
    this.cols = Math.ceil(map.width / map.cellSize);
    this.rows = Math.ceil(map.height / map.cellSize);
    this.open = new Uint8Array(this.cols * this.rows);
    this.walkable = new Uint8Array(this.cols * this.rows);
    this.obstacles = new Uint16Array(this.cols * this.rows);

    const openAt = (x: number, y: number) => map.ground.some((g) => shapeContains(g.shape, x, y)) && !map.blockers.some((b) => shapeContains(b, x, y));
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        this.open[cy * this.cols + cx] = openAt((cx + 0.5) * this.cellSize, (cy + 0.5) * this.cellSize) ? 1 : 0;
      }
    }
    // Walkable: open, with CLEARANCE of open ground all round the cell's center, so bodies don't clip into
    // walls. (It used to close every cell next to a closed one, which shut gaps that looked open.) Cells in
    // the clear are walkable outright; only those next to a closed cell need the closer look.
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const i = cy * this.cols + cx;
        if (!this.open[i]) continue;
        let clear = cx > 0 && cy > 0 && cx < this.cols - 1 && cy < this.rows - 1;
        for (let dy = -1; dy <= 1 && clear; dy++) for (let dx = -1; dx <= 1 && clear; dx++) clear = this.open[i + dy * this.cols + dx] === 1;
        const x = (cx + 0.5) * this.cellSize;
        const y = (cy + 0.5) * this.cellSize;
        this.walkable[i] = clear || CLEARANCE_RING.every(([dx, dy]) => openAt(x + dx, y + dy)) ? 1 : 0;
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
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false;
    const i = cy * this.cols + cx;
    return this.walkable[i] === 1 && this.obstacles[i] === 0;
  }

  /** Block a circular footprint (plus the usual one-cell clearance) until removeObstacle is called with the same values. */
  addObstacle(center: Vec2, radius: number): void {
    this.stampObstacle(center, radius, 1);
  }

  removeObstacle(center: Vec2, radius: number): void {
    this.stampObstacle(center, radius, -1);
  }

  private stampObstacle(center: Vec2, radius: number, delta: number): void {
    const reach = radius + this.cellSize;
    const x0 = Math.max(0, this.cellX(center.x - reach));
    const x1 = Math.min(this.cols - 1, this.cellX(center.x + reach));
    const y0 = Math.max(0, this.cellY(center.y - reach));
    const y1 = Math.min(this.rows - 1, this.cellY(center.y + reach));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (dist(this.cellCenter(cx, cy), center) <= reach) this.obstacles[cy * this.cols + cx] += delta;
      }
    }
  }

  isWalkable(p: Vec2): boolean {
    return this.isWalkableCell(this.cellX(p.x), this.cellY(p.y));
  }

  cellCenter(cx: number, cy: number): Vec2 {
    return { x: (cx + 0.5) * this.cellSize, y: (cy + 0.5) * this.cellSize };
  }

  /** The closest walkable spot to p — p itself if it's already walkable. */
  /**
   * The walkable cell center nearest `p` (or `p` itself, if it's walkable). Mirrored inputs give mirrored
   * answers, so neither side of the map is favored: it keeps looking until no unchecked cell could be
   * nearer, and a tie goes to the spot nearer `prefer` (say, where the walker is coming from), or else
   * nearer the middle of the map. (It used to take the first of a tie in reading order, left to right,
   * and stop at the first ring round `p`'s cell, so a blocked goal like a tower led blue's bots and red's
   * to different sides of it.)
   */
  nearestWalkable(p: Vec2, maxRings = 40, prefer?: Vec2): Vec2 | null {
    if (this.isWalkable(p)) return { x: p.x, y: p.y };
    const ox = this.cellX(p.x);
    const oy = this.cellY(p.y);
    const midX = (this.cols * this.cellSize) / 2;
    const midY = (this.rows * this.cellSize) / 2;
    const tieBreak = (c: Vec2) => (prefer ? dist(c, prefer) : Math.abs(c.x - midX) * 1e4 + Math.abs(c.y - midY));
    let best: Vec2 | null = null;
    let bestD = Infinity;
    let bestTie = Infinity;
    for (let r = 1; r <= maxRings; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // ring perimeter only
          if (!this.isWalkableCell(ox + dx, oy + dy)) continue;
          const c = this.cellCenter(ox + dx, oy + dy);
          const d = dist(c, p);
          if (d > bestD + TIE) continue;
          const tie = tieBreak(c);
          if (d < bestD - TIE || tie < bestTie) {
            best = c;
            bestD = d;
            bestTie = tie;
          }
        }
      }
      // The next ring's cells are all at least this far from p: none of them can beat what we have.
      if (best && (r + 0.5) * this.cellSize > bestD + TIE) return best;
    }
    return best;
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
