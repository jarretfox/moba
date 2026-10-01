import type { Graphics } from 'pixi.js';
import type { ItemId } from '../../shared/items';
import { blob, inkLine, inkOf, inkStroke, inked, shade, smooth, type Pts } from './organic';
import type { Proportions } from './rig';

// What a champion's bought shows on them. Each item hangs somewhere on the figure: a dagger in the belt,
// a loaf poking out of a pouch, a pauldron on the shoulder, a breastplate, a drum or a bow on the back, a
// chain round the forearm, heavy treads or winged boots on the feet; Bloodreaver stains the weapon red.
// Drawn in the parts' own spaces (see rig.ts), in units of the radius `r`.

/**
 * Where gear can go: over the torso (from the hips, up −y), behind it (the same space), over the near
 * shoulder (origin at the shoulder), round the forearm (elbow at the origin, along +x), on each foot.
 */
export interface GearLayers {
  torso: Graphics;
  back: Graphics;
  cap: Graphics;
  arm: Graphics;
  footF: Graphics;
  footB: Graphics;
}

const STEEL = 0xc9d3dc;
const LEATHER = 0x7a5136;
const BARK = 0x5a3d22;
const GOLD = 0xd9b25a;

type Draw = (l: GearLayers, r: number, s: Proportions) => void;

const PIECES: Record<ItemId, Draw> = {
  shiv: (l, r) => {
    // Tucked in the belt, handle up.
    inkLine(l.torso, 0.2 * r, -0.26 * r, 0.3 * r, -0.02 * r, 4, { color: 0x5a3a1a, tip: 1 }, 0);
    inked(l.torso, [0.29 * r, -0.04 * r, 0.33 * r, 0.22 * r, 0.25 * r, -0.02 * r], STEEL, 1.4);
  },
  quickstring: (l, r) => {
    // A coil of spare bowstring on the hip.
    for (let i = 0; i < 3; i++) l.torso.ellipse(-0.3 * r, -0.12 * r + i * 0.025 * r, 0.1 * r, 0.06 * r).stroke({ width: 2.5, color: 0xf2efe6 }).ellipse(-0.3 * r, -0.12 * r + i * 0.025 * r, 0.1 * r, 0.06 * r).stroke({ width: 1, color: 0x8a8070 });
  },
  loaf: (l, r) => {
    // A pouch with a loaf poking out of it.
    inked(l.torso, blob(-0.28 * r, -0.18 * r, 0.1 * r, 0.14 * r, 7, 0.15, 12), 0xd9a55a, 1.6);
    for (const k of [-0.24, -0.16]) inkLine(l.torso, -0.34 * r, k * r, -0.22 * r, (k - 0.03) * r, 1.4, { color: 0x8a5a2a }, 0);
    inked(l.torso, smooth([-0.42 * r, -0.12 * r, -0.16 * r, -0.12 * r, -0.17 * r, 0.06 * r, -0.41 * r, 0.06 * r], true, 1), LEATHER, 2);
  },
  leather: (l, r) => {
    // A leather pauldron on the near shoulder.
    inked(l.cap, blob(0.02 * r, -0.02 * r, 0.2 * r, 0.14 * r, 11, 0.15, 14), LEATHER, 2.2);
    for (const k of [-0.08, 0.08]) inkLine(l.cap, (0.02 + k) * r, -0.13 * r, (0.04 + k) * r, 0.09 * r, 1.4, { color: inkOf(LEATHER), alpha: 0.7 }, 0);
  },
  bark: (l, r, s) => {
    // A mantle of Oakner bark round the shoulders, hanging behind.
    const top = -s.torso * r;
    inked(l.back, smooth([-0.42 * r, top + 0.05 * r, 0.25 * r, top - 0.02 * r, 0.1 * r, top + 0.35 * r, -0.2 * r, top + 0.55 * r, -0.5 * r, top + 0.4 * r], true, 2), BARK, 2.5);
    for (let i = 0; i < 4; i++) inkLine(l.back, (-0.36 + i * 0.12) * r, top + 0.08 * r, (-0.38 + i * 0.1) * r, top + 0.42 * r, 1.6, { color: shade(BARK, 0.35), alpha: 0.8 }, 0.1);
  },
  sagestone: (l, r, s) => {
    // A pebble pendant on a cord, faintly glowing.
    const y = -s.torso * 0.62 * r;
    l.torso.moveTo(-0.05 * r, -s.torso * 0.95 * r).quadraticCurveTo(0.12 * r, y - 0.1 * r, 0.2 * r, y).stroke({ width: 1.5, color: 0x3a2a1c });
    l.torso.circle(0.2 * r, y + 0.04 * r, 0.09 * r).fill({ color: 0xb98be0, alpha: 0.3 });
    inked(l.torso, blob(0.2 * r, y + 0.04 * r, 0.05 * r, 0.045 * r, 3, 0.15, 10), 0xd8c8ff, 1.4);
  },
  treads: (l, r) => {
    // Thick tunnelling soles, with studs.
    for (const g of [l.footF, l.footB]) {
      inked(g, [-0.13 * r, 0.04 * r, 0.34 * r, 0.04 * r, 0.32 * r, 0.12 * r, -0.12 * r, 0.12 * r], 0x3a3530, 1.6);
      for (let i = 0; i < 4; i++) g.circle((-0.06 + i * 0.1) * r, 0.12 * r, 0.02 * r).fill(0x9aa1ab);
    }
  },
  striders: (l, r) => {
    // Little wings at the heels.
    for (const g of [l.footF, l.footB]) {
      for (const [dx, dy] of [[-0.06, -0.2], [-0.12, -0.12]]) inked(g, smooth([-0.04 * r, -0.04 * r, (dx - 0.12) * r, (dy - 0.05) * r, (dx - 0.04) * r, dy * r, 0.02 * r, -0.02 * r], true, 1), 0xf2f6ff, 1.4);
    }
  },
  fang: (l, r, s) => {
    // A cord of fangs round the neck.
    const y = -s.torso * 0.88 * r;
    inkStroke(l.torso, [-0.2 * r, y - 0.04 * r, 0.05 * r, y + 0.1 * r, 0.3 * r, y - 0.02 * r], 2, { color: 0x3a2a1c, tip: 1 });
    for (const x of [-0.05, 0.08, 0.2]) inked(l.torso, [x * r - 0.03 * r, y + 0.06 * r, x * r + 0.03 * r, y + 0.06 * r, x * r, y + 0.18 * r], 0xf2efe6, 1.2);
  },
  drum: (l, r, s) => {
    // A war drum slung on the back.
    const y = -s.torso * 0.55 * r;
    const x = -0.46 * r;
    inked(l.back, [x - 0.16 * r, y - 0.18 * r, x + 0.16 * r, y - 0.18 * r, x + 0.16 * r, y + 0.16 * r, x - 0.16 * r, y + 0.16 * r], 0x8a2a2a, 2);
    l.back.ellipse(x, y - 0.18 * r, 0.16 * r, 0.06 * r).fill(0xe8dcc0).stroke({ width: 1.8, color: 0x5a3a1a });
    for (let i = -1; i <= 1; i++) inkLine(l.back, x + i * 0.1 * r, y - 0.16 * r, x - i * 0.1 * r, y + 0.14 * r, 1.4, { color: GOLD }, 0);
  },
  longbow: (l, r, s) => {
    // A great bow strapped across the back.
    const pts: Pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(-0.55 * r + t * 0.45 * r + Math.sin(t * Math.PI) * 0.08 * r, -s.torso * 1.15 * r + t * (s.torso * 1.2) * r);
    }
    inkStroke(l.back, pts, 6, { color: inkOf(0xd98a2b), tip: 0.5 });
    inkStroke(l.back, pts, 4, { color: 0xd98a2b, tip: 0.5 });
    l.back.moveTo(pts[0], pts[1]).lineTo(pts[20], pts[21]).stroke({ width: 1.2, color: 0xf2efe6 });
  },
  reaver: () => undefined, // stains the weapon (see Rig.setGear)
  link: (l, r, s) => {
    // A link of the Warden's chain, wrapped round the forearm.
    for (const k of [0.35, 0.6]) l.arm.ellipse(s.fore * k * r, 0, 0.05 * r, 0.13 * r).stroke({ width: 4, color: 0x1a1d22 }).ellipse(s.fore * k * r, 0, 0.05 * r, 0.13 * r).stroke({ width: 2.4, color: 0x8a9099 });
  },
  plate: (l, r, s) => {
    // A royal breastplate over the chest, with a gold edge.
    const t = s.torso;
    const plate = smooth([-0.12 * r, -t * 0.95 * r, 0.3 * r, -t * 0.95 * r, 0.44 * r, -t * 0.6 * r, 0.4 * r, -t * 0.2 * r, -0.1 * r, -t * 0.2 * r], true, 2);
    inked(l.torso, plate, STEEL, 2.4);
    inkStroke(l.torso, plate.slice(0, 12), 2, { color: GOLD, tip: 0.3 });
    l.torso.moveTo(0.14 * r, -t * 0.9 * r).lineTo(0.2 * r, -t * 0.25 * r).stroke({ width: 1.5, color: shade(STEEL, 0.3) });
    l.torso.moveTo(0.02 * r, -t * 0.82 * r).lineTo(0.08 * r, -t * 0.6 * r).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    // And a steel pauldron over the near shoulder, where it shows whatever the arm is doing.
    const cap = smooth([-0.2 * r, 0.06 * r, -0.14 * r, -0.16 * r, 0.12 * r, -0.2 * r, 0.26 * r, 0.02 * r, 0.16 * r, 0.12 * r], true, 2);
    inked(l.cap, cap, STEEL, 2.4);
    inkStroke(l.cap, [-0.17 * r, 0.07 * r, 0.02 * r, 0.14 * r, 0.2 * r, 0.1 * r], 2.4, { color: GOLD, tip: 0.4 });
    l.cap.moveTo(-0.08 * r, -0.1 * r).quadraticCurveTo(0.04 * r, -0.15 * r, 0.12 * r, -0.08 * r).stroke({ width: 2, color: 0xffffff, alpha: 0.6, cap: 'round' });
  },
  aegis: (l, r, s) => {
    // A round stone shield slung on the back.
    const y = -s.torso * 0.5 * r;
    inked(l.back, blob(-0.45 * r, y, 0.26 * r, 0.3 * r, 13, 0.05, 20), 0x5a6a7a, 2.5);
    l.back.circle(-0.45 * r, y, 0.08 * r).fill(0x8fd0ff).stroke({ width: 1.5, color: 0x2a3a4a });
  },
  lantern: (l, r) => {
    // HunnaG's glowworm lantern, hanging from the belt.
    l.torso.circle(0.32 * r, 0.02 * r, 0.14 * r).fill({ color: 0xb8f07a, alpha: 0.25 });
    inkLine(l.torso, 0.3 * r, -0.14 * r, 0.32 * r, -0.08 * r, 1.4, { color: 0x2a2018 }, 0);
    inked(l.torso, smooth([0.25 * r, -0.08 * r, 0.39 * r, -0.08 * r, 0.39 * r, 0.1 * r, 0.25 * r, 0.1 * r], true, 1), 0x2a2018, 1.4);
    l.torso.roundRect(0.28 * r, -0.05 * r, 0.08 * r, 0.12 * r, 0.02 * r).fill(0xb8f07a);
  },
  staff: (l, r, s) => {
    // Rotroot sprouting over the shoulder.
    const top = -s.torso * r;
    for (const [x, len, lean] of [[-0.3, 0.45, -0.3], [-0.18, 0.35, 0.2]]) {
      inkStroke(l.back, [x * r, top + 0.3 * r, (x + lean * 0.4) * r, top - len * 0.5 * r, (x + lean) * r, top - len * r], 4, { color: 0x4f3a2a, tip: 0.2 });
      inked(l.back, blob((x + lean) * r, top - len * r, 0.05 * r, 0.04 * r, Math.round(x * 100), 0.2, 8), 0x8fd14f, 1.2);
    }
  },
};

/** Draws everything in `items` onto the figure (the layers are cleared first). */
export function drawGear(layers: GearLayers, items: readonly ItemId[], r: number, size: Proportions): void {
  for (const g of Object.values(layers)) g.clear();
  for (const id of new Set(items)) PIECES[id](layers, r, size);
}
