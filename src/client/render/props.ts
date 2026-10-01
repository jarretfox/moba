import { Graphics } from 'pixi.js';
import { blob, inkLine, inkOf, inked, shade, smooth } from './organic';
import type { MapData } from '../../shared/map/mapData';
import { shapeContains } from '../../shared/map/shapes';
import type { Light } from './lighting';

// Things that dress the map: lanterns along the lanes, braziers round the bases, glowing mushrooms in the
// jungle, and bones round the Warden's pit. Where they go is worked out once from the map, the same every
// time, so the art, the lights and the fires all agree.

export interface PropSpots {
  lanterns: { x: number; y: number }[];
  braziers: { x: number; y: number }[];
  mushrooms: { x: number; y: number; n: number }[];
  bones: { x: number; y: number; a: number; skull: boolean }[];
}

/** A light that wavers: \`flicker\` is how much (0–1), \`phase\` keeps neighbours out of step. */
export interface FlickerLight extends Light {
  base: number;
  flicker: number;
  phase: number;
  speed: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new WeakMap<MapData, PropSpots>();

export function propSpots(map: MapData): PropSpots {
  const hit = cache.get(map);
  if (hit) return hit;
  const random = rng(4242);
  const onGround = (x: number, y: number) => map.ground.some((p) => shapeContains(p.shape, x, y));
  const blocked = (x: number, y: number) => map.blockers.some((b) => shapeContains(b, x, y));
  const inside = (x: number, y: number) => x > 150 && y > 150 && x < map.width - 150 && y < map.height - 150;
  const farFrom = (list: { x: number; y: number }[], x: number, y: number, d: number) => list.every((p) => Math.hypot(p.x - x, p.y - y) >= d);

  // Lanterns: just off the edge of each lane, alternating sides.
  const lanterns: PropSpots['lanterns'] = [];
  for (const piece of map.ground) {
    if (piece.style !== 'lane' || piece.shape.type !== 'capsule') continue;
    const { ax, ay, bx, by, r } = piece.shape;
    const len = Math.hypot(bx - ax, by - ay);
    const dx = (bx - ax) / len;
    const dy = (by - ay) / len;
    let side = 1;
    for (let d = 350; d < len - 250; d += 720) {
      side = -side;
      const x = ax + dx * d - dy * side * (r + 45);
      const y = ay + dy * d + dx * side * (r + 45);
      if (!inside(x, y) || onGround(x, y) || blocked(x, y) || !farFrom(lanterns, x, y, 380)) continue;
      lanterns.push({ x, y });
    }
  }

  // Braziers in a ring round each base.
  const braziers: PropSpots['braziers'] = [];
  for (const piece of map.ground) {
    if (piece.style !== 'base' || piece.shape.type !== 'circle') continue;
    const { x, y, r } = piece.shape;
    for (const a of [0.75, 2.35, 3.95, 5.5]) {
      const bx = x + Math.cos(a) * r * 0.82;
      const by = y + Math.sin(a) * r * 0.82;
      if (inside(bx, by)) braziers.push({ x: bx, y: by });
    }
  }

  // Glowing mushrooms dotted about the jungle, clear of the lanes and camps.
  const mushrooms: PropSpots['mushrooms'] = [];
  const camps = map.camps.map((c) => c.pos);
  for (let i = 0; i < 4000 && mushrooms.length < 28; i++) {
    const x = random() * map.width;
    const y = random() * map.height;
    const jungle = map.ground.some((p) => p.style === 'jungle' && shapeContains(p.shape, x, y));
    const lane = map.ground.some((p) => p.style !== 'jungle' && shapeContains(p.shape, x, y));
    if (!jungle || lane || blocked(x, y) || !farFrom(camps, x, y, 320) || !farFrom(mushrooms, x, y, 520)) continue;
    mushrooms.push({ x, y, n: 3 + Math.floor(random() * 3) });
  }

  // Bones round the edge of the Warden's seal: those who came too close.
  const bones: PropSpots['bones'] = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + random() * 0.3;
    const d = 400 + random() * 90;
    bones.push({ x: map.width / 2 + Math.cos(a) * d, y: map.height / 2 + Math.sin(a) * d, a: random() * Math.PI, skull: i % 3 === 0 });
  }

  const spots = { lanterns, braziers, mushrooms, bones };
  cache.set(map, spots);
  return spots;
}

/** The lights they give off, wavering a little. */
export function propLights(s: PropSpots): FlickerLight[] {
  return [
    ...s.lanterns.map((p, i) => ({ x: p.x, y: p.y, r: 360, color: 0xffc070, alpha: 0.55, base: 0.55, flicker: 0.18, phase: i * 1.7, speed: 9 })),
    ...s.braziers.map((p, i) => ({ x: p.x, y: p.y, r: 520, color: 0xffa040, alpha: 0.65, base: 0.65, flicker: 0.28, phase: i * 2.3, speed: 11 })),
    ...s.mushrooms.map((p, i) => ({ x: p.x, y: p.y, r: 240, color: 0x6fd6ff, alpha: 0.45, base: 0.45, flicker: 0.25, phase: i * 0.9, speed: 1.2 })),
  ];
}

/** Where a lantern's lamp is (it stands on a post), and where a brazier's fire burns (in its bowl). */
export const LAMP_HEIGHT = 62;
export const FIRE_HEIGHT = 40;

/** The lamps themselves, glowing above the dark (drawn on the glowing layer, up on their posts). */
export function paintLampGlows(g: Graphics, s: PropSpots): void {
  for (const p of s.lanterns) {
    g.circle(p.x, p.y - LAMP_HEIGHT, 26).fill({ color: 0xffc070, alpha: 0.18 });
    g.circle(p.x, p.y - LAMP_HEIGHT, 12).fill({ color: 0xffe2a8, alpha: 0.5 });
  }
}

/** How bright a wavering light is right now. */
export function flickerAt(l: FlickerLight, time: number): number {
  const wobble = Math.sin(time * l.speed + l.phase) * 0.5 + Math.sin(time * l.speed * 2.3 + l.phase * 1.7) * 0.3 + Math.sin(time * l.speed * 0.37 + l.phase) * 0.2;
  return l.base * (1 - l.flicker * (0.5 + 0.5 * wobble));
}

const IRON = 0x3a3f48;
const WOOD = 0x5e4630;
const BONE = 0xd8d0bc;

/**
 * Paints the props: shadows and flat things (bones) on the ground, and each standing thing (lantern posts,
 * braziers, mushroom clumps) as its own piece, to be sorted in with the units so things pass behind them.
 */
export function paintProps(ground: Graphics, s: PropSpots): Graphics[] {
  const standing: Graphics[] = [];
  const stand = (x: number, y: number) => {
    const g = new Graphics();
    g.position.set(x, y);
    g.zIndex = y;
    standing.push(g);
    return g;
  };
  for (const p of s.lanterns) {
    ground.ellipse(p.x + 14, p.y + 6, 22, 8).fill({ color: 0x000000, alpha: 0.35 });
    const g = stand(p.x, p.y);
    // A stone footing, a wooden post, and the lamp on top under a little roof.
    inked(g, smooth([-11, 2, -9, -10, 9, -11, 11, 2], true, 1), 0x6a665c, 2);
    g.poly([-3.5, -8, 3.5, -8, 3, -LAMP_HEIGHT + 10, -3, -LAMP_HEIGHT + 10]).fill(WOOD).stroke({ width: 2, color: inkOf(WOOD) });
    inkLine(g, -1.5, -10, -1, -LAMP_HEIGHT + 14, 1.5, { color: shade(WOOD, -0.25), alpha: 0.6 }, 0);
    const y = -LAMP_HEIGHT;
    inked(g, [-11, y + 11, 11, y + 11, 9, y + 15, -9, y + 15], 0x2a2018, 1.5);
    inked(g, smooth([-9, y + 11, -10, y - 7, 10, y - 7, 9, y + 11], true, 1), 0x2a2018, 2);
    g.roundRect(-6.5, y - 4, 13, 13, 3).fill(0xffd27a);
    g.moveTo(0, y - 4).lineTo(0, y + 9).stroke({ width: 1.5, color: 0x2a2018 });
    inked(g, [-15, y - 6, 0, y - 18, 15, y - 6, 11, y - 4, -11, y - 4], 0x3a2a1c, 2);
  }
  for (const p of s.braziers) {
    ground.ellipse(p.x + 16, p.y + 8, 36, 12).fill({ color: 0x000000, alpha: 0.35 });
    const g = stand(p.x, p.y);
    // Three iron legs, a bowl of embers on top.
    for (const [x0, x1] of [[-22, -12], [22, 12], [0, 0]]) inkLine(g, x0, 2, x1, -FIRE_HEIGHT + 12, x0 === 0 ? 4 : 5, { color: x0 === 0 ? shade(IRON, 0.3) : IRON, tip: 0.6 }, 0);
    const bowl = smooth([-30, -FIRE_HEIGHT + 4, 30, -FIRE_HEIGHT + 4, 22, -FIRE_HEIGHT + 18, -22, -FIRE_HEIGHT + 18], true, 2);
    inked(g, bowl, 0x6b6f78, 2.5);
    g.ellipse(0, -FIRE_HEIGHT + 4, 29, 7).fill(0x1c1410).stroke({ width: 2, color: inkOf(0x6b6f78) });
    for (let i = 0; i < 6; i++) g.circle(-18 + i * 7, -FIRE_HEIGHT + 4 + Math.sin(i * 2.1) * 2, 4).fill(i % 2 ? 0xff7a2f : 0xffb347);
  }
  for (const m of s.mushrooms) {
    const g = stand(m.x, m.y);
    g.ellipse(0, 4, 46, 14).fill({ color: 0x6fd6ff, alpha: 0.15 });
    // A clump of glowing toadstools, back ones first.
    const caps = Array.from({ length: m.n }, (_, i) => {
      const a = i * 2.4;
      return { x: Math.cos(a) * (12 + (i % 2) * 16), y: Math.sin(a) * (6 + (i % 2) * 8), h: 12 + ((i * 7) % 9), r: 8 + ((i * 5) % 6) };
    }).sort((p, q) => p.y - q.y);
    for (const c of caps) {
      g.poly([c.x - 2.5, c.y, c.x + 2.5, c.y, c.x + 2, c.y - c.h, c.x - 2, c.y - c.h]).fill(0xd8eef6).stroke({ width: 1.5, color: 0x3a5a6a });
      const cap = smooth([c.x - c.r, c.y - c.h + 2, c.x - c.r * 0.6, c.y - c.h - c.r * 0.6, c.x + c.r * 0.6, c.y - c.h - c.r * 0.6, c.x + c.r, c.y - c.h + 2], true, 1);
      inked(g, cap, 0x2f9fd8, 1.6, 0x0b2a3a);
      g.circle(c.x - c.r * 0.3, c.y - c.h - c.r * 0.25, c.r * 0.22).fill(0xdff7ff);
    }
  }
  for (const b of s.bones) {
    if (b.skull) {
      inked(ground, blob(b.x, b.y, 10, 9, Math.round(b.x), 0.08, 12), BONE, 2);
      ground.circle(b.x - 3.5, b.y - 1, 2.5).fill(0x1a1410);
      ground.circle(b.x + 3.5, b.y - 1, 2.5).fill(0x1a1410);
      ground.rect(b.x - 3, b.y + 5, 6, 3).fill(shade(BONE, 0.3));
    } else {
      const dx = Math.cos(b.a) * 12;
      const dy = Math.sin(b.a) * 12;
      inkLine(ground, b.x - dx, b.y - dy, b.x + dx, b.y + dy, 6, { color: inkOf(BONE), tip: 0.8 }, 0);
      inkLine(ground, b.x - dx, b.y - dy, b.x + dx, b.y + dy, 4, { color: BONE, tip: 0.8 }, 0);
      for (const k of [-1, 1]) inked(ground, blob(b.x + dx * k, b.y + dy * k, 3.6, 3.6, Math.round(b.y) + k, 0.1, 8), BONE, 1.4);
    }
  }
  return standing;
}
