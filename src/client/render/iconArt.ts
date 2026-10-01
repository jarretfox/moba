import type { Graphics } from 'pixi.js';
import { arc } from './draw';

// Drawn pictures for every ability, passive and item. The game data names each one by an emoji; these
// replace the emoji on screen (the emoji stays as the fallback and as the key). Each draws into a
// 64×64 box around (0, 0): thick dark outline, flat colors, a bit of shine, like the champion figures.

type Draw = (g: Graphics) => void;

const INK = 0x16120e;
const STEEL = 0xc9d3dc;
const STEEL_DARK = 0x7d8a99;
const WOOD = 0x9a6532;
const WOOD_DARK = 0x5e3a19;
const GOLD = 0xffd166;
const GOLD_DARK = 0xc8962e;
const RED = 0xe5484d;
const BLOOD = 0xb3202a;
const GREEN = 0x8fd14f;
const GREEN_DARK = 0x4f8a2b;
const PURPLE = 0xa77bff;
const BLUE = 0x5aa9ff;
const PAPER = 0xf1e2bf;
const WHITE = 0xffffff;

const ink = (width = 3) => ({ width, color: INK, join: 'round' as const, cap: 'round' as const });
const shine = { width: 2.5, color: WHITE, alpha: 0.55, cap: 'round' as const };

/** A thick stroke with a dark outline: the outline pass, then the color on top. */
function rod(g: Graphics, path: (g: Graphics) => void, width: number, color: number): void {
  path(g);
  g.stroke(ink(width + 4));
  path(g);
  g.stroke({ width, color, cap: 'round', join: 'round' });
}

/** Several circles merged into one outlined blob (outlines first, then fills, so no seams inside). */
function blob(g: Graphics, circles: [number, number, number][], color: number): void {
  for (const [x, y, r] of circles) g.circle(x, y, r).stroke(ink(6));
  for (const [x, y, r] of circles) g.circle(x, y, r).fill(color);
}

/** Rotates a flat [x, y, x, y, …] list around (0, 0). */
function rot(points: number[], a: number, dx = 0, dy = 0): number[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 2) out.push(points[i] * c - points[i + 1] * s + dx, points[i] * s + points[i + 1] * c + dy);
  return out;
}

function leaf(g: Graphics, x: number, y: number, dx: number, dy: number, color = GREEN): void {
  const nx = -dy * 0.35;
  const ny = dx * 0.35;
  g.moveTo(x, y)
    .quadraticCurveTo(x + dx / 2 + nx, y + dy / 2 + ny, x + dx, y + dy)
    .quadraticCurveTo(x + dx / 2 - nx, y + dy / 2 - ny, x, y)
    .closePath()
    .fill(color)
    .stroke(ink(2.5));
}

function coin(g: Graphics, x: number, y: number, r: number): void {
  g.circle(x, y, r).fill(GOLD).stroke(ink());
  g.circle(x, y, r * 0.62).stroke({ width: 2, color: GOLD_DARK });
  arc(g, x, y, r * 0.75, Math.PI * 1.1, Math.PI * 1.45).stroke(shine);
}

function shield(g: Graphics, rim: number, field: number): void {
  const outline = (s: number) =>
    g
      .moveTo(-20 * s, -22 * s)
      .lineTo(20 * s, -22 * s)
      .lineTo(20 * s, -2 * s)
      .bezierCurveTo(20 * s, 14 * s, 6 * s, 24 * s, 0, 28 * s)
      .bezierCurveTo(-6 * s, 24 * s, -20 * s, 14 * s, -20 * s, -2 * s)
      .closePath();
  outline(1).fill(rim).stroke(ink());
  outline(0.72).fill(field).stroke({ width: 2, color: INK, alpha: 0.6 });
}

function boot(g: Graphics, color: number, cuff: number): void {
  g.poly([-12, -22, 6, -22, 6, 2, 20, 8, 24, 15, 24, 20, -14, 20, -14, -4]).fill(color).stroke(ink());
  g.roundRect(-15, 18, 41, 7, 2).fill(0x3b2a1e).stroke(ink());
  g.roundRect(-15, -27, 24, 7, 3).fill(cuff).stroke(ink());
  for (const y of [-12, -4, 4]) g.moveTo(-2, y).lineTo(6, y - 3).stroke({ width: 2, color: INK, alpha: 0.6 });
  g.moveTo(-9, -16).lineTo(-9, 12).stroke({ ...shine, alpha: 0.35 });
}

function sword(g: Graphics, a: number): void {
  g.poly(rot([0, -29, 4, -23, 4, 7, -4, 7, -4, -23], a)).fill(STEEL).stroke(ink(2.5));
  g.poly(rot([0, -25, 0, 5], a), false).stroke({ width: 1.5, color: STEEL_DARK });
  g.poly(rot([-11, 7, 11, 7, 11, 12, -11, 12], a)).fill(GOLD).stroke(ink(2.5));
  g.poly(rot([-2.5, 12, 2.5, 12, 2.5, 23, -2.5, 23], a)).fill(WOOD_DARK).stroke(ink(2.5));
  const [px, py] = rot([0, 26.5], a);
  g.circle(px, py, 3.5).fill(GOLD).stroke(ink(2.5));
}

const SKIN_TONE = 0xe2b48a;
const SKIN_SHADE = 0xb98a62;

const ART: Record<string, Draw> = {
  // ── Havarti
  '🧀': (g) => {
    // Aged to Perfection: a wedge of cheese with holes, a halo over it.
    g.poly([-26, 18, 24, 18, 24, -2, -26, 8]).fill(0xd9a52b).stroke(ink());
    g.poly([-26, 8, 24, -2, 6, -18]).fill(0xf3dc8a).stroke(ink());
    for (const [hx, hy, hr] of [[-8, 12, 4], [10, 10, 3], [4, -6, 3]] as const) g.circle(hx, hy, hr).fill(0xc9a23a);
    g.ellipse(0, -26, 12, 4).stroke({ width: 3, color: GOLD });
  },
  '🌕': (g) => {
    // Holy Wheel: a wheel of cheese, spinning through the air.
    for (const y of [-12, 0, 12]) g.moveTo(-30, y).lineTo(-18, y).stroke({ width: 3, color: GOLD, alpha: 0.8, cap: 'round' });
    g.circle(4, 0, 24).fill(0xd9a52b).stroke(ink());
    g.circle(4, 0, 18).fill(0xf3dc8a);
    for (const [hx, hy, hr] of [[-4, -6, 4], [10, 6, 3.5], [0, 9, 2.5], [12, -8, 2.5]] as const) g.circle(hx, hy, hr).fill(0xd8b860);
    arc(g, 4, 0, 20, Math.PI * 1.1, Math.PI * 1.45).stroke(shine);
  },
  '💛': (g) => {
    // Fondue Blessing: a golden heart, dripping warm fondue.
    g.moveTo(0, 24).bezierCurveTo(-30, 2, -24, -24, 0, -10).bezierCurveTo(24, -24, 30, 2, 0, 24).closePath().fill(GOLD).stroke(ink());
    g.moveTo(-12, -10).quadraticCurveTo(-16, -2, -10, 4).stroke({ ...shine, alpha: 0.6 });
    g.moveTo(8, 12).lineTo(8, 20).stroke({ width: 4, color: 0xf3dc8a, cap: 'round' });
    g.circle(8, 22, 3.5).fill(0xf3dc8a).stroke(ink(1.5));
  },
  '🔪': (g) => {
    // Rind Blade: a cheese knife, forked at the tip, holes down the blade.
    g.poly(rot([-4, -26, 4, -26, 6, -28, 6, -22, 4, -20, 4, 8, -4, 8, -4, -20, -6, -22, -6, -28], 0.6)).fill(0xffe9a8).stroke(ink(2.5));
    for (const y of [-14, -4]) {
      const [hx, hy] = rot([0, y], 0.6);
      g.circle(hx, hy, 2).fill(0xc9a23a);
    }
    rod(g, (g) => g.moveTo(...(rot([0, 10], 0.6) as [number, number])).lineTo(...(rot([0, 26], 0.6) as [number, number])), 5, WOOD_DARK);
    const [fx, fy] = rot([0, -30], 0.6);
    g.circle(fx, fy, 6).fill({ color: 0xff9f43, alpha: 0.7 });
  },
  '😇': (g) => {
    // Divine Fondue: a golden dome, a halo floating above it.
    g.moveTo(-26, 18).arc(0, 18, 26, Math.PI, Math.PI * 2).closePath().fill({ color: GOLD, alpha: 0.85 }).stroke(ink());
    g.moveTo(-26, 18).lineTo(26, 18).stroke(ink(3));
    arc(g, 0, 18, 18, Math.PI * 1.15, Math.PI * 1.45).stroke(shine);
    g.ellipse(0, -18, 14, 5).stroke({ width: 4, color: 0xfff1b8 }).stroke({ width: 1.5, color: INK });
  },
  // ── Master Paris
  '🤺': (g) => {
    // Riposte: two blades crossing, one parrying the other.
    rod(g, (g) => g.moveTo(-26, 22).lineTo(24, -24), 2.5, STEEL);
    rod(g, (g) => g.moveTo(-24, -22).lineTo(26, 20), 2.5, STEEL);
    for (const [gx, gy] of [[-20, 16], [-18, -16]] as const) g.circle(gx, gy, 7).fill(GOLD).stroke(ink(2.5));
    g.poly([0, -8, 3, -3, 8, 0, 3, 3, 0, 8, -3, 3, -8, 0, -3, -3]).fill(WHITE).stroke(ink(1.5));
  },
  '💫': (g) => {
    // Flèche: a streak of steel ending in a star.
    for (const [y, a] of [[-10, 0.5], [0, 0.9], [10, 0.5]] as const) g.moveTo(-28, y).lineTo(6, y * 0.4).stroke({ width: 3, color: 0xff8fb0, alpha: a, cap: 'round' });
    rod(g, (g) => g.moveTo(-10, 0).lineTo(16, 0), 2.5, STEEL);
    g.poly([18, -12, 22, -4, 30, -2, 23, 3, 25, 11, 18, 6, 11, 11, 13, 3, 6, -2, 14, -4]).fill(GOLD).stroke(ink(2));
  },
  '☕': (g) => {
    // Café Break: a cup of coffee, steaming.
    g.roundRect(-18, -4, 30, 26, 6).fill(WHITE).stroke(ink());
    arc(g, 14, 9, 7, -1.4, 1.4).stroke(ink(4));
    g.ellipse(-3, -4, 15, 4).fill(0x5a3a1a).stroke(ink(2));
    g.ellipse(-3, 24, 22, 4).fill(0xe8e0cc).stroke(ink(2));
    for (const sx of [-10, -2, 6]) g.moveTo(sx, -10).bezierCurveTo(sx - 5, -16, sx + 5, -20, sx, -27).stroke({ width: 2.5, color: 0xd8d0c0, cap: 'round' });
  },
  '✨': (g) => {
    // Touché: sparkles off a perfect hit.
    const star = (x: number, y: number, s: number) => g.poly([x, y - s, x + s * 0.28, y - s * 0.28, x + s, y, x + s * 0.28, y + s * 0.28, x, y + s, x - s * 0.28, y + s * 0.28, x - s, y, x - s * 0.28, y - s * 0.28]).fill(0xfff6c8).stroke(ink(2));
    star(-6, -4, 20);
    star(16, -18, 10);
    star(14, 16, 8);
  },
  '🌹': (g) => {
    // Encore: a rose for the crowd.
    rod(g, (g) => g.moveTo(4, -2).bezierCurveTo(0, 12, 8, 18, -2, 28), 3, GREEN_DARK);
    leaf(g, 2, 14, 14, -4);
    blob(g, [[0, -12, 13], [-8, -8, 9], [8, -8, 9]], 0xe5484d);
    arc(g, 0, -12, 6, 0.4, 4.4).stroke({ width: 2, color: 0x8a1a22 });
  },
  // ── Dark Dabber
  '🍯': (g) => {
    // Sticky Resin: a jar of amber resin, overflowing.
    g.roundRect(-18, -14, 36, 38, 8).fill(0xd98a1e).stroke(ink());
    g.roundRect(-20, -22, 40, 10, 4).fill(WOOD).stroke(ink());
    g.moveTo(-10, -12).quadraticCurveTo(-12, 0, -8, 6).lineTo(-6, -12).closePath().fill(0xffb347);
    g.moveTo(-12, -6).lineTo(-12, 16).stroke({ ...shine, alpha: 0.45 });
    g.moveTo(12, -12).quadraticCurveTo(14, -2, 12, 4).stroke({ width: 5, color: 0xd98a1e, cap: 'round' });
    g.circle(12, 7, 4).fill(0xd98a1e).stroke(ink(2));
  },
  '🌫': (g) => {
    // Hotbox: a cloud of smoke with two red eyes in it.
    blob(g, [[-14, 6, 14], [4, -4, 16], [18, 8, 12], [0, 14, 12]], 0xb8c6a0);
    g.circle(-2, 4, 3.5).fill(0xff4a4a);
    g.circle(10, 4, 3.5).fill(0xff4a4a);
    g.circle(-26, -18, 5).fill({ color: 0xb8c6a0, alpha: 0.7 });
    g.circle(24, -20, 4).fill({ color: 0xb8c6a0, alpha: 0.6 });
  },
  '💧': (g) => {
    // Sticky Icky: a fat drop of resin.
    g.moveTo(0, -28).bezierCurveTo(10, -10, 22, 2, 22, 12).bezierCurveTo(22, 24, 12, 28, 0, 28).bezierCurveTo(-12, 28, -22, 24, -22, 12).bezierCurveTo(-22, 2, -10, -10, 0, -28).closePath().fill(0xd98a1e).stroke(ink());
    g.moveTo(-10, 6).quadraticCurveTo(-12, 16, -4, 20).stroke({ ...shine, alpha: 0.6 });
    g.circle(8, 12, 4).fill({ color: GREEN, alpha: 0.8 });
  },
  '💥': (g) => {
    // Light It Up: a lighter's flame bursting.
    const pts: number[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = i % 2 ? 13 : 28;
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.poly(pts).fill(0xff7a2f).stroke(ink());
    g.circle(0, 0, 10).fill(GOLD);
    g.circle(0, 0, 4).fill(WHITE);
  },
  '☁': (g) => {
    // Cloud Nine: a big soft cloud, glittering.
    blob(g, [[-16, 6, 13], [0, -4, 17], [16, 6, 13], [0, 12, 12]], 0xe8f4d8);
    g.moveTo(-14, 12).lineTo(14, 12).stroke({ width: 2, color: 0xb8c6a0 });
    // A smoke bolt shot clean through it.
    rod(g, (g) => g.moveTo(-30, 20).lineTo(26, -14), 3, 0xb8f07a);
    g.poly([26, -14, 18, -16, 22, -8]).fill(0xb8f07a).stroke(ink(2));
    for (const [sx, sy] of [[-24, -18], [22, -20], [4, -26]] as const) g.poly([sx, sy - 5, sx + 1.5, sy - 1.5, sx + 5, sy, sx + 1.5, sy + 1.5, sx, sy + 5, sx - 1.5, sy + 1.5, sx - 5, sy, sx - 1.5, sy - 1.5]).fill(GREEN);
  },
  // ── Dongmaster
  '😎': (g) => {
    // Mog: a cool face behind dark shades, smirking.
    g.circle(0, 0, 26).fill(GOLD).stroke(ink());
    g.roundRect(-22, -10, 20, 13, 5).fill(0x1a1a22).stroke(ink(2.5));
    g.roundRect(2, -10, 20, 13, 5).fill(0x1a1a22).stroke(ink(2.5));
    g.moveTo(-2, -6).lineTo(2, -6).stroke(ink(3));
    g.moveTo(-16, -7).lineTo(-10, -7).stroke({ ...shine, alpha: 0.6 });
    g.moveTo(-10, 13).quadraticCurveTo(2, 18, 13, 9).stroke(ink(3));
  },
  '👊': (g) => {
    // Chin Check: a fist, flying, with speed lines.
    for (const y of [-14, 0, 14]) g.moveTo(-28, y).lineTo(-14, y).stroke({ width: 3, color: WHITE, alpha: 0.8, cap: 'round' });
    g.roundRect(-12, -18, 34, 36, 10).fill(SKIN_TONE).stroke(ink());
    for (const y of [-9, 0, 9]) g.moveTo(14, y).lineTo(21, y).stroke({ width: 2.5, color: SKIN_SHADE, cap: 'round' });
    g.roundRect(-16, -14, 10, 28, 3).fill(PAPER).stroke(ink(2.5));
    g.moveTo(-4, -12).lineTo(8, -12).stroke(shine);
  },
  '😤': (g) => {
    // Mewing: a chiseled jaw in profile, catching the light.
    g.moveTo(-18, -28).lineTo(8, -28).quadraticCurveTo(22, -20, 20, -4).lineTo(26, 6).lineTo(20, 10).lineTo(22, 20).lineTo(-2, 26).lineTo(-18, 22).closePath().fill(SKIN_TONE).stroke(ink());
    g.moveTo(-18, 22).lineTo(-2, 26).lineTo(22, 20).stroke({ width: 3, color: SKIN_SHADE });
    g.moveTo(10, -14).lineTo(16, -14).stroke(ink(3));
    for (const [sx, sy, sr] of [[24, -22, 7], [-24, 4, 5]] as const) g.poly([sx, sy - sr, sx + sr * 0.3, sy - sr * 0.3, sx + sr, sy, sx + sr * 0.3, sy + sr * 0.3, sx, sy + sr, sx - sr * 0.3, sy + sr * 0.3, sx - sr, sy, sx - sr * 0.3, sy - sr * 0.3]).fill(WHITE).stroke(ink(1.5));
  },
  '👁': (g) => {
    // Sigma Stare: one unblinking eye, red lasers out of it.
    g.moveTo(-28, 0).quadraticCurveTo(0, -24, 28, 0).quadraticCurveTo(0, 24, -28, 0).closePath().fill(WHITE).stroke(ink());
    g.circle(0, 0, 11).fill(RED).stroke(ink(2.5));
    g.circle(0, 0, 5).fill(INK);
    g.circle(-4, -4, 2.5).fill(WHITE);
    for (const a of [-0.35, 0.35]) g.moveTo(10, a * 10).lineTo(30, a * 40).stroke({ width: 3, color: 0xff3b30, cap: 'round' });
  },
  '🗿': (g) => {
    // Ascension: a stone face, chiseled to perfection, glowing from behind.
    g.circle(0, 0, 28).fill({ color: GOLD, alpha: 0.35 });
    g.poly([-14, -28, 14, -28, 18, -10, 16, 22, 8, 28, -8, 28, -16, 22, -18, -10]).fill(0x8a8f99).stroke(ink());
    g.roundRect(-14, -14, 28, 6, 2).fill(0x5d636d);
    g.poly([-2, -8, 4, -8, 6, 8, -4, 8]).fill(0x7d828c).stroke(ink(2));
    g.moveTo(-8, 16).lineTo(8, 16).stroke(ink(3));
    g.roundRect(-16, 20, 32, 8, 3).fill(0x6b707a).stroke(ink(2.5));
    g.moveTo(-10, -24).lineTo(-12, 10).stroke({ ...shine, alpha: 0.35 });
  },
  // ── Barbarian
  '🔥': (g) => {
    g.moveTo(0, 28)
      .bezierCurveTo(-22, 28, -26, 6, -12, -8)
      .bezierCurveTo(-11, 2, -5, 4, -5, 4)
      .bezierCurveTo(-9, -12, 0, -22, 6, -29)
      .bezierCurveTo(6, -14, 26, -6, 22, 10)
      .bezierCurveTo(20, 22, 10, 28, 0, 28)
      .closePath()
      .fill(0xff6b2b)
      .stroke(ink());
    g.moveTo(0, 25)
      .bezierCurveTo(-12, 25, -14, 12, -6, 3)
      .bezierCurveTo(-4, 10, 2, 10, 2, 10)
      .bezierCurveTo(0, 0, 6, -6, 8, -11)
      .bezierCurveTo(10, 0, 16, 8, 12, 16)
      .bezierCurveTo(10, 23, 4, 25, 0, 25)
      .closePath()
      .fill(GOLD);
  },
  '🪓': (g) => {
    rod(g, (g) => g.moveTo(-20, 25).lineTo(12, -18), 5, WOOD);
    g.poly([2, -27, 26, -20, 28, 4, 14, -1, 6, -10]).fill(STEEL).stroke(ink());
    g.moveTo(25, -17).lineTo(27, 1).stroke(shine);
  },
  '📣': (g) => {
    g.poly([-27, -5, -15, -5, 6, -17, 6, 17, -15, 5, -27, 5]).fill(0xc0392b).stroke(ink());
    g.ellipse(6, 0, 5, 17).fill(0x7a1f17).stroke(ink());
    g.moveTo(-20, -2).lineTo(-2, -8).stroke({ ...shine, alpha: 0.4 });
    arc(g, 10, 0, 14, -0.6, 0.6).stroke(ink(4));
    arc(g, 10, 0, 21, -0.75, 0.75).stroke(ink(4));
    arc(g, 10, 0, 14, -0.6, 0.6).stroke({ width: 2, color: GOLD });
    arc(g, 10, 0, 21, -0.75, 0.75).stroke({ width: 2, color: GOLD });
  },
  '🦘': (g) => {
    for (const [x, y, r] of [[-25, 24, 5], [-17, 26, 4], [-29, 18, 3]] as const) g.circle(x, y, r).fill(0xb9a68a).stroke(ink(2));
    rod(g, (g) => g.moveTo(-22, 20).quadraticCurveTo(-4, -34, 17, 6), 5, GOLD);
    g.poly([25, 19, 10, 11, 25, 3]).fill(GOLD).stroke(ink());
  },
  '😡': (g) => {
    g.circle(0, 0, 25).fill(RED).stroke(ink());
    arc(g, 0, 0, 20, Math.PI * 1.1, Math.PI * 1.4).stroke({ ...shine, alpha: 0.4 });
    g.moveTo(-17, -13).lineTo(-4, -6).stroke(ink(4.5));
    g.moveTo(17, -13).lineTo(4, -6).stroke(ink(4.5));
    g.circle(-9, -1, 3).fill(INK);
    g.circle(9, -1, 3).fill(INK);
    g.roundRect(-12, 8, 24, 9, 3).fill(WHITE).stroke(ink(2.5));
    for (const x of [-4, 4]) g.moveTo(x, 8).lineTo(x, 17).stroke(ink(1.5));
  },

  // ── HunnaG
  '☣️': (g) => {
    g.moveTo(0, -27)
      .bezierCurveTo(8, -12, 22, -2, 22, 10)
      .bezierCurveTo(22, 22, 12, 28, 0, 28)
      .bezierCurveTo(-12, 28, -22, 22, -22, 10)
      .bezierCurveTo(-22, -2, -8, -12, 0, -27)
      .closePath()
      .fill(GREEN)
      .stroke(ink());
    g.ellipse(-7, 10, 4, 5).fill(GREEN_DARK);
    g.ellipse(7, 10, 4, 5).fill(GREEN_DARK);
    g.moveTo(-5, 20).lineTo(5, 20).stroke({ width: 2.5, color: GREEN_DARK, cap: 'round' });
    g.circle(-10, -2, 3).fill({ color: WHITE, alpha: 0.6 });
    g.circle(-5, -10, 2).fill({ color: WHITE, alpha: 0.5 });
  },
  '🧪': (g) => {
    g.circle(0, 9, 19).fill(GREEN).stroke(ink());
    arc(g, 0, 9, 19, Math.PI * 1.12, Math.PI * 1.88).closePath().fill(0xcfe8ef);
    g.circle(0, 9, 19).stroke(ink());
    g.rect(-6, -22, 12, 15).fill(0xcfe8ef).stroke(ink());
    g.roundRect(-9, -27, 18, 6, 2).fill(0xcfe8ef).stroke(ink());
    for (const [x, y, r] of [[-6, 14, 3], [5, 19, 2.5], [8, 9, 2]] as const) g.circle(x, y, r).fill({ color: WHITE, alpha: 0.6 });
    arc(g, 0, 9, 14, Math.PI * 1.2, Math.PI * 1.45).stroke(shine);
  },
  '🍄': (g) => {
    g.roundRect(-7, 2, 14, 23, 5).fill(PAPER).stroke(ink());
    g.moveTo(-27, 6).bezierCurveTo(-27, -30, 27, -30, 27, 6).closePath().fill(RED).stroke(ink());
    for (const [x, y, r] of [[-13, -6, 4], [3, -15, 5], [15, -3, 3.5]] as const) g.circle(x, y, r).fill(WHITE);
  },
  '🌀': (g) => {
    const hole = (x: number, y: number) => {
      g.ellipse(x, y, 16, 10).fill(0x7a5230).stroke(ink());
      g.ellipse(x, y + 1, 10.5, 6).fill(0x0b0806);
    };
    hole(-13, 17);
    hole(13, -13);
    for (let i = 1; i < 6; i++) {
      const t = i / 6;
      const x = -13 + 26 * t;
      const y = 9 - 20 * t - Math.sin(t * Math.PI) * 14;
      g.circle(x, y, 3.2).fill(0xd8b07a).stroke(ink(1.5));
    }
  },
  '✋': (g) => {
    const skin = 0x9fbf7a;
    g.ellipse(0, 22, 27, 7).fill(0x2a1d12).stroke(ink());
    for (const [x, top] of [[-10, -20], [-3.5, -25], [3, -24], [9.5, -18]] as const) rod(g, (g) => g.moveTo(x, 4).lineTo(x, top), 5, skin);
    rod(g, (g) => g.moveTo(-10, 12).lineTo(-20, 0), 5, skin);
    g.roundRect(-13, -2, 26, 22, 7).fill(skin).stroke(ink());
    g.ellipse(0, 21, 26, 4).fill(0x2a1d12);
  },

  // ── King Rix
  '💰': (g) => {
    g.moveTo(-8, -12).bezierCurveTo(-30, 0, -26, 27, 0, 27).bezierCurveTo(26, 27, 30, 0, 8, -12).closePath().fill(0xc8a15a).stroke(ink());
    g.poly([-8, -12, -15, -25, -4, -20, 0, -27, 4, -20, 15, -25, 8, -12]).fill(0xc8a15a).stroke(ink());
    g.roundRect(-10, -15, 20, 5, 2).fill(BLOOD).stroke(ink(2));
    coin(g, 0, 9, 10);
  },
  '💸': (g) => {
    for (const [x, y] of [[-6, 10], [12, -4], [-2, -16]] as const) {
      for (const dy of [-4, 0, 4]) g.moveTo(x - 13, y + dy).lineTo(x - 22, y + dy).stroke({ width: 2, color: GOLD, alpha: 0.7, cap: 'round' });
      coin(g, x, y, 9);
    }
  },
  '💂': (g) => {
    rod(g, (g) => g.moveTo(15, 27).lineTo(15, -16), 3, WOOD);
    g.poly([15, -30, 20, -18, 15, -13, 10, -18]).fill(STEEL).stroke(ink(2.5));
    g.moveTo(-22, -16)
      .lineTo(8, -16)
      .lineTo(8, 0)
      .bezierCurveTo(8, 14, -4, 21, -7, 25)
      .bezierCurveTo(-10, 21, -22, 14, -22, 0)
      .closePath()
      .fill(0xc0182b)
      .stroke(ink());
    g.poly([-14, 2, -14, -7, -10.5, -3, -7, -9, -3.5, -3, 0, -7, 0, 2]).fill(GOLD).stroke(ink(1.5));
  },
  '🙇': (g) => {
    g.poly([-16, -9, -16, -27, -8, -17, 0, -29, 8, -17, 16, -27, 16, -9]).fill(GOLD).stroke(ink());
    g.circle(0, -14, 2.5).fill(BLOOD);
    for (const y of [-2, 9, 20]) rod(g, (g) => g.moveTo(-15, y).lineTo(0, y + 8).lineTo(15, y), 3.5, 0xb38cff);
  },
  '📜': (g) => {
    g.rect(-17, -19, 34, 38).fill(PAPER).stroke(ink());
    g.roundRect(-22, -26, 44, 9, 4).fill(0xe0cc9e).stroke(ink());
    g.roundRect(-22, 17, 44, 9, 4).fill(0xe0cc9e).stroke(ink());
    for (const [y, w] of [[-10, 22], [-4, 18], [2, 22]] as const) g.moveTo(-11, y).lineTo(-11 + w, y).stroke({ width: 2, color: INK, alpha: 0.45 });
    g.circle(8, 10, 6).fill(BLOOD).stroke(ink(2));
  },

  // ── Logan
  '❤️': (g) => {
    g.moveTo(0, -8)
      .bezierCurveTo(-6, -23, -29, -20, -26, -2)
      .bezierCurveTo(-24, 10, -8, 18, 0, 27)
      .bezierCurveTo(8, 18, 24, 10, 26, -2)
      .bezierCurveTo(29, -20, 6, -23, 0, -8)
      .closePath()
      .fill(RED)
      .stroke(ink());
    g.ellipse(-13, -8, 5, 3.5).fill({ color: WHITE, alpha: 0.6 });
  },
  '🐾': (g) => {
    const pad = 0xe0a050;
    g.ellipse(0, 11, 14, 12).fill(pad).stroke(ink());
    for (const [x, y] of [[-18, -6], [-7, -17], [7, -17], [18, -6]] as const) g.ellipse(x, y, 6, 7.5).fill(pad).stroke(ink());
  },
  '🛡️': (g) => {
    shield(g, STEEL, BLUE);
    g.poly([0, -12, 0, 14], false).stroke({ width: 4, color: GOLD });
    g.poly([-10, -2, 10, -2], false).stroke({ width: 4, color: GOLD });
  },
  '🩸': (g) => {
    for (const d of [-12, 0, 12]) rod(g, (g) => g.moveTo(d - 7, -24).quadraticCurveTo(d + 7, -2, d - 3, 24), 4, BLOOD);
    g.moveTo(20, 8).bezierCurveTo(26, 16, 26, 24, 20, 24).bezierCurveTo(14, 24, 14, 16, 20, 8).closePath().fill(BLOOD).stroke(ink(2));
  },
  '🦁': (g) => {
    g.star(0, 2, 12, 29, 22).fill(0xc8742a).stroke(ink());
    g.circle(-12, -10, 5).fill(0xf2b45a).stroke(ink(2.5));
    g.circle(12, -10, 5).fill(0xf2b45a).stroke(ink(2.5));
    g.circle(0, 4, 16).fill(0xf2b45a).stroke(ink());
    g.ellipse(-6, 0, 2.5, 3).fill(INK);
    g.ellipse(6, 0, 2.5, 3).fill(INK);
    g.ellipse(0, 12, 8, 6).fill(0xfbe3b0);
    g.poly([-4, 6, 4, 6, 0, 10]).fill(INK);
    g.ellipse(0, 15, 4, 3).fill(0x7a1e1e);
  },

  // ── Jordini
  '📕': (g) => {
    // By the Book: a thick red rulebook with a gold check mark.
    g.roundRect(-20, -26, 40, 52, 4).fill(0xc0392b).stroke(ink());
    g.rect(-20, -26, 7, 52).fill(0x8a1a22);
    g.moveTo(16, -22).lineTo(16, 22).stroke({ width: 3, color: PAPER });
    g.moveTo(-6, 0).lineTo(1, 8).lineTo(12, -10).stroke({ width: 5, color: GOLD, cap: 'round', join: 'round' });
    g.moveTo(-6, 0).lineTo(1, 8).lineTo(12, -10).stroke({ width: 1.5, color: INK, cap: 'round', join: 'round' });
  },
  // ── (the rest of Jordini's kit keeps the Marksman's pictures)
  '🎵': (g) => {
    rod(g, (g) => g.moveTo(-6, 14).lineTo(-6, -17), 3, GOLD);
    rod(g, (g) => g.moveTo(16, 8).lineTo(16, -23), 3, GOLD);
    g.poly([-8, -20, 18, -27, 18, -18, -8, -11]).fill(GOLD).stroke(ink());
    g.ellipse(-12, 15, 8, 6).fill(GOLD).stroke(ink());
    g.ellipse(10, 9, 8, 6).fill(GOLD).stroke(ink());
  },
  '🏹': (g) => {
    rod(g, (g) => g.moveTo(5.8, -23.2).lineTo(-12, 0).lineTo(5.8, 23.2), 1.5, PAPER);
    rod(g, (g) => arc(g, -6, 0, 26, -1.1, 1.1), 4, WOOD);
    rod(g, (g) => g.moveTo(-18, 0).lineTo(24, 0), 2.5, STEEL);
    g.poly([30, 0, 21, -6, 21, 6]).fill(STEEL).stroke(ink(2.5));
    g.poly([-18, 0, -25, -6, -21, 0, -25, 6]).fill(RED).stroke(ink(2));
  },
  '🕸️': (g) => {
    const spokes = 8;
    const pt = (i: number, r: number) => [Math.cos((i / spokes) * Math.PI * 2 + 0.2) * r, Math.sin((i / spokes) * Math.PI * 2 + 0.2) * r];
    const web = (width: number, color: number) => {
      for (let i = 0; i < spokes; i++) g.moveTo(0, 0).lineTo(...(pt(i, 27) as [number, number]));
      for (const r of [9, 17, 25]) g.poly(Array.from({ length: spokes }, (_, i) => pt(i, r)).flat());
      g.stroke({ width, color, join: 'round', cap: 'round' });
    };
    web(4.5, INK);
    web(1.8, 0xdfe6ee);
  },
  '💨': (g) => {
    for (const [x0, x1, y] of [[-27, 2, -11], [-22, 0, 1], [-29, 2, 13]] as const) rod(g, (g) => g.moveTo(x0, y).lineTo(x1, y), 2, 0xe6eef5);
    blob(g, [[6, 3, 11], [17, -4, 9], [21, 9, 8]], 0xe6eef5);
  },
  '🎯': (g) => {
    g.circle(0, 2, 25).fill(RED).stroke(ink());
    g.circle(0, 2, 18).fill(WHITE);
    g.circle(0, 2, 11).fill(RED);
    g.circle(0, 2, 4.5).fill(WHITE);
    rod(g, (g) => g.moveTo(1, 1).lineTo(23, -21), 3, WOOD);
    g.poly([23, -21, 30, -22, 25, -26, 26, -31, 22, -26]).fill(GOLD).stroke(ink(2));
  },

  // ── Willmore
  '🔩': (g) => {
    g.star(-8, -7, 8, 20, 15).fill(0x9a6a3a).stroke(ink());
    g.circle(-8, -7, 6).fill(0x2a1d12).stroke(ink(2));
    g.regularPoly(10, 11, 14, 6).fill(STEEL_DARK).stroke(ink());
    g.circle(10, 11, 6).fill(0x1a1f26).stroke(ink(2));
    g.moveTo(2, 2).lineTo(10, -2).stroke({ ...shine, alpha: 0.4 });
  },
  '🥫': (g) => {
    g.roundRect(-14, -18, 28, 40, 3).fill(0xb0bcc8).stroke(ink());
    g.rect(-14, -8, 28, 16).fill(RED).stroke(ink(2));
    g.ellipse(0, -18, 14, 4).fill(0xdfe6ee).stroke(ink());
    g.moveTo(-8, 13).lineTo(-8, 19).stroke({ ...shine, alpha: 0.5 });
    arc(g, 9, -1, 5, Math.PI * 0.6, Math.PI * 1.4).stroke({ width: 2, color: INK, alpha: 0.5 });
  },
  '🕳️': (g) => {
    g.ellipse(0, 6, 28, 16).fill(0x7a5230).stroke(ink());
    g.ellipse(0, 8, 19, 9.5).fill(0x0b0806);
    for (const [x, y, r] of [[-23, -9, 4], [20, -10, 5], [-5, -14, 3]] as const) g.circle(x, y, r).fill(0x7a5230).stroke(ink(2));
  },
  '🎣': (g) => {
    rod(g, (g) => g.moveTo(-18, -30).quadraticCurveTo(-8, -28, 4, -26), 1.5, PAPER);
    g.circle(4, -24, 4).stroke(ink(5));
    g.circle(4, -24, 4).stroke({ width: 2, color: STEEL });
    rod(g, (g) => g.moveTo(4, -20).lineTo(4, 8).arc(-6, 8, 10, 0, Math.PI).lineTo(-16, -2), 4, STEEL);
    g.poly([-16, -6, -21, 4, -12, 2]).fill(STEEL).stroke(ink(2));
  },
  '⛏️': (g) => {
    rod(g, (g) => g.moveTo(-20, 25).lineTo(10, -14), 5, WOOD);
    rod(g, (g) => g.moveTo(-16, -20).quadraticCurveTo(8, -26, 25, 3), 6, STEEL);
    g.moveTo(-8, -21).quadraticCurveTo(6, -24, 16, -12).stroke({ ...shine, alpha: 0.45 });
  },

  // ── Items
  '🗡️': (g) => {
    g.poly([0, -28, 6, -20, 6, 4, -6, 4, -6, -20]).fill(STEEL).stroke(ink());
    g.moveTo(0, -22).lineTo(0, 2).stroke({ width: 2, color: STEEL_DARK });
    g.roundRect(-14, 4, 28, 6, 2).fill(GOLD).stroke(ink(2.5));
    g.roundRect(-3.5, 10, 7, 13, 2).fill(WOOD_DARK).stroke(ink(2.5));
    g.circle(0, 25, 4).fill(GOLD).stroke(ink(2.5));
  },
  '🧵': (g) => {
    g.rect(-12, -17, 24, 34).fill(0x4fd1c5).stroke(ink());
    for (let y = -12; y <= 12; y += 6) g.moveTo(-12, y).lineTo(12, y + 3).stroke({ width: 1.5, color: 0x1f8a80 });
    g.roundRect(-17, -23, 34, 7, 2).fill(WOOD).stroke(ink());
    g.roundRect(-17, 16, 34, 7, 2).fill(WOOD).stroke(ink());
    rod(g, (g) => g.moveTo(12, 6).quadraticCurveTo(26, 10, 22, 26), 2, 0x4fd1c5);
  },
  '🍞': (g) => {
    g.moveTo(-26, 18).bezierCurveTo(-32, -30, 32, -30, 26, 18).closePath().fill(0xd9963c).stroke(ink());
    g.moveTo(-24, 18).lineTo(24, 18).stroke(ink());
    for (const x of [-12, 0, 12]) g.moveTo(x - 5, -2).lineTo(x + 5, -11).stroke({ width: 3.5, color: 0xf3d39a, cap: 'round' });
    g.moveTo(-18, 6).quadraticCurveTo(-18, -8, -8, -14).stroke({ ...shine, alpha: 0.35 });
  },
  '🧥': (g) => {
    g.poly([-10, -25, 0, -15, 10, -25, 23, -18, 21, 25, -21, 25, -23, -18]).fill(0x8a5a2b).stroke(ink());
    g.moveTo(0, -15).lineTo(0, 25).stroke(ink(2.5));
    for (const y of [-6, 3, 12]) g.moveTo(-4, y).lineTo(4, y + 4).moveTo(4, y).lineTo(-4, y + 4).stroke({ width: 1.5, color: PAPER });
    g.moveTo(-17, -12).lineTo(-16, 18).stroke({ ...shine, alpha: 0.3 });
  },
  '🌳': (g) => {
    g.rect(-5, 4, 10, 22).fill(WOOD).stroke(ink());
    blob(g, [[-11, -3, 12], [11, -3, 12], [0, -15, 14]], GREEN_DARK);
    g.circle(-5, -18, 5).fill({ color: GREEN, alpha: 0.6 });
  },
  '🔮': (g) => {
    g.poly([-14, 27, 14, 27, 9, 16, -9, 16]).fill(WOOD_DARK).stroke(ink());
    g.circle(0, -3, 20).fill(PURPLE).stroke(ink());
    arc(g, 0, -3, 10, 0, Math.PI * 1.3).stroke({ width: 2.5, color: 0xe4d6ff, alpha: 0.7 });
    g.ellipse(-8, -12, 6, 4).fill({ color: WHITE, alpha: 0.7 });
  },
  '🥾': (g) => boot(g, WOOD, 0xc8945a),
  '👟': (g) => {
    g.poly([-12, -12, -29, -22, -26, -15, -31, -10, -27, -6, -30, -1, -14, 2]).fill(WHITE).stroke(ink(2.5));
    boot(g, BLUE, 0xdfe6ee);
  },
  '🦷': (g) => {
    g.moveTo(-14, -20).lineTo(14, -20).bezierCurveTo(14, 0, 6, 10, 0, 27).bezierCurveTo(-6, 10, -14, 0, -14, -20).closePath().fill(0xf5efe0).stroke(ink());
    g.roundRect(-18, -27, 36, 10, 4).fill(0xb03a48).stroke(ink());
    g.moveTo(-7, -12).quadraticCurveTo(-6, 4, -2, 14).stroke({ width: 2.5, color: 0xc9bfa8 });
  },
  '🥁': (g) => {
    rod(g, (g) => g.moveTo(-24, -27).lineTo(-6, -13), 2.5, WOOD);
    rod(g, (g) => g.moveTo(24, -27).lineTo(6, -13), 2.5, WOOD);
    g.ellipse(0, 18, 21, 7).fill(RED).stroke(ink());
    g.rect(-21, -6, 42, 24).fill(RED);
    g.moveTo(-21, -6).lineTo(-21, 18).moveTo(21, -6).lineTo(21, 18).stroke(ink());
    g.poly([-21, -2, -10, 18, 0, -2, 10, 18, 21, -2], false).stroke({ width: 2, color: GOLD });
    g.ellipse(0, -6, 21, 7).fill(PAPER).stroke(ink());
  },
  '⚔️': (g) => {
    sword(g, -0.75);
    sword(g, 0.75);
  },
  '⛓️': (g) => {
    const link = (x: number, y: number, rx: number, ry: number) => {
      g.ellipse(x, y, rx, ry).stroke(ink(8));
      g.ellipse(x, y, rx, ry).stroke({ width: 4, color: STEEL });
    };
    link(-13, 13, 11, 7);
    link(13, -13, 11, 7);
    link(0, 0, 7, 11);
  },
  '💠': (g) => {
    g.poly([0, -28, 22, 0, 0, 28, -22, 0]).fill(0x5ad1ff).stroke(ink());
    for (const [x, y] of [[0, -28], [22, 0], [0, 28], [-22, 0]] as const) g.moveTo(0, 0).lineTo(x, y).stroke({ width: 1.5, color: INK, alpha: 0.3 });
    g.poly([0, -15, 11, 0, 0, 15, -11, 0]).fill(0xbff0ff).stroke({ width: 1.5, color: INK, alpha: 0.4 });
    g.moveTo(-14, -6).lineTo(-6, -17).stroke(shine);
  },
  '🏮': (g) => {
    arc(g, 0, -27, 5, Math.PI, 0).stroke(ink(2.5));
    g.circle(0, 2, 14).fill({ color: GOLD, alpha: 0.35 });
    g.ellipse(0, 2, 18, 22).fill(RED).stroke(ink());
    g.ellipse(0, 2, 8, 22).stroke({ width: 2, color: INK, alpha: 0.35 });
    g.circle(0, 2, 6).fill({ color: GOLD, alpha: 0.7 });
    g.roundRect(-10, -24, 20, 6, 2).fill(GOLD_DARK).stroke(ink(2.5));
    g.roundRect(-8, 21, 16, 5, 2).fill(GOLD_DARK).stroke(ink(2.5));
    g.moveTo(0, 26).lineTo(0, 31).stroke({ width: 2.5, color: GOLD, cap: 'round' });
  },
  '🌿': (g) => {
    rod(g, (g) => g.moveTo(-18, 27).lineTo(8, -16), 4, WOOD);
    leaf(g, 8, -16, 15, -8);
    leaf(g, 8, -16, -4, -15);
    leaf(g, 2, -6, -15, -4);
    leaf(g, 4, -10, 15, 6, GREEN_DARK);
  },
};

/** The emoji with its invisible "draw as emoji" marks removed, so '🛡️' and '🛡' are the same key. */
export function iconKey(emoji: string): string {
  return emoji.replace(/️/g, '');
}

export const ICON_ART: Record<string, Draw> = Object.fromEntries(Object.entries(ART).map(([k, v]) => [iconKey(k), v]));
