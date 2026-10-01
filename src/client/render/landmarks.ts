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

export interface Landmarks {
  /** On the ground, above the water. */
  flat: Container;
  /** Raised with the wall tops. */
  tall: Graphics;
  /** Glows for the light map. */
  lights: FlickerLight[];
}

/** Where each landmark sits, mirrored to the map's size (the layout is authored for 12000 by 7000). */
export function landmarkSpots(map: MapData): Record<'cage' | 'statue' | 'sewer' | 'rot' | 'pit', { x: number; y: number }> {
  const cx = map.width / 2;
  const cy = map.height / 2;
  return {
    cage: { x: cx - 2600, y: cy },
    statue: { x: cx + 2600, y: cy },
    sewer: { x: cx, y: cy - 1250 },
    rot: { x: cx, y: cy + 1250 },
    pit: { x: cx, y: cy },
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

  const lights: FlickerLight[] = [
    { x: at.sewer.x, y: at.sewer.y, r: 300, color: 0x6fd6a0, alpha: 0.35, base: 0.35, flicker: 0.3, phase: 1, speed: 2 },
    { x: at.rot.x, y: at.rot.y, r: 380, color: 0xb36bff, alpha: 0.45, base: 0.45, flicker: 0.35, phase: 2, speed: 1.4 },
    { x: at.pit.x, y: at.pit.y, r: 260, color: 0xb8f07a, alpha: 0.3, base: 0.3, flicker: 0.4, phase: 3, speed: 0.8 },
    // A shaft of pale light on the cage and the fallen king, so they show at dusk.
    { x: at.cage.x, y: at.cage.y, r: 330, color: 0xffe2a8, alpha: 0.4, base: 0.4, flicker: 0.05, phase: 4, speed: 0.5 },
    { x: at.statue.x + 40, y: at.statue.y, r: 360, color: 0xcfe0ff, alpha: 0.4, base: 0.4, flicker: 0.05, phase: 5, speed: 0.5 },
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
