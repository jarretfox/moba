import type { MapData } from '../../shared/map/mapData';
import { NavGrid } from '../../shared/map/navGrid';
import { Pathfinder } from '../../shared/map/pathfind';
import type { Vec2 } from '../../shared/math';
import { landmarkSpots } from './landmarks';
import { blob, fbm, rng, smooth, type Pts } from './organic';

// Where the story landmarks meet the ground, so they sit in the jungle rather than on it: the earth worn
// bare round each one, and footpaths trodden out to them over the years: from the back door to Logan's
// cage, from the cage round to the café and the cellar, from those to the camps and the mouth of the
// Warden's pit. All of it is painted into the ground (see paintGround in mapView.ts), under the same brush
// dabs as everything else, so it's the same paint as the lanes; and the grass keeps off it.

export interface WornPatch {
  pts: Pts;
  color: number;
  alpha: number;
  /** How soft its edge is, in world units. */
  blur: number;
}

export interface LoreGround {
  /** Bare earth, gravel and stains round the landmarks, painted in order. */
  patches: WornPatch[];
  /** The footpaths, each as a ribbon outline. */
  trails: Pts[];
  /** How worn the ground is at a point: 0 is untouched grass, 1 is bare earth (for keeping tufts off). */
  wear(x: number, y: number): number;
}

const EARTH = 0x4e3e29;
const GRAVEL = 0x8a7b5e;
const CELL = 40;

const cache = new WeakMap<MapData, LoreGround>();

/** The Rift's lore ground (none on other maps). Worked out once per map. */
export function loreGround(map: MapData): LoreGround {
  let lore = cache.get(map);
  if (!lore) {
    lore = map.id === 'rift' ? build(map) : { patches: [], trails: [], wear: () => 0 };
    cache.set(map, lore);
  }
  return lore;
}

function build(map: MapData): LoreGround {
  const W = map.width;
  const H = map.height;
  const at = landmarkSpots(map);
  const patches: WornPatch[] = [];
  const trails: Pts[] = [];
  // Wear, on a coarse grid: the strongest mark wins.
  const cols = Math.ceil(W / CELL);
  const rows = Math.ceil(H / CELL);
  const wearGrid = new Float32Array(cols * rows);
  const mark = (x: number, y: number, r: number, strength: number) => {
    const c0 = Math.max(0, Math.floor((x - r) / CELL));
    const c1 = Math.min(cols - 1, Math.floor((x + r) / CELL));
    const r0 = Math.max(0, Math.floor((y - r) / CELL));
    const r1 = Math.min(rows - 1, Math.floor((y + r) / CELL));
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const d = Math.hypot((cx + 0.5) * CELL - x, (cy + 0.5) * CELL - y) / r;
        if (d >= 1) continue;
        const w = strength * Math.min(1, (1 - d) * 1.8);
        const i = cy * cols + cx;
        if (w > wearGrid[i]) wearGrid[i] = w;
      }
    }
  };
  /** A patch of bare ground: a soft halo of trodden earth, then the bare middle. */
  const bare = (x: number, y: number, rx: number, ry: number, seed: number, color = EARTH, alpha = 0.55) => {
    patches.push({ pts: blob(x, y, rx * 1.35, ry * 1.35, seed, 0.3, 26), color, alpha: alpha * 0.4, blur: 50 });
    patches.push({ pts: blob(x, y, rx, ry, seed + 1, 0.32, 26), color, alpha, blur: 16 });
    mark(x, y, Math.max(rx, ry) * 1.1, 0.95);
  };

  // Round each landmark (and its mirror on the red side), the ground its story wore bare.
  for (const flip of [false, true]) {
    const cage = flip ? at.statue : at.cage;
    if (!flip) bare(cage.x + 10, cage.y + 40, 240, 150, 11);
    // The fallen king: earth torn up where he came down and was dragged, round the plinth and the body.
    else {
      bare(cage.x + 40, cage.y + 20, 300, 150, 12, 0x46382a, 0.6);
      patches.push({ pts: blob(cage.x - 30, cage.y + 30, 120, 50, 13, 0.4, 18), color: 0x2e2418, alpha: 0.5, blur: 12 });
    }
    const cafe = flip ? at.gym : at.cafe;
    const cellar = flip ? at.den : at.cellar;
    if (!flip) {
      // Le Petit Café: a round gravel terrace under the table, the piste worn into the grass beside it.
      bare(cafe.x, cafe.y + 40, 230, 130, 21, EARTH, 0.4);
      patches.push({ pts: blob(cafe.x, cafe.y - 4, 116, 68, 22, 0.12, 30), color: GRAVEL, alpha: 0.7, blur: 6 });
      // The Royal Cellar: a mound of dark earth heaped round the hatch.
      bare(cellar.x + 20, cellar.y - 10, 200, 150, 31, EARTH, 0.5);
      patches.push({ pts: blob(cellar.x, cellar.y - 20, 110, 105, 32, 0.2, 24), color: 0x2e2418, alpha: 0.45, blur: 18 });
    } else {
      // Iron Paradise: dust kicked up all round the mat.
      bare(cafe.x, cafe.y + 10, 230, 160, 41, 0x5a4a34, 0.6);
      // The Hotbox: trampled flat, a burnt ring where the fire was.
      bare(cellar.x, cellar.y + 10, 210, 150, 51, EARTH, 0.55);
    }
  }
  // The Deep's outflow and the Rot's bloom stain the river downstream.
  for (const [p, color] of [[at.sewer, 0x4a6a2a], [at.rot, 0x5a2a6a]] as const) {
    patches.push({ pts: blob(p.x, p.y, 210, 330, 61, 0.3, 24), color, alpha: 0.35, blur: 60 });
  }

  // The footpaths: authored in blue's top quarter and mirrored round the map, each walked out by the
  // pathfinder so it goes round the rocks, then wandering a little and narrowing and widening as it goes.
  const grid = new NavGrid(map);
  const finder = new Pathfinder(grid);
  const cage = at.cage;
  const cafe = at.cafe;
  const quarter: [Vec2, Vec2, boolean][] = [
    // From the back door to the cage (on the middle line, so only mirrored left to right).
    [{ x: 2000, y: H / 2 }, { x: cage.x - 120, y: cage.y + 40 }, true],
    [{ x: cage.x + 140, y: cage.y - 40 }, { x: cafe.x - 60, y: cafe.y + 70 }, false],
    [{ x: cafe.x + 60, y: cafe.y + 60 }, { x: 5330, y: H / 2 - 150 }, false],
    [{ x: cafe.x + 10, y: cafe.y - 60 }, { x: 4600, y: 2260 }, false],
  ];
  const random = rng(4242);
  let seed = 0;
  for (const [a, b, midline] of quarter) {
    for (const mx of [false, true]) {
      for (const my of midline ? [false] : [false, true]) {
        const m = (p: Vec2) => ({ x: mx ? W - p.x : p.x, y: my ? H - p.y : p.y });
        const from = m(a);
        const path = [from, ...finder.find(from, m(b))];
        if (path.length < 2) continue;
        const ribbon = trail(path, ++seed, random, grid);
        trails.push(ribbon.outline);
        for (const [x, y, w] of ribbon.spine) mark(x, y, w * 1.25, 0.8);
      }
    }
  }

  const wear = (x: number, y: number) => {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return 0;
    return wearGrid[cy * cols + cx];
  };
  return { patches, trails, wear };
}

/** A worn path along a route: resampled, nudged side to side, its width breathing; as a ribbon outline. */
function trail(route: Vec2[], seed: number, random: () => number, grid: NavGrid): { outline: Pts; spine: [number, number, number][] } {
  // Resample every 30 units along the route.
  const pts: Vec2[] = [route[0]];
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 30));
    for (let k = 1; k <= n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  // Wander: push each point sideways by a slow noise, unless that would walk it off the ground.
  const wandered: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[Math.min(pts.length - 1, i + 1)];
    const o = pts[Math.max(0, i - 1)];
    const len = Math.hypot(q.x - o.x, q.y - o.y) || 1;
    const nx = -(q.y - o.y) / len;
    const ny = (q.x - o.x) / len;
    const ends = Math.min(1, i / 6, (pts.length - 1 - i) / 6);
    const push = (fbm(i / 9, seed * 3.1, 2, seed) - 0.5) * 140 * ends;
    const x = p.x + nx * push;
    const y = p.y + ny * push;
    const ok = grid.isWalkableCell(grid.cellX(x), grid.cellY(y));
    wandered.push(ok ? x : p.x, ok ? y : p.y);
  }
  const line = smooth(wandered, false, 2);
  const n = line.length / 2;
  const left: number[] = [];
  const right: number[] = [];
  const spine: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const x = line[i * 2];
    const y = line[i * 2 + 1];
    const j = Math.min(n - 1, i + 1);
    const h = Math.max(0, i - 1);
    const dx = line[j * 2] - line[h * 2];
    const dy = line[j * 2 + 1] - line[h * 2 + 1];
    const len = Math.hypot(dx, dy) || 1;
    // Narrow at the ends, breathing in between, a little ragged at the edges.
    const ends = Math.min(1, (i + 2) / 8, (n - i + 1) / 8);
    const w = (20 + 18 * fbm(i / 7, seed, 2, seed + 5)) * (0.45 + 0.55 * ends);
    const jag = () => 1 + (random() - 0.5) * 0.3;
    left.push(x - (dy / len) * w * jag(), y + (dx / len) * w * jag());
    right.push(x + (dy / len) * w * jag(), y - (dx / len) * w * jag());
    spine.push([x, y, w]);
  }
  const outline: Pts = [...left];
  for (let i = n - 1; i >= 0; i--) outline.push(right[i * 2], right[i * 2 + 1]);
  return { outline, spine };
}
