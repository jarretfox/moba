import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { TEAM, type Team } from '../../shared/constants';
import type { GroundStyle, MapData } from '../../shared/map/mapData';
import type { NavGrid } from '../../shared/map/navGrid';
import { shapeContains, type Shape } from '../../shared/map/shapes';
import { GroundCanvas } from './groundTexture';
import {
  blade,
  blob,
  fbm,
  hatch,
  inflate,
  inkLine,
  inkLoop,
  inkOf,
  inkStroke,
  inked,
  insidePoly,
  offset,
  polyBounds,
  rng,
  roughen,
  shade,
  shapeOutline,
  shard,
  smooth,
  vary,
  type Pts,
  type StrokeStyle,
} from './organic';
import { paintProps, propSpots } from './props';

// The map, painted once at load. Everything decorative is placed by a seeded random generator, so the
// map looks the same for everyone and every match. Gameplay shapes (ground, walls, brush) come straight
// from MapData; the trees, tufts, pebbles and cracks are just paint.
//
// It's painted in two passes, like a backdrop and the ink over it: the ground is a soft painted texture
// (see groundTexture.ts), and everything with an edge is drawn on top with wobbly, hand-inked lines.

const PAL = {
  void: 0x162313,
  canopy: [0x1d3a19, 0x244620, 0x2c5226, 0x1a351b],
  jungle: 0x2f4a29,
  jungleDark: 0x22391d,
  tuft: [0x4c7a3d, 0x5f8f48, 0x3f6a33],
  lane: 0x7d6849,
  laneEdge: 0x4f4130,
  pebble: [0x9a9284, 0x7d766a, 0xb1a998],
  allyBase: 0x3a465e,
  enemyBase: 0x5d3c3d,
  river: 0x22546b,
  riverDeep: 0x173f52,
  riverShore: 0x6fb0c2,
  rock: 0x4d5146,
  rockTop: 0x666b5c,
  rockDark: 0x2c2f28,
  cliff: 0x23261f,
  moss: 0x3e6233,
  brush: 0x1f4a1b,
  brushBlade: [0x3a7a31, 0x2b6125, 0x4c8f40],
  bark: 0x3d2a18,
} as const;

/** Draw order: later styles paint over earlier ones where they overlap. */
const STYLE_ORDER: GroundStyle[] = ['jungle', 'base', 'lane', 'river'];

/** How much each kind of ground's edge wanders, and how tightly. */
const ROUGH: Record<GroundStyle, { amp: number; freq: number }> = {
  jungle: { amp: 100, freq: 1 / 360 },
  base: { amp: 14, freq: 1 / 300 },
  lane: { amp: 44, freq: 1 / 220 },
  river: { amp: 24, freq: 1 / 160 },
};

/**
 * The map in three layers. `ground` lies flat; `wallTops` and `canopy` are the tops of tall things
 * (cliffs, trees). The game draws those slightly spread away from the middle of the screen, so trunks and
 * cliff faces peek out from under them and the map reads as having height.
 */
export interface MapLayers {
  ground: Container;
  wallTops: Container;
  canopy: Container;
  /** Patches of tall grass, each pivoted at its foot, for the wind to lean. */
  sway: Container[];
  /** Where the tree crowns are (for weather that settles on them: snow). */
  crowns: { x: number; y: number; r: number; deep: boolean }[];
  /** Things standing up off the ground (lantern posts, braziers, toadstools): sort them in with the units. */
  standing: Container[];
}

/** How far each kind of tall thing leans out from the middle of the screen (share of its distance). */
export const HEIGHT = { wall: 0.04, tree: 0.065 } as const;

/** Places a tall layer: everything in it is pushed out from the camera's center by `k` of its distance. */
export function elevate(layer: Container, k: number, cameraX: number, cameraY: number): void {
  layer.scale.set(1 + k);
  layer.position.set(-k * cameraX, -k * cameraY);
}

/** Destroys a map layer built here, including the painted ground's texture. */
export function destroyMapLayer(layer: Container): void {
  layer.destroy({ children: true, texture: true, textureSource: true });
}

/** The static map. Bases are tinted from the viewer's side: yours blue, theirs red, like every unit color. */
export function buildMap(map: MapData, myTeam: Team = TEAM.blue): MapLayers {
  const root = new Container();
  const wallTops = new Graphics();
  const canopy = new Graphics();
  const random = rng(1337);
  const terrain = new Terrain(map);

  // Beyond the painting, the dark of the forest floor.
  const beyond = new Graphics();
  beyond.rect(-4000, -4000, map.width + 8000, map.height + 8000).fill(PAL.void);
  root.addChild(beyond);
  const trees = placeTrees(map, terrain, random);
  const rocks = map.blockers.map((b, i) => ({ shape: b, outline: rockOutline(b, 300 + i) }));
  root.addChild(paintGround(map, myTeam, terrain, trees, rocks, random));
  const detail = new Graphics();
  paintBases(detail, map, myTeam, terrain, random);
  paintGroundDetail(detail, map, terrain, random);
  paintRipples(detail, map, random);
  if (!map.aram) paintPit(detail, map, random);
  for (const c of map.camps) paintNest(detail, c.pos.x, c.pos.y, random);
  root.addChild(detail);
  const forest = new Graphics();
  paintForest(forest, canopy, trees, random);
  root.addChild(forest);
  const walls = new Graphics();
  for (const r of rocks) paintRock(walls, wallTops, r.outline, random);
  root.addChild(walls);

  // Light pooled on the Warden's seal and the base plazas.
  const lights = new Container();
  if (!map.aram) lights.addChild(glow(map.width / 2, map.height / 2, 460, 0x8fd14f, 0.16));
  for (const piece of map.ground) {
    if (piece.style !== 'base' || piece.shape.type !== 'circle') continue;
    lights.addChild(glow(piece.shape.x, piece.shape.y, piece.shape.r, groundColor('base', piece.shape, map, myTeam) === PAL.allyBase ? 0x3d8bfd : 0xe5484d, 0.14));
  }
  root.addChild(lights);

  // Lanterns, braziers, glowing mushrooms and bones.
  const props = new Graphics();
  const standing: Container[] = paintProps(props, propSpots(map));
  root.addChild(props);
  // Each patch of tall grass on its own, so the wind can lean it from its foot.
  const sway: Container[] = [];
  for (const b of map.brush) {
    const patch = new Graphics();
    paintBrush(patch, b, random);
    const box = polyBounds(shapeOutline(b, 20, 20));
    patch.pivot.set(box.x + box.w / 2, box.y + box.h);
    patch.position.copyFrom(patch.pivot);
    root.addChild(patch);
    sway.push(patch);
  }

  for (const [text, y] of map.aram ? [] : ([['TOP LANE', 1100], ['BOT LANE', map.height - 1100]] as const)) {
    const t = new Text({ text, style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 60, fill: 0xffffff, letterSpacing: 6 } });
    t.alpha = 0.06;
    t.anchor.set(0.5);
    t.position.set(map.width / 2, y);
    root.addChild(t);
  }
  // Halloween: everything graded toward a cold purple night; the woods go nearly black.
  if (map.theme === 'halloween') {
    for (const child of root.children) child.tint = 0xb0a2cc;
    forest.tint = canopy.tint = 0x6c5c8c;
    walls.tint = wallTops.tint = 0xa49ac0;
    for (const patch of sway) patch.tint = 0x8a7aa8;
  }
  const crowns = trees.filter((t) => !t.shrub).map(({ x, y, r, deep }) => ({ x, y, r, deep }));
  return { ground: root, wallTops, canopy, sway, standing, crowns };
}

/** A soft round pool of light, fading smoothly to nothing at radius `r` (added over what's under it). */
function glow(x: number, y: number, r: number, color: number, alpha: number): Sprite {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const sprite = new Sprite(Texture.from(canvas));
  sprite.anchor.set(0.5);
  sprite.position.set(x, y);
  sprite.width = r * 2;
  sprite.height = r * 2;
  sprite.tint = color;
  sprite.alpha = alpha;
  sprite.blendMode = 'add';
  return sprite;
}

/** Debug overlay: green where units can walk, amber where the clearance margin trims the ground. */
export function buildNavOverlay(grid: NavGrid): Graphics {
  const g = new Graphics();
  const s = grid.cellSize;
  for (let cy = 0; cy < grid.rows; cy++) {
    for (let cx = 0; cx < grid.cols; cx++) {
      const i = cy * grid.cols + cx;
      if (grid.walkable[i]) g.rect(cx * s + 1, cy * s + 1, s - 2, s - 2).fill({ color: 0x4ade80, alpha: 0.12 });
      else if (grid.open[i]) g.rect(cx * s + 1, cy * s + 1, s - 2, s - 2).fill({ color: 0xf59e0b, alpha: 0.25 });
    }
  }
  return g;
}

// ─── Where things are ─────────────────────────────────────────────────────────

/** Answers "what's here?" for decoration: which ground style, and whether it's wall, brush or open. */
class Terrain {
  /** Coarse grid of how far (in cells) each spot is from walkable ground: 0 on the ground itself. */
  private readonly far: Uint16Array;
  /** The ground style at each cell's center (index into STYLE_ORDER, plus one; 0 for none). */
  private readonly styles: Uint8Array;
  private readonly cols: number;
  private readonly rows: number;
  static readonly CELL = 100;

  constructor(private readonly map: MapData) {
    const C = Terrain.CELL;
    this.cols = Math.ceil((map.width + 1600) / C);
    this.rows = Math.ceil((map.height + 1600) / C);
    this.far = new Uint16Array(this.cols * this.rows).fill(65535);
    this.styles = new Uint8Array(this.cols * this.rows);
    const queue: number[] = [];
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = cx * C - 800 + C / 2;
        const y = cy * C - 800 + C / 2;
        const style = this.styleAt(x, y);
        this.styles[cy * this.cols + cx] = style ? STYLE_ORDER.indexOf(style) + 1 : 0;
        if (style && !this.blocked(x, y)) {
          this.far[cy * this.cols + cx] = 0;
          queue.push(cy * this.cols + cx);
        }
      }
    }
    // Breadth-first outward from the ground: a cheap distance map.
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const cx = i % this.cols;
      const cy = (i - cx) / this.cols;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const j = ny * this.cols + nx;
        if (this.far[j] !== 65535) continue;
        this.far[j] = this.far[i] + 1;
        queue.push(j);
      }
    }
  }

  /** The topmost ground style here, or null off the ground. */
  styleAt(x: number, y: number): GroundStyle | null {
    for (let i = STYLE_ORDER.length - 1; i >= 0; i--) {
      const style = STYLE_ORDER[i];
      for (const p of this.map.ground) if (p.style === style && shapeContains(p.shape, x, y)) return style;
    }
    return null;
  }

  blocked(x: number, y: number): boolean {
    return this.map.blockers.some((b) => shapeContains(b, x, y));
  }

  inBrush(x: number, y: number): boolean {
    return this.map.brush.some((b) => shapeContains(b, x, y));
  }

  /** The ground style here to the nearest cell: quick, for scattering decoration. */
  roughStyleAt(x: number, y: number): GroundStyle | null {
    const cx = Math.floor((x + 800) / Terrain.CELL);
    const cy = Math.floor((y + 800) / Terrain.CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return null;
    const v = this.styles[cy * this.cols + cx];
    return v ? STYLE_ORDER[v - 1] : null;
  }

  /** Cells from the nearest walkable ground. */
  distanceToGround(x: number, y: number): number {
    const cx = Math.floor((x + 800) / Terrain.CELL);
    const cy = Math.floor((y + 800) / Terrain.CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return 99;
    return this.far[cy * this.cols + cx];
  }

  /** Which way a brush stroke runs here: along a lane, or swirling gently through the jungle. */
  flowAt(x: number, y: number): number {
    if (this.roughStyleAt(x, y) === 'lane') for (const p of this.map.ground) {
      if (p.style !== 'lane' || p.shape.type !== 'capsule' || !shapeContains(p.shape, x, y)) continue;
      return Math.atan2(p.shape.by - p.shape.ay, p.shape.bx - p.shape.ax);
    }
    return fbm(x / 1600, y / 1600, 2, 5) * Math.PI * 4;
  }
}

// ─── The painted ground ───────────────────────────────────────────────────────

function groundColor(style: GroundStyle, shape: Shape, map: MapData, myTeam: Team): number {
  if (style === 'jungle') return PAL.jungle;
  if (style === 'lane') return PAL.lane;
  if (style === 'river') return PAL.river;
  const x = shape.type === 'capsule' ? shape.ax : shape.x;
  return x < map.width / 2 === (myTeam === TEAM.blue) ? PAL.allyBase : PAL.enemyBase;
}

function edgeColor(style: GroundStyle): number {
  return style === 'lane' ? PAL.laneEdge : style === 'river' ? PAL.riverShore : style === 'base' ? 0x22272f : PAL.jungleDark;
}

/** A ground piece's outline with its edge wandering, the same way every time. */
function roughShape(style: GroundStyle, s: Shape, grow: number): Pts {
  const { amp, freq } = ROUGH[style];
  return roughen(shapeOutline(s, 22, grow), amp, freq, STYLE_ORDER.indexOf(style) + 1);
}

interface Tree {
  x: number;
  y: number;
  r: number;
  c: number;
  seed: number;
  /** Deep in the woods, behind other trees: drawn more simply. */
  deep: boolean;
  /** A low bush on the ground rather than a tree overhead. */
  shrub: boolean;
}

interface Rock {
  shape: Shape;
  outline: Pts;
}

function paintGround(map: MapData, myTeam: Team, t: Terrain, trees: Tree[], rocks: Rock[], random: () => number): Container {
  const M = 900;
  const c = new GroundCanvas(-M, -M, map.width + 2 * M, map.height + 2 * M, 0.25);
  c.clear(PAL.void);

  // Each kind of ground: a wide soft shadow round its edge, a darker rim, then the ground itself.
  for (const style of STYLE_ORDER) {
    const pieces = map.ground.filter((p) => p.style === style);
    c.fill(pieces.map((p) => roughShape(style, p.shape, 40)), edgeColor(style), 0.5, 40);
    c.fill(pieces.map((p) => roughShape(style, p.shape, 9)), shade(edgeColor(style), 0.2), 0.75, 7);
    for (const p of pieces) c.fill([roughShape(style, p.shape, 0)], groundColor(style, p.shape, map, myTeam), 1, 3);
  }
  // The river runs deeper down its middle.
  c.fill(map.ground.filter((p) => p.style === 'river').map((p) => roughShape('river', p.shape, -90)), PAL.riverDeep, 0.6, 50);
  // The Warden's seal, camp nests and the beds of tall grass.
  c.fill([blob(map.width / 2, map.height / 2, 480, 480, 71, 0.03, 64)], 0x000000, 0.35, 40);
  c.fill([blob(map.width / 2, map.height / 2, 470, 470, 71, 0.03, 64)], 0x2b2a30, 0.9, 6);
  c.fill(map.camps.map((cp, i) => blob(cp.pos.x, cp.pos.y + 20, 170, 140, 40 + i, 0.2)), 0x000000, 0.22, 30);
  c.fill(map.camps.map((cp, i) => blob(cp.pos.x, cp.pos.y + 20, 130, 105, 60 + i, 0.25)), 0x4b3a26, 0.4, 12);
  c.fill(map.brush.map((b, i) => roughen(shapeOutline(b, 16, 16), 10, 1 / 50, 80 + i)), 0x0c220a, 0.65, 14);
  c.fill(map.brush.map((b, i) => roughen(shapeOutline(b, 16, 2), 10, 1 / 50, 80 + i)), PAL.brush, 1, 3);

  // Brush dabs over everything walkable (and a few beyond), each in a nudged copy of the color under it.
  // Lighter and darker dabs cluster, so the ground has passes of light rather than salt-and-pepper.
  c.beginDabs();
  for (let i = 0; i < 34000; i++) {
    const x = -300 + random() * (map.width + 600);
    const y = -300 + random() * (map.height + 600);
    const style = t.roughStyleAt(x, y);
    if (!style && random() < 0.7) continue;
    const base = c.colorAt(x, y);
    const lift = (fbm(x / 500, y / 500, 2, 3) - 0.5) * 0.5 + (random() - 0.5) * 0.16;
    const len = style === 'lane' ? 40 + random() * 50 : 26 + random() * 46;
    const angle = t.flowAt(x, y) + (random() - 0.5) * 0.7;
    c.dab(x, y, len, len * (0.28 + random() * 0.16), angle, shade(base, -lift), 0.2 + random() * 0.12);
  }
  c.endDabs();

  // Soft shadows: cliffs and trees cast them down and to the right, and darken the ground right round them.
  c.fill(rocks.map((r) => inflate(r.outline, 34)), 0x000000, 0.22, 40);
  c.fill(rocks.map((r) => offset(inflate(r.outline, 6), 22, 30)), 0x000000, 0.42, 20);
  c.fill(trees.filter((tr) => !tr.shrub).map((tr) => blob(tr.x + 22, tr.y + 30, tr.r, tr.r * 0.92, tr.seed, 0.14, 14)), 0x000000, 0.38, 22);
  c.fill(trees.filter((tr) => tr.shrub).map((tr) => blob(tr.x + 8, tr.y + 10, tr.r, tr.r * 0.85, tr.seed, 0.2, 12)), 0x000000, 0.4, 10);
  c.mottle(1, 17);
  c.grain(14, 99);
  const holder = new Container();
  holder.addChild(c.sprite());
  return holder;
}

// ─── Inked details on the ground ──────────────────────────────────────────────

/** Irregular flagstones in rings round a point, in the given color: Da Base's plaza, the Warden's seal. */
function flagstones(
  g: Graphics,
  x: number,
  y: number,
  r0: number,
  r1: number,
  rings: number,
  perRing: (ring: number) => number,
  color: number,
  random: () => number,
  keep: (x: number, y: number) => boolean,
): void {
  const gap = 5;
  for (let ring = 0; ring < rings; ring++) {
    const ra = r0 + ((r1 - r0) * ring) / rings;
    const rb = r0 + ((r1 - r0) * (ring + 1)) / rings;
    const n = perRing(ring);
    const spin = random() * Math.PI * 2;
    // Uneven widths: each joint is nudged a little.
    const cuts = Array.from({ length: n }, (_, i) => spin + ((i + (random() - 0.5) * 0.5) / n) * Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a0 = cuts[i] + gap / ((ra + rb) / 2);
      const a1 = (i + 1 < n ? cuts[i + 1] : cuts[0] + Math.PI * 2) - gap / ((ra + rb) / 2);
      const mid = (a0 + a1) / 2;
      const rm = (ra + rb) / 2;
      if (!keep(x + Math.cos(mid) * rm, y + Math.sin(mid) * rm)) continue;
      const pts: Pts = [];
      const steps = Math.max(2, Math.ceil(((a1 - a0) * rb) / 40));
      for (let k = 0; k <= steps; k++) {
        const a = a0 + ((a1 - a0) * k) / steps;
        pts.push(x + Math.cos(a) * (rb - gap) + (random() - 0.5) * 4, y + Math.sin(a) * (rb - gap) + (random() - 0.5) * 4);
      }
      for (let k = steps; k >= 0; k--) {
        const a = a0 + ((a1 - a0) * k) / steps;
        const rr = Math.max(0, ra + (ring ? gap : 0));
        pts.push(x + Math.cos(a) * rr + (random() - 0.5) * 4, y + Math.sin(a) * rr + (random() - 0.5) * 4);
      }
      const stone = smooth(pts, true, 1);
      const tone = vary(color, 0.12, random);
      g.poly(stone).fill(tone);
      // Each stone lit from the upper left: a pale lip there, a dark one on the far side.
      g.poly(offset(inflate(stone, -4), -1.5, -2)).fill({ color: shade(tone, -0.1), alpha: 0.6 });
      g.poly(stone).stroke({ width: 1.5, color: inkOf(color), alpha: 0.55, join: 'round' });
      if (random() < 0.12) {
        const cx = x + Math.cos(mid) * rm;
        const cy = y + Math.sin(mid) * rm;
        inkLine(g, cx - 10, cy - 6, cx + 12, cy + 7, 2, { color: inkOf(color), alpha: 0.6, seed: i }, 0.2);
      }
    }
  }
}

/** Flagstones round each Da Base, in the base's team tint, ringed by a band of it. */
function paintBases(g: Graphics, map: MapData, myTeam: Team, t: Terrain, random: () => number): void {
  for (const piece of map.ground) {
    if (piece.style !== 'base' || piece.shape.type !== 'circle') continue;
    const s = piece.shape;
    const tint = groundColor('base', s, map, myTeam);
    // Lanes leading out of the base lie over the stones.
    flagstones(g, s.x, s.y, 0, s.r * 0.94, 6, (ring) => (ring ? ring * 7 + 2 : 1), tint, random, (x, y) => t.styleAt(x, y) === 'base');
    const onBase = (x: number, y: number) => t.styleAt(x, y) === 'base';
    inkRuns(g, shapeOutline({ type: 'circle', x: s.x, y: s.y, r: s.r * 0.9 }, 20), onBase, 12, { color: shade(tint, -0.25), alpha: 0.55, seed: 3, pressure: 0.5 });
    inkRuns(g, roughShape('base', s, -4), onBase, 7, { color: inkOf(tint), alpha: 0.6, seed: 4 });
  }
}

/** Inks a closed outline only where `keep` holds, as separate strokes (so it stops where a lane crosses). */
function inkRuns(g: Graphics, pts: Pts, keep: (x: number, y: number) => boolean, width: number, style: StrokeStyle): void {
  const n = pts.length / 2;
  const ok = Array.from({ length: n }, (_, i) => keep(pts[i * 2], pts[i * 2 + 1]));
  if (ok.every(Boolean)) {
    inkLoop(g, pts, width, style, 4);
    return;
  }
  // Start just after a gap, so no run is split across the end of the list.
  const start = ok.findIndex((v, i) => !v && ok[(i + 1) % n]);
  let run: Pts = [];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (ok[i]) run.push(pts[i * 2], pts[i * 2 + 1]);
    if ((!ok[i] || k === n) && run.length >= 6) inkStroke(g, run, width, { ...style, seed: (style.seed ?? 0) + k, tip: 0.1 });
    if (!ok[i]) run = [];
  }
}

/** Grass tufts, flowers and mushrooms in the jungle; pebbles and cracks in the lanes. */
function paintGroundDetail(g: Graphics, map: MapData, t: Terrain, random: () => number): void {
  for (let i = 0; i < 8000; i++) {
    const x = random() * map.width;
    const y = random() * map.height;
    const roll = random();
    if (t.distanceToGround(x, y) > 1) continue;
    const style = t.styleAt(x, y);
    if (!style || t.blocked(x, y) || t.inBrush(x, y)) continue;
    if (style === 'jungle') {
      if (roll < 0.6) tuft(g, x, y, 9 + random() * 7, PAL.tuft, random);
      else if (roll < 0.72) flowers(g, x, y, random);
      else if (roll < 0.8) mushroom(g, x, y, random);
      else if (roll < 0.88) pebble(g, x, y, random);
      else twig(g, x, y, random);
    } else if (style === 'lane') {
      if (roll < 0.5) pebble(g, x, y, random);
      else if (roll < 0.66) crack(g, x, y, random, 0x3f3324);
      else if (roll < 0.78) tuft(g, x, y, 7 + random() * 4, [0x6f7a45, 0x7d8650, 0x5d6a3a], random);
    }
  }
}

/** A clump of grass blades fanning from one root, darker ones behind. */
function tuft(g: Graphics, x: number, y: number, h: number, colors: readonly number[], random: () => number): void {
  const n = 3 + Math.floor(random() * 3);
  g.ellipse(x + 2, y + 1.5, h * 0.5, h * 0.18).fill({ color: 0x000000, alpha: 0.22 });
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) - 0.5;
    const color = shade(colors[Math.floor(random() * colors.length)], 0.22 - (i / n) * 0.3);
    blade(g, x + k * h * 0.5, y, h * (0.75 + random() * 0.5), k * h * 1.1 + (random() - 0.5) * 4, 3 + random() * 1.5, color);
  }
}

function pebble(g: Graphics, x: number, y: number, random: () => number): void {
  const r = 3.5 + random() * 5;
  const color = PAL.pebble[Math.floor(random() * 3)];
  const stone = shard(x, y, r, random, 5 + Math.floor(random() * 3), 0.72);
  inked(g, stone, color, 1.8);
  g.poly(offset(inflate(stone, -r * 0.4), -r * 0.15, -r * 0.2)).fill({ color: shade(color, -0.3), alpha: 0.7 });
}

function crack(g: Graphics, x: number, y: number, random: () => number, color: number): void {
  const pts: Pts = [x, y];
  let a = random() * Math.PI * 2;
  for (let i = 0; i < 4; i++) {
    a += (random() - 0.5) * 1.2;
    pts.push(pts[pts.length - 2] + Math.cos(a) * (8 + random() * 10), pts[pts.length - 1] + Math.sin(a) * (8 + random() * 10));
  }
  inkStroke(g, pts, 2.6, { color, alpha: 0.6, tip: 0.05, seed: Math.floor(x) });
}

function flowers(g: Graphics, x: number, y: number, random: () => number): void {
  const color = [0xe8d36a, 0xd98ad9, 0xf2f2f2][Math.floor(random() * 3)];
  for (let f = 0; f < 3; f++) {
    const fx = x + random() * 18 - 9;
    const fy = y + random() * 18 - 9;
    blade(g, fx, fy + 6, 7, (random() - 0.5) * 4, 1.6, 0x3f6a33);
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2 + f;
      g.ellipse(fx + Math.cos(a) * 2.4, fy + Math.sin(a) * 2.4, 2.2, 1.6).fill(color);
    }
    g.circle(fx, fy, 1.3).fill(inkOf(color));
  }
}

function mushroom(g: Graphics, x: number, y: number, random: () => number): void {
  const color = random() < 0.5 ? 0xc0392b : 0x8e5bc4;
  const w = 5 + random() * 3;
  inked(g, [x - 1.8, y, x + 1.8, y, x + 2.2, y + 7, x - 2.2, y + 7], 0xe8dcc0, 1.4);
  const cap: Pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI + (i / 10) * Math.PI;
    cap.push(x + Math.cos(a) * w, y + 1 + Math.sin(a) * w * 0.75);
  }
  inked(g, cap, color, 1.8);
  g.circle(x - w * 0.35, y - w * 0.25, 1.2).fill(0xffffff);
  g.circle(x + w * 0.3, y - w * 0.4, 0.9).fill(0xffffff);
}

function twig(g: Graphics, x: number, y: number, random: () => number): void {
  const a = random() * Math.PI;
  const len = 10 + random() * 10;
  const dx = Math.cos(a) * len;
  const dy = Math.sin(a) * len;
  inkLine(g, x - dx, y - dy, x + dx, y + dy, 3, { color: 0x5a3e24, seed: Math.floor(y) }, (random() - 0.5) * 0.2);
  inkLine(g, x, y, x + dx * 0.4 - dy * 0.5, y + dy * 0.4 + dx * 0.5, 2, { color: 0x5a3e24, seed: Math.floor(x) });
}

/** Little curls of light on the water (the river's animated shimmer goes over these). */
function paintRipples(g: Graphics, map: MapData, random: () => number): void {
  for (let i = 0; i < 1800; i++) {
    const x = random() * map.width;
    const y = random() * map.height;
    if (!map.ground.some((p) => p.style === 'river' && shapeContains(p.shape, x, y))) continue;
    const w = 10 + random() * 24;
    inkLine(g, x - w, y, x + w, y + (random() - 0.5) * 6, 2.4, { color: 0xbfe9f4, alpha: 0.14 + random() * 0.14, seed: i, tip: 0 }, 0.15);
  }
}

/** The Warden's pit: a ring of cracked stone sealing the Deep, with runes and green rot seeping up. */
function paintPit(g: Graphics, map: MapData, random: () => number): void {
  const x = map.width / 2;
  const y = map.height / 2;
  flagstones(g, x, y, 150, 470, 3, (ring) => 14 + ring * 6, 0x4a4850, random, () => true);
  g.poly(blob(x, y, 150, 150, 9, 0.05, 40)).fill(0x1c1b21);
  inkLoop(g, blob(x, y, 150, 150, 9, 0.05, 40), 5, { color: 0x0e0d12, seed: 2 }, 3);
  inkLoop(g, blob(x, y, 472, 472, 71, 0.03, 64), 6, { color: 0x15141a, alpha: 0.8, seed: 5 }, 5);
  // Runes round the seal.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rx = x + Math.cos(a) * 370;
    const ry = y + Math.sin(a) * 370;
    const style = { color: 0xb98be0, alpha: 0.45, seed: i };
    inkLine(g, rx - 8, ry - 9, rx + 7, ry + 8, 3, style, 0.1);
    inkLine(g, rx + 8, ry - 8, rx - 1, ry + 1, 2.5, style, -0.1);
  }
  // Cracks where the rot has been eating at it.
  for (const [a, len] of [[0.4, 260], [2.2, 320], [3.9, 220], [5.1, 300]]) {
    const pts: Pts = [x + Math.cos(a) * 140, y + Math.sin(a) * 140];
    for (let i = 1; i <= 6; i++) {
      const ang = a + Math.sin(i * 1.7) * 0.4;
      pts.push(pts[pts.length - 2] + Math.cos(ang) * (len / 6), pts[pts.length - 1] + Math.sin(ang) * (len / 6));
    }
    inkStroke(g, pts, 9, { color: 0x8fd14f, alpha: 0.18, tip: 0.1 });
    inkStroke(g, pts, 4, { color: 0x0e0d12, alpha: 0.8, tip: 0.05, seed: Math.floor(a * 10) });
  }
}

/** A trampled camp nest with a few bones and sticks, so an empty camp still reads as one. */
function paintNest(g: Graphics, x: number, y: number, random: () => number): void {
  for (let i = 0; i < 8; i++) {
    const a = random() * Math.PI * 2;
    const d = 90 + random() * 60;
    const bx = x + Math.cos(a) * d;
    const by = y + 20 + Math.sin(a) * d * 0.8;
    const rot = random() * Math.PI;
    const dx = Math.cos(rot) * 13;
    const dy = Math.sin(rot) * 13;
    if (random() < 0.5) {
      inkLine(g, bx - dx, by - dy, bx + dx, by + dy, 5, { color: 0x6b4a2b, seed: i, tip: 0.4 }, 0.06);
    } else {
      inkLine(g, bx - dx, by - dy, bx + dx, by + dy, 6, { color: 0x4a4436, seed: i, tip: 0.8 }, 0); // the bone's shadow line
      inkLine(g, bx - dx, by - dy, bx + dx, by + dy, 4, { color: 0xe8e0cc, seed: i, tip: 0.8 }, 0);
      for (const s of [-1, 1]) inked(g, blob(bx + dx * s, by + dy * s, 3.8, 3.8, i + s, 0.15, 8), 0xe8e0cc, 1.4);
    }
  }
  for (let i = 0; i < 6; i++) tuft(g, x + (random() - 0.5) * 220, y + 20 + (random() - 0.5) * 170, 8, [0x6f7a45, 0x5d6a3a], random);
}

// ─── Trees ────────────────────────────────────────────────────────────────────

/** Trees everywhere off the ground (never over somewhere you can walk, or over the rocks). */
function placeTrees(map: MapData, t: Terrain, random: () => number): Tree[] {
  const step = 130;
  const trees: Tree[] = [];
  // A little clearing round each lantern so it isn't hidden under the trees.
  const lanterns = propSpots(map).lanterns;
  for (let y = -500; y < map.height + 500; y += step) {
    for (let x = -500; x < map.width + 500; x += step) {
      const px = x + (random() - 0.5) * step * 0.9;
      const py = y + (random() - 0.5) * step * 0.9;
      const d = t.distanceToGround(px, py);
      // Trees come in stands of bigger and smaller ones rather than all of a size.
      const r = (70 + random() * 55 + (d > 4 ? 20 : 0)) * (0.75 + fbm(px / 700, py / 700, 2, 41) * 0.55);
      const c = Math.floor(random() * PAL.canopy.length);
      const seed = Math.floor(random() * 100000);
      const bush = random() < 0.65;
      if (d === 0 || d > 9) continue;
      if (t.styleAt(px, py) || t.blocked(px, py)) continue;
      if (lanterns.some((l) => Math.hypot(l.x - px, l.y - py) < 150)) continue;
      // Gaps along the edge of the woods, so the treeline isn't a wall: some left bare, most with a bush.
      if (d <= 2 && fbm(px / 450, py / 450, 2, 31) < 0.4) {
        if (bush) trees.push({ x: px, y: py, r: 24 + (seed % 18), c, seed, deep: false, shrub: true });
        continue;
      }
      trees.push({ x: px, y: py, r, c, seed, deep: d > 4, shrub: false });
    }
  }
  return trees.sort((a, b) => a.y - b.y);
}

/** Trunks and roots on the ground, crowns from back to front on the tall layer. */
function paintForest(g: Graphics, top: Graphics, trees: Tree[], random: () => number): void {
  for (const tr of trees) if (tr.shrub) paintCrown(g, tr, random);
  for (const tr of trees) {
    if (tr.deep || tr.shrub) continue; // nobody sees a trunk that deep in the woods
    const trunk = blob(tr.x, tr.y, tr.r * 0.2, tr.r * 0.17, tr.seed, 0.18, 12);
    inked(g, trunk, PAL.bark, 3);
    for (let i = 0; i < 3; i++) {
      const a = (tr.seed % 7) + i * 2.1;
      const r0 = tr.r * 0.16;
      inkLine(g, tr.x + Math.cos(a) * r0, tr.y + Math.sin(a) * r0, tr.x + Math.cos(a) * tr.r * 0.34, tr.y + Math.sin(a) * tr.r * 0.3, 5, { color: shade(PAL.bark, 0.2), seed: tr.seed + i }, 0.15);
    }
  }
  for (const tr of trees) if (!tr.shrub) paintCrown(top, tr, random);
}

/**
 * A tree's crown seen from above: a cluster of leafy lobes, inked heavily on the shadow side, each lobe a
 * shade darker toward the lower right, with light catching the upper-left ones.
 */
function paintCrown(g: Graphics, tr: Tree, random: () => number): void {
  const base = PAL.canopy[tr.c];
  const ink = inkOf(base);
  const n = tr.deep ? 4 : tr.shrub ? 3 + Math.floor(random() * 2) : 5 + Math.floor(random() * 3);
  const lobes = [{ x: tr.x, y: tr.y, r: tr.r * 0.62 }];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + random() * 0.6;
    const d = tr.r * (0.36 + random() * 0.14);
    lobes.push({ x: tr.x + Math.cos(a) * d, y: tr.y + Math.sin(a) * d * 0.92, r: tr.r * (0.36 + random() * 0.16) });
  }
  const shapes = lobes.map((l, i) => blob(l.x, l.y, l.r, l.r, tr.seed + i, 0.2, tr.deep ? 10 : 16));
  for (const s of shapes) g.poly(offset(inflate(s, 2.5), 3, 4));
  g.fill(ink);
  const order = lobes.map((_, i) => i).sort((a, b) => lobes[a].y - lobes[b].y);
  for (const i of order) {
    const l = lobes[i];
    const facing = ((l.x - tr.x) * 0.6 + (l.y - tr.y) * 0.8) / tr.r;
    g.poly(shapes[i]).fill(shade(base, 0.06 + facing * 0.3));
    if (tr.deep) continue;
    if (l.y > tr.y - tr.r * 0.1) {
      // A seam under the front lobes where they sit on the ones behind.
      const s = shapes[i];
      const m = s.length / 2;
      inkStroke(g, s.slice(Math.floor(m * 0.06) * 2, Math.ceil(m * 0.46) * 2), 2.4, { color: ink, alpha: 0.7, tip: 0.05, seed: tr.seed + i });
    }
    if (facing < 0.12) g.poly(blob(l.x - l.r * 0.28, l.y - l.r * 0.32, l.r * 0.42, l.r * 0.34, tr.seed + i * 3, 0.25, 10)).fill({ color: shade(base, -0.24), alpha: 0.6 });
  }
  if (tr.deep) return;
  // Leafy ticks: little curved marks in the shade.
  for (let k = 0; k < (tr.shrub ? 1 : 4); k++) {
    const a = random() * Math.PI * 2;
    const d = random() * tr.r * 0.65;
    const x = tr.x + Math.cos(a) * d;
    const y = tr.y + Math.sin(a) * d;
    inkLine(g, x - 6, y - 2, x + 6, y + 1, 2, { color: ink, alpha: 0.55, seed: k, tip: 0.05 }, 0.35);
  }
}

// ─── Rocks ────────────────────────────────────────────────────────────────────

/** A wall's footprint as a craggy outline. */
function rockOutline(s: Shape, seed: number): Pts {
  // Grown past the blocked shape and only gently roughened, so the rock covers everything you can't walk
  // on (the nav grid keeps CLEARANCE off it) and no grass shows where a wall really is.
  const rough = roughen(shapeOutline(s, 14, 26, 0.3), 26, 1 / 150, seed);
  // A second, finer wobble for chipped edges.
  return roughen(rough, 7, 1 / 16, seed + 1);
}

/**
 * Walls inside the map: the cliff face on the ground (with strata running down it), and on the raised
 * layer a lit top of stacked slabs and boulders, hatched in the shade, stippled, cracked, with moss.
 */
function paintRock(g: Graphics, top: Graphics, outline: Pts, random: () => number): void {
  g.poly(outline).fill(PAL.cliff);
  const n = outline.length / 2;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    cx += outline[i * 2];
    cy += outline[i * 2 + 1];
  }
  cx /= n;
  cy /= n;
  // Strata: strokes from the foot of the cliff up into it, seen where the top leans away.
  for (let i = 0; i < n; i += 2) {
    const x = outline[i * 2];
    const y = outline[i * 2 + 1];
    const d = Math.hypot(cx - x, cy - y) || 1;
    const len = 26 + random() * 40;
    inkLine(g, x, y, x + ((cx - x) / d) * len, y + ((cy - y) / d) * len, 2.5, { color: inkOf(PAL.cliff), alpha: 0.8, seed: i }, (random() - 0.5) * 0.2);
  }
  inkLoop(g, outline, 5, { color: 0x0b0c0a, seed: n }, 4);

  const upper = inflate(outline, -5);
  inked(top, upper, PAL.rockDark, 5, 0x101210);
  top.poly(smooth(inflate(outline, -18), true, 1)).fill(PAL.rock);
  const box = polyBounds(outline);
  const core = inflate(outline, -40);
  const inner = inflate(outline, -46);
  const shaded = (x: number, y: number) => (x - cx) * 0.6 + (y - cy) * 0.8 > 0;

  // Big slabs, then boulders on them: lit faces up and to the left, inked heavier on the shadow side.
  const slabs = Math.max(2, Math.round((box.w * box.h) / 60000));
  for (let i = 0; i < slabs * 3; i++) {
    const x = box.x + random() * box.w;
    const y = box.y + random() * box.h;
    if (!insidePoly(core, x, y)) continue;
    const r = 60 + random() * 70;
    const slab = roughen(shard(x, y, r, random, 7 + Math.floor(random() * 3), 0.7), 8, 1 / 30, i);
    const tone = vary(PAL.rockTop, 0.06, random);
    top.poly(smooth(slab, true, 1)).fill({ color: tone, alpha: 0.35 });
    const m = slab.length / 2;
    inkStroke(top, slab.slice(0, Math.ceil(m * 0.55) * 2), 2.6, { color: 0x14160f, alpha: 0.6, seed: i, tip: 0.05 });
  }
  const count = Math.max(4, Math.round((box.w * box.h) / 11000));
  for (let i = 0; i < count; i++) {
    const x = box.x + random() * box.w;
    const y = box.y + random() * box.h;
    if (!insidePoly(core, x, y)) continue;
    const r = 18 + random() * 30;
    const tone = vary([PAL.rock, PAL.rockTop, 0x5a5e51][Math.floor(random() * 3)], 0.08, random);
    const stone = smooth(shard(x, y, r, random, 5 + Math.floor(random() * 3), 0.8), true, 1);
    inked(top, stone, tone, 3);
    top.poly(offset(inflate(stone, -r * 0.3), -r * 0.12, -r * 0.16)).fill({ color: shade(tone, -0.18), alpha: 0.7 });
  }
  // Stipple for grit: dark in the shade, pale where the light hits.
  for (let i = 0; i < (box.w * box.h) / 700; i++) {
    const x = box.x + random() * box.w;
    const y = box.y + random() * box.h;
    if (!insidePoly(upper, x, y)) continue;
    const dark = shaded(x, y) ? random() < 0.8 : random() < 0.3;
    top.circle(x, y, 1 + random() * 1.4).fill({ color: dark ? 0x14160f : 0xb8bba8, alpha: dark ? 0.45 : 0.3 });
  }
  // Hatching on the shaded lower-right rim.
  hatch(
    top,
    box,
    (x, y) => insidePoly(upper, x, y) && !insidePoly(inner, x, y) && shaded(x, y),
    { angle: -1.05, spacing: 6, length: 24, width: 2.2, color: 0x101210, alpha: 0.55, density: 7 },
    random,
  );
  // Cracks and moss.
  for (let i = 0; i < Math.max(3, count / 2); i++) {
    const x = box.x + random() * box.w;
    const y = box.y + random() * box.h;
    if (!insidePoly(inner, x, y)) continue;
    if (random() < 0.45) {
      const moss = blob(x, y, 18 + random() * 22, 11 + random() * 12, i * 13 + 5, 0.3, 14);
      inked(top, moss, PAL.moss, 2);
      for (let k = 0; k < 6; k++) top.circle(x + (random() - 0.5) * 24, y + (random() - 0.5) * 12, 1.6).fill(shade(PAL.moss, 0.4));
      top.poly(blob(x - 5, y - 4, 9, 5, i, 0.3, 8)).fill({ color: shade(PAL.moss, -0.3), alpha: 0.7 });
    } else {
      crack(top, x, y, random, 0x101210);
    }
  }
}

// ─── Brush ────────────────────────────────────────────────────────────────────

/**
 * Tall grass: thick clumps of long blades from the back row to the front, about chest-high on a champion,
 * with seed heads on the tallest, so it reads as somewhere to hide. The back row is kept shorter, so the
 * grass doesn't stick up much past the edge of where it actually hides you.
 */
function paintBrush(g: Graphics, s: Shape, random: () => number): void {
  const outline = roughen(shapeOutline(s, 14, 2), 10, 1 / 50, 80);
  const b = polyBounds(outline);
  const spacing = 24;
  for (let y = b.y + 8; y <= b.y + b.h + 4; y += spacing * 0.55) {
    for (let x = b.x; x <= b.x + b.w; x += spacing) {
      const px = x + (random() - 0.5) * spacing * 0.8;
      const py = y + (random() - 0.5) * 8;
      if (!insidePoly(outline, px, py)) continue;
      const n = 5 + Math.floor(random() * 3);
      const tallest = Math.min(36 + random() * 28, py - b.y + 26);
      for (let i = 0; i < n; i++) {
        const k = i / (n - 1) - 0.5;
        const h = tallest * (0.7 + random() * 0.3) * (1 - Math.abs(k) * 0.35);
        const color = shade(PAL.brushBlade[Math.floor(random() * 3)], 0.3 - (i / n) * 0.35);
        const lean = k * h * 0.75 + (random() - 0.5) * 8;
        blade(g, px + k * 14, py, h, lean, 6 + random() * 2.5, color);
        // Seed heads on some of the tall ones.
        if (h > 44 && random() < 0.14) g.ellipse(px + k * 14 + lean, py - h + 2, 2.4, 5).fill(shade(0xb8b060, (random() - 0.5) * 0.2));
      }
    }
  }
}
