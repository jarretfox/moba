import type { Graphics } from 'pixi.js';
import { blob, inkLine, inkLoop, inkOf, inkStroke, inked, mix, rng, shade, shard, smooth, type Pts } from './organic';

// The buildings, standing up like everyone else: seen from the front and a little above, so you see the
// face of a wall and the top of it. Origins are the middle of the footprint on the ground; up is −y; sizes
// in the structure's radius. Hand-inked like the rest: irregular stone courses, ivy, moss, wood grain.

const STONE = 0x6a707a;
const STONE_LIGHT = 0x878d96;
const STONE_DARK = 0x464b54;
const WOOD = 0x6b4a2b;
const IVY = 0x3f6b33;
const INK_STONE = 0x1c1e24;

/** How tall each kind of building stands, and where its crystal floats, in its radius. */
export const BUILDING = {
  shootie: { height: 3.3, crystal: 2.95, body: 2.2 },
  oakner: { height: 2.6 },
  daBase: { height: 1.5, crystal: 1.05 },
} as const;

/** How tall a building stands, in its radius. */
export function buildingHeight(role: string): number {
  return role === 'oakner' ? BUILDING.oakner.height : role === 'daBase' ? BUILDING.daBase.height : BUILDING.shootie.height;
}

/** Points round part of an ellipse, from angle a0 to a1. */
function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 16): Pts {
  const pts: Pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return pts;
}

/** Ivy climbing a wall from (x, y): a wandering vine with leaves along it. */
function ivy(g: Graphics, x: number, y: number, len: number, lean: number, random: () => number): void {
  const pts: Pts = [x, y];
  let a = -Math.PI / 2 + lean;
  for (let i = 0; i < 6; i++) {
    a += (random() - 0.5) * 0.7;
    pts.push(pts[pts.length - 2] + Math.cos(a) * (len / 6), pts[pts.length - 1] + Math.sin(a) * (len / 6));
  }
  inkStroke(g, pts, 3, { color: 0x2a4a22, tip: 0.3 });
  for (let i = 2; i < pts.length; i += 2) {
    const side = (i / 2) % 2 ? 1 : -1;
    inked(g, blob(pts[i] + side * 5, pts[i + 1], 5, 4, i + Math.floor(x), 0.25, 8), i % 4 ? IVY : shade(IVY, -0.2), 1.5);
  }
}

/** A team crystal, floating: drawn round (0, 0), `s` tall from tip to tip. */
export function drawCrystal(g: Graphics, s: number, team: number): void {
  g.circle(0, 0, s * 1.15).fill({ color: team, alpha: 0.12 });
  g.circle(0, 0, s * 0.75).fill({ color: team, alpha: 0.16 });
  const w = s * 0.42;
  const h = s * 0.5;
  const body: Pts = [0, -h, w, -h * 0.2, w * 0.75, h * 0.45, 0, h, -w * 0.75, h * 0.45, -w, -h * 0.2];
  inked(g, body, team, 2.5, inkOf(team));
  g.poly([0, -h, 0, h, -w * 0.75, h * 0.45, -w, -h * 0.2]).fill({ color: 0xffffff, alpha: 0.22 }); // the lit facet
  g.poly([0, -h, w, -h * 0.2, w * 0.75, h * 0.45, 0, h]).fill({ color: 0x000000, alpha: 0.18 });
  g.moveTo(0, -h).lineTo(0, h).stroke({ width: 1.5, color: shade(team, -0.4), alpha: 0.8 });
  g.poly([-w * 0.55, -h * 0.25, -w * 0.15, -h * 0.75, -w * 0.3, -h * 0.1]).fill({ color: 0xffffff, alpha: 0.7 });
}

/** A Shootie: a round stone watchtower, battlements on top, a crystal hovering over the deck. */
export function drawTower(g: Graphics, r: number, team: number): void {
  const random = rng(77);
  const H = BUILDING.shootie.body * r;
  const rxB = 0.8 * r;
  const ryB = 0.3 * r;
  const rxT = 0.68 * r;
  const ryT = 0.26 * r;
  // The wall: the front of the cylinder, from the top rim down to the base.
  const wall: Pts = [...arcPts(0, -H, rxT, ryT, Math.PI, 0), ...arcPts(0, 0, rxB, ryB, 0, Math.PI)];
  inked(g, wall, STONE, 4, INK_STONE);
  // Round, so darker toward the right and lit down the left.
  const band = (x0: number, x1: number, color: number, alpha: number) => {
    const a = (x: number, rx: number) => Math.acos(Math.max(-1, Math.min(1, x / rx)));
    g.poly([...arcPts(0, -H, rxT, ryT, a(x0 * rxT, rxT), a(x1 * rxT, rxT), 6), ...arcPts(0, 0, rxB, ryB, a(x1 * rxB, rxB), a(x0 * rxB, rxB), 6)]).fill({ color, alpha });
  };
  band(0.35, 1, 0x000000, 0.22);
  band(0.75, 1, 0x000000, 0.15);
  band(-0.75, -0.45, 0xffffff, 0.1);
  // Stone courses with staggered joints, a little uneven.
  const courses = 8;
  for (let k = 1; k < courses; k++) {
    const t = k / courses;
    const y = -H * t;
    const rx = rxB + (rxT - rxB) * t;
    const ry = ryB + (ryT - ryB) * t;
    const line = arcPts(0, y, rx, ry, Math.PI * 0.97, Math.PI * 0.03, 14).map((v, i) => v + (i % 2 ? (random() - 0.5) * 2.5 : 0));
    inkStroke(g, line, 2, { color: INK_STONE, alpha: 0.45, tip: 0.6, seed: k });
    const prevY = -H * ((k - 1) / courses);
    for (let j = 0; j < 5; j++) {
      const a = Math.PI * ((j + 0.5 + (k % 2) * 0.5) / 5.5);
      const x = Math.cos(a) * rx;
      if (Math.abs(x) > rx * 0.9) continue;
      const yy = y + Math.sin(a) * ry;
      inkLine(g, x, yy, x, prevY + Math.sin(a) * ry, 1.6, { color: INK_STONE, alpha: 0.4 }, 0);
    }
  }
  // A few stones picked out lighter and darker.
  for (let i = 0; i < 10; i++) {
    const k = 1 + Math.floor(random() * (courses - 1));
    const a = Math.PI * (0.2 + random() * 0.6);
    const t = (k - 0.5) / courses;
    const rx = rxB + (rxT - rxB) * t;
    const ry = ryB + (ryT - ryB) * t;
    g.poly(smooth(shard(Math.cos(a) * rx, -H * t + Math.sin(a) * ry, 0.1 * r, random, 5, 0.55), true, 1)).fill({ color: random() < 0.5 ? STONE_LIGHT : STONE_DARK, alpha: 0.5 });
  }
  // An arrow slit, and the door at the foot.
  inked(g, smooth([0.08 * r, -1.55 * r, 0.16 * r, -1.55 * r, 0.16 * r, -1.15 * r, 0.08 * r, -1.15 * r], true, 1), 0x15161a, 2, STONE_DARK);
  const door = [...arcPts(0, -0.42 * r, 0.17 * r, 0.17 * r, Math.PI, Math.PI * 2, 8), 0.17 * r, ryB - 0.02 * r, -0.17 * r, ryB - 0.02 * r];
  inked(g, door, WOOD, 2.5, 0x2a1a0c);
  for (const x of [-0.06, 0.06]) g.moveTo(x * r, -0.5 * r).lineTo(x * r, ryB - 0.04 * r).stroke({ width: 1.5, color: 0x3a2814 });
  for (const [x, y] of [[-0.11, -0.3], [0.11, -0.3], [-0.11, 0.05], [0.11, 0.05]]) g.circle(x * r, y * r, 0.02 * r).fill(0x9aa1ab);
  // Ivy up the left side, moss at the foot.
  ivy(g, -0.62 * r, 0.12 * r, 1.1 * r, 0.2, random);
  ivy(g, -0.4 * r, 0.25 * r, 0.6 * r, -0.1, random);
  for (const [x, s] of [[-0.5, 0.14], [0.35, 0.1], [0.6, 0.12]]) inked(g, blob(x * r, 0.22 * r, s * r, s * 0.5 * r, Math.floor(x * 10) + 20, 0.3, 10), IVY, 1.5);

  // The top: the parapet ring, the wooden deck inside it, battlements round the rim.
  inked(g, arcPts(0, -H, rxT + 0.06 * r, ryT + 0.03 * r, 0, Math.PI * 2, 28), STONE_LIGHT, 3, INK_STONE);
  g.poly(arcPts(0, -H, rxT - 0.1 * r, ryT - 0.05 * r, 0, Math.PI * 2, 28)).fill(WOOD).stroke({ width: 2, color: 0x2a1a0c });
  for (let i = -3; i <= 3; i++) g.moveTo(i * 0.16 * r, -H - 0.17 * r).lineTo(i * 0.16 * r, -H + 0.17 * r).stroke({ width: 1.2, color: 0x3a2814, alpha: 0.6 });
  const merlon = (a: number) => {
    const x = Math.cos(a) * (rxT + 0.02 * r);
    const y = -H + Math.sin(a) * (ryT + 0.01 * r);
    const w = 0.1 * r;
    inked(g, [x - w, y, x - w, y - 0.2 * r, x + w, y - 0.2 * r, x + w, y], Math.cos(a) > 0.3 ? STONE : STONE_LIGHT, 2, INK_STONE);
  };
  for (let i = 0; i < 6; i++) merlon(Math.PI + (i + 0.5) * (Math.PI / 6)); // the back ones
  // A banner on its pole at the back.
  g.moveTo(-0.38 * r, -H - 0.1 * r).lineTo(-0.38 * r, -H - 1.05 * r).stroke({ width: 3.5, color: 0x3a2814 });
  inked(g, smooth([-0.36 * r, -H - 1.02 * r, 0.05 * r, -H - 0.96 * r, -0.05 * r, -H - 0.84 * r, 0.08 * r, -H - 0.72 * r, -0.36 * r, -H - 0.72 * r], true, 1), team, 2);
  // A stone plinth for the crystal.
  inked(g, [-0.12 * r, -H + 0.02 * r, -0.08 * r, -H - 0.14 * r, 0.08 * r, -H - 0.14 * r, 0.12 * r, -H + 0.02 * r], STONE_LIGHT, 2, INK_STONE);
  for (let i = 0; i < 6; i++) merlon((i + 0.5) * (Math.PI / 6)); // and the front ones
}

/** A Shootie brought down: the stump of the tower, jagged on top, its stones all round. */
export function drawTowerRuin(g: Graphics, r: number): void {
  const random = rng(91);
  const rxB = 0.8 * r;
  const ryB = 0.3 * r;
  const top: Pts = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI - (i / 12) * Math.PI;
    top.push(Math.cos(a) * rxB * 0.95, -0.35 * r - random() * 0.4 * r + Math.sin(a) * ryB);
  }
  inked(g, [...top, ...arcPts(0, 0, rxB, ryB, 0, Math.PI, 12)], STONE_DARK, 3, INK_STONE);
  inkStroke(g, top, 2.5, { color: INK_STONE, alpha: 0.8 });
  for (let i = 0; i < 9; i++) {
    const a = random() * Math.PI * 2;
    const d = (0.6 + random() * 0.5) * r;
    inked(g, smooth(shard(Math.cos(a) * d, Math.sin(a) * d * 0.4 + 0.1 * r, (0.1 + random() * 0.1) * r, random, 5, 0.7), true, 1), random() < 0.5 ? STONE : STONE_LIGHT, 2, INK_STONE);
  }
}

/** An Oakner: a great old oak, roots gripping the ground, the team's ribbon tied round its trunk. */
export function drawOak(g: Graphics, r: number, team: number): void {
  const random = rng(53);
  const bark = 0x5a3d22;
  // Roots and trunk, as one shape flaring out at the foot.
  const trunk = smooth([
    -0.62 * r, 0.12 * r, -0.36 * r, 0.02 * r, -0.26 * r, -0.4 * r, -0.2 * r, -1.0 * r, -0.36 * r, -1.25 * r,
    -0.1 * r, -1.2 * r, 0.0, -1.35 * r, 0.1 * r, -1.2 * r, 0.38 * r, -1.28 * r, 0.22 * r, -1.0 * r, 0.27 * r, -0.4 * r,
    0.38 * r, 0.02 * r, 0.66 * r, 0.14 * r, 0.25 * r, 0.16 * r, 0.0, 0.1 * r, -0.25 * r, 0.16 * r,
  ], true, 2);
  inked(g, trunk, bark, 4, 0x24170b);
  g.poly(smooth([0.08 * r, -1.1 * r, 0.22 * r, -1.0 * r, 0.27 * r, -0.4 * r, 0.36 * r, 0.04 * r, 0.12 * r, 0.06 * r, 0.06 * r, -0.4 * r], true, 1)).fill({ color: 0x000000, alpha: 0.2 });
  // Bark: long wavering grooves.
  for (let i = 0; i < 6; i++) {
    const x = (-0.18 + i * 0.07) * r;
    const pts: Pts = [];
    for (let k = 0; k <= 6; k++) pts.push(x + Math.sin(k * 1.3 + i) * 0.025 * r, (0.0 - k * 0.17) * r);
    inkStroke(g, pts, 2, { color: 0x24170b, alpha: 0.55, tip: 0.2, seed: i });
  }
  inked(g, blob(0.06 * r, -0.78 * r, 0.06 * r, 0.09 * r, 3, 0.2, 10), 0x24170b, 1.5); // a knot hole
  // The team's ribbon, round the trunk with a bow.
  g.moveTo(-0.24 * r, -0.55 * r).quadraticCurveTo(0.0, -0.47 * r, 0.25 * r, -0.55 * r).stroke({ width: 0.12 * r, color: inkOf(team), cap: 'round' });
  g.moveTo(-0.24 * r, -0.55 * r).quadraticCurveTo(0.0, -0.47 * r, 0.25 * r, -0.55 * r).stroke({ width: 0.08 * r, color: team, cap: 'round' });
  inked(g, [0.05 * r, -0.52 * r, 0.22 * r, -0.62 * r, 0.22 * r, -0.44 * r], team, 1.8);
  inked(g, [0.05 * r, -0.52 * r, -0.1 * r, -0.64 * r, -0.12 * r, -0.44 * r], team, 1.8);
  inked(g, [0.04 * r, -0.5 * r, 0.12 * r, -0.28 * r, 0.06 * r, -0.3 * r, -0.02 * r, -0.5 * r], shade(team, 0.15), 1.5);

  // The crown: a dome of lumpy, inked leaf clusters, lit from the upper left.
  const leaf = [0x2c5226, 0x356030, 0x244620];
  const lobes: { x: number; y: number; s: number }[] = [];
  for (let i = 0; i < 13; i++) {
    const a = Math.PI + (i / 12) * Math.PI;
    lobes.push({ x: Math.cos(a) * 0.95 * r, y: -1.6 * r + Math.sin(a) * 0.62 * r + 0.18 * r, s: (0.36 + random() * 0.12) * r });
  }
  for (let i = 0; i < 6; i++) lobes.push({ x: (-0.75 + i * 0.3) * r, y: -1.3 * r + (random() - 0.5) * 0.12 * r, s: (0.34 + random() * 0.08) * r });
  lobes.push({ x: -0.2 * r, y: -1.75 * r, s: 0.55 * r }, { x: 0.3 * r, y: -1.65 * r, s: 0.5 * r });
  const shapes = lobes.map((l, i) => blob(l.x, l.y, l.s, l.s * 0.9, 60 + i, 0.18, 16));
  for (const s of shapes) g.poly(offset2(s, 4, 5));
  g.fill(0x0f1f0d);
  const order = lobes.map((_, i) => i).sort((a, b) => lobes[a].y - lobes[b].y);
  for (const i of order) {
    const l = lobes[i];
    const lit = (l.y + 1.6 * r) / r - l.x / r * 0.3; // lower and further right is darker
    const color = shade(leaf[i % 3], Math.max(-0.1, Math.min(0.3, lit * 0.35)));
    g.poly(shapes[i]).fill(color);
    if (l.y > -1.75 * r) {
      const m = shapes[i].length / 2;
      inkStroke(g, shapes[i].slice(Math.floor(m * 0.05) * 2, Math.ceil(m * 0.48) * 2), 2.5, { color: 0x0f1f0d, alpha: 0.65, tip: 0.05, seed: i });
    }
    if (lit < 0.2) g.poly(blob(l.x - l.s * 0.3, l.y - l.s * 0.32, l.s * 0.42, l.s * 0.32, i * 3, 0.25, 10)).fill({ color: shade(color, -0.3), alpha: 0.6 });
  }
  for (let k = 0; k < 10; k++) {
    const x = (random() - 0.5) * 1.2 * r;
    const y = -1.6 * r + (random() - 0.4) * 0.8 * r;
    inkLine(g, x - 5, y - 2, x + 5, y + 1, 2, { color: 0x0f1f0d, alpha: 0.5, tip: 0.05 }, 0.35);
  }
  // Acorns and a few leaves tinted in the team's color, so it reads at a glance.
  for (const [x, y] of [[-0.3, -1.25], [0.35, -1.35], [0.0, -1.95], [-0.55, -1.6], [0.55, -1.7]]) {
    g.circle(x * r, y * r, 0.07 * r).fill({ color: team, alpha: 0.35 });
    g.circle(x * r, y * r, 0.035 * r).fill(mix(team, 0xffffff, 0.3));
  }
}

function offset2(pts: Pts, dx: number, dy: number): Pts {
  return pts.map((v, i) => v + (i % 2 ? dy : dx));
}

/** A felled Oakner: a stump, its rings showing, with a shoot already coming up. */
export function drawOakStump(g: Graphics, r: number): void {
  const bark = 0x5a3d22;
  const body = [...arcPts(0, -0.32 * r, 0.32 * r, 0.12 * r, Math.PI, 0, 10), 0.4 * r, 0.06 * r, 0.6 * r, 0.14 * r, 0.2 * r, 0.14 * r, -0.2 * r, 0.14 * r, -0.6 * r, 0.14 * r, -0.4 * r, 0.06 * r];
  inked(g, smooth(body, true, 1), bark, 3, 0x24170b);
  g.poly(arcPts(0, -0.32 * r, 0.32 * r, 0.12 * r, 0, Math.PI * 2, 20)).fill(0xc8a070).stroke({ width: 2.5, color: 0x24170b });
  for (const k of [0.7, 0.45, 0.2]) g.ellipse(0, -0.32 * r, 0.32 * r * k, 0.12 * r * k).stroke({ width: 1.5, color: 0x8a6a40, alpha: 0.8 });
  g.moveTo(0.1 * r, -0.32 * r).lineTo(0.12 * r, -0.62 * r).stroke({ width: 3, color: 0x3f6b33 });
  inked(g, blob(0.2 * r, -0.62 * r, 0.08 * r, 0.04 * r, 5, 0.2, 8), 0x6aa84f, 1.5);
  inked(g, blob(0.04 * r, -0.56 * r, 0.07 * r, 0.035 * r, 6, 0.2, 8), 0x6aa84f, 1.5);
}

/** Da Base: a walled fort over the Chud burrow, towers flying the team's banners, a gate at the front. */
export function drawFort(g: Graphics, r: number, team: number): void {
  const random = rng(12);
  const R = 0.95 * r;
  const squash = 0.5;
  const H = 0.42 * r;
  const corners: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    corners.push([Math.cos(a) * R, Math.sin(a) * R * squash]);
  }
  const edges = corners.map((c, i) => [c, corners[(i + 1) % 6]] as const);
  const isFront = ([a, b]: readonly [[number, number], [number, number]]) => (a[1] + b[1]) / 2 > 0.01 * r;
  // The yard inside, and the burrow.
  g.poly(corners.flat()).fill(0x3a3024);
  inked(g, blob(0, 0.0, 0.42 * r, 0.18 * r, 4, 0.12, 20), 0x1a130c, 2, 0x0c0906);
  for (let i = 0; i < 3; i++) g.ellipse((-0.25 + i * 0.25) * r, -0.06 * r + (i % 2) * 0.08 * r, 0.06 * r, 0.03 * r).fill(0x050403);
  const wall = (edge: readonly [[number, number], [number, number]], front: boolean) => {
    const [[x0, y0], [x1, y1]] = edge;
    const face: Pts = [x0, y0, x1, y1, x1, y1 - H, x0, y0 - H];
    inked(g, face, front ? STONE : STONE_DARK, 3, INK_STONE);
    // Courses of stone.
    for (let k = 1; k < 4; k++) {
      const t = k / 4;
      inkLine(g, x0, y0 - H * t, x1, y1 - H * t, 1.6, { color: INK_STONE, alpha: 0.4 }, 0);
      for (let j = 0; j < 4; j++) {
        const u = (j + 0.5 + (k % 2) * 0.5) / 4.5;
        const x = x0 + (x1 - x0) * u;
        const y = y0 + (y1 - y0) * u;
        inkLine(g, x, y - H * t, x, y - H * (t - 0.25), 1.4, { color: INK_STONE, alpha: 0.35 }, 0);
      }
    }
    if (front && random() < 0.8) ivy(g, x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.3, H * 0.9, 0.1, random);
    // The walk along the top, and its battlements.
    inked(g, [x0, y0 - H, x1, y1 - H, x1, y1 - H - 0.05 * r, x0, y0 - H - 0.05 * r], STONE_LIGHT, 2, INK_STONE);
    for (let j = 1; j < 5; j++) {
      const u = j / 5;
      const x = x0 + (x1 - x0) * u;
      const y = y0 + (y1 - y0) * u - H - 0.05 * r;
      inked(g, [x - 0.05 * r, y, x - 0.05 * r, y - 0.1 * r, x + 0.05 * r, y - 0.1 * r, x + 0.05 * r, y], STONE_LIGHT, 1.6, INK_STONE);
    }
  };
  const tower = ([x, y]: [number, number]) => {
    const tr = 0.14 * r;
    const th = 0.7 * r;
    inked(g, [...arcPts(x, y - th, tr, tr * 0.4, Math.PI, 0, 8), ...arcPts(x, y, tr, tr * 0.4, 0, Math.PI, 8)], STONE, 2.5, INK_STONE);
    g.poly([x + tr * 0.3, y - th, x + tr, y - th, x + tr, y, x + tr * 0.3, y]).fill({ color: 0x000000, alpha: 0.2 });
    // A pointed roof in the team's color, and a banner.
    inked(g, [x - tr * 1.2, y - th, x, y - th - 0.42 * r, x + tr * 1.2, y - th], team, 2.5);
    g.poly([x, y - th - 0.42 * r, x + tr * 1.2, y - th, x + tr * 0.2, y - th]).fill({ color: 0x000000, alpha: 0.2 });
    g.moveTo(x, y - th - 0.42 * r).lineTo(x, y - th - 0.62 * r).stroke({ width: 2.5, color: 0x3a2814 });
    inked(g, [x, y - th - 0.62 * r, x + 0.2 * r, y - th - 0.57 * r, x, y - th - 0.5 * r], team, 1.5);
  };
  // Back walls and towers first, then the front, nearest last.
  for (const e of edges) if (!isFront(e)) wall(e, false);
  for (const c of corners) if (c[1] <= 0.01 * r) tower(c);
  for (const e of edges) if (isFront(e)) wall(e, true);
  // The gate where the Chuds march out, in the middle of the front wall.
  const gx = (corners[1][0] + corners[2][0]) / 2;
  const gy = (corners[1][1] + corners[2][1]) / 2;
  const gate = [...arcPts(gx, gy - H * 0.62, 0.16 * r, 0.16 * r, Math.PI, Math.PI * 2, 8), gx + 0.16 * r, gy, gx - 0.16 * r, gy];
  inked(g, gate, 0x15110c, 2.5, INK_STONE);
  for (let i = -2; i <= 2; i++) g.moveTo(gx + i * 0.06 * r, gy - H * 0.7).lineTo(gx + i * 0.06 * r, gy - 0.02 * r).stroke({ width: 1.5, color: 0x5d636d, alpha: 0.8 }); // portcullis
  for (const c of corners) if (c[1] > 0.01 * r) tower(c);
  inkLoop(g, corners.flat(), 3, { color: INK_STONE, alpha: 0.4 }, 6);
}

/** Da Base fallen: broken walls and a heap of stone where the crystal was. */
export function drawFortRuin(g: Graphics, r: number): void {
  const random = rng(33);
  g.ellipse(0, 0, 0.95 * r, 0.48 * r).fill({ color: 0x2a2620, alpha: 0.8 });
  for (let i = 0; i < 18; i++) {
    const a = random() * Math.PI * 2;
    const d = Math.sqrt(random()) * 0.8 * r;
    inked(g, smooth(shard(Math.cos(a) * d, Math.sin(a) * d * 0.5 - random() * 0.1 * r, (0.08 + random() * 0.14) * r, random, 5, 0.7), true, 1), random() < 0.5 ? STONE : STONE_DARK, 2, INK_STONE);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const x = Math.cos(a) * 0.85 * r;
    const y = Math.sin(a) * 0.42 * r;
    inked(g, [x - 0.1 * r, y, x - 0.08 * r, y - (0.2 + random() * 0.2) * r, x + 0.02 * r, y - 0.12 * r, x + 0.1 * r, y - (0.15 + random() * 0.2) * r, x + 0.12 * r, y], STONE_DARK, 2.5, INK_STONE);
  }
}
