import type { Graphics } from 'pixi.js';
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

/** The lamps themselves, glowing above the dark (drawn on the glowing layer, raised like the lantern heads). */
export function paintLampGlows(g: Graphics, s: PropSpots): void {
  for (const p of s.lanterns) {
    g.circle(p.x, p.y - 40, 26).fill({ color: 0xffc070, alpha: 0.18 });
    g.circle(p.x, p.y - 40, 12).fill({ color: 0xffe2a8, alpha: 0.5 });
  }
}

/** How bright a wavering light is right now. */
export function flickerAt(l: FlickerLight, time: number): number {
  const wobble = Math.sin(time * l.speed + l.phase) * 0.5 + Math.sin(time * l.speed * 2.3 + l.phase * 1.7) * 0.3 + Math.sin(time * l.speed * 0.37 + l.phase) * 0.2;
  return l.base * (1 - l.flicker * (0.5 + 0.5 * wobble));
}

const INK = { width: 2, color: 0x0b0f14 };

/** Paints the props: footings and flat things on the ground, lantern heads on the raised layer. */
export function paintProps(ground: Graphics, top: Graphics, s: PropSpots): void {
  for (const p of s.lanterns) {
    ground.ellipse(p.x + 10, p.y + 14, 16, 10).fill({ color: 0x000000, alpha: 0.35 });
    ground.rect(p.x - 9, p.y - 9, 18, 18).fill(0x4a3a28).stroke(INK);
    top.rect(p.x - 5, p.y - 34, 10, 34).fill(0x5e4630).stroke(INK); // the post
    top.poly([p.x - 17, p.y - 50, p.x, p.y - 62, p.x + 17, p.y - 50]).fill(0x3a2a1c).stroke(INK); // a little roof
    top.roundRect(p.x - 13, p.y - 52, 26, 24, 4).fill(0x2a2018).stroke(INK);
    top.roundRect(p.x - 9, p.y - 48, 18, 16, 3).fill(0xffd27a);
  }
  for (const p of s.braziers) {
    ground.ellipse(p.x + 12, p.y + 16, 34, 22).fill({ color: 0x000000, alpha: 0.35 });
    ground.circle(p.x, p.y, 32).fill(0x6b6f78).stroke({ width: 3, color: 0x0b0f14 });
    ground.circle(p.x, p.y, 22).fill(0x1c1410);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ground.circle(p.x + Math.cos(a) * 9, p.y + Math.sin(a) * 9, 5).fill(i % 2 ? 0xff7a2f : 0xffb347);
    }
  }
  for (const m of s.mushrooms) {
    for (let i = 0; i < m.n; i++) {
      const a = i * 2.4;
      const d = 14 + (i % 2) * 16;
      const x = m.x + Math.cos(a) * d;
      const y = m.y + Math.sin(a) * d;
      const r = 9 + ((i * 7) % 5);
      ground.circle(x, y, r + 5).fill({ color: 0x6fd6ff, alpha: 0.15 });
      ground.circle(x, y, r).fill(0x2f9fd8).stroke({ width: 1.5, color: 0x0b2a3a });
      ground.circle(x - r * 0.3, y - r * 0.3, r * 0.3).fill(0xdff7ff);
    }
  }
  for (const b of s.bones) {
    if (b.skull) {
      ground.circle(b.x, b.y, 10).fill(0xd8d0bc).stroke(INK);
      ground.circle(b.x - 3.5, b.y - 1, 2.5).fill(0x1a1410);
      ground.circle(b.x + 3.5, b.y - 1, 2.5).fill(0x1a1410);
    } else {
      const dx = Math.cos(b.a) * 12;
      const dy = Math.sin(b.a) * 12;
      ground.moveTo(b.x - dx, b.y - dy).lineTo(b.x + dx, b.y + dy).stroke({ width: 4, color: 0xd8d0bc, cap: 'round' });
      ground.circle(b.x - dx, b.y - dy, 3.5).fill(0xd8d0bc);
      ground.circle(b.x + dx, b.y + dy, 3.5).fill(0xd8d0bc);
    }
  }
}
