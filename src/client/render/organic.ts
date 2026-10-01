import type { Graphics } from 'pixi.js';
import type { Shape } from '../../shared/map/shapes';

// The hand-made look: seeded noise to wobble every edge, colors that shade toward a cool ink instead of
// flat black, and strokes that swell and taper like a brush or a dip pen. Everything here is deterministic
// for a given seed, so the map and the champions look the same on every screen.

// ─── Randomness ───────────────────────────────────────────────────────────────

/** A small seeded generator (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). */
export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Layered noise in [0, 1): big soft shapes with finer wobble on top. */
export function fbm(x: number, y: number, octaves = 4, seed = 0): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * f, y * f, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

// ─── Color ────────────────────────────────────────────────────────────────────

/** The darkest line color: a cool, slightly purple near-black rather than flat black. */
export const INK = 0x14121c;
const WARM_LIGHT = 0xfff3d6;

export function mix(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** Toward ink (t > 0) or toward a warm light (t < 0). */
export function shade(color: number, t: number): number {
  return t >= 0 ? mix(color, INK, t) : mix(color, WARM_LIGHT, -t);
}

/** The line color for something of this color: the same hue, much darker. */
export function inkOf(color: number): number {
  return mix(color, INK, 0.72);
}

/** A color nudged at random, so a field of the "same" thing isn't all one flat color. */
export function vary(color: number, amount: number, random: () => number): number {
  return shade(color, (random() - 0.5) * 2 * amount);
}

// ─── Outlines ─────────────────────────────────────────────────────────────────

/** Flat [x, y, x, y...] polygon. */
export type Pts = number[];

/**
 * A map shape's outline as a polygon, grown by `grow`, with a point roughly every `step` units.
 * `round` rounds a rectangle's corners (as a share of its shorter side).
 */
export function shapeOutline(s: Shape, step = 24, grow = 0, round = 0): Pts {
  const pts: Pts = [];
  if (s.type === 'circle') {
    const r = s.r + grow;
    const n = Math.max(12, Math.ceil((Math.PI * 2 * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
    }
    return pts;
  }
  if (s.type === 'rect' && round > 0) {
    const rad = Math.min(s.w, s.h) * round + grow;
    const x0 = s.x + rad - grow;
    const y0 = s.y + rad - grow;
    const x1 = s.x + s.w - rad + grow;
    const y1 = s.y + s.h - rad + grow;
    // Corner centers clockwise from the top right, each with the angle its arc starts at.
    const corners: [number, number, number][] = [[x1, y0, -Math.PI / 2], [x1, y1, 0], [x0, y1, Math.PI / 2], [x0, y0, Math.PI]];
    const arcN = Math.max(3, Math.ceil(((Math.PI / 2) * rad) / step));
    for (let c = 0; c < 4; c++) {
      const [cx, cy, a0] = corners[c];
      for (let i = 0; i <= arcN; i++) {
        const a = a0 + (i / arcN) * (Math.PI / 2);
        pts.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      // The straight run to the next corner.
      const [nx, ny] = corners[(c + 1) % 4];
      const out = a0 + Math.PI / 2;
      const ex = cx + Math.cos(out) * rad;
      const ey = cy + Math.sin(out) * rad;
      const tx = nx + Math.cos(out) * rad;
      const ty = ny + Math.sin(out) * rad;
      const n = Math.max(1, Math.round(Math.hypot(tx - ex, ty - ey) / step));
      for (let i = 1; i < n; i++) pts.push(ex + ((tx - ex) * i) / n, ey + ((ty - ey) * i) / n);
    }
    return pts;
  }
  if (s.type === 'rect') {
    const x0 = s.x - grow;
    const y0 = s.y - grow;
    const x1 = s.x + s.w + grow;
    const y1 = s.y + s.h + grow;
    const edge = (ax: number, ay: number, bx: number, by: number) => {
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
      for (let i = 0; i < n; i++) pts.push(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n);
    };
    edge(x0, y0, x1, y0);
    edge(x1, y0, x1, y1);
    edge(x1, y1, x0, y1);
    edge(x0, y1, x0, y0);
    return pts;
  }
  // Capsule: round the far end, along one side, round the near end, back along the other.
  const r = s.r + grow;
  const base = Math.atan2(s.by - s.ay, s.bx - s.ax);
  const n = Math.max(8, Math.ceil((Math.PI * r) / step));
  const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
  const sides = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const a = base - Math.PI / 2 + (i / n) * Math.PI;
    pts.push(s.bx + Math.cos(a) * r, s.by + Math.sin(a) * r);
  }
  for (let i = 1; i < sides; i++) {
    const k = 1 - i / sides;
    pts.push(s.ax + (s.bx - s.ax) * k + Math.cos(base + Math.PI / 2) * r, s.ay + (s.by - s.ay) * k + Math.sin(base + Math.PI / 2) * r);
  }
  for (let i = 0; i <= n; i++) {
    const a = base + Math.PI / 2 + (i / n) * Math.PI;
    pts.push(s.ax + Math.cos(a) * r, s.ay + Math.sin(a) * r);
  }
  for (let i = 1; i < sides; i++) {
    const k = i / sides;
    pts.push(s.ax + (s.bx - s.ax) * k + Math.cos(base - Math.PI / 2) * r, s.ay + (s.by - s.ay) * k + Math.sin(base - Math.PI / 2) * r);
  }
  return pts;
}

function signedArea(pts: Pts): number {
  let a = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const j = (i + 2) % pts.length;
    a += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
  }
  return a / 2;
}

/** Each vertex's outward normal (averaged from its two edges). */
function normals(pts: Pts): Pts {
  const n = pts.length / 2;
  const out: Pts = new Array(pts.length);
  const sign = signedArea(pts) > 0 ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const p = ((i - 1 + n) % n) * 2;
    const q = ((i + 1) % n) * 2;
    const tx = pts[q] - pts[p];
    const ty = pts[q + 1] - pts[p + 1];
    const len = Math.hypot(tx, ty) || 1;
    out[i * 2] = (ty / len) * sign;
    out[i * 2 + 1] = (-tx / len) * sign;
  }
  return out;
}

/** Push every point of a closed outline in or out by noise, so straight edges and perfect curves wobble. */
export function roughen(pts: Pts, amp: number, freq: number, seed = 0): Pts {
  const nm = normals(pts);
  const out: Pts = new Array(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    const d = (fbm(pts[i] * freq, pts[i + 1] * freq, 3, seed) - 0.5) * 2 * amp;
    out[i] = pts[i] + nm[i] * d;
    out[i + 1] = pts[i + 1] + nm[i + 1] * d;
  }
  return out;
}

/** Grow (or with a negative `d`, shrink) a closed outline. */
export function inflate(pts: Pts, d: number): Pts {
  const nm = normals(pts);
  return pts.map((v, i) => v + nm[i] * d);
}

export function offset(pts: Pts, dx: number, dy: number): Pts {
  return pts.map((v, i) => v + (i % 2 ? dy : dx));
}

/** A lumpy round shape: a rock, a bush, a puddle. `lump` is how far the edge strays (share of the radius). */
export function blob(x: number, y: number, rx: number, ry: number, seed: number, lump = 0.22, n = 0): Pts {
  const count = n || Math.max(10, Math.round(Math.max(rx, ry) / 5));
  const pts: Pts = [];
  // Noise sampled round a circle, so the edge joins up seamlessly.
  const ox = (seed % 97) * 7.3;
  const oy = (seed % 89) * 5.1;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const k = 1 + (fbm(ox + Math.cos(a) * 1.6, oy + Math.sin(a) * 1.6, 3, seed) - 0.5) * 2 * lump;
    pts.push(x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k);
  }
  return pts;
}

/** A few jittered corners: a pebble, a flagstone, a chunk of rock. */
export function shard(x: number, y: number, r: number, random: () => number, corners = 6, squash = 0.75): Pts {
  const pts: Pts = [];
  const spin = random() * Math.PI * 2;
  for (let i = 0; i < corners; i++) {
    const a = spin + ((i + (random() - 0.5) * 0.6) / corners) * Math.PI * 2;
    const k = 0.7 + random() * 0.45;
    pts.push(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k * squash);
  }
  return pts;
}

/** Rounds off a polyline's corners (Chaikin). */
export function smooth(pts: Pts, closed: boolean, passes = 1): Pts {
  let cur = pts;
  for (let p = 0; p < passes; p++) {
    const out: Pts = [];
    const n = cur.length / 2;
    const last = closed ? n : n - 1;
    if (!closed) out.push(cur[0], cur[1]);
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      const ax = cur[i * 2];
      const ay = cur[i * 2 + 1];
      const bx = cur[j * 2];
      const by = cur[j * 2 + 1];
      out.push(ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25, ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75);
    }
    if (!closed) out.push(cur[cur.length - 2], cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}

// ─── Ink ──────────────────────────────────────────────────────────────────────

export interface StrokeStyle {
  color: number;
  alpha?: number;
  /** How much the width wanders along the line, like pen pressure (0–1). */
  pressure?: number;
  /** Width left at each end, as a share of the full width (0 = a sharp point). */
  tip?: number;
  seed?: number;
}

/**
 * A line that swells in the middle and tapers to its ends, drawn as one filled shape. This is the
 * hand-inked line everything uses in place of a flat, even stroke.
 */
export function inkStroke(g: Graphics, pts: Pts, width: number, style: StrokeStyle): Graphics {
  const n = pts.length / 2;
  if (n < 2) return g;
  const { color, alpha = 1, pressure = 0.35, tip = 0.15, seed = 0 } = style;
  const lens = [0];
  for (let i = 1; i < n; i++) lens.push(lens[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]));
  const total = lens[n - 1] || 1;
  const left: Pts = [];
  const right: Pts = [];
  for (let i = 0; i < n; i++) {
    const p = Math.max(0, i - 1);
    const q = Math.min(n - 1, i + 1);
    const tx = pts[q * 2] - pts[p * 2];
    const ty = pts[q * 2 + 1] - pts[p * 2 + 1];
    const tl = Math.hypot(tx, ty) || 1;
    const t = lens[i] / total;
    const swell = tip + (1 - tip) * Math.sqrt(Math.sin(Math.PI * t));
    const press = 1 + (noise2(seed * 3.7 + lens[i] * 0.03, 0.5, seed) - 0.5) * 2 * pressure;
    const w = (width * swell * press) / 2;
    const nx = (-ty / tl) * w;
    const ny = (tx / tl) * w;
    left.push(pts[i * 2] + nx, pts[i * 2 + 1] + ny);
    right.push(pts[i * 2] - nx, pts[i * 2 + 1] - ny);
  }
  const poly: Pts = left;
  for (let i = n - 1; i >= 0; i--) poly.push(right[i * 2], right[i * 2 + 1]);
  return g.poly(poly).fill({ color, alpha });
}

/** A simple straight-ish inked mark from (ax, ay) to (bx, by), bowed a little. */
export function inkLine(g: Graphics, ax: number, ay: number, bx: number, by: number, width: number, style: StrokeStyle, bow = 0.08): Graphics {
  const mx = (ax + bx) / 2 - (by - ay) * bow;
  const my = (ay + by) / 2 + (bx - ax) * bow;
  const pts: Pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const u = 1 - t;
    pts.push(u * u * ax + 2 * u * t * mx + t * t * bx, u * u * ay + 2 * u * t * my + t * t * by);
  }
  return inkStroke(g, pts, width, style);
}

/**
 * Outlines a closed shape the way a hand would: a few overlapping strokes rather than one even ring,
 * heavier on the shadow side (lower right).
 */
export function inkLoop(g: Graphics, pts: Pts, width: number, style: StrokeStyle, pieces = 3): Graphics {
  const n = pts.length / 2;
  if (n < 3) return g;
  const seed = style.seed ?? 0;
  const start = Math.floor(hash(n, pieces, seed) * n);
  const per = Math.ceil(n / pieces);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += pts[i * 2];
    cy += pts[i * 2 + 1];
  }
  cx /= n;
  cy /= n;
  for (let k = 0; k < pieces; k++) {
    const seg: Pts = [];
    // Overlap each piece onto the next a little so the joins don't show.
    for (let i = 0; i <= per + 1; i++) {
      const idx = (start + k * per + i) % n;
      seg.push(pts[idx * 2], pts[idx * 2 + 1]);
    }
    const mid = (start + k * per + Math.floor(per / 2)) % n;
    // Heavier where the outline faces away from the light.
    const facing = ((pts[mid * 2] - cx) * 0.6 + (pts[mid * 2 + 1] - cy) * 0.8) / (Math.hypot(pts[mid * 2] - cx, pts[mid * 2 + 1] - cy) || 1);
    inkStroke(g, seg, width * (0.75 + 0.45 * Math.max(0, facing)), { ...style, seed: seed + k, tip: style.tip ?? 0.35 });
  }
  return g;
}

/**
 * A filled shape with a hand-inked edge: a darker copy pushed toward the shadow side sits underneath,
 * so the line is thick at the lower right and thin at the upper left, then a thin even line all round.
 */
export function inked(g: Graphics, pts: Pts, fill: number, width = 2.5, line = inkOf(fill), alpha = 1): Graphics {
  g.poly(offset(inflate(pts, width * 0.5), width * 0.45, width * 0.6)).fill({ color: line, alpha });
  g.poly(pts).fill({ color: fill, alpha });
  return g.poly(pts).stroke({ width: Math.max(1, width * 0.4), color: line, alpha: alpha * 0.85, join: 'round' });
}

/**
 * Hatching: little groups of parallel strokes scattered where `inside` says, like shading with a pen.
 * `angle` is the direction of the strokes.
 */
export function hatch(
  g: Graphics,
  box: { x: number; y: number; w: number; h: number },
  inside: (x: number, y: number) => boolean,
  opts: { angle: number; spacing: number; length: number; width: number; color: number; alpha: number; density: number },
  random: () => number,
): Graphics {
  const { angle, spacing, length, width, color, alpha, density } = opts;
  const count = Math.round(((box.w * box.h) / 10000) * density);
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let i = 0; i < count; i++) {
    const x = box.x + random() * box.w;
    const y = box.y + random() * box.h;
    const lines = 2 + Math.floor(random() * 3);
    for (let l = 0; l < lines; l++) {
      const ox = x - dy * spacing * l;
      const oy = y + dx * spacing * l;
      const len = length * (0.6 + random() * 0.5);
      const ax = ox - (dx * len) / 2;
      const ay = oy - (dy * len) / 2;
      const bx = ox + (dx * len) / 2;
      const by = oy + (dy * len) / 2;
      if (!inside(ax, ay) || !inside(bx, by)) continue;
      inkLine(g, ax, ay, bx, by, width, { color, alpha, seed: i * 7 + l, tip: 0.1 }, (random() - 0.5) * 0.1);
    }
  }
  return g;
}

/** A tapered blade of grass (or a flame, a feather, a tuft of hair) from its root, leaning. */
export function blade(g: Graphics, x: number, y: number, h: number, lean: number, width: number, color: number, alpha = 1): Graphics {
  const tx = x + lean;
  const ty = y - h;
  const mx = x + lean * 0.3;
  const my = y - h * 0.55;
  // Wide at the root, curving to a point.
  return g
    .moveTo(x - width / 2, y)
    .quadraticCurveTo(mx - width * 0.3, my, tx, ty)
    .quadraticCurveTo(mx + width * 0.3, my, x + width / 2, y)
    .closePath()
    .fill({ color, alpha });
}

/** Point inside a closed polygon (even-odd). */
export function insidePoly(pts: Pts, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i];
    const yi = pts[i + 1];
    const xj = pts[j];
    const yj = pts[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polyBounds(pts: Pts): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    x0 = Math.min(x0, pts[i]);
    x1 = Math.max(x1, pts[i]);
    y0 = Math.min(y0, pts[i + 1]);
    y1 = Math.max(y1, pts[i + 1]);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
