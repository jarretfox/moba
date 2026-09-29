import type { Vec2 } from '../math';
import type { NavGrid } from './navGrid';

const SQRT2 = Math.SQRT2;
const NEIGHBORS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/** A* over the nav grid, followed by string-pulling so units walk in straight lines. */
export class Pathfinder {
  private readonly g: Float32Array;
  private readonly parent: Int32Array;
  // Generation stamps let each search reuse the arrays without clearing them.
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private gen = 0;
  private readonly heap = new MinHeap();

  constructor(private readonly grid: NavGrid) {
    const n = grid.cols * grid.rows;
    this.g = new Float32Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  /** Waypoints from start to (the nearest walkable spot to) goal, excluding start. Empty if unreachable. */
  find(start: Vec2, goal: Vec2, maxExpansions = 40000): Vec2[] {
    const grid = this.grid;
    const target = grid.nearestWalkable(goal);
    if (!target) return [];
    if (grid.lineWalkable(start, target)) return [target];

    const from = grid.nearestWalkable(start) ?? start;
    const cols = grid.cols;
    const sx = grid.cellX(from.x);
    const sy = grid.cellY(from.y);
    const tx = grid.cellX(target.x);
    const ty = grid.cellY(target.y);
    const startIdx = sy * cols + sx;
    const goalIdx = ty * cols + tx;

    const gen = ++this.gen;
    const heuristic = (cx: number, cy: number) => {
      const dx = Math.abs(cx - tx);
      const dy = Math.abs(cy - ty);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };

    this.heap.clear();
    this.g[startIdx] = 0;
    this.parent[startIdx] = -1;
    this.seen[startIdx] = gen;
    this.heap.push(startIdx, heuristic(sx, sy));

    let found = false;
    let expansions = 0;
    while (this.heap.size > 0) {
      const idx = this.heap.pop();
      if (this.closed[idx] === gen) continue;
      this.closed[idx] = gen;
      if (idx === goalIdx) {
        found = true;
        break;
      }
      if (++expansions > maxExpansions) break;

      const cx = idx % cols;
      const cy = (idx - cx) / cols;
      for (const [dx, dy, cost] of NEIGHBORS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!grid.isWalkableCell(nx, ny)) continue;
        // No cutting corners diagonally past a wall.
        if (dx !== 0 && dy !== 0 && (!grid.isWalkableCell(cx + dx, cy) || !grid.isWalkableCell(cx, cy + dy))) continue;
        const nIdx = ny * cols + nx;
        if (this.closed[nIdx] === gen) continue;
        const ng = this.g[idx] + cost;
        if (this.seen[nIdx] !== gen || ng < this.g[nIdx]) {
          this.seen[nIdx] = gen;
          this.g[nIdx] = ng;
          this.parent[nIdx] = idx;
          this.heap.push(nIdx, ng + heuristic(nx, ny));
        }
      }
    }
    if (!found) return [];

    const cells: Vec2[] = [];
    for (let i = goalIdx; i !== -1; i = this.parent[i]) {
      const cx = i % cols;
      cells.push(grid.cellCenter(cx, (i - cx) / cols));
    }
    cells.reverse();
    cells[cells.length - 1] = target;
    return this.smooth(start, cells);
  }

  /** Greedy string-pulling: skip every waypoint we can already see past. */
  private smooth(start: Vec2, pts: Vec2[]): Vec2[] {
    const out: Vec2[] = [];
    let anchor = start;
    let i = 0;
    while (i < pts.length) {
      let j = i;
      while (j + 1 < pts.length && this.grid.lineWalkable(anchor, pts[j + 1])) j++;
      out.push(pts[j]);
      anchor = pts[j];
      i = j + 1;
    }
    return out;
  }
}

/** Binary min-heap of cell indices keyed by priority. Duplicates are allowed; stale entries are skipped by the caller. */
class MinHeap {
  private ids: number[] = [];
  private pri: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  clear(): void {
    this.ids.length = 0;
    this.pri.length = 0;
  }

  push(id: number, p: number): void {
    const ids = this.ids;
    const pri = this.pri;
    let i = ids.length;
    ids.push(id);
    pri.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= p) break;
      ids[i] = ids[parent];
      pri[i] = pri[parent];
      i = parent;
    }
    ids[i] = id;
    pri[i] = p;
  }

  pop(): number {
    const ids = this.ids;
    const pri = this.pri;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastP = pri.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      while (true) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && pri[r] < pri[l] ? r : l;
        if (pri[c] >= lastP) break;
        ids[i] = ids[c];
        pri[i] = pri[c];
        i = c;
      }
      ids[i] = lastId;
      pri[i] = lastP;
    }
    return top;
  }
}
