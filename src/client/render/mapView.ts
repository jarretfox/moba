import { Container, Graphics, Text } from 'pixi.js';
import { TEAM, type Team } from '../../shared/constants';
import type { GroundStyle, MapData } from '../../shared/map/mapData';
import type { NavGrid } from '../../shared/map/navGrid';
import { shapeContains, type Shape } from '../../shared/map/shapes';

// The map, painted once at load. Everything decorative is placed by a seeded random generator, so the
// map looks the same for everyone and every match. Gameplay shapes (ground, walls, brush) come straight
// from MapData; the trees, tufts, pebbles and cracks are just paint.

const PAL = {
  void: 0x0d130c,
  canopy: [0x1b3618, 0x214220, 0x284d24, 0x18311a],
  canopyLight: 0x3f6d33,
  jungle: 0x2f4a29,
  jungleLight: 0x3b5c32,
  jungleDark: 0x24401f,
  tuft: [0x4c7a3d, 0x5f8f48, 0x3f6a33],
  lane: 0x7a6548,
  laneEdge: 0x4f4130,
  laneLight: 0x8b7553,
  laneDark: 0x66543b,
  pebble: [0x9a9284, 0x7d766a, 0xb1a998],
  allyBase: 0x37425a,
  enemyBase: 0x5a3a3b,
  river: 0x22546b,
  riverDeep: 0x1a4559,
  riverShore: 0x7cc1d4,
  rock: 0x4a4e44,
  rockTop: 0x5f6457,
  rockDark: 0x2a2d27,
  moss: 0x3f6b33,
  brush: 0x1f4a1b,
  brushBlade: [0x3f8a35, 0x2f6e28, 0x56a347],
} as const;

/** Draw order: later styles paint over earlier ones where they overlap. */
const STYLE_ORDER: GroundStyle[] = ['jungle', 'base', 'lane', 'river'];

/** Tiny seeded generator so decoration lands in the same place every time. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The map in three layers. `ground` lies flat; `wallTops` and `canopy` are the tops of tall things
 * (cliffs, trees). The game draws those slightly spread away from the middle of the screen, so trunks and
 * cliff faces peek out from under them and the map reads as having height.
 */
export interface MapLayers {
  ground: Container;
  wallTops: Container;
  canopy: Container;
}

/** How far each kind of tall thing leans out from the middle of the screen (share of its distance). */
export const HEIGHT = { wall: 0.04, structure: 0.045, tree: 0.065 } as const;

/** Places a tall layer: everything in it is pushed out from the camera's center by `k` of its distance. */
export function elevate(layer: Container, k: number, cameraX: number, cameraY: number): void {
  layer.scale.set(1 + k);
  layer.position.set(-k * cameraX, -k * cameraY);
}

/** The static map. Bases are tinted from the viewer's side: yours blue, theirs red, like every unit color. */
export function buildMap(map: MapData, myTeam: Team = TEAM.blue): MapLayers {
  const root = new Container();
  const wallTops = new Graphics();
  const canopy = new Graphics();
  const random = rng(1337);
  const terrain = new Terrain(map);

  const ground = new Graphics();
  ground.rect(-2000, -2000, map.width + 4000, map.height + 4000).fill(PAL.void);
  root.addChild(ground);

  // Soft edges first (each piece a little bigger and darker underneath), then the pieces themselves.
  for (const style of STYLE_ORDER) {
    for (const piece of map.ground) if (piece.style === style) fillShape(ground, piece.shape, edgeColor(style), 0.55, 26);
    for (const piece of map.ground) if (piece.style === style) fillShape(ground, piece.shape, groundColor(style, piece.shape, map, myTeam));
    if (style === 'base') paintBases(ground, map, myTeam); // under the lanes that lead out of it
  }

  const detail = new Graphics();
  paintGroundDetail(detail, map, terrain, random);
  paintRiver(detail, map, random);
  paintPit(detail, map);
  for (const c of map.camps) paintNest(detail, c.pos.x, c.pos.y, random);
  root.addChild(detail);

  const forest = new Graphics();
  paintForest(forest, canopy, map, terrain, random);
  root.addChild(forest);

  const walls = new Graphics();
  for (const b of map.blockers) paintRock(walls, wallTops, b, random);
  root.addChild(walls);

  // Warm light pooled on the Warden's seal and the base plazas.
  const lights = new Graphics();
  lights.blendMode = 'add';
  glow(lights, map.width / 2, map.height / 2, 420, 0x8fd14f, 0.05);
  for (const piece of map.ground) {
    if (piece.style !== 'base' || piece.shape.type !== 'circle') continue;
    glow(lights, piece.shape.x, piece.shape.y, piece.shape.r * 0.9, groundColor('base', piece.shape, map, myTeam) === PAL.allyBase ? 0x3d8bfd : 0xe5484d, 0.045);
  }
  root.addChild(lights);

  const brush = new Graphics();
  for (const b of map.brush) paintBrush(brush, b, random);
  root.addChild(brush);

  for (const [text, y] of [['TOP LANE', 1100], ['BOT LANE', map.height - 1100]] as const) {
    const t = new Text({ text, style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 60, fill: 0xffffff, letterSpacing: 6 } });
    t.alpha = 0.06;
    t.anchor.set(0.5);
    t.position.set(map.width / 2, y);
    root.addChild(t);
  }
  return { ground: root, wallTops, canopy };
}

/** A soft round light: stacked circles fading outward (drawn on an additive layer). */
export function glow(g: Graphics, x: number, y: number, r: number, color: number, alpha: number): void {
  for (let i = 1; i <= 5; i++) g.circle(x, y, (r * i) / 5).fill({ color, alpha });
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
  private readonly cols: number;
  private readonly rows: number;
  static readonly CELL = 100;

  constructor(private readonly map: MapData) {
    const C = Terrain.CELL;
    this.cols = Math.ceil((map.width + 1600) / C);
    this.rows = Math.ceil((map.height + 1600) / C);
    this.far = new Uint16Array(this.cols * this.rows).fill(65535);
    const queue: number[] = [];
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = cx * C - 800 + C / 2;
        const y = cy * C - 800 + C / 2;
        if (this.styleAt(x, y) && !this.blocked(x, y)) {
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

  /** Cells from the nearest walkable ground. */
  distanceToGround(x: number, y: number): number {
    const cx = Math.floor((x + 800) / Terrain.CELL);
    const cy = Math.floor((y + 800) / Terrain.CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return 99;
    return this.far[cy * this.cols + cx];
  }
}

// ─── Painting ─────────────────────────────────────────────────────────────────

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

function fillShape(g: Graphics, s: Shape, color: number, alpha = 1, grow = 0): void {
  const fill = { color, alpha };
  switch (s.type) {
    case 'circle':
      g.circle(s.x, s.y, s.r + grow).fill(fill);
      return;
    case 'rect':
      g.roundRect(s.x - grow, s.y - grow, s.w + 2 * grow, s.h + 2 * grow, grow).fill(fill);
      return;
    case 'capsule': {
      const r = s.r + grow;
      const len = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1;
      const nx = (-(s.by - s.ay) / len) * r;
      const ny = ((s.bx - s.ax) / len) * r;
      g.circle(s.ax, s.ay, r).fill(fill);
      g.circle(s.bx, s.by, r).fill(fill);
      g.poly([s.ax + nx, s.ay + ny, s.bx + nx, s.by + ny, s.bx - nx, s.by - ny, s.ax - nx, s.ay - ny]).fill(fill);
      return;
    }
  }
}

/** Mottled patches and scattered bits on the open ground, by style. */
function paintGroundDetail(g: Graphics, map: MapData, t: Terrain, random: () => number): void {
  // Patches of lighter and darker ground break up the flat colors.
  for (let i = 0; i < 1400; i++) {
    const x = random() * map.width;
    const y = random() * map.height;
    const style = t.styleAt(x, y);
    if (!style || style === 'river' || style === 'base' || t.blocked(x, y)) continue;
    const light = random() < 0.5;
    const color = style === 'lane' ? (light ? PAL.laneLight : PAL.laneDark) : light ? PAL.jungleLight : PAL.jungleDark;
    g.ellipse(x, y, 60 + random() * 110, 40 + random() * 80).fill({ color, alpha: 0.35 });
  }
  // Grass tufts, flowers and mushrooms in the jungle; pebbles and cracks in the lanes.
  for (let i = 0; i < 9000; i++) {
    const x = random() * map.width;
    const y = random() * map.height;
    const style = t.styleAt(x, y);
    if (!style || t.blocked(x, y) || t.inBrush(x, y)) continue;
    const roll = random();
    if (style === 'jungle') {
      if (roll < 0.7) tuft(g, x, y, PAL.tuft[Math.floor(random() * 3)], 6 + random() * 5);
      else if (roll < 0.82) for (let f = 0; f < 3; f++) g.circle(x + random() * 16 - 8, y + random() * 16 - 8, 2.5).fill([0xe8d36a, 0xd98ad9, 0xf2f2f2][f]);
      else if (roll < 0.9) mushroom(g, x, y, random);
      else pebble(g, x, y, random);
    } else if (style === 'lane') {
      if (roll < 0.6) pebble(g, x, y, random);
      else if (roll < 0.75) crack(g, x, y, random);
      else if (roll < 0.85) tuft(g, x, y, 0x6f7a45, 5);
    }
  }
}

function tuft(g: Graphics, x: number, y: number, color: number, h: number): void {
  g.moveTo(x - h * 0.8, y + h * 0.5).lineTo(x - h * 0.2, y - h).moveTo(x, y + h * 0.5).lineTo(x + h * 0.1, y - h * 1.2).moveTo(x + h * 0.8, y + h * 0.5).lineTo(x + h * 0.3, y - h * 0.9).stroke({ width: 2, color });
}

function pebble(g: Graphics, x: number, y: number, random: () => number): void {
  const r = 3 + random() * 5;
  g.ellipse(x + 1.5, y + 2, r, r * 0.7).fill({ color: 0x000000, alpha: 0.25 });
  g.ellipse(x, y, r, r * 0.7).fill(PAL.pebble[Math.floor(random() * 3)]);
}

function crack(g: Graphics, x: number, y: number, random: () => number): void {
  let px = x;
  let py = y;
  g.moveTo(px, py);
  for (let i = 0; i < 3; i++) {
    px += random() * 30 - 15;
    py += random() * 30 - 15;
    g.lineTo(px, py);
  }
  g.stroke({ width: 1.5, color: 0x3f3324, alpha: 0.6 });
}

function mushroom(g: Graphics, x: number, y: number, random: () => number): void {
  const color = random() < 0.5 ? 0xc0392b : 0x8e5bc4;
  g.rect(x - 1.5, y, 3, 6).fill(0xe8dcc0);
  g.ellipse(x, y, 6, 4).fill(color);
  g.circle(x - 2, y - 1, 1.2).fill(0xffffff);
}

/** Flagstones around each Da Base, in the base's team tint. */
function paintBases(g: Graphics, map: MapData, myTeam: Team): void {
  for (const piece of map.ground) {
    if (piece.style !== 'base' || piece.shape.type !== 'circle') continue;
    const s = piece.shape;
    const tint = groundColor('base', s, map, myTeam);
    for (let ring = 1; ring <= 6; ring++) {
      const r = (s.r / 6.5) * ring;
      g.circle(s.x, s.y, r).stroke({ width: 3, color: 0x000000, alpha: 0.18 });
      const n = ring * 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.37;
        const r0 = (s.r / 6.5) * (ring - 1);
        g.moveTo(s.x + Math.cos(a) * r0, s.y + Math.sin(a) * r0).lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r).stroke({ width: 2, color: 0x000000, alpha: 0.14 });
      }
    }
    g.circle(s.x, s.y, s.r * 0.9).stroke({ width: 10, color: tint, alpha: 0.7 });
    g.circle(s.x, s.y, s.r).stroke({ width: 6, color: 0x000000, alpha: 0.3 });
  }
}

/** Water: a deeper channel down the middle and ripples on top. */
function paintRiver(g: Graphics, map: MapData, random: () => number): void {
  for (const piece of map.ground) if (piece.style === 'river') fillShape(g, piece.shape, PAL.riverDeep, 0.55, -90);
  for (let i = 0; i < 2200; i++) {
    const x = random() * map.width;
    const y = random() * map.height;
    if (!map.ground.some((p) => p.style === 'river' && shapeContains(p.shape, x, y))) continue;
    const w = 10 + random() * 26;
    g.moveTo(x - w, y).quadraticCurveTo(x, y - 5, x + w, y).stroke({ width: 2, color: 0xaee3f0, alpha: 0.18 + random() * 0.15 });
  }
}

/** The Warden's pit: a cracked stone seal over the Deep, glowing faintly. */
function paintPit(g: Graphics, map: MapData): void {
  const x = map.width / 2;
  const y = map.height / 2;
  g.circle(x, y, 470).fill({ color: 0x2a2a2e, alpha: 0.85 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.moveTo(x + Math.cos(a) * 160, y + Math.sin(a) * 160).lineTo(x + Math.cos(a) * 470, y + Math.sin(a) * 470).stroke({ width: 3, color: 0x000000, alpha: 0.35 });
  }
  for (const r of [160, 300, 440]) g.circle(x, y, r).stroke({ width: 4, color: 0x000000, alpha: 0.35 });
  g.circle(x, y, 380).stroke({ width: 6, color: 0x8fd14f, alpha: 0.12 });
  // Runes around the seal.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rx = x + Math.cos(a) * 370;
    const ry = y + Math.sin(a) * 370;
    g.moveTo(rx - 8, ry - 8).lineTo(rx + 8, ry + 8).moveTo(rx + 8, ry - 8).lineTo(rx, ry).stroke({ width: 3, color: 0xb98be0, alpha: 0.35 });
  }
  // Cracks where the rot has been eating at it.
  for (const [a, len] of [[0.4, 260], [2.2, 320], [3.9, 220], [5.1, 300]]) {
    let px = x + Math.cos(a) * 60;
    let py = y + Math.sin(a) * 60;
    g.moveTo(px, py);
    for (let i = 1; i <= 6; i++) {
      const ang = a + Math.sin(i * 1.7) * 0.4;
      px += Math.cos(ang) * (len / 6);
      py += Math.sin(ang) * (len / 6);
      g.lineTo(px, py);
    }
    g.stroke({ width: 4, color: 0x8fd14f, alpha: 0.28 });
  }
}

/** A trampled camp nest with a few bones and sticks, so an empty camp still reads as one. */
function paintNest(g: Graphics, x: number, y: number, random: () => number): void {
  g.ellipse(x, y + 20, 170, 140).fill({ color: 0x000000, alpha: 0.2 });
  g.ellipse(x, y + 20, 130, 105).fill({ color: 0x4b3a26, alpha: 0.35 });
  for (let i = 0; i < 7; i++) {
    const a = random() * Math.PI * 2;
    const d = 90 + random() * 60;
    const bx = x + Math.cos(a) * d;
    const by = y + 20 + Math.sin(a) * d * 0.8;
    const rot = random() * Math.PI;
    const dx = Math.cos(rot) * 12;
    const dy = Math.sin(rot) * 12;
    const bone = random() < 0.5;
    g.moveTo(bx - dx, by - dy).lineTo(bx + dx, by + dy).stroke({ width: bone ? 4 : 3, color: bone ? 0xe8e0cc : 0x6b4a2b });
    if (bone) {
      g.circle(bx - dx, by - dy, 3).fill(0xe8e0cc);
      g.circle(bx + dx, by + dy, 3).fill(0xe8e0cc);
    }
  }
}

/** Trees everywhere off the ground: shadows and trunks on the ground, crowns on the tall layer above. */
function paintForest(g: Graphics, top: Graphics, map: MapData, t: Terrain, random: () => number): void {
  const step = 130;
  const trees: { x: number; y: number; r: number; c: number }[] = [];
  for (let y = -500; y < map.height + 500; y += step) {
    for (let x = -500; x < map.width + 500; x += step) {
      const px = x + (random() - 0.5) * step * 0.9;
      const py = y + (random() - 0.5) * step * 0.9;
      const d = t.distanceToGround(px, py);
      if (d === 0 || d > 9) continue;
      if (t.styleAt(px, py) || t.blocked(px, py)) continue; // never over somewhere you can walk, or over the rocks
      trees.push({ x: px, y: py, r: 70 + random() * 55 + (d > 4 ? 20 : 0), c: Math.floor(random() * PAL.canopy.length) });
    }
  }
  // Shadows and trunks on the ground, then crowns from back to front on the tall layer.
  for (const tr of trees) g.circle(tr.x + 18, tr.y + 24, tr.r).fill({ color: 0x000000, alpha: 0.32 });
  for (const tr of trees) g.circle(tr.x, tr.y, tr.r * 0.22).fill(0x3d2a18).stroke({ width: 2, color: 0x1d140b });
  trees.sort((a, b) => a.y - b.y);
  for (const tr of trees) {
    top.circle(tr.x, tr.y, tr.r).fill(PAL.canopy[tr.c]).stroke({ width: 2, color: 0x0c180b, alpha: 0.5 });
    top.circle(tr.x - tr.r * 0.3, tr.y - tr.r * 0.3, tr.r * 0.55).fill({ color: PAL.canopyLight, alpha: 0.35 });
    top.circle(tr.x + tr.r * 0.35, tr.y + tr.r * 0.2, tr.r * 0.35).fill({ color: 0x000000, alpha: 0.12 });
  }
}

/** Walls inside the map: a dark cliff base and cast shadow on the ground, a lit top with cracks and moss up high. */
function paintRock(g: Graphics, top: Graphics, s: Shape, random: () => number): void {
  const outline = rockOutline(s, random, 0);
  const upper = rockOutline(s, random, -6);
  g.poly(outline.map((v, i) => v + (i % 2 ? 26 : 18))).fill({ color: 0x000000, alpha: 0.38 }); // shadow
  g.poly(outline).fill(0x23261f).stroke({ width: 3, color: 0x111310 }); // the cliff face, seen from the side
  top.poly(upper).fill(PAL.rockDark).stroke({ width: 3, color: 0x161814 });
  top.poly(rockOutline(s, random, -18)).fill(PAL.rock);
  top.poly(rockOutline(s, random, -40)).fill({ color: PAL.rockTop, alpha: 0.7 });
  const box = bounds(s);
  for (let i = 0; i < Math.max(3, (box.w * box.h) / 40000); i++) {
    const x = box.x + random() * box.w;
    const y = box.y + random() * box.h;
    if (!shapeContains(s, x, y)) continue;
    if (random() < 0.5) top.ellipse(x, y, 18 + random() * 22, 10 + random() * 12).fill({ color: PAL.moss, alpha: 0.6 });
    else crack(top, x, y, random);
  }
}

function bounds(s: Shape): { x: number; y: number; w: number; h: number } {
  if (s.type === 'rect') return { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.type === 'circle') return { x: s.x - s.r, y: s.y - s.r, w: 2 * s.r, h: 2 * s.r };
  const x = Math.min(s.ax, s.bx) - s.r;
  const y = Math.min(s.ay, s.by) - s.r;
  return { x, y, w: Math.abs(s.bx - s.ax) + 2 * s.r, h: Math.abs(s.by - s.ay) + 2 * s.r };
}

/** A shape's outline as a jagged polygon, pushed out (or, with a negative inset, in). */
function rockOutline(s: Shape, random: () => number, inset: number): number[] {
  const pts: number[] = [];
  const jag = () => (random() - 0.5) * 14;
  if (s.type === 'circle') {
    const n = Math.max(10, Math.round(s.r / 14));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = s.r + inset + jag();
      pts.push(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r);
    }
    return pts;
  }
  const b = bounds(s);
  const x0 = b.x - inset;
  const y0 = b.y - inset;
  const x1 = b.x + b.w + inset;
  const y1 = b.y + b.h + inset;
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 40));
    for (let i = 0; i < n; i++) pts.push(ax + ((bx - ax) * i) / n + jag(), ay + ((by - ay) * i) / n + jag());
  };
  edge(x0, y0, x1, y0);
  edge(x1, y0, x1, y1);
  edge(x1, y1, x0, y1);
  edge(x0, y1, x0, y0);
  return pts;
}

/** Tall grass: a dark bed packed with blades in a few greens, so it reads as somewhere to hide. */
function paintBrush(g: Graphics, s: Shape, random: () => number): void {
  fillShape(g, s, 0x0f2a0d, 0.6, 10);
  fillShape(g, s, PAL.brush);
  const b = bounds(s);
  const count = Math.round((b.w * b.h) / 220);
  for (let i = 0; i < count; i++) {
    const x = b.x + random() * b.w;
    const y = b.y + random() * b.h;
    if (!shapeContains(s, x, y)) continue;
    const h = 12 + random() * 12;
    const lean = (random() - 0.5) * 10;
    g.moveTo(x, y + 6).quadraticCurveTo(x + lean * 0.5, y - h * 0.5, x + lean, y - h).stroke({ width: 3, color: PAL.brushBlade[Math.floor(random() * 3)] });
  }
}
