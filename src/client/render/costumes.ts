import type { Graphics } from 'pixi.js';
import type { ChampionId } from '../../shared/champions/types';
import { BUILDS } from './builds';
import { blob, inkLine, inked, shade, smooth, type Pts } from './organic';
import type { Build, Dangle, Palette } from './rig';

// Halloween looks: each champion's fourth look is a costume. A costume is a palette like any other look,
// plus pieces drawn over the figure (on the head, the body or the back), and sometimes a different hat.
// Logan's a werewolf, King Rix a vampire, Willmore a mummy, the Dabber a plague doctor...

export interface Costume {
  name: string;
  colors: Palette;
  /** Drawn over the head (head space: the neck at (0, 0), up as −y, facing +x, in units of r). */
  head?(g: Graphics, r: number, p: Palette): void;
  /** Drawn over the body (the hips at (0, 0)). */
  torso?(g: Graphics, r: number, p: Palette): void;
  /** Drawn over the back piece, behind everything. */
  back?(g: Graphics, r: number, p: Palette): void;
  /** A different hat. */
  dangle?: Dangle;
  /** The face is covered: no blinking or talking drawn over it. */
  masked?: boolean;
}

/** Which look is the Halloween costume. */
export const COSTUME_SKIN = 3;

const PUMPKIN = 0xe8771f;
const LIT = 0xffd27a;
const BONE = 0xe8dcc0;

/** A carved pumpkin face: two triangle eyes and a jagged grin, lit from inside, about `s` across. */
function carve(g: Graphics, cx: number, cy: number, s: number, edge = 0x8a3a10): void {
  for (const dx of [-0.32, 0.32]) g.poly([cx + (dx - 0.14) * s, cy - 0.08 * s, cx + (dx + 0.14) * s, cy - 0.08 * s, cx + dx * s, cy - 0.32 * s]).fill(LIT).stroke({ width: 1.2, color: edge });
  g.poly([cx - 0.4 * s, cy + 0.08 * s, cx - 0.24 * s, cy + 0.2 * s, cx - 0.12 * s, cy + 0.1 * s, cx, cy + 0.22 * s, cx + 0.12 * s, cy + 0.1 * s, cx + 0.24 * s, cy + 0.2 * s, cx + 0.4 * s, cy + 0.08 * s, cx + 0.22 * s, cy + 0.34 * s, cx - 0.22 * s, cy + 0.34 * s]).fill(LIT).stroke({ width: 1.2, color: edge });
}

/** A whole pumpkin, ribbed, around (cx, cy). */
function pumpkin(g: Graphics, cx: number, cy: number, rx: number, ry: number, color = PUMPKIN): void {
  for (const [dx, k] of [[-0.42, 0.62], [0.42, 0.62], [0, 0.8]] as const) inked(g, blob(cx + dx * rx, cy, rx * k, ry, Math.round(dx * 10) + 7, 0.05, 16), dx === 0 ? color : shade(color, -0.1), 2.2, 0x3a1606);
}

/** Two little fangs hanging from (x, y). */
function fangs(g: Graphics, x: number, y: number, s: number): void {
  for (const dx of [0, 0.09]) g.poly([x + dx * s, y, x + (dx + 0.05) * s, y, x + (dx + 0.025) * s, y + 0.08 * s]).fill(0xffffff).stroke({ width: 1, color: 0x3a3a3a });
}

/** A band of bandage from (ax, ay) to (bx, by): pale, with darker edges and a stain. */
function bandage(g: Graphics, ax: number, ay: number, bx: number, by: number, w: number): void {
  inkLine(g, ax, ay, bx, by, w, { color: 0xece4cc, tip: 1 }, 0.04);
  g.moveTo(ax, ay - w * 0.42).lineTo(bx, by - w * 0.42).stroke({ width: 1, color: 0xa89c80, alpha: 0.8 });
}

export const COSTUMES: Record<ChampionId, Costume> = {
  marksman: {
    name: 'Pumpkin Ranger',
    colors: { cloak: 0x1c1a20, hood: 0x2a2430, quiver: 0x3a2a1a, fletch: 0xff8a2a, face: 0x0a0a0a, bow: 0x2a1a10, arrow: 0xff8a2a },
    masked: true,
    head(g, r) {
      // A jack-o'-lantern where his face should be, grinning out of the hood.
      pumpkin(g, 0.16 * r, -0.34 * r, 0.2 * r, 0.21 * r);
      carve(g, 0.2 * r, -0.33 * r, 0.3 * r);
      inked(g, [0.12 * r, -0.54 * r, 0.16 * r, -0.62 * r, 0.2 * r, -0.6 * r, 0.17 * r, -0.53 * r], 0x3a5a1a, 1.5);
    },
  },
  barbarian: {
    name: 'Frankenoak',
    colors: { skin: 0x8fb87a, fur: 0x3a3a40, furDot: 0x5a5a64, helmet: 0x5a5f6a, horns: 0x8a8f9a, blade: 0x9aa1ab, chain: 0x5a5f6a, haft: 0x2a2a2e },
    head(g, r) {
      // Bolts in the neck, and stitches across his brow and cheek.
      for (const [x, y] of [[-0.18, -0.1], [0.3, -0.08]] as const) {
        g.rect((x - 0.05) * r, (y - 0.04) * r, 0.1 * r, 0.08 * r).fill(0x9aa1ab).stroke({ width: 1.5, color: 0x3a3f48 });
        g.rect((x - 0.025) * r, (y - 0.07) * r, 0.05 * r, 0.14 * r).fill(0x6a707a).stroke({ width: 1.2, color: 0x2a2f38 });
      }
      inkLine(g, -0.04 * r, -0.58 * r, 0.36 * r, -0.62 * r, 2, { color: 0x2a3a1a }, 0.05);
      for (let i = 0; i < 6; i++) {
        const x = -0.02 + i * 0.07;
        g.moveTo(x * r, -0.635 * r).lineTo((x + 0.01) * r, -0.565 * r).stroke({ width: 1.5, color: 0x2a3a1a });
      }
      inkLine(g, 0.32 * r, -0.32 * r, 0.42 * r, -0.2 * r, 1.6, { color: 0x2a3a1a }, 0);
      for (const t of [0.25, 0.6]) g.moveTo((0.32 + 0.1 * t - 0.03) * r, (-0.32 + 0.12 * t + 0.02) * r).lineTo((0.32 + 0.1 * t + 0.03) * r, (-0.32 + 0.12 * t - 0.02) * r).stroke({ width: 1.3, color: 0x2a3a1a });
    },
    torso(g, r) {
      // A stitched seam across the chest.
      inkLine(g, -0.3 * r, -0.66 * r, 0.42 * r, -0.4 * r, 2, { color: 0x2a3a1a }, 0.08);
      for (let i = 0; i < 7; i++) {
        const t = i / 6;
        const x = -0.3 + 0.72 * t;
        const y = -0.66 + 0.26 * t;
        g.moveTo((x - 0.02) * r, (y - 0.05) * r).lineTo((x + 0.02) * r, (y + 0.05) * r).stroke({ width: 1.5, color: 0x2a3a1a });
      }
    },
  },
  willmore: {
    name: 'Sewer Mummy',
    colors: { body: 0xcfc6a8, patch: 0x8a8070, sack: 0x5a5040, lid: 0x6a6a70, lidKnob: 0x3a3a40, goggles: 0x9fffb0, rim: 0x5a5a60, strap: 0x5a4a30 },
    head(g, r) {
      // Wrapped up: bands of bandage round the head (the goggles and the grin peep out).
      bandage(g, -0.28 * r, -0.6 * r, 0.42 * r, -0.62 * r, 0.09 * r);
      bandage(g, -0.3 * r, -0.28 * r, 0.12 * r, -0.3 * r, 0.08 * r);
      bandage(g, -0.24 * r, -0.08 * r, 0.16 * r, -0.04 * r, 0.07 * r);
      // A loose end trailing off the back.
      inkLine(g, -0.28 * r, -0.6 * r, -0.5 * r, -0.36 * r, 0.06 * r, { color: 0xece4cc, tip: 0.3 }, 0.2);
    },
    torso(g, r) {
      for (const [ay, by] of [[-0.62, -0.5], [-0.42, -0.28], [-0.22, -0.12]] as const) bandage(g, -0.38 * r, ay * r, 0.46 * r, by * r, 0.08 * r);
    },
  },
  hunnag: {
    name: "Jack-o'-Shroom",
    colors: { cap: PUMPKIN, spots: 0xd8661a, eyes: LIT, orb: 0xff9a3a, orbGlow: 0xffb04a, orbEdge: 0x6a3410 },
    dangle: {
      at: [0.05, -0.46],
      give: 0.8,
      draw(g, r, p) {
        // The cap's a carved pumpkin, lit from inside, with a curly stem on top.
        BUILDS.hunnag.dangle!.draw(g, r, p);
        carve(g, 0.24 * r, -0.66 * r, 0.42 * r);
        inked(g, smooth([-0.04 * r, -0.98 * r, 0.02 * r, -1.14 * r, 0.12 * r, -1.12 * r, 0.06 * r, -0.97 * r], true, 1), 0x3a5a1a, 1.8);
        g.moveTo(0.1 * r, -1.1 * r).quadraticCurveTo(0.24 * r, -1.2 * r, 0.22 * r, -1.06 * r).stroke({ width: 2, color: 0x4a7a2a, cap: 'round' });
      },
    },
  },
  logan: {
    name: 'Werewolf',
    colors: { mane: 0x4a4048, maneEdge: 0x1e1a20, face: 0x6a5a50, muzzle: 0x9a8a7a, collar: 0x6a6a70, eyes: 0xffd23a, nose: 0x1a1414, paw: 0x6a5a50 },
    head(g, r, p) {
      // Wolf ears pricked up out of the mane, fangs, and eyes that catch the moon.
      for (const [x, lean] of [[-0.12, -0.06], [0.14, 0.04]] as const) {
        inked(g, [(x - 0.09) * r, -0.74 * r, (x + lean) * r, -1.0 * r, (x + 0.1) * r, -0.74 * r], p.face, 2);
        g.poly([(x - 0.04) * r, -0.77 * r, (x + lean * 0.8) * r, -0.92 * r, (x + 0.05) * r, -0.77 * r]).fill(0xc89a8a);
      }
      fangs(g, 0.33 * r, -0.24 * r, r);
      g.circle(0.22 * r, -0.48 * r, 0.1 * r).fill({ color: 0xffd23a, alpha: 0.25 });
      // Ragged fur at the cheeks.
      for (const y of [-0.3, -0.2]) g.poly([0.0, y * r, -0.12 * r, (y + 0.05) * r, 0.0, (y + 0.08) * r]).fill(p.mane);
    },
    torso(g, r) {
      // What's left of a shirt, torn to rags across his chest.
      const rags: Pts = [-0.42 * r, -0.86 * r, 0.44 * r, -0.86 * r, 0.5 * r, -0.5 * r, 0.36 * r, -0.4 * r, 0.26 * r, -0.52 * r, 0.12 * r, -0.36 * r, 0.0, -0.5 * r, -0.14 * r, -0.38 * r, -0.28 * r, -0.52 * r, -0.44 * r, -0.42 * r];
      inked(g, rags, 0x5a3a6a, 2);
    },
  },
  kingrix: {
    name: 'Vampire King',
    colors: { cape: 0x1a1420, ermine: 0xa8182b, spots: 0x1a1420, skin: 0xd8d4e0, crown: 0x9aa1ab, jewelA: 0xc0182b, jewelB: 0xc0182b, scepter: 0x6a6a70, orb: 0x9a2030, gem: 0xff3040 },
    head(g, r) {
      fangs(g, 0.27 * r, -0.17 * r, r);
      g.circle(0.25 * r, -0.4 * r, 0.03 * r).fill(0xff3040);
      // Sunken cheeks.
      g.moveTo(0.12 * r, -0.3 * r).quadraticCurveTo(0.18 * r, -0.24 * r, 0.16 * r, -0.18 * r).stroke({ width: 1.6, color: 0x8a8098, alpha: 0.8 });
    },
    back(g, r) {
      // The collar, up high behind the head, black outside and red within.
      const collar = smooth([-0.08 * r, -0.86 * r, -0.42 * r, -1.36 * r, -0.12 * r, -1.22 * r, 0.06 * r, -1.42 * r, 0.16 * r, -0.86 * r], true, 1);
      inked(g, collar, 0x1a1420, 2.5);
      g.poly(smooth([-0.06 * r, -0.9 * r, -0.32 * r, -1.28 * r, -0.1 * r, -1.16 * r, 0.04 * r, -1.32 * r, 0.12 * r, -0.9 * r], true, 1)).fill(0xa8182b);
    },
  },
  dongmaster: {
    name: "Swole-o'-Lantern",
    colors: { tank: PUMPKIN, band: 0x2f7a2a, wrap: PUMPKIN, hair: 0x1a1008 },
    torso(g, r) {
      // The tank top's a carved pumpkin.
      carve(g, 0.3 * r, -0.5 * r, 0.42 * r, 0x6a2a08);
    },
    head(g, r) {
      // A pumpkin stem sprouting from the sweatband.
      inked(g, smooth([-0.02 * r, -0.66 * r, 0.02 * r, -0.86 * r, 0.12 * r, -0.84 * r, 0.08 * r, -0.66 * r], true, 1), 0x3a5a1a, 1.8);
    },
  },
  dabber: {
    name: 'Plague Doctor',
    colors: { hood: 0x1a1a1e, hoodEdge: 0x0a0a0e, fur: 0x5a5a50, eyes: 0xff4a4a, smoke: 0x8fd14f, rig: 0x6a6a70, rigEdge: 0x2a2a30 },
    masked: true,
    head(g, r) {
      // The beaked mask over his snout, a glass eye, stitched seams.
      const beak = smooth([0.06 * r, -0.5 * r, 0.42 * r, -0.44 * r, 0.9 * r, -0.16 * r, 0.42 * r, -0.12 * r, 0.06 * r, -0.14 * r], true, 2);
      inked(g, beak, BONE, 2.5, 0x5a4a30);
      g.moveTo(0.3 * r, -0.46 * r).quadraticCurveTo(0.6 * r, -0.3 * r, 0.86 * r, -0.17 * r).stroke({ width: 1.5, color: 0x8a7a5a });
      for (let i = 0; i < 4; i++) g.moveTo((0.4 + i * 0.12) * r, (-0.4 + i * 0.06) * r).lineTo((0.42 + i * 0.12) * r, (-0.36 + i * 0.06) * r).stroke({ width: 1.2, color: 0x6a5a3a });
      g.circle(0.28 * r, -0.36 * r, 0.08 * r).fill(0x8a1a1a).stroke({ width: 2.5, color: 0x3a3a40 });
      g.circle(0.25 * r, -0.39 * r, 0.025 * r).fill({ color: 0xffffff, alpha: 0.7 });
    },
    dangle: {
      at: [0.0, -0.74],
      give: 0.7,
      draw(g, r) {
        // A wide-brimmed black hat.
        g.ellipse(0.0, -0.76 * r, 0.42 * r, 0.08 * r).fill(0x16161a).stroke({ width: 2, color: 0x050508 });
        inked(g, smooth([-0.22 * r, -0.78 * r, -0.2 * r, -1.08 * r, 0.2 * r, -1.1 * r, 0.22 * r, -0.78 * r], true, 1), 0x1a1a1e, 2, 0x050508);
        g.rect(-0.21 * r, -0.86 * r, 0.42 * r, 0.05 * r).fill(0x5a1a1a);
      },
    },
  },
  paris: {
    name: 'Phantom of the Boulevard',
    colors: { jacket: 0x1a1a20, jacketShade: 0x0a0a10, beret: 0x1a1a20, stem: 0x0a0a10, scarf: 0xc0182b, mustache: 0x1a1414, guard: 0xc0182b, grip: 0x1a1414 },
    head(g, r) {
      // The white half-mask over the near side of his face, with an eye hole.
      const mask = smooth([0.06 * r, -0.6 * r, 0.3 * r, -0.6 * r, 0.36 * r, -0.44 * r, 0.32 * r, -0.28 * r, 0.12 * r, -0.26 * r, 0.04 * r, -0.4 * r], true, 2);
      inked(g, mask, 0xf6f4f0, 2, 0x8a8a90);
      g.ellipse(0.2 * r, -0.42 * r, 0.07 * r, 0.05 * r).fill(0x1a1414);
      g.circle(0.22 * r, -0.42 * r, 0.025 * r).fill(0xffffff);
    },
    torso(g, r) {
      // A red rose at the lapel.
      g.circle(0.24 * r, -0.62 * r, 0.06 * r).fill(0xc0182b).stroke({ width: 1.5, color: 0x5a0a14 });
      g.moveTo(0.24 * r, -0.56 * r).lineTo(0.2 * r, -0.44 * r).stroke({ width: 2, color: 0x2a5a1a });
    },
  },
  havarti: {
    name: 'Haunted Havarti',
    colors: { wheel: 0xdfe8f0, rind: 0x8a9aa8, holes: 0x4a5a6a, wing: 0x3a3440, wingEdge: 0x1a1620, halo: 0x8fffc8, eyes: 0x1a1a2a, blade: 0xb8ffe0, hilt: 0x3a4a5a, flame: 0x8fffc8 },
    masked: true,
    torso(g, r) {
      // Hollow eyes and a moan for a mouth, and ghostly drips down the rind.
      for (const x of [0.08, 0.3]) {
        g.ellipse(x * r, -0.85 * r, 0.07 * r, 0.09 * r).fill(0x1a1a2a);
        g.ellipse(x * r, -0.85 * r, 0.1 * r, 0.12 * r).stroke({ width: 2, color: 0x8fffc8, alpha: 0.5 });
      }
      g.ellipse(0.19 * r, -0.66 * r, 0.06 * r, 0.08 * r).fill(0x1a1a2a);
      for (const [x, len] of [[-0.42, 0.18], [-0.1, 0.12], [0.36, 0.16]] as const) {
        const y = -0.62 * r + Math.sqrt(Math.max(0, 0.64 * 0.64 - x * x)) * r * 0.98;
        inkLine(g, x * r, y - 0.04 * r, x * r, y + len * r, 0.05 * r, { color: 0x8fffc8, alpha: 0.7, tip: 0.2 }, 0);
      }
    },
  },
  daltonomo: {
    name: 'Dead Funny',
    colors: { tunicA: 0x111114, tunicB: 0x2a2a30, hatA: 0x111114, hatB: 0xe8e4d8, bell: 0xc9c3b4, face: 0xf2efe6, grin: 0x111114, eye: 0x111114, ruff: 0x2a2a30 },
    head(g, r) {
      // Skull paint: a nose hole and teeth along the grin.
      g.poly([0.3 * r, -0.33 * r, 0.27 * r, -0.26 * r, 0.33 * r, -0.26 * r]).fill(0x111114);
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const x = 0.06 + 0.3 * t;
        const y = -0.24 + Math.sin(t * Math.PI) * 0.08;
        g.moveTo(x * r, (y - 0.035) * r).lineTo(x * r, (y + 0.035) * r).stroke({ width: 1.4, color: 0x111114 });
      }
    },
    torso(g, r) {
      // Ribs and a spine, in bone.
      g.moveTo(0.02 * r, -0.74 * r).lineTo(0.02 * r, -0.1 * r).stroke({ width: 3, color: BONE });
      for (const y of [-0.64, -0.52, -0.4, -0.28]) {
        g.moveTo(0.02 * r, y * r).quadraticCurveTo(0.26 * r, (y - 0.02) * r, 0.3 * r, (y + 0.08) * r).stroke({ width: 2.5, color: BONE, cap: 'round' });
        g.moveTo(0.02 * r, y * r).quadraticCurveTo(-0.2 * r, (y - 0.02) * r, -0.26 * r, (y + 0.08) * r).stroke({ width: 2.5, color: BONE, cap: 'round' });
      }
    },
  },
  scrimby: {
    name: 'Zombie Commuter',
    colors: { skin: 0x9ab87a, jacket: 0x3a3a40, jacketDark: 0x1e1e22, jeans: 0x4a4a52, hood: 0x5a5a60, cup: 0x5a5a60, hair: 0x2a3a1a },
    head(g, r) {
      // Stitches across the brow, a bite out of the ear, dead eyes.
      inkLine(g, 0.02 * r, -0.56 * r, 0.34 * r, -0.6 * r, 1.8, { color: 0x2a3a1a }, 0.05);
      for (let i = 0; i < 5; i++) g.moveTo((0.04 + i * 0.07) * r, -0.62 * r).lineTo((0.05 + i * 0.07) * r, -0.54 * r).stroke({ width: 1.4, color: 0x2a3a1a });
      g.circle(-0.1 * r, -0.46 * r, 0.05 * r).fill(0x5a1a1a);
      g.circle(0.22 * r, -0.42 * r, 0.03 * r).fill(0xd8e8c0);
    },
    torso(g, r) {
      // The jacket torn open, stuffing spilling out.
      for (const [x, y] of [[-0.2, -0.5], [0.18, -0.3]] as const) {
        g.poly([x * r, y * r, (x + 0.1) * r, (y - 0.06) * r, (x + 0.16) * r, (y + 0.04) * r, (x + 0.06) * r, (y + 0.1) * r]).fill(0x1a1a1e);
        g.circle((x + 0.08) * r, (y + 0.02) * r, 0.03 * r).fill(0xe8e4d8);
      }
    },
  },
  bigwhale: {
    name: 'Moby Rich',
    colors: { whale: 0xe8eef2, belly: 0xffffff, blazer: 0x2a3a3a, trim: 0x8fffc8, hat: 0x2a3a3a, band: 0x8fffc8, shades: 0x0a1a14, cash: 0x8fffc8 },
    head(g, r) {
      // The harpoon he swears he doesn't notice, and the barnacles.
      inkLine(g, -0.1 * r, -0.5 * r, -0.62 * r, -0.98 * r, 4, { color: 0x6a4a2a, tip: 0.2 }, 0);
      g.poly([-0.1 * r, -0.5 * r, -0.02 * r, -0.62 * r, -0.2 * r, -0.56 * r]).fill(0x9aa1ab).stroke({ width: 1.2, color: 0x3a3f48 });
      g.moveTo(-0.62 * r, -0.98 * r).quadraticCurveTo(-0.9 * r, -0.8 * r, -0.8 * r, -0.5 * r).stroke({ width: 1.6, color: 0xc8b890 });
      for (const [x, y] of [[0.36, -0.46], [0.46, -0.34], [0.06, -0.5]] as const) g.circle(x * r, y * r, 0.03 * r).fill(0xc8c0b0).stroke({ width: 1, color: 0x6a6460 });
    },
  },
};

const costumed = new Map<ChampionId, Build>();

/** The build to draw a champion in a look: the costume's pieces on top of the usual figure for the Halloween one. */
export function buildFor(id: ChampionId, skin = 0): Build {
  const base = BUILDS[id];
  if (skin !== COSTUME_SKIN) return base;
  let b = costumed.get(id);
  if (!b) {
    const c = COSTUMES[id];
    b = {
      ...base,
      head: (g, r, p) => {
        base.head(g, r, p);
        c.head?.(g, r, p);
      },
      torso: (g, r, p) => {
        base.torso(g, r, p);
        c.torso?.(g, r, p);
      },
      back:
        base.back || c.back
          ? (g, r, p) => {
              base.back?.(g, r, p);
              c.back?.(g, r, p);
            }
          : undefined,
      dangle: c.dangle ?? base.dangle,
      face: c.masked ? undefined : base.face,
    };
    costumed.set(id, b);
  }
  return b;
}

