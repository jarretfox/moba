import { Container, Graphics, Text } from 'pixi.js';
import type { MapData } from '../../shared/map/mapData';
import { arc } from './draw';
import type { FlickerLight } from './props';

// Story landmarks: places on the map that tell the champions' tale. Logan's royal cage stands broken open
// on blue's side of the jungle, and the statue of King Rix lies toppled on red's. Great chains run from the
// walls of the Warden's pit to the broken shackle in its middle. Willmore's sewer spills junk into the top
// of the river, and HunnaG's rot blooms at the bottom. A faint name is cut into the ground by each.
//
// Flat parts lie on the ground (above the water, under everyone); tall parts go on the raised layer with
// the wall tops, so they stand up as the camera moves.

const INK = { width: 2.5, color: 0x0b0f14 };
const IRON = 0x3a3f48;
const IRON_HI = 0x6b7380;
const GOLD = 0xc9a23a;
const STONE = 0x8a857a;
const STONE_DARK = 0x5e5a52;
const MOSS = 0x4f6b34;
const WHITE_CUP = 0xffffff;

export interface Landmarks {
  /** On the ground, above the water. */
  flat: Container;
  /** Raised with the wall tops. */
  tall: Graphics;
  /** Glows for the light map. */
  lights: FlickerLight[];
}

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
  const flat = new Container();
  const ground = new Graphics();
  const tall = new Graphics();
  flat.addChild(ground);
  const at = landmarkSpots(map);
  const label = (text: string, x: number, y: number) => {
    const t = new Text({ text, style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 34, fill: 0xffffff, letterSpacing: 5 } });
    t.alpha = 0.09;
    t.anchor.set(0.5);
    t.position.set(x, y);
    flat.addChild(t);
  };

  royalCage(ground, tall, at.cage.x, at.cage.y);
  label('THE ROYAL CAGE', at.cage.x, at.cage.y + 175);
  fallenKing(ground, tall, at.statue.x, at.statue.y);
  label('THE FALLEN KING', at.statue.x, at.statue.y + 185);
  wardenChains(ground, tall, at.pit.x, at.pit.y);
  sewerMouth(ground, tall, at.sewer.x, at.sewer.y);
  label('THE DEEP', at.sewer.x, at.sewer.y - 160);
  rotBloom(ground, tall, at.rot.x, at.rot.y);
  label('THE ROT', at.rot.x, at.rot.y + 160);
  petitCafe(ground, tall, at.cafe.x, at.cafe.y);
  label('LE PETIT CAFÉ', at.cafe.x, at.cafe.y + 140);
  ironParadise(ground, tall, at.gym.x, at.gym.y);
  label('IRON PARADISE', at.gym.x, at.gym.y + 140);
  royalCellar(ground, tall, at.cellar.x, at.cellar.y);
  label('THE ROYAL CELLAR', at.cellar.x, at.cellar.y + 140);
  ratDen(ground, tall, at.den.x, at.den.y);
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
  return { flat, tall, lights };
}

/** Logan's cage: the king's gilded iron, roof bars bent out where he burst through, the door hanging off. */
function royalCage(g: Graphics, top: Graphics, x: number, y: number): void {
  const w = 130;
  const h = 95;
  g.ellipse(x + 14, y + 18, w + 20, h + 14).fill({ color: 0x000000, alpha: 0.3 });
  g.roundRect(x - w, y - h, w * 2, h * 2, 10).fill(STONE_DARK).stroke(INK); // the floor slab
  for (const [x0, y0, x1, y1] of [[-90, -60, -30, -20], [20, 40, 80, 70], [-40, 50, 10, 20]]) g.moveTo(x + x0, y + y0).lineTo(x + x1, y + y1).stroke({ width: 2, color: 0x3a3630 });
  // Old straw, and the claw marks he left on the way out.
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4;
    const sx = x + Math.cos(a * 1.7) * (40 + (i * 13) % 70);
    const sy = y + Math.sin(a) * (30 + (i * 7) % 50);
    g.moveTo(sx, sy).lineTo(sx + Math.cos(a) * 16, sy + Math.sin(a) * 16).stroke({ width: 2, color: 0xc9a85a, alpha: 0.7 });
  }
  for (let i = 0; i < 3; i++) {
    g.moveTo(x + 150 + i * 14, y - 40).quadraticCurveTo(x + 185 + i * 14, y, x + 160 + i * 14, y + 45).stroke({ width: 3, color: 0xd8d0c0, alpha: 0.5 });
  }
  // The broken chain trailing out of the door, and the collar's snapped lock.
  for (let i = 0; i < 6; i++) g.ellipse(x + 95 + i * 22, y + 30 + Math.sin(i) * 8, 9, 5).stroke({ width: 3, color: IRON_HI });
  g.roundRect(x + 232, y + 22, 16, 18, 3).fill(GOLD).stroke({ width: 1.5, color: INK.color });

  // Up on the raised layer: the bars of the roof, bent out in the middle, gilded frame, a crown plaque.
  top.roundRect(x - w, y - h, w * 2, h * 2, 10).stroke({ width: 8, color: IRON }).stroke({ width: 3, color: GOLD });
  for (let i = 1; i < 7; i++) {
    const by = y - h + (i * h * 2) / 7;
    const bent = i === 3 || i === 4;
    if (bent) {
      // Bars wrenched apart into a hole.
      const out = i === 3 ? -1 : 1;
      top.moveTo(x - w, by).lineTo(x - 30, by).quadraticCurveTo(x, by + out * 70, x + 30, by).lineTo(x + w, by).stroke({ width: 4, color: IRON });
    } else top.moveTo(x - w, by).lineTo(x + w, by).stroke({ width: 4, color: IRON });
  }
  top.circle(x - w + 30, y - h + 22, 14).fill(GOLD).stroke({ width: 2, color: 0x6b4f16 });
  top.poly([x - w + 21, y - h + 26, x - w + 23, y - h + 16, x - w + 27, y - h + 21, x - w + 30, y - h + 14, x - w + 33, y - h + 21, x - w + 37, y - h + 16, x - w + 39, y - h + 26]).fill(0xffe29a);
  // The door, torn half off its hinges and hanging out to the right.
  top.moveTo(x + w, y - 40).lineTo(x + w + 80, y - 75).lineTo(x + w + 92, y + 5).lineTo(x + w, y + 30).stroke({ width: 6, color: IRON });
  for (let i = 1; i < 4; i++) top.moveTo(x + w + i * 22, y - 40 - i * 9).lineTo(x + w + 3 + i * 23, y + 30 - i * 6).stroke({ width: 3, color: IRON_HI });
}

/** King Rix's statue, pulled down: the stone king face down on the grass, his crowned head rolled away. */
function fallenKing(g: Graphics, top: Graphics, x: number, y: number): void {
  // The plinth, cracked, with REX cut into it.
  g.ellipse(x - 120, y + 10, 100, 80).fill({ color: 0x000000, alpha: 0.25 });
  g.roundRect(x - 200, y - 70, 140, 140, 8).fill(STONE).stroke(INK);
  g.moveTo(x - 190, y - 40).lineTo(x - 150, y - 10).lineTo(x - 165, y + 30).stroke({ width: 2, color: STONE_DARK });
  // R, E, X in carved strokes.
  const carve = { width: 4, color: STONE_DARK };
  g.moveTo(x - 172, y + 50).lineTo(x - 172, y + 22).lineTo(x - 160, y + 22).lineTo(x - 160, y + 35).lineTo(x - 172, y + 35).lineTo(x - 158, y + 50).stroke(carve);
  g.moveTo(x - 138, y + 22).lineTo(x - 150, y + 22).lineTo(x - 150, y + 50).lineTo(x - 138, y + 50).moveTo(x - 150, y + 36).lineTo(x - 140, y + 36).stroke(carve);
  g.moveTo(x - 128, y + 22).lineTo(x - 112, y + 50).moveTo(x - 112, y + 22).lineTo(x - 128, y + 50).stroke(carve);
  // The body face down: the stone cape spread out, arms flung, cracked across the middle.
  g.ellipse(x + 40, y + 10, 140, 70).fill({ color: 0x000000, alpha: 0.25 });
  g.poly([x - 40, y - 50, x + 120, y - 70, x + 170, y - 10, x + 140, y + 60, x - 30, y + 55, x - 60, y]).fill(STONE).stroke(INK);
  g.moveTo(x + 40, y - 62).lineTo(x + 55, y - 10).lineTo(x + 35, y + 55).stroke({ width: 3, color: STONE_DARK });
  for (const side of [-1, 1]) g.roundRect(x + 10, y + side * 62 - 12, 90, 24, 10).fill(STONE).stroke(INK); // arms
  g.circle(x + 120, y + 74, 14).fill(STONE).stroke(INK); // a hand, still holding a broken scepter
  g.moveTo(x + 120, y + 74).lineTo(x + 175, y + 96).stroke({ width: 6, color: STONE_DARK });
  // Moss creeping over it.
  for (const [mx, my, mr] of [[x - 20, y - 30, 22], [x + 100, y + 30, 18], [x + 150, y - 20, 14], [x - 180, y + 55, 16]]) g.circle(mx, my, mr).fill({ color: MOSS, alpha: 0.7 });
  // The head, rolled off to the side: crown chipped, nose broken.
  g.circle(x + 240, y - 50, 40).fill(STONE).stroke(INK);
  g.circle(x + 240, y - 50, 32).stroke({ width: 7, color: 0xb0a070 });
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.5;
    if (i === 3) continue; // a point broken off
    g.poly([x + 240 + Math.cos(a - 0.15) * 34, y - 50 + Math.sin(a - 0.15) * 34, x + 240 + Math.cos(a) * 50, y - 50 + Math.sin(a) * 50, x + 240 + Math.cos(a + 0.15) * 34, y - 50 + Math.sin(a + 0.15) * 34]).fill(0xb0a070).stroke({ width: 1.5, color: INK.color });
  }
  g.circle(x + 255, y - 40, 5).fill(STONE_DARK);
  // Rubble.
  for (const [rx, ry, rr] of [[x + 190, y + 40, 10], [x + 205, y + 10, 7], [x - 50, y + 80, 9], [x + 280, y + 10, 8]]) g.circle(rx, ry, rr).fill(STONE_DARK).stroke({ width: 1.5, color: INK.color });
  // On the plinth, only his boots are left standing, snapped at the ankle.
  top.roundRect(x - 175, y - 45, 36, 52, 8).fill(STONE).stroke(INK);
  top.roundRect(x - 125, y - 45, 36, 52, 8).fill(STONE).stroke(INK);
  for (const bx of [x - 157, x - 107]) top.ellipse(bx, y - 42, 16, 7).fill(STONE_DARK);
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
      g.poly(pts).stroke({ width: 5, color: 0x1a1d22 }).stroke({ width: 3, color: IRON_HI });
    }
    // Bolted into the wall corner: a great iron ring.
    top.circle(ax, ay, 26).fill(IRON).stroke(INK);
    top.circle(ax, ay, 14).stroke({ width: 5, color: IRON_HI });
  }
  // The shackle in the middle, burst open.
  arc(g, x, y, 70, 0.6, Math.PI * 2 - 0.6).stroke({ width: 16, color: 0x1a1d22 }).stroke({ width: 11, color: IRON });
  for (const a of [0.6, -0.6]) g.circle(x + Math.cos(a) * 70, y + Math.sin(a) * 70, 10).fill(IRON_HI).stroke({ width: 2, color: INK.color });
}

/** Willmore's way in: a sewer grate in the riverbed, levered open, junk spilling out around it. */
function sewerMouth(g: Graphics, top: Graphics, x: number, y: number): void {
  g.circle(x, y, 78).fill({ color: 0x0b0f14, alpha: 0.85 });
  g.circle(x, y, 78).stroke({ width: 10, color: IRON }).stroke({ width: 3, color: IRON_HI });
  // Green sewer glow down the hole.
  g.circle(x, y, 50).fill({ color: 0x6fd6a0, alpha: 0.18 });
  g.circle(x, y, 26).fill({ color: 0x6fd6a0, alpha: 0.2 });
  // The grate itself, propped open at an angle beside the hole.
  const gx = x + 95;
  const gy = y - 40;
  g.ellipse(gx, gy, 70, 52).fill(IRON).stroke(INK);
  for (let i = -2; i <= 2; i++) g.moveTo(gx + i * 22, gy - 46 + Math.abs(i) * 6).lineTo(gx + i * 22, gy + 46 - Math.abs(i) * 6).stroke({ width: 4, color: 0x1a1d22 });
  // Junk: a trash can lid (like his crown), a cart wheel, a boot, bottles, a fish skeleton.
  g.circle(x - 110, y + 20, 30).fill(0x9aa1ab).stroke(INK);
  g.roundRect(x - 116, y + 14, 12, 12, 2).fill(0x5d636d);
  g.circle(x - 70, y + 85, 36).stroke({ width: 7, color: 0x6b4a2b });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.moveTo(x - 70, y + 85).lineTo(x - 70 + Math.cos(a) * 34, y + 85 + Math.sin(a) * 34).stroke({ width: 3, color: 0x6b4a2b });
  }
  g.roundRect(x + 40, y + 60, 46, 22, 9).fill(0x3a2a1c).stroke(INK);
  for (const [bx, by, color] of [[x - 30, y - 95, 0x5cff9a], [x + 10, y + 100, 0x6ab8ff], [x - 140, y - 40, 0xc9a85a]] as const) {
    g.roundRect(bx - 6, by - 14, 12, 28, 5).fill({ color, alpha: 0.8 }).stroke({ width: 1.5, color: INK.color });
  }
  g.moveTo(x + 120, y + 40).lineTo(x + 175, y + 40).stroke({ width: 3, color: 0xe8e0cc });
  for (let i = 0; i < 4; i++) g.moveTo(x + 128 + i * 12, y + 30).lineTo(x + 128 + i * 12, y + 50).stroke({ width: 2, color: 0xe8e0cc });
  g.poly([x + 175, y + 40, x + 190, y + 30, x + 190, y + 50]).fill(0xe8e0cc);
  // A rusted pipe standing up out of the water.
  top.roundRect(x - 165, y - 105, 30, 70, 6).fill(0x6a4a2a).stroke(INK);
  top.ellipse(x - 150, y - 105, 15, 7).fill(0x2a1a10);
}

/** Master Paris's café: a little round table for two under a striped parasol, and a fencing strip beside it. */
function petitCafe(g: Graphics, top: Graphics, x: number, y: number): void {
  // The piste, chalked out on the grass.
  g.roundRect(x - 150, y + 55, 300, 34, 4).fill({ color: 0xe8e0cc, alpha: 0.55 }).stroke({ width: 2, color: 0x8a8070, alpha: 0.6 });
  for (const t of [-100, -50, 0, 50, 100]) g.moveTo(x + t, y + 55).lineTo(x + t, y + 89).stroke({ width: 2, color: 0x8a8070, alpha: 0.6 });
  // Chairs, and the table's shadow.
  for (const side of [-1, 1]) g.circle(x + side * 62, y - 10, 18).fill(0x2a2a30).stroke(INK);
  g.ellipse(x + 10, y + 6, 46, 18).fill({ color: 0x000000, alpha: 0.25 });
  // On the raised layer: the table, two cups, a croissant, and the parasol over it.
  top.circle(x, y - 10, 36).fill(0xf2efe6).stroke(INK);
  for (const side of [-1, 1]) {
    top.circle(x + side * 16, y - 18, 7).fill(WHITE_CUP).stroke({ width: 1.5, color: INK.color });
    top.circle(x + side * 16, y - 18, 4).fill(0x5a3a1a);
  }
  top.moveTo(x - 10, y + 2).quadraticCurveTo(x, y - 6, x + 12, y + 4).stroke({ width: 7, color: 0xd99a4a, cap: 'round' });
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const a0 = (i / stripes) * Math.PI * 2;
    const a1 = ((i + 1) / stripes) * Math.PI * 2;
    top.moveTo(x, y - 60).arc(x, y - 60, 70, a0, a1).closePath().fill({ color: i % 2 ? 0xc0182b : 0xf2efe6, alpha: 0.92 });
  }
  top.circle(x, y - 60, 70).stroke(INK);
  top.circle(x, y - 60, 5).fill(0x2a2a30);
}

/** Dongmaster's outdoor gym: a rubber mat, a bench with a loaded bar, a dumbbell rack, chalk everywhere. */
function ironParadise(g: Graphics, top: Graphics, x: number, y: number): void {
  g.roundRect(x - 140, y - 90, 280, 180, 8).fill(0x2a2a30).stroke(INK);
  for (const [cx, cy, cr] of [[x - 90, y + 50, 26], [x + 70, y - 50, 20], [x + 20, y + 60, 16]]) g.circle(cx, cy, cr).fill({ color: 0xffffff, alpha: 0.12 }); // chalk
  // The dumbbell rack along one side.
  g.roundRect(x + 80, y - 70, 40, 140, 4).fill(0x4a4f58).stroke(INK);
  for (let i = 0; i < 5; i++) {
    const dy = y - 55 + i * 28;
    g.moveTo(x + 88, dy).lineTo(x + 112, dy).stroke({ width: 4, color: 0x8a9099 });
    for (const dx of [86, 114]) g.circle(x + dx, dy, 7 + i).fill(0x1a1a1e).stroke({ width: 1.5, color: INK.color });
  }
  // A protein shaker, left out.
  g.roundRect(x - 125, y - 75, 18, 28, 4).fill(0xe5484d).stroke(INK);
  // The bench and the bar, up on the raised layer.
  top.roundRect(x - 90, y - 18, 130, 36, 8).fill(0x8a1a22).stroke(INK);
  top.moveTo(x - 30, y - 70).lineTo(x - 30, y + 70).stroke({ width: 6, color: 0xb8bec6 });
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) top.roundRect(x - 44, y + side * (40 + i * 9) - 4, 28, 8, 3).fill(i === 1 ? 0xffd166 : 0x1a1a1e).stroke({ width: 1.5, color: INK.color });
  }
}

/** Havarti's birthplace: the hatch to the royal cellar thrown open, stairs into the dark, wheels of cheese and candles. */
function royalCellar(g: Graphics, top: Graphics, x: number, y: number): void {
  // The hatch: one door lying open, the opening dark, stairs going down.
  g.roundRect(x - 60, y - 45, 120, 90, 6).fill(0x120c08).stroke(INK);
  for (let i = 0; i < 4; i++) g.rect(x - 52 + i * 6, y - 38 + i * 18, 104 - i * 12, 10).fill({ color: 0x5a4632, alpha: 0.9 - i * 0.2 });
  g.roundRect(x - 60, y - 115, 120, 66, 6).fill(0x6b4a2b).stroke(INK); // the door, flung back
  for (const dx of [-30, 0, 30]) g.moveTo(x + dx, y - 112).lineTo(x + dx, y - 52).stroke({ width: 2, color: 0x3d2c1a });
  g.circle(x, y - 82, 7).stroke({ width: 3, color: IRON_HI });
  // Wheels of cheese stacked beside it, and candles on them.
  for (const [cx, cy] of [[x + 95, y + 10], [x + 95, y + 55], [x + 140, y + 30], [x - 100, y + 40]]) {
    g.circle(cx, cy, 26).fill(0xd9a52b).stroke(INK);
    g.circle(cx, cy, 20).fill(0xf3dc8a);
    g.circle(cx - 6, cy - 5, 4).fill(0xd8b860);
  }
  for (const [cx, cy] of [[x + 95, y + 10], [x - 100, y + 40], [x - 75, y - 60], [x + 70, y - 60]]) {
    top.roundRect(cx - 4, cy - 26, 8, 22, 2).fill(0xfff6dc).stroke({ width: 1.5, color: INK.color });
    top.ellipse(cx, cy - 31, 4, 7).fill(0xffd166);
  }
}

/** The Dark Dabber's den: crates and barrels in a ring, an old mattress, a lantern, and a haze that never lifts. */
function ratDen(g: Graphics, top: Graphics, x: number, y: number): void {
  g.roundRect(x - 50, y - 30, 100, 60, 10).fill(0x6a5a4a).stroke(INK); // the mattress
  for (const [sx, sy] of [[x - 30, y - 10], [x + 15, y + 8]]) g.circle(sx, sy, 10).fill({ color: 0x4a3a2a, alpha: 0.8 }); // stains
  for (let i = 0; i < 18; i++) g.ellipse(x - 90 + ((i * 37) % 180), y + 50 + ((i * 23) % 30), 3, 2).fill(0x3a2a1a); // seed husks
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const bx = x + Math.cos(a) * 115;
    const by = y + Math.sin(a) * 85;
    if (i % 2) top.circle(bx, by, 24).fill(0x5a3a1a).stroke(INK).circle(bx, by, 16).stroke({ width: 3, color: 0x2a1a0a });
    else {
      top.roundRect(bx - 24, by - 22, 48, 44, 4).fill(0x8a6a3a).stroke(INK);
      top.moveTo(bx - 24, by - 22).lineTo(bx + 24, by + 22).stroke({ width: 3, color: 0x5a3a1a });
    }
  }
  // The haze, in soft green puffs.
  for (const [hx, hy, hr] of [[x - 40, y - 40, 50], [x + 30, y - 20, 60], [x - 10, y + 30, 45], [x + 70, y + 40, 40]]) top.circle(hx, hy, hr).fill({ color: 0xc8e6a0, alpha: 0.14 });
  top.roundRect(x + 55, y - 75, 18, 24, 4).fill(0x2a2018).stroke(INK);
  top.roundRect(x + 58, y - 72, 12, 16, 3).fill(0xb8f07a);
}

/** HunnaG's rot: a purple bloom on the water, rings of mushrooms, bubbles. */
function rotBloom(g: Graphics, top: Graphics, x: number, y: number): void {
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39996;
    const r = 30 + Math.sqrt(i) * 38;
    g.circle(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.75, 46 - i * 1.5).fill({ color: i % 2 ? 0x5a2a6a : 0x3d5a24, alpha: 0.45 });
  }
  // A fairy ring of toadstools, and bubbles rising through the scum.
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const mx = x + Math.cos(a) * 130;
    const my = y + Math.sin(a) * 95;
    const big = i % 3 === 0;
    top.circle(mx, my, big ? 22 : 15).fill(i % 2 ? 0x7a3fb0 : 0x9a4fd0).stroke({ width: 2, color: INK.color });
    top.circle(mx - 5, my - 4, big ? 5 : 3.5).fill(0xe8d7ff);
    top.circle(mx + 6, my + 3, big ? 4 : 2.5).fill(0xe8d7ff);
  }
  for (const [bx, by, br] of [[x - 30, y - 20, 9], [x + 25, y + 15, 6], [x + 5, y - 45, 7], [x - 50, y + 35, 5], [x + 55, y - 30, 8]]) g.circle(bx, by, br).stroke({ width: 2, color: 0xb8f07a, alpha: 0.7 });
  // One big toadstool in the middle.
  top.circle(x, y, 40).fill(0x7a3fb0).stroke(INK);
  for (const [sx, sy, sr] of [[-14, -12, 9], [12, -4, 7], [-2, 16, 8], [20, 18, 5]]) top.circle(x + sx, y + sy, sr).fill(0xe8d7ff);
}
