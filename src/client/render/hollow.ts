import { Container, Graphics, Text } from 'pixi.js';
import type { MapData } from '../../shared/map/mapData';
import { shapeContains } from '../../shared/map/shapes';
import type { Landmarks } from './landmarks';
import { blob, inkLine, inkStroke, inked, rng, shade, smooth, type Pts } from './organic';
import type { FlickerLight } from './props';

// The Howling Hollow's decor, for ARAM on Halloween night: crooked gravestones lining the lane, carved
// jack-o'-lanterns grinning (and lighting the dark), an iron fence round the graveyard plaza in the middle,
// gnarled dead trees in the alcoves, a scarecrow, and a faint name cut into the ground. Same inked style as
// everything else; standing pieces are sorted in with the units, like the Rift's landmarks.

const STONE = 0x7a7684;
const STONE_DARK = 0x4e4a58;
const MOSS = 0x4a5a3a;
const IRON = 0x2a2a34;
const PUMPKIN = 0xe8771f;
const PUMPKIN_DARK = 0xa84a10;
const BARK = 0x3a2e2a;

/** A crooked gravestone, standing on (0, 0). */
function gravestone(g: Graphics, random: () => number): void {
  const w = 22 + random() * 14;
  const h = 34 + random() * 22;
  const tilt = (random() - 0.5) * 0.35;
  g.rotation = tilt;
  g.ellipse(4, 2, w * 0.8, w * 0.25).fill({ color: 0x000000, alpha: 0.3 });
  const kind = random();
  const top: Pts =
    kind < 0.5
      ? smooth([-w / 2, 0, -w / 2, -h + w / 2, -w * 0.3, -h, w * 0.3, -h, w / 2, -h + w / 2, w / 2, 0], true, 1) // rounded slab
      : kind < 0.8
        ? [-w / 2, 0, -w / 2, -h * 0.75, 0, -h, w / 2, -h * 0.75, w / 2, 0] // pointed
        : [-w * 0.15, 0, -w * 0.15, -h * 0.65, -w / 2, -h * 0.65, -w / 2, -h * 0.8, -w * 0.15, -h * 0.8, -w * 0.15, -h, w * 0.15, -h, w * 0.15, -h * 0.8, w / 2, -h * 0.8, w / 2, -h * 0.65, w * 0.15, -h * 0.65, w * 0.15, 0]; // a cross
  inked(g, top, kind < 0.8 ? STONE : STONE_DARK, 2.5, 0x16141c);
  g.poly(top.map((v, i) => (i % 2 ? v : v + w * 0.12))).fill({ color: 0x000000, alpha: 0.15 });
  if (kind < 0.8) {
    // "RIP", scratched, and a crack or moss.
    inkLine(g, -w * 0.25, -h * 0.62, w * 0.25, -h * 0.62, 1.6, { color: 0x2a2632, alpha: 0.7 }, 0);
    inkLine(g, -w * 0.18, -h * 0.48, w * 0.2, -h * 0.48, 1.4, { color: 0x2a2632, alpha: 0.6 }, 0);
    if (random() < 0.5) inkStroke(g, [w * 0.1, -h * 0.9, w * 0.02, -h * 0.7, w * 0.14, -h * 0.55], 1.5, { color: 0x16141c, alpha: 0.8 });
  }
  if (random() < 0.6) g.poly(blob(-w * 0.2, -2, w * 0.35, 5, Math.floor(random() * 99), 0.3, 8)).fill({ color: MOSS, alpha: 0.85 });
}

/** A carved jack-o'-lantern on (0, 0), grinning. */
export function jackOLantern(g: Graphics, size: number): void {
  const r = size;
  g.ellipse(3, 2, r * 1.1, r * 0.35).fill({ color: 0x000000, alpha: 0.35 });
  for (const [dx, k] of [[-0.45, 0.62], [0.45, 0.62], [0, 0.78]] as const) inked(g, blob(dx * r, -r * 0.8, r * k, r * 0.78, Math.round(dx * 10) + 5, 0.06, 16), dx === 0 ? PUMPKIN : shade(PUMPKIN, -0.1), 2.5, 0x2a1406);
  inked(g, [-r * 0.08, -r * 1.55, r * 0.1, -r * 1.75, r * 0.2, -r * 1.68, r * 0.06, -r * 1.5], 0x4a5a2a, 2, 0x16200a);
  // The carved face, lit from inside.
  const lit = 0xffd27a;
  g.poly([-r * 0.45, -r * 0.95, -r * 0.2, -r * 0.95, -r * 0.32, -r * 1.2]).fill(lit).stroke({ width: 1.5, color: PUMPKIN_DARK });
  g.poly([r * 0.2, -r * 0.95, r * 0.45, -r * 0.95, r * 0.32, -r * 1.2]).fill(lit).stroke({ width: 1.5, color: PUMPKIN_DARK });
  g.poly([-r * 0.5, -r * 0.6, -r * 0.3, -r * 0.45, -r * 0.15, -r * 0.6, 0, -r * 0.45, r * 0.15, -r * 0.6, r * 0.3, -r * 0.45, r * 0.5, -r * 0.6, r * 0.3, -r * 0.3, -r * 0.3, -r * 0.3]).fill(lit).stroke({ width: 1.5, color: PUMPKIN_DARK });
}

/** A gnarled dead tree, roots on (0, 0). */
function deadTree(g: Graphics, random: () => number, scale: number): void {
  const s = scale;
  g.ellipse(8 * s, 4 * s, 70 * s, 18 * s).fill({ color: 0x000000, alpha: 0.3 });
  inked(g, smooth([-26 * s, 0, -12 * s, -20 * s, -14 * s, -120 * s, -4 * s, -150 * s, 10 * s, -118 * s, 12 * s, -18 * s, 30 * s, 0], true, 2), BARK, 3, 0x0e0a0a);
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    inkStroke(g, [x, y, (x + ex) / 2 + Math.cos(a + 1.4) * len * 0.15, (y + ey) / 2 + Math.sin(a + 1.4) * len * 0.15, ex, ey], w, { color: BARK, tip: 0.3 });
    if (depth > 0) {
      branch(ex, ey, a - 0.5 - random() * 0.3, len * 0.62, w * 0.65, depth - 1);
      branch(ex, ey, a + 0.45 + random() * 0.3, len * 0.58, w * 0.65, depth - 1);
    }
  };
  branch(-6 * s, -130 * s, -2.2, 60 * s, 9 * s, 2);
  branch(0, -140 * s, -1.4, 70 * s, 9 * s, 2);
  branch(4 * s, -120 * s, -0.7, 55 * s, 8 * s, 2);
  // A knot hole, and a crow's nest of twigs.
  g.ellipse(-2 * s, -80 * s, 5 * s, 8 * s).fill(0x0a0606);
}

/** A stretch of iron fence from (ax, ay) to (bx, by), drawn in its own piece (its feet at the midpoint). */
function fence(g: Graphics, ax: number, ay: number, bx: number, by: number): void {
  const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 26));
  for (let i = 0; i <= n; i++) {
    const x = ax + ((bx - ax) * i) / n;
    const y = ay + ((by - ay) * i) / n;
    inkLine(g, x, y, x, y - 46, 3, { color: IRON }, 0);
    g.poly([x - 4, y - 46, x, y - 56, x + 4, y - 46]).fill(IRON);
  }
  for (const h of [12, 38]) inkLine(g, ax, ay - h, bx, by - h, 3, { color: IRON }, 0);
}

/** A scarecrow with a pumpkin head, on (0, 0). */
function scarecrow(g: Graphics): void {
  const WOOD = 0x6a4a2a;
  const COAT = 0x4a3a5e;
  const STRAW = 0xd8b050;
  g.ellipse(4, 2, 34, 9).fill({ color: 0x000000, alpha: 0.35 });
  // The post and the crossbar.
  inked(g, [-4, 0, -3, -112, 3, -112, 4, 0], WOOD, 2, 0x1a1008);
  inked(g, [-58, -86, 58, -90, 58, -83, -58, -79], WOOD, 2, 0x1a1008);
  // Straw sticking out of the cuffs and the hem.
  for (const [x, y, dx] of [[-58, -82, -1], [58, -86, 1]] as const) {
    for (let k = 0; k < 4; k++) inkLine(g, x, y, x + dx * (10 + k * 3), y + (k - 1.5) * 6, 2, { color: STRAW }, 0.1);
  }
  for (let k = 0; k < 6; k++) inkLine(g, -14 + k * 6, -34, -16 + k * 7, -22 + (k % 2) * 5, 2, { color: STRAW }, 0.1);
  // A ragged coat hung on the crossbar: sleeves along it, the body down the post, a torn hem.
  inked(g, [-56, -92, -18, -96, 18, -96, 56, -94, 56, -78, 20, -78, 22, -36, 14, -30, 8, -38, 0, -28, -8, -36, -14, -28, -22, -38, -20, -78, -56, -76], COAT, 2.5, 0x140c1a);
  g.poly([-56, -92, -18, -96, -20, -78, -56, -76]).fill({ color: 0x000000, alpha: 0.15 });
  // Patches, and a rope belt.
  g.rect(6, -70, 10, 9).fill(0x8a6a3a).stroke({ width: 1.5, color: 0x140c1a });
  g.rect(-44, -90, 9, 8).fill(0x6a8a5a).stroke({ width: 1.5, color: 0x140c1a });
  inkLine(g, -21, -52, 21, -54, 3, { color: 0xb8904a }, 0.05);
  // The pumpkin head, and a battered witch's hat.
  const head = new Graphics();
  jackOLantern(head, 15);
  head.position.set(0, -96);
  g.addChild(head);
  const hat = new Graphics();
  hat.position.set(0, -122);
  hat.rotation = -0.12;
  hat.ellipse(0, 0, 26, 6).fill(0x1e1626).stroke({ width: 2, color: 0x050308 });
  inked(hat, [-14, -2, 14, -2, 6, -24, 16, -38, 0, -30, -8, -20], 0x1e1626, 2, 0x050308);
  hat.rect(-14, -7, 28, 5).fill(0x6a3fa0);
  g.addChild(hat);
}

const PERCHES = new WeakMap<MapData, { x: number; y: number }[]>();

/** The tops of the Hollow's gravestones, once its decor is built (where crows can sit). */
export function hollowPerches(map: MapData): readonly { x: number; y: number }[] {
  return PERCHES.get(map) ?? [];
}

/** The Hollow's decor, in the Rift's landmarks' shape (flat, tall, standing, lights). */
export function buildHollow(map: MapData): Landmarks {
  const flat = new Container();
  const ground = new Graphics();
  const tall = new Graphics();
  const standing: Container[] = [];
  const lights: FlickerLight[] = [];
  flat.addChild(ground);
  const random = rng(1031);
  const Y = map.height / 2;
  const onGround = (x: number, y: number) => map.ground.some((p) => shapeContains(p.shape, x, y));
  const blocked = (x: number, y: number) => map.blockers.some((b) => shapeContains(b, x, y));
  const stand = (x: number, y: number) => {
    const g = new Graphics();
    g.position.set(x, y);
    g.zIndex = y;
    standing.push(g);
    return g;
  };
  // Gravestones are where the crows sit (see critters.ts).
  const perches: { x: number; y: number }[] = [];
  PERCHES.set(map, perches);
  const perch = (x: number, y: number) => {
    perches.push({ x, y: y - 40 });
    return stand(x, y);
  };

  // Gravestones along both edges of the lane, just off the walkable ground, crooked and in little rows.
  for (let x = 1500; x < map.width - 1500; x += 120 + random() * 160) {
    for (const side of [-1, 1]) {
      if (random() < 0.35) continue;
      for (let tries = 0; tries < 6; tries++) {
        const y = Y + side * (600 + random() * 260);
        if (onGround(x, y) || blocked(x, y)) continue;
        gravestone(perch(x, y), random);
        break;
      }
    }
  }
  // A crooked row along each edge of the lane itself, inside it, where the camera sees them: clear of the
  // structures and the pumpkins.
  const clearOf = (x: number, y: number, d: number) =>
    map.structures.every((st) => Math.hypot(st.pos.x - x, st.pos.y - y) > d) && (map.relics ?? []).every((r) => Math.hypot(r.x - x, r.y - y) > d);
  for (let x = 1650; x < map.width - 1650; x += 70 + random() * 110) {
    for (const side of [-1, 1]) {
      if (random() < 0.3) continue;
      const y = Y + side * (440 + random() * 90);
      if (blocked(x, y) || !clearOf(x, y, 230)) continue;
      gravestone(perch(x, y), random);
    }
  }
  // Underfoot: old grave slabs sunk into the lane, fallen leaves, and candles left burning on the graves.
  const cx = map.width / 2;
  for (let i = 0; i < 44; i++) {
    const x = 1500 + random() * (map.width - 3000);
    const y = Y + (random() - 0.5) * 760;
    if (!clearOf(x, y, 160) || Math.abs(x - cx) < 520) continue;
    const w = 40 + random() * 26;
    const h = 70 + random() * 30;
    const a = (random() - 0.5) * 0.5;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    const corner = (dx: number, dy: number) => [x + dx * c - dy * sn, y + dx * sn + dy * c];
    const slab = [...corner(-w / 2, -h / 2), ...corner(w / 2, -h / 2), ...corner(w / 2, h / 2), ...corner(-w / 2, h / 2)];
    ground.poly(slab).fill({ color: STONE_DARK, alpha: 0.35 }).stroke({ width: 2, color: 0x16141c, alpha: 0.35 });
    ground.poly(slab.map((v, k) => v + (k % 2 ? 3 : -3))).stroke({ width: 1.5, color: STONE, alpha: 0.25 });
    if (random() < 0.5) inkLine(ground, ...(corner(-w * 0.2, -h * 0.3) as [number, number]), ...(corner(w * 0.15, h * 0.1) as [number, number]), 1.5, { color: 0x16141c, alpha: 0.6 }, 0.1);
  }
  for (let i = 0; i < 700; i++) {
    const x = 1300 + random() * (map.width - 2600);
    const y = Y + (random() - 0.5) * 1300;
    if (!onGround(x, y)) continue;
    const r = 4 + random() * 4;
    const a = random() * Math.PI * 2;
    const leaf = [x + Math.cos(a) * r, y + Math.sin(a) * r, x + Math.cos(a + 1.9) * r * 0.5, y + Math.sin(a + 1.9) * r * 0.5, x - Math.cos(a) * r, y - Math.sin(a) * r, x + Math.cos(a - 1.9) * r * 0.5, y + Math.sin(a - 1.9) * r * 0.5];
    ground.poly(leaf).fill({ color: [0xc8601a, 0x8a3a10, 0xd89a2a, 0x6a2a1a][Math.floor(random() * 4)], alpha: 0.75 });
  }
  for (let i = 0; i < 14; i++) {
    const x = 1700 + random() * (map.width - 3400);
    const y = Y + (random() < 0.5 ? -1 : 1) * (380 + random() * 120);
    if (blocked(x, y) || !clearOf(x, y, 200)) continue;
    const g = stand(x, y);
    for (let k = 0; k < 3; k++) {
      const cx2 = (k - 1) * 9 + (random() - 0.5) * 4;
      const h = 10 + random() * 10;
      g.rect(cx2 - 2.5, -h, 5, h).fill(0xeee2c8).stroke({ width: 1, color: 0x3a3028 });
      g.ellipse(cx2, -h - 4, 2.5, 4.5).fill(0xffd27a);
    }
    lights.push({ x, y: y - 12, r: 110, color: 0xffb04a, alpha: 0.45, base: 0.45, flicker: 0.45, phase: i * 3, speed: 9 });
  }

  // The heart of the graveyard: an old cobbled round with a moon set into it in pale stone, ringed by
  // standing candles.
  for (let i = 0; i < 260; i++) {
    const a = random() * Math.PI * 2;
    const d = Math.sqrt(random()) * 300;
    const x = cx + Math.cos(a) * d;
    const y = Y + Math.sin(a) * d * 0.9;
    ground.poly(blob(x, y, 11 + random() * 6, 9 + random() * 5, i, 0.25, 7)).fill({ color: shade(STONE, (random() - 0.5) * 0.3), alpha: 0.5 }).stroke({ width: 1.5, color: 0x16141c, alpha: 0.4 });
  }
  ground.ellipse(cx, Y, 310, 280).stroke({ width: 6, color: STONE_DARK, alpha: 0.7 });
  ground.ellipse(cx, Y, 322, 292).stroke({ width: 2, color: 0x16141c, alpha: 0.5 });
  // The moon: a pale crescent, and stars round it.
  ground.circle(cx, Y, 110).fill({ color: 0xe8e2f4, alpha: 0.35 });
  ground.circle(cx + 42, Y - 26, 96).fill({ color: 0x2a2434, alpha: 0.45 });
  ground.circle(cx, Y, 110).stroke({ width: 3, color: 0x16141c, alpha: 0.35 });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const sx = cx + Math.cos(a) * 200;
    const sy = Y + Math.sin(a) * 180;
    const pts: number[] = [];
    for (let k = 0; k < 10; k++) {
      const r = k % 2 ? 6 : 15;
      const b = (k / 10) * Math.PI * 2 - Math.PI / 2;
      pts.push(sx + Math.cos(b) * r, sy + Math.sin(b) * r);
    }
    ground.poly(pts).fill({ color: 0xe8e2f4, alpha: 0.3 });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = cx + Math.cos(a) * 330;
    const y = Y + Math.sin(a) * 300;
    const g = stand(x, y);
    g.rect(-4, -26, 8, 26).fill(0xeee2c8).stroke({ width: 1.5, color: 0x3a3028 });
    g.ellipse(0, -31, 3.5, 6).fill(0xffd27a);
    g.ellipse(0, 0, 9, 3).fill({ color: 0xeee2c8, alpha: 0.6 }); // a puddle of wax
  }

  // A few graves inside the plaza's edge, where the fighting is.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const x = cx + Math.cos(a) * 690;
    const y = Y + Math.sin(a) * 690;
    if (Math.abs(Math.sin(a)) < 0.45) continue; // keep the lane through the plaza clear
    if (!blocked(x, y)) gravestone(perch(x, y), random);
  }

  // Jack-o'-lanterns off the lane's edges, every so often, alternating sides; they light the dark orange.
  let side = 1;
  for (let x = 1700; x < map.width - 1700; x += 520) {
    side = -side;
    const y = Y + side * 500;
    if (!clearOf(x, y, 200)) continue;
    if (blocked(x, y)) continue;
    jackOLantern(stand(x, y), 20 + random() * 6);
    lights.push({ x, y: y - 20, r: 300, color: 0xff9a3a, alpha: 0.55, base: 0.55, flicker: 0.3, phase: x, speed: 5 + random() * 4 });
  }

  // An iron fence round the graveyard plaza, broken where the lane runs through.
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2;
    const a1 = ((i + 0.8) / 16) * Math.PI * 2;
    if (Math.abs(Math.sin((a0 + a1) / 2)) < 0.5) continue;
    const ax = cx + Math.cos(a0) * 780;
    const ay = Y + Math.sin(a0) * 780;
    const bx = cx + Math.cos(a1) * 780;
    const by = Y + Math.sin(a1) * 780;
    const g = stand((ax + bx) / 2, (ay + by) / 2);
    fence(g, ax - g.x, ay - g.y, bx - g.x, by - g.y);
  }

  // Dead trees at the backs of the alcoves, and a scarecrow keeping watch on each side.
  for (const piece of map.ground) {
    if (piece.style !== 'jungle' || piece.shape.type !== 'circle' || piece.shape.r > 500) continue;
    const { x, y, r } = piece.shape;
    const back = y < Y ? y - r * 0.85 : y + r * 0.85;
    deadTree(stand(x + (random() - 0.5) * 80, back), random, 0.9 + random() * 0.3);
  }
  for (const x of [2700, map.width - 2700]) {
    scarecrow(stand(x, Y - 640));
    lights.push({ x, y: Y - 700, r: 220, color: 0xffa040, alpha: 0.4, base: 0.4, flicker: 0.35, phase: x, speed: 6 });
  }

  // Ghost lights drifting over the plaza, and moonlight on it.
  lights.push({ x: cx, y: Y, r: 700, color: 0xb8c8ff, alpha: 0.35, base: 0.35, flicker: 0.08, phase: 1, speed: 0.4 });
  for (const [dx, dy] of [[-320, -260], [300, 240], [60, -380]]) lights.push({ x: cx + dx, y: Y + dy, r: 160, color: 0x8fffc8, alpha: 0.45, base: 0.45, flicker: 0.5, phase: dx, speed: 1.2 });

  const t = new Text({ text: 'THE HOWLING HOLLOW', style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 54, fill: 0xffffff, letterSpacing: 8 } });
  t.alpha = 0.07;
  t.anchor.set(0.5);
  t.position.set(cx, Y + 430);
  flat.addChild(t);
  return { flat, tall, standing, lights };
}
