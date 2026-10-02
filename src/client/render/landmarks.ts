import { Container, Graphics, Text } from 'pixi.js';
import type { MapData } from '../../shared/map/mapData';
import { blade, blob, inkLine, inkLoop, inkOf, inkStroke, inked, mix, rng, roughen, shade, shapeOutline, shard, smooth, type Pts } from './organic';
import type { FlickerLight } from './props';
import { buildHollow } from './hollow';

// Story landmarks: places on the map that tell the champions' tale. Logan's royal cage stands broken open
// on blue's side of the jungle, and the statue of King Rix lies toppled on red's. Great chains run from the
// walls of the Warden's pit to the broken shackle in its middle. Willmore's sewer spills junk into the top
// of the river, and HunnaG's rot blooms at the bottom. Round the pit are the newcomers' haunts: Master
// Paris's café, Dongmaster's outdoor gym, the royal cellar Havarti came out of, and the Dabber's den. A
// faint name is cut into the ground by each.
//
// Each sits in the jungle rather than on it: the earth round it is worn bare and footpaths lead to it
// (painted into the ground, see loreGround.ts), grass grows up over its edges, and its clutter spreads
// out into the grass round about.
//
// Drawn in the inked style. Flat things lie on the ground (above the water, under everyone); things that
// stand up (the cage, the plinth, the café table, crates, toadstools) are pieces of their own, sorted in
// with the units so champions walk behind and in front of them; a few things on the pit walls go on the
// raised layer with the wall tops.

const IRON = 0x3a3f48;
const IRON_HI = 0x6b7380;
const GOLD = 0xc9a23a;
const STONE = 0x8a857a;
const STONE_DARK = 0x5e5a52;
const MOSS = 0x4f6b34;
const WOOD = 0x8a6a3a;

export interface Landmarks {
  /** On the ground, above the water. */
  flat: Container;
  /** Raised with the wall tops. */
  tall: Graphics;
  /** Standing pieces, each with its feet at its position: sort them in with the units. */
  standing: Container[];
  /** Glows for the light map. */
  lights: FlickerLight[];
}

/** Makes a standing piece whose base is at (x, y); it's drawn about (0, 0), up as −y. */
type Stand = (x: number, y: number) => Graphics;

/** Where each landmark sits, mirrored to the map's size (the layout is authored for 12000 by 7000). */
export function landmarkSpots(map: MapData): Record<'cage' | 'statue' | 'sewer' | 'rot' | 'pit' | 'cafe' | 'gym' | 'cellar' | 'den', { x: number; y: number }> {
  const cx = map.width / 2;
  const cy = map.height / 2;
  return {
    cage: { x: cx - 2600, y: cy },
    statue: { x: cx + 2600, y: cy },
    sewer: { x: cx, y: cy - 1250 },
    rot: { x: cx, y: cy + 1250 },
    pit: { x: cx, y: cy },
    // Out from the Warden's pit, one in each quarter of the jungle (clear of brush).
    cafe: { x: cx - 1400, y: cy - 800 },
    gym: { x: cx + 1400, y: cy - 800 },
    cellar: { x: cx - 1400, y: cy + 800 },
    den: { x: cx + 1400, y: cy + 800 },
  };
}

export function buildLandmarks(map: MapData): Landmarks {
  // The Howling Hollow (ARAM) has its own Halloween decor instead.
  if (map.theme === 'halloween') return buildHollow(map);
  const flat = new Container();
  const ground = new Graphics();
  const tall = new Graphics();
  const standing: Container[] = [];
  flat.addChild(ground);
  const stand: Stand = (x, y) => {
    const g = new Graphics();
    g.position.set(x, y);
    g.zIndex = y;
    standing.push(g);
    return g;
  };
  const at = landmarkSpots(map);
  const label = (text: string, x: number, y: number) => {
    const t = new Text({ text, style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 34, fill: 0xffffff, letterSpacing: 5 } });
    t.alpha = 0.09;
    t.anchor.set(0.5);
    t.position.set(x, y);
    flat.addChild(t);
  };

  royalCage(ground, stand, at.cage.x, at.cage.y);
  label('THE ROYAL CAGE', at.cage.x, at.cage.y + 175);
  fallenKing(ground, stand, at.statue.x, at.statue.y);
  label('THE FALLEN KING', at.statue.x, at.statue.y + 185);
  wardenChains(ground, tall, at.pit.x, at.pit.y);
  sewerMouth(ground, stand, at.sewer.x, at.sewer.y);
  label('THE DEEP', at.sewer.x, at.sewer.y - 160);
  rotBloom(ground, stand, at.rot.x, at.rot.y);
  label('THE ROT', at.rot.x, at.rot.y + 160);
  petitCafe(ground, stand, at.cafe.x, at.cafe.y);
  label('LE PETIT CAFÉ', at.cafe.x, at.cafe.y + 150);
  ironParadise(ground, stand, at.gym.x, at.gym.y);
  label('IRON PARADISE', at.gym.x, at.gym.y + 140);
  royalCellar(ground, stand, at.cellar.x, at.cellar.y);
  label('THE ROYAL CELLAR', at.cellar.x, at.cellar.y + 140);
  ratDen(ground, tall, stand, at.den.x, at.den.y);
  label('THE HOTBOX', at.den.x, at.den.y + 140);

  const lights: FlickerLight[] = [
    { x: at.sewer.x, y: at.sewer.y, r: 300, color: 0x6fd6a0, alpha: 0.35, base: 0.35, flicker: 0.3, phase: 1, speed: 2 },
    { x: at.rot.x, y: at.rot.y, r: 380, color: 0xb36bff, alpha: 0.45, base: 0.45, flicker: 0.35, phase: 2, speed: 1.4 },
    { x: at.pit.x, y: at.pit.y, r: 260, color: 0xb8f07a, alpha: 0.3, base: 0.3, flicker: 0.4, phase: 3, speed: 0.8 },
    // A shaft of pale light on the cage and the fallen king, so they show at dusk.
    { x: at.cage.x, y: at.cage.y, r: 330, color: 0xffe2a8, alpha: 0.4, base: 0.4, flicker: 0.05, phase: 4, speed: 0.5 },
    { x: at.statue.x + 40, y: at.statue.y, r: 360, color: 0xcfe0ff, alpha: 0.4, base: 0.4, flicker: 0.05, phase: 5, speed: 0.5 },
    { x: at.cafe.x, y: at.cafe.y, r: 300, color: 0xffd9a0, alpha: 0.45, base: 0.45, flicker: 0.1, phase: 6, speed: 3 },
    { x: at.cellar.x, y: at.cellar.y, r: 280, color: 0xffe29a, alpha: 0.5, base: 0.5, flicker: 0.25, phase: 7, speed: 7 },
    { x: at.den.x, y: at.den.y, r: 300, color: 0xb8f07a, alpha: 0.35, base: 0.35, flicker: 0.3, phase: 8, speed: 1.5 },
    { x: at.gym.x, y: at.gym.y, r: 280, color: 0xe8f0ff, alpha: 0.3, base: 0.3, flicker: 0.02, phase: 9, speed: 0.5 },
  ];
  return { flat, tall, standing, lights };
}

// ─── Shapes ───────────────────────────────────────────────────────────────────

/** A slab or patch on the ground, its edges a little uneven. */
function slab(x: number, y: number, w: number, h: number, seed: number, wobble = 5): Pts {
  return roughen(shapeOutline({ type: 'rect', x: x - w / 2, y: y - h / 2, w, h }, 14, 0, 0.15), wobble, 1 / 40, seed);
}

/** A box seen from the front and a little above: its front face from (0, 0) up, and the top behind it. */
function crate(g: Graphics, x: number, w: number, h: number, depth: number, color: number): void {
  inked(g, [x - w / 2, -h, x - w / 2 + depth * 0.4, -h - depth, x + w / 2 + depth * 0.4, -h - depth, x + w / 2, -h], shade(color, -0.15), 2);
  inked(g, [x - w / 2, 0, x - w / 2, -h, x + w / 2, -h, x + w / 2, 0], color, 2.5);
  g.moveTo(x - w / 2 + 3, -3).lineTo(x + w / 2 - 3, -h + 3).stroke({ width: 3, color: shade(color, 0.3) });
  for (const k of [0.33, 0.66]) g.moveTo(x - w / 2 + 2, -h * k).lineTo(x + w / 2 - 2, -h * k).stroke({ width: 1.5, color: shade(color, 0.35), alpha: 0.6 });
}

/** Something round standing up (a barrel, a pipe, a stack of cheese): its body from (x, 0) up, its top. */
function drum(g: Graphics, x: number, r: number, h: number, body: number, top = shade(body, -0.15)): void {
  const pts: Pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI - (i / 10) * Math.PI;
    pts.push(x + Math.cos(a) * r, -h + Math.sin(a) * r * 0.35);
  }
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    pts.push(x + Math.cos(a) * r, Math.sin(a) * r * 0.35);
  }
  inked(g, pts, body, 2.5);
  g.poly([x + r * 0.35, -h, x + r, -h, x + r, 0, x + r * 0.35, 0]).fill({ color: 0x000000, alpha: 0.15 });
  g.ellipse(x, -h, r, r * 0.35).fill(top).stroke({ width: 2, color: inkOf(body) });
}

const GRASS = [0x4c7a3d, 0x5f8f48, 0x3f6a33];

/** A clump of grass blades fanning from one root. */
function tuft(g: Graphics, x: number, y: number, h: number, random: () => number): void {
  const n = 3 + Math.floor(random() * 3);
  g.ellipse(x + 2, y + 1.5, h * 0.5, h * 0.18).fill({ color: 0x000000, alpha: 0.2 });
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) - 0.5;
    blade(g, x + k * h * 0.5, y, h * (0.75 + random() * 0.5), k * h * 1.1 + (random() - 0.5) * 4, 3 + random() * 1.5, shade(GRASS[Math.floor(random() * 3)], 0.22 - (i / n) * 0.3));
  }
}

/** Grass grown up over an edge: tufts along an outline, so the thing sits in the ground, not on it. */
function overgrow(g: Graphics, outline: Pts, random: () => number, spacing = 42, chance = 0.75): void {
  const n = outline.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = outline[i * 2];
    const ay = outline[i * 2 + 1];
    const len = Math.hypot(outline[j * 2] - ax, outline[j * 2 + 1] - ay);
    for (let d = random() * spacing; d < len; d += spacing * (0.6 + random() * 0.8)) {
      if (random() > chance) continue;
      const t = d / len;
      tuft(g, ax + (outline[j * 2] - ax) * t + (random() - 0.5) * 10, ay + (outline[j * 2 + 1] - ay) * t + (random() - 0.5) * 8, 9 + random() * 9, random);
    }
  }
}

/** Ivy climbing from (x, y) up `h`: a wandering stem with leaves along it. */
function vine(g: Graphics, x: number, y: number, h: number, random: () => number): void {
  const pts: Pts = [];
  for (let k = 0; k <= 6; k++) pts.push(x + Math.sin(k * 1.7 + x) * 6, y - (h * k) / 6);
  inkStroke(g, pts, 2.5, { color: 0x2f5a28, tip: 0.3 });
  for (let k = 1; k < 6; k++) {
    const side = k % 2 ? -1 : 1;
    const lx = pts[k * 2] + side * 6;
    const ly = pts[k * 2 + 1];
    g.ellipse(lx, ly, 5 + random() * 2, 3).fill(GRASS[k % 3]).stroke({ width: 1, color: 0x1e3a18 });
  }
}

/** A toadstool: a pale stem and a spotted cap. */
function toadstool(g: Graphics, x: number, h: number, r: number, cap: number, seed: number): void {
  g.poly([x - r * 0.22, 0, x + r * 0.22, 0, x + r * 0.17, -h, x - r * 0.17, -h]).fill(0xe8dcc0).stroke({ width: 1.8, color: 0x5a5040 });
  const top = smooth([x - r, -h + r * 0.15, x - r * 0.65, -h - r * 0.7, x + r * 0.65, -h - r * 0.7, x + r, -h + r * 0.15], true, 2);
  inked(g, top, cap, 2);
  const random = rng(seed);
  for (let i = 0; i < 3; i++) g.ellipse(x + (random() - 0.5) * r * 1.2, -h - r * (0.15 + random() * 0.35), r * 0.13, r * 0.1).fill(0xe8d7ff);
}

// ─── The landmarks ────────────────────────────────────────────────────────────

/** Logan's cage: the king's gilded iron, the front bars wrenched apart where he burst out, the door hanging off. */
function royalCage(g: Graphics, stand: Stand, x: number, y: number): void {
  const w = 130;
  g.ellipse(x + 18, y + 20, w + 30, 100).fill({ color: 0x000000, alpha: 0.28 });
  inked(g, slab(x, y, w * 2, 150, 1), STONE_DARK, 3);
  for (const [x0, y0, x1, y1] of [[-90, -40, -30, -10], [20, 30, 80, 50], [-40, 40, 10, 15]]) inkLine(g, x + x0, y + y0, x + x1, y + y1, 2.5, { color: 0x3a3630, alpha: 0.8 }, 0.1);
  // Years of nobody sweeping: moss in the corners, weeds up through the cracks, grass over the edge.
  const random = rng(101);
  for (const [mx, my, mr] of [[x - 110, y - 50, 26], [x + 105, y + 52, 22], [x - 95, y + 55, 16]]) inked(g, blob(mx, my, mr, mr * 0.6, mx, 0.35, 14), MOSS, 1.8);
  for (const [wx, wy] of [[x - 40, y + 40], [x + 80, y + 50], [x - 30, y - 10]]) tuft(g, wx, wy, 8, random);
  overgrow(g, slab(x, y, w * 2, 150, 1), random, 38, 0.8);
  // His straw, blown out across the grass the way he went.
  for (let i = 0; i < 34; i++) {
    const d = 170 + random() * 230;
    const a = (random() - 0.5) * 2.2;
    const sx = x + Math.cos(a) * d * 1.1;
    const sy = y + 20 + Math.sin(a) * d * 0.55;
    const r = random() * Math.PI;
    inkLine(g, sx, sy, sx + Math.cos(r) * 14, sy + Math.sin(r) * 6, 2.2, { color: 0xc9a85a, alpha: 0.75 - (d - 170) / 460 }, 0.2);
  }
  // Old straw, and the claw marks he left on the way out.
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4;
    const sx = x + Math.cos(a * 1.7) * (40 + ((i * 13) % 70));
    const sy = y + Math.sin(a) * (25 + ((i * 7) % 40));
    inkLine(g, sx, sy, sx + Math.cos(a) * 16, sy + Math.sin(a) * 8, 2.5, { color: 0xc9a85a, alpha: 0.85 }, 0.2);
  }
  for (let i = 0; i < 3; i++) inkStroke(g, [x + 150 + i * 14, y - 40, x + 180 + i * 14, y, x + 160 + i * 14, y + 45], 4, { color: 0xd8d0c0, alpha: 0.6 });
  // The broken chain trailing out of the door, and the collar's snapped lock.
  for (let i = 0; i < 6; i++) g.ellipse(x + 150 + i * 22, y + 50 + Math.sin(i) * 8, 9, 5).stroke({ width: 5, color: inkOf(IRON_HI) }).ellipse(x + 150 + i * 22, y + 50 + Math.sin(i) * 8, 9, 5).stroke({ width: 3, color: IRON_HI });
  inked(g, smooth([x + 284, y + 42, x + 298, y + 42, x + 298, y + 60, x + 284, y + 60], true, 1), GOLD, 2);

  // The cage itself, standing on the slab: back bars, then the front, the front ones wrenched apart.
  const c = stand(x, y + 72);
  const H = 160;
  const back = -140;
  const lean = 20; // the back is drawn a little up and across, so you see in
  for (let i = 0; i <= 8; i++) {
    const bx = -w + (i * w * 2) / 8;
    c.moveTo(bx + lean, back).lineTo(bx + lean, back - H).stroke({ width: 4, color: shade(IRON, 0.25) });
  }
  c.moveTo(-w + lean, back - H).lineTo(w + lean, back - H).stroke({ width: 6, color: shade(GOLD, 0.3) });
  for (const sx of [-w, w]) c.moveTo(sx, -H).lineTo(sx + lean, back - H).stroke({ width: 6, color: GOLD });
  for (let i = 0; i <= 8; i++) {
    const bx = -w + (i * w * 2) / 8;
    if (i === 4) continue; // torn out
    // The bars either side of the hole, bent outward.
    const out = i === 3 ? -1 : i === 5 ? 1 : 0;
    const pts = out ? [bx, 0, bx, -H * 0.25, bx + out * 34, -H * 0.55, bx, -H * 0.85, bx, -H] : [bx, 0, bx, -H];
    inkStroke(c, pts, 8, { color: inkOf(IRON), tip: 1 });
    inkStroke(c, pts, 5, { color: IRON, tip: 1 });
    c.moveTo(bx - 1.5, -H + 6).lineTo(bx - 1.5, -6).stroke({ width: 1.2, color: IRON_HI, alpha: 0.6 });
  }
  inkStroke(c, [-w, -H, w, -H], 9, { color: inkOf(GOLD), tip: 1 });
  inkStroke(c, [-w, -H, w, -H], 6, { color: GOLD, tip: 1 });
  inkStroke(c, [-w, -2, w, -2], 8, { color: inkOf(IRON), tip: 1 });
  // Ivy up the corners and a bar or two at the back.
  for (const [vx, vh] of [[-w + 2, H * 0.8], [w - 2, H * 0.55], [-w + w / 2 + lean, H * 0.6]] as const) vine(c, vx, vx === -w + w / 2 + lean ? back : -2, vh, random);
  // A crown plaque on top.
  inked(c, [-22, -H - 4, -24, -H - 32, -12, -H - 20, 0, -H - 38, 12, -H - 20, 24, -H - 32, 22, -H - 4], 0xffe29a, 2);
  // The door, torn half off its hinges, hanging out to the right.
  const door: Pts = [w, -H * 0.2, w + 70, -H * 0.05, w + 82, -H * 0.72, w, -H * 0.85];
  c.poly(door).stroke({ width: 6, color: inkOf(IRON), join: 'round' }).poly(door).stroke({ width: 4, color: IRON, join: 'round' });
  for (let i = 1; i < 4; i++) inkLine(c, w + i * 19, -H * 0.15 + i * 2, w + 3 + i * 20, -H * 0.8 + i * 3, 3, { color: IRON_HI }, 0);
}

/** King Rix's statue, pulled down: the stone king face down in the grass, his crowned head rolled away, his boots still on the plinth. */
function fallenKing(g: Graphics, stand: Stand, x: number, y: number): void {
  // The body face down: the stone cape spread out, arms flung, cracked across the middle.
  g.ellipse(x + 50, y + 16, 150, 70).fill({ color: 0x000000, alpha: 0.25 });
  const body = smooth([x - 40, y - 50, x + 120, y - 70, x + 170, y - 10, x + 140, y + 60, x - 30, y + 55, x - 60, y], true, 1);
  // Where he hit the ground: earth thrown up in a lip round the far side.
  inkStroke(g, [x + 150, y - 80, x + 200, y - 20, x + 180, y + 60], 9, { color: 0x3a2c1c, alpha: 0.7, tip: 0.4 });
  inked(g, body, STONE, 3);
  inkStroke(g, [x + 40, y - 62, x + 55, y - 10, x + 35, y + 55], 4, { color: STONE_DARK });
  for (const side of [-1, 1]) inked(g, smooth([x + 10, y + side * 62 - 12, x + 100, y + side * 58 - 12, x + 100, y + side * 58 + 12, x + 10, y + side * 62 + 12], true, 1), STONE, 2.5);
  inked(g, blob(x + 120, y + 74, 14, 13, 3, 0.1, 12), STONE, 2);
  inkLine(g, x + 120, y + 74, x + 175, y + 96, 7, { color: STONE_DARK, tip: 0.6 }, 0.05); // a broken scepter
  // Moss creeping over it.
  for (const [mx, my, mr] of [[x - 20, y - 30, 22], [x + 100, y + 30, 18], [x + 150, y - 20, 14]]) inked(g, blob(mx, my, mr, mr * 0.7, mx, 0.3, 14), MOSS, 2);
  // The head, rolled off to the side: crown chipped, nose broken.
  inked(g, blob(x + 240, y - 50, 40, 38, 9, 0.06, 24), STONE, 3);
  g.circle(x + 240, y - 50, 31).stroke({ width: 7, color: 0xb0a070 });
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.5;
    if (i === 3) continue; // a point broken off
    inked(g, [x + 240 + Math.cos(a - 0.15) * 34, y - 50 + Math.sin(a - 0.15) * 34, x + 240 + Math.cos(a) * 50, y - 50 + Math.sin(a) * 50, x + 240 + Math.cos(a + 0.15) * 34, y - 50 + Math.sin(a + 0.15) * 34], 0xb0a070, 1.6);
  }
  g.circle(x + 255, y - 40, 5).fill(STONE_DARK);
  const random = rng(17);
  for (const [rx, ry, rr] of [[x + 190, y + 40, 10], [x + 205, y + 10, 7], [x - 50, y + 80, 9], [x + 280, y + 10, 8]]) inked(g, smooth(shard(rx, ry, rr, random, 5, 0.75), true, 1), STONE_DARK, 1.8);
  // Chips of him scattered wide, and the grass already growing over his edges.
  for (let i = 0; i < 16; i++) {
    const a = random() * Math.PI * 2;
    const d = 200 + random() * 180;
    inked(g, smooth(shard(x + 60 + Math.cos(a) * d, y + 20 + Math.sin(a) * d * 0.5, 4 + random() * 5, random, 5, 0.75), true, 1), random() < 0.5 ? STONE : STONE_DARK, 1.5);
  }
  overgrow(g, body, random, 48, 0.55);
  for (const [tx, ty] of [[x - 200, y + 60], [x - 60, y + 66], [x - 130, y + 66]]) tuft(g, tx, ty, 12, random);

  // The plinth stands where he stood, REX cut in its face, his boots snapped off at the ankle on top.
  const p = stand(x - 130, y + 50);
  g.ellipse(x - 110, y + 54, 100, 30).fill({ color: 0x000000, alpha: 0.3 });
  crate(p, 0, 140, 80, 40, STONE);
  inkStroke(p, [-60, -70, -30, -48, -42, -20], 3, { color: STONE_DARK });
  const carve = (pts: Pts) => inkStroke(p, pts, 4.5, { color: STONE_DARK, tip: 0.5 });
  carve([-46, -14, -46, -46, -34, -46, -34, -32, -46, -32, -32, -14]);
  carve([-10, -46, -22, -46, -22, -14, -10, -14]);
  carve([-22, -30, -12, -30]);
  carve([2, -46, 18, -14]);
  carve([18, -46, 2, -14]);
  for (const bx of [-30, 22]) {
    inked(p, smooth([bx - 18, -82, bx - 16, -128, bx + 14, -128, bx + 16, -100, bx + 30, -96, bx + 30, -82], true, 1), STONE, 2.5);
    p.ellipse(bx - 1, -127, 15, 5).fill(STONE_DARK);
  }
  inked(p, blob(46, -84, 16, 10, 4, 0.3, 12), MOSS, 1.8);
  vine(p, 58, -2, 62, random);
  vine(p, -64, -2, 44, random);
}

/** The Warden's pit: four great chains from the walls to the broken shackle where it sleeps. */
function wardenChains(g: Graphics, top: Graphics, x: number, y: number): void {
  const anchors = [
    [x - 510, y - 360],
    [x + 510, y - 360],
    [x - 510, y + 360],
    [x + 510, y + 360],
  ] as const;
  for (const [ax, ay] of anchors) {
    const dx = x - ax;
    const dy = y - ay;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const links = Math.floor((len - 90) / 26);
    for (let i = 0; i < links; i++) {
      const px = ax + ux * (20 + i * 26);
      const py = ay + uy * (20 + i * 26);
      const along = i % 2 === 0;
      const angle = Math.atan2(uy, ux) + (along ? 0 : Math.PI / 2);
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      // Each link an oval, laid along the chain or across it in turn.
      const rx = along ? 17 : 9;
      const pts: number[] = [];
      for (let k = 0; k < 12; k++) {
        const t = (k / 12) * Math.PI * 2;
        const lx = Math.cos(t) * rx;
        const ly = Math.sin(t) * 9;
        pts.push(px + lx * c - ly * s, py + lx * s + ly * c);
      }
      g.poly(pts).stroke({ width: 6, color: 0x1a1d22 }).poly(pts).stroke({ width: 3.5, color: IRON_HI });
    }
    // Bolted into the wall corner: a great iron ring.
    inked(top, blob(ax, ay, 26, 26, Math.round(ax), 0.06, 18), IRON, 3);
    top.circle(ax, ay, 14).stroke({ width: 6, color: inkOf(IRON_HI) }).circle(ax, ay, 14).stroke({ width: 4, color: IRON_HI });
  }
  // The shackle in the middle, burst open.
  const arcPts: Pts = [];
  for (let i = 0; i <= 24; i++) {
    const a = 0.6 + (i / 24) * (Math.PI * 2 - 1.2);
    arcPts.push(x + Math.cos(a) * 70, y + Math.sin(a) * 70);
  }
  inkStroke(g, arcPts, 18, { color: 0x1a1d22, tip: 0.8 });
  inkStroke(g, arcPts, 11, { color: IRON, tip: 0.8 });
  for (const a of [0.6, -0.6]) inked(g, blob(x + Math.cos(a) * 70, y + Math.sin(a) * 70, 10, 10, 2, 0.1, 10), IRON_HI, 2);
}

/** Willmore's way in: a sewer grate in the riverbed, levered open, junk spilling out, a rusty pipe sticking up. */
function sewerMouth(g: Graphics, stand: Stand, x: number, y: number): void {
  g.poly(blob(x, y, 78, 74, 3, 0.05, 30)).fill({ color: 0x0b0f14, alpha: 0.88 });
  inkLoop(g, blob(x, y, 78, 74, 3, 0.05, 30), 11, { color: IRON }, 4);
  // Green sewer glow down the hole.
  g.circle(x, y, 50).fill({ color: 0x6fd6a0, alpha: 0.18 });
  g.circle(x, y, 26).fill({ color: 0x6fd6a0, alpha: 0.2 });
  // The grate itself, propped open at an angle beside the hole.
  const gx = x + 95;
  const gy = y - 40;
  inked(g, blob(gx, gy, 70, 50, 6, 0.04, 26), IRON, 3);
  for (let i = -2; i <= 2; i++) inkLine(g, gx + i * 22, gy - 44 + Math.abs(i) * 6, gx + i * 22, gy + 44 - Math.abs(i) * 6, 4, { color: 0x1a1d22, tip: 1 }, 0);
  // Junk: a trash can lid (like his crown), a cart wheel, a boot, bottles, a fish skeleton.
  inked(g, blob(x - 110, y + 20, 30, 26, 4, 0.05, 20), 0x9aa1ab, 2.5);
  inked(g, smooth([x - 117, y + 13, x - 103, y + 13, x - 103, y + 27, x - 117, y + 27], true, 1), 0x5d636d, 1.5);
  g.circle(x - 70, y + 85, 36).stroke({ width: 9, color: inkOf(0x6b4a2b) }).circle(x - 70, y + 85, 36).stroke({ width: 6, color: 0x6b4a2b });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    inkLine(g, x - 70, y + 85, x - 70 + Math.cos(a) * 34, y + 85 + Math.sin(a) * 34, 3, { color: 0x6b4a2b, tip: 1 }, 0);
  }
  inked(g, smooth([x + 40, y + 60, x + 72, y + 60, x + 86, y + 72, x + 86, y + 82, x + 40, y + 82], true, 1), 0x3a2a1c, 2.5);
  for (const [bx, by, color] of [[x - 30, y - 95, 0x5cff9a], [x + 10, y + 100, 0x6ab8ff], [x - 140, y - 40, 0xc9a85a]] as const) {
    inked(g, smooth([bx - 6, by - 10, bx - 3, by - 16, bx + 3, by - 16, bx + 6, by - 10, bx + 6, by + 14, bx - 6, by + 14], true, 1), mix(color, 0x3a3a3a, 0.2), 1.6);
  }
  inkLine(g, x + 120, y + 40, x + 175, y + 40, 3, { color: 0xe8e0cc }, 0);
  for (let i = 0; i < 4; i++) inkLine(g, x + 128 + i * 12, y + 30, x + 128 + i * 12, y + 50, 2, { color: 0xe8e0cc }, 0.2);
  inked(g, [x + 175, y + 40, x + 190, y + 30, x + 190, y + 50], 0xe8e0cc, 1.5);
  // A rusty pipe standing up out of the water.
  const pipe = stand(x - 150, y - 50);
  drum(pipe, 0, 16, 64, 0x6a4a2a, 0x2a1a10);
  pipe.moveTo(-14, -36).lineTo(14, -32).stroke({ width: 4, color: 0x8a5a2a });
}

/** Master Paris's café: a little round table for two under a striped parasol, chairs either side, a fencing strip beside it. */
function petitCafe(g: Graphics, stand: Stand, x: number, y: number): void {
  const random = rng(303);
  // The terrace's edge: a ring of little stones round the gravel (painted into the ground).
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + random() * 0.1;
    inked(g, smooth(shard(x + Math.cos(a) * 118, y - 4 + Math.sin(a) * 70, 5 + random() * 3, random, 5, 0.75), true, 1), 0xb1a998, 1.4);
  }
  // The piste, chalked on the grass and worn half away: its edges and lines broken, grass through it.
  for (const py of [y + 78, y + 108]) {
    for (let px = x - 150; px < x + 150; px += 26 + random() * 18) inkLine(g, px, py + (random() - 0.5) * 3, px + 16 + random() * 14, py + (random() - 0.5) * 3, 3, { color: 0xe8e0cc, alpha: 0.55 }, 0.05);
  }
  for (const t of [-150, -75, 0, 75, 150]) inkLine(g, x + t, y + 78, x + t, y + 108, 2.5, { color: 0xe8e0cc, alpha: 0.5 }, 0);
  for (let i = 0; i < 7; i++) tuft(g, x - 140 + random() * 280, y + 76 + random() * 36, 9 + random() * 5, random);
  // Leaves off the plane tree, and a napkin that blew away.
  for (let i = 0; i < 14; i++) {
    const lx = x + (random() - 0.5) * 380;
    const ly = y + (random() - 0.5) * 200;
    g.ellipse(lx, ly, 5, 3).fill({ color: [0xc8901a, 0x9a6a2a, 0xd8b04a][i % 3], alpha: 0.85 });
  }
  inked(g, [x + 150, y - 30, x + 166, y - 36, x + 172, y - 20, x + 156, y - 16], 0xf2efe6, 1.2);
  // A planter of red geraniums, and the chalkboard with today's special.
  const planter = stand(x + 130, y - 40);
  inked(planter, [-34, 0, 34, 0, 38, -26, -38, -26], 0x8a5a3a, 2);
  planter.rect(-38, -30, 76, 6).fill(0x6a4228);
  for (let i = 0; i < 6; i++) {
    const fx = -28 + i * 11;
    blade(planter, fx, -28, 14 + (i % 2) * 5, (i - 2.5) * 2, 4, 0x3f6a33);
    planter.circle(fx + (i - 2.5) * 1.5, -44 - (i % 2) * 5, 5).fill(0xd82a3a).stroke({ width: 1.2, color: 0x6a1018 });
  }
  const board = stand(x - 140, y - 20);
  inkLine(board, -18, 0, -10, -56, 3, { color: 0x6a4228, tip: 1 }, 0);
  inkLine(board, 18, 0, 10, -56, 3, { color: 0x6a4228, tip: 1 }, 0);
  inked(board, [-20, -12, 20, -12, 14, -58, -14, -58], 0x24282a, 2, 0x6a4228);
  for (const [ly, lw] of [[-48, 18], [-40, 12], [-32, 16], [-24, 10]] as const) inkLine(board, -lw / 2, ly, lw / 2, ly, 1.6, { color: 0xe8e0cc, alpha: 0.8 }, 0.1);
  g.ellipse(x + 12, y + 6, 70, 20).fill({ color: 0x000000, alpha: 0.25 });
  // Bistro chairs either side, facing in.
  for (const side of [-1, 1]) {
    const c = stand(x + side * 66, y + 2);
    const f = -side;
    for (const lx of [-12, 12]) inkLine(c, lx, 0, lx * 0.8, -26, 3, { color: 0x2a2a30, tip: 1 }, 0);
    inked(c, smooth([-16, -28, 16, -28, 16, -22, -16, -22], true, 1), 0x8a2a2a, 1.8);
    inkLine(c, -14 * f, -26, -18 * f, -66, 3, { color: 0x2a2a30, tip: 1 }, 0.05);
    inked(c, smooth([-18 * f - 4, -66, -14 * f + 4, -66, -14 * f + 4, -46, -18 * f - 4, -46], true, 1), 0x8a2a2a, 1.8);
  }
  // The table, its cups and a croissant, and the parasol over it.
  const t = stand(x, y + 8);
  inkLine(t, 0, 0, 0, -52, 5, { color: 0x2a2a30, tip: 1 }, 0);
  t.moveTo(-18, 0).lineTo(18, 0).stroke({ width: 4, color: 0x2a2a30 });
  t.ellipse(0, -54, 40, 12).fill(0xf2efe6).stroke({ width: 2.5, color: inkOf(0xf2efe6) });
  for (const side of [-1, 1]) {
    inked(t, smooth([side * 18 - 6, -66, side * 18 + 6, -66, side * 18 + 5, -56, side * 18 - 5, -56], true, 1), 0xffffff, 1.5);
    t.ellipse(side * 18, -66, 6, 2).fill(0x5a3a1a);
  }
  inkStroke(t, [-10, -58, 0, -64, 12, -58], 7, { color: 0xd99a4a, tip: 0.5 });
  inkLine(t, 0, -54, 0, -150, 4, { color: 0x3a3a40, tip: 1 }, 0);
  const canopy: Pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI + (i / 16) * Math.PI;
    canopy.push(Math.cos(a) * 92, -150 + Math.sin(a) * 42);
  }
  for (let i = 8; i >= 0; i--) canopy.push(-92 + (i / 8) * 184, -150 + (i % 2 ? 12 : 4));
  inked(t, canopy, 0xf2efe6, 2.5);
  // Red stripes fanning down from the top to the scalloped edge.
  for (let i = 0; i < 8; i += 2) t.poly([0, -191, -92 + i * 23, -148, -92 + (i + 1) * 23, -148]).fill({ color: 0xc0182b, alpha: 0.9 });
  inkLoop(t, canopy, 2.5, { color: inkOf(0xf2efe6), alpha: 0.9 }, 3);
  t.circle(0, -193, 5).fill(0x2a2a30);
}

/** Dongmaster's outdoor gym: a rubber mat, a bench with a loaded bar, a dumbbell rack, chalk everywhere. */
function ironParadise(g: Graphics, stand: Stand, x: number, y: number): void {
  const random = rng(404);
  // Scavenged rubber floor tiles laid on the bare earth: sun-faded, scuffed, one gone missing and one
  // kicked askew, grass growing up between them.
  const tw = 92;
  const th = 88;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      if (row === 0 && col === 2) continue; // missing
      const cx = x - tw + col * tw + (random() - 0.5) * 6;
      const cy = y - th / 2 + row * th + (random() - 0.5) * 6;
      const tilt = row === 1 && col === 0 ? 0.22 : (random() - 0.5) * 0.06;
      const c = Math.cos(tilt);
      const sn = Math.sin(tilt);
      const tile = slab(0, 0, tw - 5, th - 5, row * 3 + col + 1, 2);
      const pts = tile.map((v, i) => (i % 2 ? cy + tile[i - 1] * sn + v * c : cx + v * c - tile[i + 1] * sn));
      inked(g, pts, shade(0x45454a, (random() - 0.5) * 0.2), 2.5, 0x16161a);
      g.poly(blob(cx + (random() - 0.5) * 30, cy + (random() - 0.5) * 20, 26, 16, row * 7 + col, 0.4, 12)).fill({ color: 0x6a6a70, alpha: 0.3 });
      overgrow(g, pts, random, 46, 0.3);
    }
  }
  for (let i = 0; i < 5; i++) tuft(g, x + tw - 30 + random() * 70, y - th + 10 + random() * 70, 10 + random() * 6, random);
  for (const [cx, cy, cr] of [[x - 90, y + 50, 26], [x + 70, y - 50, 20], [x + 20, y + 60, 16], [x - 190, y + 10, 22], [x + 200, y + 40, 18]]) g.poly(blob(cx, cy, cr, cr * 0.6, cx, 0.3, 14)).fill({ color: 0xffffff, alpha: 0.14 }); // chalk
  // A tractor tire lying in the grass for flipping, and a kettlebell left out.
  g.ellipse(x - 200, y - 70, 54, 34).fill({ color: 0x1a1a1e }).stroke({ width: 3, color: 0x0a0a0c });
  g.ellipse(x - 200, y - 72, 26, 15).fill(0x4e3e29).stroke({ width: 2.5, color: 0x0a0a0c });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    inkLine(g, x - 200 + Math.cos(a) * 32, y - 71 + Math.sin(a) * 19, x - 200 + Math.cos(a) * 50, y - 70 + Math.sin(a) * 31, 2, { color: 0x3a3a3e }, 0);
  }
  const kb = stand(x + 190, y - 30);
  inked(kb, blob(0, -14, 15, 14, 9, 0.04, 16), 0x2a2a30, 2);
  kb.poly(smooth([-10, -24, -12, -40, 12, -40, 10, -24], false, 1)).stroke({ width: 5, color: 0x2a2a30 });
  // The bench, and the bar racked over it, loaded heavy.
  const b = stand(x - 30, y + 30);
  for (const lx of [-50, 50]) inkLine(b, lx, 0, lx, -30, 6, { color: 0x4a4f58, tip: 1 }, 0);
  inked(b, smooth([-66, -44, 66, -44, 66, -30, -66, -30], true, 1), 0x8a1a22, 2.5);
  for (const lx of [-40, 40]) inkLine(b, lx, -30, lx, -86, 5, { color: 0x6a707a, tip: 1 }, 0);
  inkLine(b, -96, -84, 96, -84, 5, { color: 0xb8bec6, tip: 1 }, 0);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) inked(b, smooth([side * (64 + i * 9) - 4, -112 + i * 6, side * (64 + i * 9) + 4, -112 + i * 6, side * (64 + i * 9) + 4, -56 - i * 6, side * (64 + i * 9) - 4, -56 - i * 6], true, 1), i === 1 ? 0xffd166 : 0x1a1a1e, 1.8);
  }
  // The dumbbell rack along one side.
  const r = stand(x + 100, y + 70);
  for (const lx of [-20, 20]) inkLine(r, lx, 0, lx, -120, 5, { color: 0x4a4f58, tip: 1 }, 0);
  for (let i = 0; i < 4; i++) {
    const dy = -20 - i * 30;
    inkLine(r, -24, dy, 24, dy, 3, { color: 0x6a707a, tip: 1 }, 0);
    inkLine(r, -12, dy - 7, 12, dy - 7, 3, { color: 0x8a9099, tip: 1 }, 0);
    for (const dx of [-14, 14]) inked(r, blob(dx, dy - 7, 6 + i, 6 + i, i * 3 + dx, 0.05, 12), 0x1a1a1e, 1.5);
  }
  // A protein shaker, left out.
  const s = stand(x - 116, y - 50);
  inked(s, smooth([-9, 0, 9, 0, 10, -26, -10, -26], true, 1), 0xe5484d, 2);
  inked(s, [-7, -26, 7, -26, 4, -34, -4, -34], 0x2a2a30, 1.5);
}

/** Havarti's birthplace: the hatch to the royal cellar thrown open, stairs into the dark, wheels of cheese and candles. */
function royalCellar(g: Graphics, stand: Stand, x: number, y: number): void {
  const random = rng(505);
  // Old stones round the hatch, set in the mound of earth, the grass creeping in.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    inked(g, smooth(shard(x + Math.cos(a) * 82, y + Math.sin(a) * 62, 13 + random() * 5, random, 6, 0.8), true, 1), i % 3 ? STONE : STONE_DARK, 1.8);
  }
  overgrow(g, shapeOutline({ type: 'circle', x, y, r: 100 }, 16, 0), random, 44, 0.6);
  // The hatch: the opening dark, stairs going down, its door flung back on the grass.
  inked(g, slab(x, y, 120, 90, 7, 3), 0x120c08, 3);
  for (let i = 0; i < 4; i++) g.rect(x - 52 + i * 6, y - 38 + i * 18, 104 - i * 12, 10).fill({ color: 0x5a4632, alpha: 0.9 - i * 0.2 });
  inked(g, slab(x, y - 82, 120, 66, 8, 3), 0x6b4a2b, 2.5);
  for (const dx of [-30, 0, 30]) inkLine(g, x + dx, y - 112, x + dx, y - 52, 2, { color: 0x3d2c1a }, 0);
  g.circle(x, y - 82, 7).stroke({ width: 4, color: inkOf(IRON_HI) }).circle(x, y - 82, 7).stroke({ width: 2.5, color: IRON_HI });
  // Wheels of cheese stacked up beside it, candles burning on the tops.
  const wheel = (s: Graphics, dx: number, h0: number) => {
    const r = 28;
    const pts: Pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI - (i / 10) * Math.PI;
      pts.push(dx + Math.cos(a) * r, h0 - 22 + Math.sin(a) * r * 0.35);
    }
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI;
      pts.push(dx + Math.cos(a) * r, h0 + Math.sin(a) * r * 0.35);
    }
    inked(s, pts, 0xd9a52b, 2.2);
    s.ellipse(dx, h0 - 22, r, r * 0.35).fill(0xf3dc8a).stroke({ width: 1.8, color: inkOf(0xd9a52b) });
    s.ellipse(dx - 8, h0 - 22, 4, 1.6).fill(0xd8b860);
  };
  const candle = (s: Graphics, dx: number, h0: number) => {
    inked(s, [dx - 4, h0, dx + 4, h0, dx + 4, h0 - 22, dx - 4, h0 - 22], 0xfff6dc, 1.5);
    s.ellipse(dx, h0 - 28, 4, 7).fill(0xffd166);
    s.ellipse(dx, h0 - 27, 2, 3.5).fill(0xfff6dc);
  };
  const stackA = stand(x + 105, y + 40);
  wheel(stackA, 0, 0);
  wheel(stackA, 0, -22);
  candle(stackA, 0, -44);
  const stackB = stand(x + 150, y + 64);
  wheel(stackB, 0, 0);
  const stackC = stand(x - 100, y + 52);
  wheel(stackC, 0, 0);
  candle(stackC, 4, -22);
  for (const [cx, cy] of [[x - 75, y - 60], [x + 70, y - 60]]) candle(stand(cx, cy), 0, 0);
  // Rind and crumbs trodden out along the path, and wax dripped in the grass.
  for (let i = 0; i < 14; i++) {
    const d = 140 + random() * 200;
    const a = Math.PI * 0.6 + (random() - 0.5) * 1.2;
    g.ellipse(x + Math.cos(a) * d, y - Math.sin(a) * d * 0.7, 4 + random() * 3, 3).fill({ color: random() < 0.5 ? 0xf3dc8a : 0xd9a52b, alpha: 0.85 });
  }
}

/** The Dark Dabber's den: crates and barrels in a ring, an old mattress, a lantern, and a haze that never lifts. */
function ratDen(g: Graphics, top: Graphics, stand: Stand, x: number, y: number): void {
  const random = rng(606);
  inked(g, slab(x, y, 100, 60, 9, 4), 0x6a5a4a, 2.5); // the mattress
  overgrow(g, slab(x, y, 100, 60, 9, 4), random, 36, 0.4);
  // An old fire ring off to one side, black with ash, stones round it.
  g.poly(blob(x - 205, y + 30, 46, 32, 7, 0.2, 16)).fill({ color: 0x1a1612, alpha: 0.75 });
  g.poly(blob(x - 205, y + 30, 24, 16, 8, 0.3, 12)).fill({ color: 0x5a5650, alpha: 0.6 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    inked(g, smooth(shard(x - 205 + Math.cos(a) * 50, y + 30 + Math.sin(a) * 34, 9 + random() * 4, random, 5, 0.8), true, 1), STONE_DARK, 1.6);
  }
  // Litter blown out into the grass: husks, crushed cans, papers.
  for (let i = 0; i < 26; i++) {
    const a = random() * Math.PI * 2;
    const d = 150 + random() * 120;
    const lx = x + Math.cos(a) * d;
    const ly = y + Math.sin(a) * d * 0.7;
    if (i % 3 === 0) inked(g, [lx - 5, ly - 3, lx + 6, ly - 4, lx + 5, ly + 3, lx - 6, ly + 3], 0x9aa1ab, 1.2);
    else if (i % 3 === 1) inked(g, [lx - 6, ly - 4, lx + 6, ly - 5, lx + 7, ly + 4, lx - 5, ly + 5], 0xe8e0cc, 1);
    else g.ellipse(lx, ly, 3, 2).fill(0x3a2a1a);
  }
  for (const [sx, sy] of [[x - 30, y - 10], [x + 15, y + 8]]) g.poly(blob(sx, sy, 10, 7, sx, 0.3, 10)).fill({ color: 0x4a3a2a, alpha: 0.8 }); // stains
  for (let i = 0; i < 18; i++) g.ellipse(x - 90 + ((i * 37) % 180), y + 50 + ((i * 23) % 30), 3, 2).fill(0x3a2a1a); // seed husks
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const bx = x + Math.cos(a) * 115;
    const by = y + Math.sin(a) * 85;
    const s = stand(bx, by + 20);
    if (i % 2) {
      drum(s, 0, 22, 48, 0x5a3a1a);
      for (const k of [14, 34]) s.moveTo(-22, -k).lineTo(22, -k).stroke({ width: 3, color: 0x2a1a0a });
    } else crate(s, 0, 46, 40, 18, WOOD);
    if (i === 0) {
      // The lantern on top of a crate.
      inked(s, smooth([-8, -40, 8, -40, 8, -62, -8, -62], true, 1), 0x2a2018, 1.6);
      s.roundRect(-5, -58, 10, 14, 2).fill(0xb8f07a);
    }
  }
  // The haze, in soft green puffs over it all.
  for (const [hx, hy, hr] of [[x - 40, y - 60, 50], [x + 30, y - 40, 60], [x - 10, y + 10, 45], [x + 70, y + 20, 40]]) top.poly(blob(hx, hy, hr, hr * 0.7, hx, 0.25, 16)).fill({ color: 0xc8e6a0, alpha: 0.13 });
}

/** HunnaG's rot: a purple bloom on the water, a fairy ring of toadstools, bubbles. */
function rotBloom(g: Graphics, stand: Stand, x: number, y: number): void {
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996;
    const r = 30 + Math.sqrt(i) * 38;
    g.poly(blob(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.75, 46 - i * 1.5, (46 - i * 1.5) * 0.8, i, 0.25, 16)).fill({ color: i % 2 ? 0x5a2a6a : 0x3d5a24, alpha: 0.45 });
  }
  for (const [bx, by, br] of [[x - 30, y - 20, 9], [x + 25, y + 15, 6], [x + 5, y - 45, 7], [x - 50, y + 35, 5], [x + 55, y - 30, 8]]) g.circle(bx, by, br).stroke({ width: 2.5, color: 0xb8f07a, alpha: 0.7 });
  // The ring of toadstools, and one big one in the middle.
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const big = i % 3 === 0;
    const s = stand(x + Math.cos(a) * 130, y + Math.sin(a) * 95);
    toadstool(s, 0, big ? 30 : 20, big ? 24 : 16, i % 2 ? 0x7a3fb0 : 0x9a4fd0, i);
  }
  toadstool(stand(x, y + 6), 0, 52, 44, 0x7a3fb0, 99);
}
