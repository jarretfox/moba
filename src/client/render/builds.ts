import type { Graphics } from 'pixi.js';
import type { ChampionId } from '../../shared/champions/types';
import { blob, inkLine, inkOf, inked, mix, shade, smooth, type Pts } from './organic';
import { boot, limb, type Build, type Held, type Palette, type Proportions } from './rig';

// What each champion looks like standing up: their proportions, and the torso, head, back and weapon
// drawn in the hand-inked style. Everything is in units of the unit's radius `r`, facing right (+x),
// with up as −y. The torso hangs from the hips at (0, 0); the head sits on the neck at (0, 0).

const HUMAN: Proportions = { thigh: 0.46, shin: 0.42, torso: 0.82, shoulder: 0.12, shoulderX: 0.04, upper: 0.42, fore: 0.4, legW: 0.3, armW: 0.25, foot: 0.3, headH: 0.86 };
const CHUD: Proportions = { thigh: 0.34, shin: 0.32, torso: 0.78, shoulder: 0.16, shoulderX: 0.08, upper: 0.42, fore: 0.42, legW: 0.32, armW: 0.27, foot: 0.3, headH: 0.9 };

const sized = (base: Proportions, over: Partial<Proportions>): Proportions => ({ ...base, ...over });

/** A body from the hips (0, 0) up to the neck: back, shoulders, chest and belly. `hem` hangs below the hips. */
function trunk(r: number, h: number, back: number, front: number, chest = 1, belly = 1, hem = 0.05): Pts {
  return smooth(
    [
      -back * 0.95 * r, hem * r,
      -back * r, -h * 0.35 * r,
      -back * 0.92 * r, -h * 0.82 * r,
      -back * 0.45 * r, -h * 1.03 * r,
      front * 0.35 * r, -h * 1.03 * r,
      front * chest * r, -h * 0.72 * r,
      front * belly * r, -h * 0.3 * r,
      front * 0.92 * r, hem * r,
      0, (hem + 0.04) * r,
    ],
    true,
    2,
  );
}

/** An eye looking forward: white, iris toward the front, a lid line over it. */
function eye(g: Graphics, x: number, y: number, s: number, iris = 0x1a1a22, lid?: number): void {
  g.ellipse(x, y, s * 0.8, s).fill(0xfffbf0).stroke({ width: 1.5, color: 0x1a1414 });
  g.circle(x + s * 0.3, y + s * 0.05, s * 0.5).fill(iris);
  g.circle(x + s * 0.12, y - s * 0.3, s * 0.18).fill({ color: 0xffffff, alpha: 0.9 });
  if (lid !== undefined) g.moveTo(x - s, y - s * 0.45).lineTo(x + s, y - s * 0.7 + lid).stroke({ width: 2.4, color: 0x1a1414, cap: 'round' });
}

/** A brow: a short thick stroke, `tilt` + angry, − worried. */
function brow(g: Graphics, x: number, y: number, len: number, tilt: number, color = 0x2a1a10): void {
  inkLine(g, x - len / 2, y - tilt, x + len / 2, y + tilt, len * 0.28, { color, tip: 0.4 }, 0.1);
}

/** A head-shaped lump around (cx, cy). */
function skull(cx: number, cy: number, rx: number, ry: number, seed: number): Pts {
  return blob(cx, cy, rx, ry, seed, 0.05, 28);
}

function ear(g: Graphics, x: number, y: number, s: number, color: number): void {
  g.ellipse(x, y, s * 0.55, s * 0.8).fill(color).stroke({ width: 1.8, color: inkOf(color) });
  g.ellipse(x + s * 0.05, y, s * 0.25, s * 0.45).fill(shade(color, 0.25));
}

/** A mitten-like hand, or a fist when `fist`. */
function mitt(g: Graphics, r: number, color: number, fist = false): void {
  if (fist) {
    g.roundRect(-0.06 * r, -0.13 * r, 0.26 * r, 0.26 * r, 0.08 * r).fill(color).stroke({ width: 2, color: inkOf(color) });
    for (let i = -1; i <= 1; i++) g.moveTo(0.16 * r, i * 0.07 * r).lineTo(0.2 * r, i * 0.07 * r).stroke({ width: 1.5, color: inkOf(color) });
    return;
  }
  g.ellipse(0.05 * r, 0, 0.13 * r, 0.11 * r).fill(color).stroke({ width: 2, color: inkOf(color) });
}

/** Bare feet (a Chud's, a rat's, a lion's): a rounded pad with toes. */
function bareFoot(g: Graphics, r: number, color: number, claws = 0): void {
  const pts = smooth([-0.08 * r, -0.12 * r, 0.12 * r, -0.1 * r, 0.3 * r, -0.02 * r, 0.32 * r, 0.08 * r, -0.1 * r, 0.08 * r], true, 2);
  g.poly(pts).fill(color).stroke({ width: 2, color: inkOf(color), join: 'round' });
  for (let i = 0; i < 2; i++) g.moveTo((0.16 + i * 0.07) * r, 0.0).lineTo((0.17 + i * 0.07) * r, 0.07 * r).stroke({ width: 1.5, color: inkOf(color) });
  for (let i = 0; i < claws; i++) g.poly([(0.27 + i * 0.03) * r, 0.04 * r, (0.36 + i * 0.03) * r, 0.07 * r, (0.28 + i * 0.03) * r, 0.08 * r]).fill(0xf2efe6);
}

// ─── Weapons, side on ─────────────────────────────────────────────────────────

const bow: Held = {
  hold: 0,
  draw(g, r, p) {
    // The bow upright in the fist, the string behind, an arrow nocked.
    const limbPts: Pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = (t - 0.5) * 1.7 * r;
      limbPts.push(0.06 * r + Math.cos((t - 0.5) * Math.PI) * 0.22 * r, y);
    }
    g.moveTo(limbPts[0], limbPts[1]).lineTo(-0.26 * r, 0).lineTo(limbPts[24], limbPts[25]).stroke({ width: 1.4, color: p.string });
    for (let i = 0; i < limbPts.length; i += 2) (i ? g.lineTo(limbPts[i], limbPts[i + 1]) : g.moveTo(limbPts[i], limbPts[i + 1]));
    g.stroke({ width: 5.5, color: inkOf(p.bow), cap: 'round' });
    for (let i = 0; i < limbPts.length; i += 2) (i ? g.lineTo(limbPts[i], limbPts[i + 1]) : g.moveTo(limbPts[i], limbPts[i + 1]));
    g.stroke({ width: 3.2, color: p.bow, cap: 'round' });
    g.moveTo(-0.26 * r, 0).lineTo(0.62 * r, 0).stroke({ width: 2, color: p.arrow });
    g.poly([0.6 * r, -0.07 * r, 0.76 * r, 0, 0.6 * r, 0.07 * r]).fill(p.tip).stroke({ width: 1.2, color: inkOf(p.tip) });
    g.poly([-0.26 * r, 0, -0.36 * r, -0.07 * r, -0.2 * r, 0]).fill(p.fletch);
    g.poly([-0.26 * r, 0, -0.36 * r, 0.07 * r, -0.2 * r, 0]).fill(p.fletch);
  },
};

const axe: Held = {
  hold: -1.15,
  draw(g, r, p) {
    limb(g, 1.15 * r, 0.12 * r, 0.1 * r, p.haft);
    const blade = smooth([0.75 * r, -0.08 * r, 0.82 * r, -0.42 * r, 1.12 * r, -0.5 * r, 1.08 * r, -0.08 * r, 1.12 * r, 0.3 * r, 0.82 * r, 0.24 * r], true, 1);
    inked(g, blade, p.blade, 2.5);
    g.moveTo(1.06 * r, -0.42 * r).quadraticCurveTo(1.0 * r, -0.1 * r, 1.06 * r, 0.22 * r).stroke({ width: 2, color: 0xffffff, alpha: 0.55 });
    g.circle(0.9 * r, -0.08 * r, 0.05 * r).fill(inkOf(p.blade));
  },
};

const hookRope: Held = {
  hold: 1.2,
  draw(g, r, p) {
    g.moveTo(0, 0).quadraticCurveTo(0.25 * r, 0.15 * r, 0.5 * r, 0.05 * r).stroke({ width: 2.5, color: p.rope });
    g.moveTo(0.5 * r, 0.05 * r).arc(0.62 * r, 0.05 * r, 0.12 * r, Math.PI, Math.PI * 2.5).stroke({ width: 5.5, color: inkOf(p.hook), cap: 'round' });
    g.moveTo(0.5 * r, 0.05 * r).arc(0.62 * r, 0.05 * r, 0.12 * r, Math.PI, Math.PI * 2.5).stroke({ width: 3.2, color: p.hook, cap: 'round' });
    g.poly([0.62 * r, 0.17 * r, 0.52 * r, 0.12 * r, 0.6 * r, 0.24 * r]).fill(p.hook);
  },
};

const staff: Held = {
  hold: -1.45,
  draw(g, r, p) {
    g.position.set(0, 0);
    limb(g, 1.35 * r, 0.09 * r, 0.08 * r, p.staff);
    limb(g, -0.45 * r, 0.09 * r, 0.08 * r, p.staff);
    g.circle(1.42 * r, 0, 0.3 * r).fill({ color: p.orbGlow, alpha: 0.25 });
    g.circle(1.42 * r, 0, 0.16 * r).fill(p.orb).stroke({ width: 2, color: p.orbEdge });
    g.circle(1.38 * r, -0.05 * r, 0.05 * r).fill({ color: 0xffffff, alpha: 0.8 });
    // A twist of root round the top.
    inkLine(g, 1.2 * r, -0.08 * r, 1.42 * r, 0.16 * r, 3, { color: p.staff }, 0.4);
  },
};

const scepter: Held = {
  hold: -1.25,
  draw(g, r, p) {
    limb(g, 0.95 * r, 0.08 * r, 0.07 * r, p.scepter);
    g.circle(1.02 * r, 0, 0.15 * r).fill(p.orb).stroke({ width: 2, color: 0x8a6a1e });
    g.circle(1.02 * r, 0, 0.06 * r).fill(p.gem);
    g.poly([1.12 * r, -0.04 * r, 1.26 * r, 0, 1.12 * r, 0.04 * r]).fill(p.orb);
    g.circle(0.98 * r, -0.06 * r, 0.035 * r).fill({ color: 0xffffff, alpha: 0.8 });
  },
};

const epee: Held = {
  hold: 0.12,
  draw(g, r, p) {
    g.moveTo(-0.16 * r, 0).lineTo(0.04 * r, 0).stroke({ width: 5, color: p.grip, cap: 'round' });
    g.moveTo(0.08 * r, 0).lineTo(1.6 * r, 0).stroke({ width: 3.2, color: inkOf(p.blade), cap: 'round' });
    g.moveTo(0.08 * r, 0).lineTo(1.6 * r, 0).stroke({ width: 1.8, color: p.blade, cap: 'round' });
    g.ellipse(0.08 * r, 0, 0.05 * r, 0.15 * r).fill(p.guard).stroke({ width: 1.8, color: inkOf(p.guard) });
  },
};

const cheeseKnife: Held = {
  hold: -0.9,
  draw(g, r, p) {
    g.moveTo(-0.16 * r, 0).lineTo(0.08 * r, 0).stroke({ width: 5, color: p.hilt, cap: 'round' });
    g.moveTo(0.16 * r, -0.12 * r).lineTo(1.12 * r, -0.12 * r).stroke({ width: 7, color: p.flame, alpha: 0.35, cap: 'round' });
    const blade: Pts = [0.1 * r, -0.08 * r, 1.12 * r, -0.08 * r, 1.26 * r, -0.04 * r, 1.15 * r, 0, 1.26 * r, 0.04 * r, 1.08 * r, 0.08 * r, 0.1 * r, 0.08 * r];
    inked(g, blade, p.blade, 2);
    for (const x of [0.42, 0.66, 0.9]) g.circle(x * r, 0, 0.03 * r).fill(p.hilt);
    g.roundRect(0.05 * r, -0.13 * r, 0.07 * r, 0.26 * r, 0.02 * r).fill(p.hilt).stroke({ width: 1.5, color: inkOf(p.hilt) });
  },
};

const rigBow: Held = {
  hold: 0,
  draw(g, r, p) {
    limb(g, 0.75 * r, 0.12 * r, 0.1 * r, p.wood); // the stock
    g.moveTo(0.6 * r, -0.36 * r).quadraticCurveTo(0.78 * r, 0, 0.6 * r, 0.36 * r).stroke({ width: 5, color: inkOf(p.wood), cap: 'round' });
    g.moveTo(0.6 * r, -0.36 * r).quadraticCurveTo(0.78 * r, 0, 0.6 * r, 0.36 * r).stroke({ width: 3, color: p.wood, cap: 'round' });
    g.moveTo(0.6 * r, -0.36 * r).lineTo(0.45 * r, 0).lineTo(0.6 * r, 0.36 * r).stroke({ width: 1, color: p.string });
    // The glass bulb, bubbling.
    g.circle(0.3 * r, -0.16 * r, 0.14 * r).fill({ color: p.rig, alpha: 0.85 }).stroke({ width: 2, color: p.rigEdge });
    g.rect(0.27 * r, -0.05 * r, 0.06 * r, 0.06 * r).fill(p.rigEdge);
    g.circle(0.26 * r, -0.2 * r, 0.04 * r).fill({ color: 0xffffff, alpha: 0.7 });
    g.circle(0.36 * r, -0.4 * r, 0.06 * r).fill({ color: p.smoke, alpha: 0.5 });
    g.circle(0.42 * r, -0.52 * r, 0.04 * r).fill({ color: p.smoke, alpha: 0.35 });
  },
};

const dagger = (hold: number): Held => ({
  hold,
  draw(g, r, p) {
    g.rect(-0.14 * r, -0.045 * r, 0.14 * r, 0.09 * r).fill(p.hilt).stroke({ width: 1.5, color: inkOf(p.hilt) });
    g.moveTo(0.01 * r, -0.11 * r).lineTo(0.01 * r, 0.11 * r).stroke({ width: 3, color: p.bell, cap: 'round' });
    inked(g, [0.03 * r, -0.06 * r, 0.5 * r, 0, 0.03 * r, 0.06 * r], p.blade, 1.6);
  },
});

// ─── The champions ────────────────────────────────────────────────────────────

export const BUILDS: Record<ChampionId, Build> = {
  /** Jordini: a hooded ranger who has read every rule. Long cloak, quiver, a bow held low, a permanent frown. */
  marksman: {
    size: sized(HUMAN, { torso: 0.84 }),
    arms: [1.05, 0.45, 1.4, 0.3],
    colors: { sleeve: 'cloak', hand: 'hand', leg: 'pants', boot: 'quiver' },
    prep: (p) => ({ pants: shade(p.cloak, 0.45) }),
    back(g, r, p) {
      // The quiver across the back, fletchings over the shoulder.
      g.position.set(0, 0);
      const q: Pts = [-0.42 * r, -0.2 * r, -0.2 * r, -0.95 * r, -0.04 * r, -0.9 * r, -0.26 * r, -0.14 * r];
      for (const [x, y, a] of [[-0.12, -1.05, -0.5], [-0.04, -1.0, -0.2], [-0.2, -1.08, -0.8]]) {
        inkLine(g, x * r, y * r + 0.2 * r, x * r + Math.sin(a) * 0.1 * r, y * r - 0.12 * r, 7, { color: p.fletch, tip: 0.3 }, 0);
      }
      inked(g, q, p.quiver, 2.5);
      g.moveTo(-0.38 * r, -0.36 * r).lineTo(-0.16 * r, -0.4 * r).stroke({ width: 2, color: shade(p.quiver, 0.35) });
    },
    torso(g, r, p) {
      // A long cloak, flaring below the hips.
      inked(g, trunk(r, 0.84, 0.36, 0.34, 1.05, 1.0, 0.28), p.cloak, 3);
      g.moveTo(-0.05 * r, -0.8 * r).quadraticCurveTo(0.05 * r, -0.3 * r, -0.02 * r, 0.26 * r).stroke({ width: 2, color: shade(p.cloak, 0.35) }); // a fold
      g.moveTo(-0.3 * r, -0.78 * r).lineTo(0.28 * r, -0.34 * r).stroke({ width: 4, color: p.quiver }); // the strap
      g.circle(0.22 * r, -0.76 * r, 0.06 * r).fill(0xd9c27a).stroke({ width: 1.5, color: 0x6b5a22 }); // a clasp
    },
    head(g, r, p) {
      // The hood, peaked at the back, the face in its shadow, two disapproving eyes.
      const hood = smooth([-0.36 * r, 0.02 * r, -0.44 * r, -0.45 * r, -0.5 * r, -0.86 * r, -0.12 * r, -0.82 * r, 0.24 * r, -0.66 * r, 0.36 * r, -0.36 * r, 0.3 * r, 0.02 * r], true, 2);
      inked(g, hood, p.hood, 3);
      const face = smooth([0.0, -0.08 * r, 0.02 * r, -0.56 * r, 0.24 * r, -0.6 * r, 0.32 * r, -0.36 * r, 0.26 * r, -0.08 * r], true, 2);
      g.poly(face).fill(p.face);
      g.ellipse(0.18 * r, -0.34 * r, 0.12 * r, 0.16 * r).fill({ color: p.hand, alpha: 0.35 }); // light on the cheek
      eye(g, 0.18 * r, -0.4 * r, 0.065 * r, 0x2a3a2a, 0.02 * r);
      brow(g, 0.18 * r, -0.5 * r, 0.16 * r, 0.025 * r);
      g.moveTo(0.14 * r, -0.2 * r).quadraticCurveTo(0.2 * r, -0.24 * r, 0.27 * r, -0.19 * r).stroke({ width: 2, color: 0x1a1414 }); // the frown
    },
    weapon: bow,
    gait: { swing: 0.5, lean: 0.06 },
  },

  /** The Oak: a slab of a berserker. Horned helmet (or tinfoil), a beard, fur, a broken shackle, and the axe. */
  barbarian: {
    size: sized(HUMAN, { torso: 0.86, legW: 0.36, armW: 0.33, upper: 0.44, fore: 0.42, thigh: 0.44, shin: 0.4 }),
    arms: [1.25, 0.6, 1.45, 0.25],
    colors: { sleeve: 'skin', hand: 'skin', leg: 'pants', boot: 'fur' },
    prep: (p) => ({ pants: shade(p.fur, 0.35) }),
    torso(g, r, p) {
      inked(g, trunk(r, 0.86, 0.5, 0.52, 1.15, 1.05, 0.12), p.skin, 3);
      // Pecs and a scar, and a fur kilt round the waist.
      g.moveTo(0.05 * r, -0.6 * r).quadraticCurveTo(0.35 * r, -0.5 * r, 0.5 * r, -0.62 * r).stroke({ width: 2, color: shade(p.skin, 0.3) });
      inkLine(g, -0.1 * r, -0.72 * r, 0.12 * r, -0.4 * r, 2.5, { color: 0xb05a4a, alpha: 0.8 }, 0.1);
      const kilt = smooth([-0.54 * r, -0.12 * r, 0.56 * r, -0.12 * r, 0.6 * r, 0.22 * r, 0.3 * r, 0.16 * r, 0.1 * r, 0.26 * r, -0.15 * r, 0.16 * r, -0.4 * r, 0.24 * r, -0.58 * r, 0.14 * r], true, 1);
      inked(g, kilt, p.fur, 2.5);
      for (const x of [-0.35, -0.05, 0.25]) g.circle(x * r, 0.02 * r, 0.06 * r).fill(p.furDot);
      g.rect(-0.55 * r, -0.2 * r, 1.1 * r, 0.1 * r).fill(shade(p.fur, 0.4)); // belt
    },
    cap(g, r, p) {
      // A fur pauldron on the near shoulder.
      inked(g, blob(0, 0.02 * r, 0.26 * r, 0.2 * r, 11, 0.25, 16), p.fur, 2.5);
      for (const [x, y] of [[-0.1, -0.04], [0.08, 0.06], [0.0, -0.1]]) g.circle(x * r, y * r, 0.045 * r).fill(p.furDot);
    },
    head(g, r, p) {
      const face = skull(0.08 * r, -0.36 * r, 0.32 * r, 0.36 * r, 3);
      inked(g, face, p.skin, 3);
      // The beard, big and wild.
      const beard = smooth([-0.05 * r, -0.28 * r, 0.42 * r, -0.26 * r, 0.44 * r, 0.02 * r, 0.3 * r, 0.12 * r, 0.12 * r, 0.06 * r, -0.08 * r, -0.04 * r], true, 2);
      inked(g, beard, p.fur, 2.5);
      eye(g, 0.24 * r, -0.4 * r, 0.075 * r, 0x2a1a10);
      eye(g, 0.36 * r, -0.41 * r, 0.05 * r, 0x2a1a10); // the far eye, not quite pointing the same way
      brow(g, 0.27 * r, -0.53 * r, 0.24 * r, 0.04 * r, 0x2a1a10);
      g.poly([0.4 * r, -0.36 * r, 0.48 * r, -0.26 * r, 0.38 * r, -0.26 * r]).fill(shade(p.skin, 0.1)).stroke({ width: 1.5, color: inkOf(p.skin) }); // nose
      // The helmet and its horns (or the tinfoil hat: same shape, just shinier).
      const helm = smooth([-0.3 * r, -0.44 * r, -0.26 * r, -0.72 * r, 0.06 * r, -0.84 * r, 0.36 * r, -0.66 * r, 0.4 * r, -0.48 * r], true, 2);
      inked(g, helm, p.helmet, 3);
      g.rect(-0.31 * r, -0.52 * r, 0.72 * r, 0.08 * r).fill(shade(p.helmet, 0.3));
      for (const [x, dir] of [[0.22, 1], [-0.2, -1]] as const) {
        const horn: Pts = [x * r, -0.66 * r, (x + dir * 0.16) * r, -0.86 * r, (x + dir * 0.34) * r, -0.98 * r, (x + dir * 0.2) * r, -0.78 * r, (x + dir * 0.06) * r, -0.6 * r];
        inked(g, smooth(horn, true, 1), p.horns, 2);
      }
    },
    weapon: axe,
    gait: { swing: 0.55, bounce: 0.09, lean: 0.12 },
  },

  /** Willmore: Gutter King of the Deep. A squat Chud in goggles, a bin-lid crown, a sack of junk on his back. */
  willmore: {
    size: sized(CHUD, {}),
    arms: [1.35, 0.4, 1.5, 0.2],
    colors: { sleeve: 'body', hand: 'body', leg: 'body', boot: 'patch' },
    back(g, r, p) {
      const sack = blob(-0.42 * r, -0.62 * r, 0.4 * r, 0.44 * r, 21, 0.18, 22);
      inked(g, sack, p.sack, 3);
      inked(g, blob(-0.5 * r, -0.62 * r, 0.12 * r, 0.1 * r, 4, 0.2, 10), p.patch, 1.5);
      // Junk poking out the top: a boot, a can, a bone.
      inked(g, [-0.3 * r, -1.0 * r, -0.18 * r, -1.0 * r, -0.18 * r, -1.18 * r, -0.3 * r, -1.18 * r], 0xb8bec6, 1.5);
      inkLine(g, -0.6 * r, -0.98 * r, -0.48 * r, -1.2 * r, 5, { color: 0xe8e0cc }, 0);
      g.moveTo(-0.2 * r, -0.86 * r).lineTo(-0.66 * r, -0.92 * r).stroke({ width: 3, color: p.rope });
    },
    torso(g, r, p) {
      inked(g, trunk(r, 0.78, 0.4, 0.42, 1.0, 1.25, 0.08), p.body, 3);
      g.ellipse(0.12 * r, -0.3 * r, 0.24 * r, 0.2 * r).fill({ color: shade(p.body, -0.15), alpha: 0.6 }); // the belly
      g.moveTo(-0.4 * r, -0.08 * r).lineTo(0.48 * r, -0.12 * r).stroke({ width: 4, color: p.rope }); // a rope belt
      g.moveTo(-0.36 * r, -0.76 * r).lineTo(0.3 * r, -0.2 * r).stroke({ width: 4, color: p.strap }); // the sack's strap
    },
    head(g, r, p) {
      inked(g, skull(0.08 * r, -0.36 * r, 0.38 * r, 0.36 * r, 5), p.body, 3);
      ear(g, -0.22 * r, -0.36 * r, 0.16 * r, p.body);
      // A wide Chud grin with a missing tooth.
      g.moveTo(0.18 * r, -0.16 * r).quadraticCurveTo(0.34 * r, -0.08 * r, 0.44 * r, -0.2 * r).stroke({ width: 2.5, color: 0x1a1414 });
      g.rect(0.26 * r, -0.15 * r, 0.05 * r, 0.05 * r).fill(0xf2efe6);
      g.rect(0.35 * r, -0.16 * r, 0.05 * r, 0.05 * r).fill(0xf2efe6);
      // Goggles over the eyes.
      g.moveTo(-0.28 * r, -0.44 * r).lineTo(0.2 * r, -0.44 * r).stroke({ width: 4, color: p.strap });
      for (const x of [0.22, 0.4]) {
        g.circle(x * r, -0.42 * r, 0.11 * r).fill(p.goggles).stroke({ width: 3.5, color: p.rim });
        g.circle((x - 0.03) * r, -0.45 * r, 0.03 * r).fill({ color: 0xffffff, alpha: 0.8 });
      }
      // The bin lid, worn like a crown.
      const lid: Pts = [-0.34 * r, -0.66 * r, 0.42 * r, -0.74 * r, 0.44 * r, -0.66 * r, -0.34 * r, -0.58 * r];
      inked(g, smooth(lid, true, 1), p.lid, 2.5);
      inked(g, [0.0, -0.72 * r, 0.12 * r, -0.73 * r, 0.12 * r, -0.82 * r, 0.0, -0.81 * r], p.lidKnob, 1.5);
    },
    weapon: hookRope,
    foot: (g, r, p) => bareFoot(g, r, p.body),
    gait: { swing: 0.6, bounce: 0.1, lean: 0.1 },
  },

  /** HunnaG: Rot of the Deep. A Chud under a huge spotted mushroom cap, eyes glowing, a staff with a spore-orb. */
  hunnag: {
    size: sized(CHUD, { headH: 1.0 }),
    arms: [1.15, 0.9, 1.5, 0.3],
    colors: { sleeve: 'robe', hand: 'body', leg: 'body', boot: 'body' },
    prep: (p) => ({ robe: mix(p.orbEdge, 0x3a3328, 0.5) }),
    torso(g, r, p) {
      // A mossy robe, ragged at the hem.
      const robe = trunk(r, 0.78, 0.4, 0.4, 0.95, 1.05, 0.24);
      inked(g, robe, p.robe, 3);
      for (const x of [-0.3, -0.1, 0.12, 0.32]) g.poly([(x - 0.06) * r, 0.22 * r, x * r, 0.32 * r, (x + 0.06) * r, 0.22 * r]).fill(p.robe);
      for (const [x, y, s] of [[-0.2, -0.5, 0.08], [0.15, -0.25, 0.06], [-0.05, -0.05, 0.07]]) g.circle(x * r, y * r, s * r).fill({ color: p.orbGlow, alpha: 0.35 }); // glowing moss
    },
    head(g, r, p) {
      inked(g, skull(0.08 * r, -0.3 * r, 0.32 * r, 0.3 * r, 7), p.body, 3);
      // The cap: wide and drooping, spotted, overhanging the face.
      const cap = smooth([-0.62 * r, -0.36 * r, -0.5 * r, -0.78 * r, 0.0, -1.0 * r, 0.5 * r, -0.86 * r, 0.7 * r, -0.4 * r, 0.5 * r, -0.4 * r, 0.1 * r, -0.46 * r, -0.3 * r, -0.4 * r], true, 2);
      inked(g, cap, p.cap, 3);
      g.moveTo(-0.5 * r, -0.4 * r).quadraticCurveTo(0.1 * r, -0.5 * r, 0.62 * r, -0.42 * r).stroke({ width: 3, color: shade(p.cap, 0.4) }); // gills under the brim
      for (const [x, y, s] of [[-0.3, -0.7, 0.1], [0.1, -0.86, 0.08], [0.38, -0.66, 0.07], [-0.05, -0.62, 0.06], [-0.48, -0.5, 0.05]]) g.ellipse(x * r, y * r, s * r, s * 0.8 * r).fill(p.spots);
      // Eyes glowing out from under the brim.
      for (const x of [0.22, 0.36]) {
        g.circle(x * r, -0.28 * r, 0.09 * r).fill({ color: p.eyes, alpha: 0.35 });
        g.circle(x * r, -0.28 * r, 0.045 * r).fill(p.eyes);
      }
      g.moveTo(0.18 * r, -0.12 * r).quadraticCurveTo(0.3 * r, -0.07 * r, 0.4 * r, -0.14 * r).stroke({ width: 2, color: 0x1a1414 });
    },
    weapon: staff,
    foot: (g, r, p) => bareFoot(g, r, p.body),
    gait: { swing: 0.55, bounce: 0.08, lean: 0.12 },
  },

  /** Logan Lionheart: the lion who left the cage, up on his hind legs. A great mane, the broken collar, claws out. */
  logan: {
    size: sized(HUMAN, { torso: 0.86, thigh: 0.46, shin: 0.44, legW: 0.34, armW: 0.3, headH: 0.95 }),
    arms: [1.1, 0.7, 1.4, 0.4],
    colors: { sleeve: 'face', hand: 'paw', leg: 'face', boot: 'paw' },
    back(g, r, p) {
      // The tail, with its tuft.
      const tail: Pts = [-0.3 * r, -0.1 * r, -0.7 * r, -0.05 * r, -0.85 * r, -0.35 * r, -0.95 * r, -0.6 * r];
      g.moveTo(tail[0], tail[1]).bezierCurveTo(tail[2], tail[3], tail[4], tail[5], tail[6], tail[7]).stroke({ width: 8, color: inkOf(p.face), cap: 'round' });
      g.moveTo(tail[0], tail[1]).bezierCurveTo(tail[2], tail[3], tail[4], tail[5], tail[6], tail[7]).stroke({ width: 5, color: p.face, cap: 'round' });
      inked(g, blob(-0.96 * r, -0.66 * r, 0.12 * r, 0.14 * r, 9, 0.3, 12), p.mane, 2);
    },
    torso(g, r, p) {
      inked(g, trunk(r, 0.86, 0.42, 0.46, 1.12, 0.9, 0.06), p.face, 3);
      g.ellipse(0.22 * r, -0.42 * r, 0.2 * r, 0.32 * r).fill({ color: p.muzzle, alpha: 0.8 }); // the pale chest
      g.rect(-0.44 * r, -0.12 * r, 0.9 * r, 0.12 * r).fill(shade(p.collar, 0.3)); // a belt from the cage days
      g.circle(0.3 * r, -0.07 * r, 0.06 * r).fill(p.collar);
    },
    head(g, r, p) {
      // The mane first, a ring of tufts round the face.
      const mane: Pts = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const rr = i % 2 ? 0.42 : 0.55;
        mane.push(-0.02 * r + Math.cos(a) * rr * r, -0.42 * r + Math.sin(a) * rr * 0.95 * r);
      }
      inked(g, smooth(mane, true, 1), p.mane, 3);
      g.poly(smooth(mane, true, 1).map((v) => v * 0.8)).fill({ color: shade(p.mane, -0.15), alpha: 0.4 });
      inked(g, skull(0.1 * r, -0.4 * r, 0.27 * r, 0.3 * r, 8), p.face, 2.5);
      ear(g, -0.06 * r, -0.7 * r, 0.14 * r, p.face);
      // Muzzle and nose out front.
      inked(g, blob(0.32 * r, -0.28 * r, 0.16 * r, 0.12 * r, 12, 0.1, 14), p.muzzle, 2);
      g.poly([0.4 * r, -0.4 * r, 0.5 * r, -0.36 * r, 0.42 * r, -0.3 * r]).fill(p.nose).stroke({ width: 1.5, color: inkOf(p.nose) });
      g.moveTo(0.42 * r, -0.3 * r).lineTo(0.42 * r, -0.22 * r).quadraticCurveTo(0.36 * r, -0.18 * r, 0.3 * r, -0.22 * r).stroke({ width: 1.8, color: 0x1a1414 });
      eye(g, 0.22 * r, -0.48 * r, 0.065 * r, p.eyes, 0.0);
      brow(g, 0.24 * r, -0.58 * r, 0.18 * r, 0.03 * r, p.maneEdge);
      // The broken collar from the cage, still round his neck.
      g.moveTo(-0.2 * r, -0.04 * r).quadraticCurveTo(0.05 * r, 0.06 * r, 0.3 * r, -0.04 * r).stroke({ width: 6, color: p.collar });
      g.ellipse(0.32 * r, 0.04 * r, 0.04 * r, 0.06 * r).stroke({ width: 2, color: p.collar });
    },
    hand(g, r, p) {
      inked(g, blob(0.06 * r, 0, 0.14 * r, 0.12 * r, 4, 0.12, 12), p.paw, 2);
      for (let i = -1; i <= 1; i++) g.poly([0.16 * r, i * 0.06 * r - 0.02 * r, 0.27 * r, i * 0.07 * r, 0.16 * r, i * 0.06 * r + 0.02 * r]).fill(0xf2efe6).stroke({ width: 1, color: 0x6a5a40 });
    },
    foot: (g, r, p) => bareFoot(g, r, p.paw, 2),
    gait: { swing: 0.6, bounce: 0.06, lean: 0.14, knee: 1.1 },
  },

  /** King Rix: the Crown that kept the cage. A big red cape, ermine, a round royal belly, a crown and a scepter. */
  kingrix: {
    size: sized(HUMAN, { torso: 0.84, legW: 0.28 }),
    arms: [1.2, 0.5, 1.45, 0.25],
    colors: { sleeve: 'cape', hand: 'skin', leg: 'hose', boot: 'shoe' },
    prep: (p) => ({ hose: shade(p.cape, 0.4), shoe: 0x2a1a14 }),
    back(g, r, p) {
      const cape = smooth([-0.2 * r, -0.86 * r, -0.62 * r, -0.4 * r, -0.78 * r, 0.62 * r, -0.2 * r, 0.7 * r, 0.1 * r, -0.2 * r], true, 2);
      inked(g, cape, p.cape, 3);
      g.moveTo(-0.5 * r, -0.2 * r).quadraticCurveTo(-0.62 * r, 0.2 * r, -0.6 * r, 0.6 * r).stroke({ width: 2.5, color: shade(p.cape, 0.35) });
      // Ermine along the hem.
      g.moveTo(-0.78 * r, 0.62 * r).lineTo(-0.2 * r, 0.7 * r).stroke({ width: 7, color: p.ermine, cap: 'round' });
      for (const x of [-0.65, -0.45, -0.28]) g.ellipse(x * r, 0.65 * r, 1.6, 2.6).fill(p.spots);
    },
    torso(g, r, p) {
      inked(g, trunk(r, 0.84, 0.4, 0.44, 1.05, 1.35, 0.1), p.cape, 3);
      // Ermine down the front and round the collar.
      g.poly(smooth([0.22 * r, -0.86 * r, 0.42 * r, -0.86 * r, 0.6 * r, -0.4 * r, 0.56 * r, 0.06 * r, 0.36 * r, 0.06 * r, 0.4 * r, -0.4 * r], true, 1)).fill(p.ermine).stroke({ width: 1.8, color: inkOf(p.ermine) });
      for (const [x, y] of [[0.4, -0.7], [0.5, -0.36], [0.44, -0.08]]) g.ellipse(x * r, y * r, 1.6, 2.6).fill(p.spots);
      g.ellipse(-0.1 * r, -0.88 * r, 0.36 * r, 0.1 * r).fill(p.ermine).stroke({ width: 1.8, color: inkOf(p.ermine) });
      g.rect(-0.4 * r, -0.22 * r, 0.9 * r, 0.1 * r).fill(p.crown); // a golden belt
      g.circle(0.2 * r, -0.17 * r, 0.06 * r).fill(p.jewelA);
    },
    head(g, r, p) {
      inked(g, skull(0.08 * r, -0.34 * r, 0.3 * r, 0.33 * r, 9), p.skin, 3);
      ear(g, -0.14 * r, -0.34 * r, 0.12 * r, p.skin);
      // A pointed royal beard and a smug little mustache.
      const beard: Pts = [0.06 * r, -0.16 * r, 0.36 * r, -0.16 * r, 0.3 * r, 0.02 * r, 0.2 * r, 0.14 * r, 0.14 * r, -0.02 * r];
      inked(g, smooth(beard, true, 1), 0x6a4a2a, 2);
      g.moveTo(0.2 * r, -0.2 * r).quadraticCurveTo(0.32 * r, -0.26 * r, 0.42 * r, -0.2 * r).stroke({ width: 3, color: 0x6a4a2a, cap: 'round' });
      eye(g, 0.24 * r, -0.4 * r, 0.06 * r, 0x2a3a6a, 0.03 * r); // half-lidded, unimpressed
      brow(g, 0.24 * r, -0.5 * r, 0.16 * r, -0.02 * r, 0x6a4a2a);
      g.poly([0.36 * r, -0.4 * r, 0.44 * r, -0.28 * r, 0.34 * r, -0.28 * r]).fill(p.skin).stroke({ width: 1.5, color: inkOf(p.skin) });
      // The crown.
      const crown: Pts = [-0.22 * r, -0.56 * r, -0.24 * r, -0.86 * r, -0.12 * r, -0.72 * r, 0.0, -0.92 * r, 0.12 * r, -0.72 * r, 0.24 * r, -0.88 * r, 0.3 * r, -0.56 * r];
      inked(g, crown, p.crown, 2.5);
      g.rect(-0.22 * r, -0.62 * r, 0.52 * r, 0.07 * r).fill(shade(p.crown, 0.25));
      for (const [x, c] of [[-0.12, p.jewelB], [0.04, p.jewelA], [0.2, p.jewelB]] as const) g.circle(x * r, -0.6 * r, 0.035 * r).fill(c);
    },
    weapon: scepter,
    gait: { swing: 0.42, bounce: 0.05, lean: -0.04 },
  },

  /** Dongmaster: the Jawline Eternal. A V of a torso, a tank top, a sweatband, fists up, and THE jaw. */
  dongmaster: {
    size: sized(HUMAN, { torso: 0.9, legW: 0.34, armW: 0.36, upper: 0.42, fore: 0.4, thigh: 0.44, shin: 0.4, headH: 0.76, shoulderX: 0.08 }),
    arms: [0.75, 1.9, 0.95, 1.8],
    colors: { sleeve: 'skin', hand: 'skin', leg: 'skin', boot: 'wrap' },
    prep: (p) => ({ shorts: mix(p.tank, 0x8a8f9a, 0.45) }),
    torso(g, r, p) {
      // A barrel chest out front, a broad back, tapering to a narrow waist.
      const body = smooth([-0.26 * r, 0.06 * r, -0.34 * r, -0.4 * r, -0.48 * r, -0.8 * r, -0.3 * r, -0.98 * r, 0.3 * r, -1.0 * r, 0.6 * r, -0.76 * r, 0.52 * r, -0.4 * r, 0.3 * r, 0.06 * r], true, 2);
      inked(g, body, p.skin, 3);
      // The tank top: thin straps, cut low, so the chest and traps show.
      const tank = smooth([-0.27 * r, 0.04 * r, -0.33 * r, -0.4 * r, -0.4 * r, -0.74 * r, -0.26 * r, -0.86 * r, -0.12 * r, -0.62 * r, 0.22 * r, -0.6 * r, 0.36 * r, -0.84 * r, 0.5 * r, -0.62 * r, 0.48 * r, -0.36 * r, 0.3 * r, 0.04 * r], true, 2);
      inked(g, tank, p.tank, 2);
      g.moveTo(0.22 * r, -0.5 * r).quadraticCurveTo(0.36 * r, -0.44 * r, 0.48 * r, -0.5 * r).stroke({ width: 2, color: shade(p.tank, -0.35), alpha: 0.7 }); // pecs under the shirt
      for (const y of [-0.3, -0.18]) g.moveTo(0.14 * r, y * r).lineTo(0.38 * r, y * r).stroke({ width: 1.5, color: shade(p.tank, -0.35), alpha: 0.55 }); // and abs
      g.moveTo(-0.2 * r, -0.92 * r).quadraticCurveTo(0.0, -0.84 * r, 0.24 * r, -0.94 * r).stroke({ width: 2, color: p.skinDark, alpha: 0.7 }); // traps
      // Gym shorts, over the tops of the legs.
      const shorts = smooth([-0.3 * r, -0.06 * r, 0.34 * r, -0.06 * r, 0.4 * r, 0.3 * r, 0.06 * r, 0.32 * r, 0.0, 0.18 * r, -0.08 * r, 0.32 * r, -0.36 * r, 0.3 * r], true, 1);
      inked(g, shorts, p.shorts, 2.5);
      g.moveTo(0.37 * r, -0.04 * r).lineTo(0.42 * r, 0.28 * r).stroke({ width: 3, color: p.band }); // a stripe
    },
    head(g, r, p) {
      // A thick neck, a small skull, and the jaw, which is most of the head.
      g.rect(-0.12 * r, -0.16 * r, 0.3 * r, 0.2 * r).fill(p.skin);
      inked(g, skull(0.02 * r, -0.42 * r, 0.24 * r, 0.27 * r, 11), p.skin, 3);
      const jaw = smooth([-0.08 * r, -0.36 * r, 0.36 * r, -0.36 * r, 0.44 * r, -0.12 * r, 0.4 * r, -0.04 * r, 0.04 * r, -0.04 * r, -0.1 * r, -0.2 * r], true, 1);
      inked(g, jaw, p.skin, 3);
      g.moveTo(0.4 * r, -0.12 * r).lineTo(0.36 * r, -0.08 * r).stroke({ width: 2, color: p.skinDark }); // the cleft
      g.moveTo(0.04 * r, -0.12 * r).lineTo(0.34 * r, -0.08 * r).stroke({ width: 2, color: p.skinDark, alpha: 0.6 }); // jaw shadow
      g.moveTo(0.22 * r, -0.24 * r).quadraticCurveTo(0.3 * r, -0.2 * r, 0.38 * r, -0.26 * r).stroke({ width: 2, color: 0x1a1414 }); // the smirk
      eye(g, 0.16 * r, -0.44 * r, 0.05 * r, 0x2a3a5a, 0.035 * r);
      brow(g, 0.17 * r, -0.53 * r, 0.16 * r, 0.035 * r, p.hair);
      g.poly([0.25 * r, -0.44 * r, 0.32 * r, -0.34 * r, 0.24 * r, -0.33 * r]).fill(p.skin).stroke({ width: 1.5, color: inkOf(p.skin) });
      // Slicked-back hair and the sweatband.
      const hair = smooth([-0.24 * r, -0.4 * r, -0.26 * r, -0.62 * r, -0.04 * r, -0.74 * r, 0.24 * r, -0.66 * r, 0.24 * r, -0.58 * r, -0.06 * r, -0.58 * r], true, 2);
      inked(g, hair, p.hair, 2);
      g.moveTo(-0.2 * r, -0.54 * r).quadraticCurveTo(0.04 * r, -0.5 * r, 0.26 * r, -0.56 * r).stroke({ width: 6, color: p.band });
      g.moveTo(-0.1 * r, -0.68 * r).lineTo(0.06 * r, -0.71 * r).stroke({ width: 2, color: 0xffffff, alpha: 0.4 }); // the shine
    },
    hand: (g, r, p) => {
      mitt(g, r, p.skin, true);
      g.roundRect(-0.1 * r, -0.12 * r, 0.08 * r, 0.24 * r, 0.03 * r).fill(p.wrap).stroke({ width: 1.5, color: inkOf(p.wrap) });
    },
    gait: { swing: 0.45, bounce: 0.05, lean: 0.02, arm: 0.2 },
  },

  /** The Dark Dabber: a rat in a hoodie, hunched, red-eyed, tail dragging, his rig in his paws. */
  dabber: {
    size: sized(HUMAN, { torso: 0.72, thigh: 0.4, shin: 0.38, legW: 0.28, armW: 0.24, headH: 0.82 }),
    arms: [0.7, 0.5, 1.1, 0.6],
    colors: { sleeve: 'hood', hand: 'fur', leg: 'pants', boot: 'fur' },
    prep: (p) => ({ pants: shade(p.hood, 0.35) }),
    back(g, r, p) {
      const tail: Pts = [-0.28 * r, -0.05 * r, -0.8 * r, 0.1 * r, -1.0 * r, 0.3 * r, -1.3 * r, 0.2 * r];
      g.moveTo(tail[0], tail[1]).bezierCurveTo(tail[2], tail[3], tail[4], tail[5], tail[6], tail[7]).stroke({ width: 7, color: inkOf(p.tail), cap: 'round' });
      g.moveTo(tail[0], tail[1]).bezierCurveTo(tail[2], tail[3], tail[4], tail[5], tail[6], tail[7]).stroke({ width: 4, color: p.tail, cap: 'round' });
    },
    torso(g, r, p) {
      inked(g, trunk(r, 0.72, 0.42, 0.38, 0.95, 1.05, 0.12), p.hood, 3);
      g.rect(0.0, -0.26 * r, 0.36 * r, 0.16 * r).fill(shade(p.hood, 0.2)).stroke({ width: 1.5, color: p.hoodEdge }); // the pocket
      for (const x of [0.12, 0.2]) g.moveTo(x * r, -0.72 * r).lineTo(x * r + 2, -0.5 * r).stroke({ width: 1.5, color: 0xe8e0cc }); // drawstrings
      g.circle(-0.1 * r, -0.5 * r, 0.06 * r).fill({ color: p.smoke, alpha: 0.6 }); // a little leaf on the hoodie
    },
    head(g, r, p) {
      // The hood up, the snout poking out of it.
      const hood = smooth([-0.4 * r, 0.02 * r, -0.46 * r, -0.5 * r, -0.2 * r, -0.8 * r, 0.16 * r, -0.74 * r, 0.24 * r, -0.4 * r, 0.12 * r, 0.02 * r], true, 2);
      const snout = smooth([0.0, -0.46 * r, 0.3 * r, -0.44 * r, 0.6 * r, -0.28 * r, 0.6 * r, -0.2 * r, 0.3 * r, -0.12 * r, 0.0, -0.14 * r], true, 2);
      inked(g, snout, p.fur, 2.5);
      g.circle(0.6 * r, -0.25 * r, 0.05 * r).fill(p.nose);
      for (const dy of [-0.04, 0.02]) g.moveTo(0.5 * r, -0.24 * r + dy * r).lineTo(0.74 * r, -0.28 * r + dy * 2 * r).stroke({ width: 1.2, color: 0xe8e0cc, alpha: 0.9 }); // whiskers
      g.rect(0.42 * r, -0.16 * r, 0.04 * r, 0.06 * r).fill(0xf2e8c8); // a buck tooth
      inked(g, hood, p.hood, 3);
      g.moveTo(-0.1 * r, -0.74 * r).quadraticCurveTo(0.26 * r, -0.5 * r, 0.12 * r, -0.04 * r).stroke({ width: 5, color: p.hoodEdge });
      // An ear through a hole in the hood.
      ear(g, 0.0, -0.78 * r, 0.2 * r, p.fur);
      g.ellipse(0.02 * r, -0.78 * r, 0.06 * r, 0.11 * r).fill(p.ear);
      // Red eyes, heavy-lidded.
      g.circle(0.3 * r, -0.36 * r, 0.06 * r).fill(p.eyes);
      g.moveTo(0.23 * r, -0.4 * r).lineTo(0.37 * r, -0.39 * r).stroke({ width: 2.5, color: 0x1a1414, cap: 'round' });
    },
    hand: (g, r, p) => mitt(g, r, p.fur),
    foot: (g, r, p) => bareFoot(g, r, p.tail, 0),
    weapon: rigBow,
    gait: { swing: 0.55, bounce: 0.05, lean: 0.3, knee: 1.1 },
  },

  /** Master Paris: the blade of the boulevard. White fencing jacket, a red cravat, a beret, a mustache to twirl. */
  paris: {
    size: sized(HUMAN, { thigh: 0.5, shin: 0.46, legW: 0.27, armW: 0.23, torso: 0.8 }),
    arms: [0.55, 0.35, 2.2, 1.6],
    colors: { sleeve: 'jacket', hand: 'skin', leg: 'jacket', boot: 'boots' },
    prep: (p) => ({ boots: mix(p.stem, 0x1a1414, 0.5) }),
    torso(g, r, p) {
      inked(g, trunk(r, 0.8, 0.34, 0.36, 1.1, 0.95, 0.1), p.jacket, 3);
      g.moveTo(0.3 * r, -0.76 * r).quadraticCurveTo(0.18 * r, -0.36 * r, 0.3 * r, 0.06 * r).stroke({ width: 2, color: p.jacketShade }); // the side seam
      for (const y of [-0.6, -0.42, -0.24]) g.circle(0.27 * r, y * r, 0.03 * r).fill(p.guard);
      g.rect(-0.34 * r, -0.08 * r, 0.7 * r, 0.08 * r).fill(p.jacketShade);
    },
    head(g, r, p) {
      inked(g, skull(0.06 * r, -0.36 * r, 0.27 * r, 0.32 * r, 13), p.skin, 3);
      // The cravat at the throat.
      inked(g, [0.04 * r, -0.02 * r, 0.3 * r, -0.06 * r, 0.24 * r, 0.12 * r, 0.12 * r, 0.04 * r], p.scarf, 2);
      eye(g, 0.2 * r, -0.42 * r, 0.055 * r, 0x3a2a1a, 0.025 * r);
      brow(g, 0.2 * r, -0.52 * r, 0.16 * r, -0.04 * r, p.mustache); // one brow up
      g.poly([0.3 * r, -0.4 * r, 0.4 * r, -0.28 * r, 0.3 * r, -0.27 * r]).fill(p.skin).stroke({ width: 1.5, color: inkOf(p.skin) });
      // The mustache, curled at the ends.
      g.moveTo(0.16 * r, -0.2 * r).quadraticCurveTo(0.3 * r, -0.28 * r, 0.42 * r, -0.2 * r).stroke({ width: 4, color: p.mustache, cap: 'round' });
      g.moveTo(0.42 * r, -0.2 * r).quadraticCurveTo(0.5 * r, -0.16 * r, 0.47 * r, -0.26 * r).stroke({ width: 2.5, color: p.mustache, cap: 'round' });
      g.moveTo(0.16 * r, -0.2 * r).quadraticCurveTo(0.08 * r, -0.16 * r, 0.11 * r, -0.26 * r).stroke({ width: 2.5, color: p.mustache, cap: 'round' });
      ear(g, -0.1 * r, -0.36 * r, 0.12 * r, p.skin);
      // The beret, tilted rakishly.
      inked(g, smooth([-0.3 * r, -0.58 * r, -0.12 * r, -0.76 * r, 0.24 * r, -0.74 * r, 0.38 * r, -0.6 * r, 0.1 * r, -0.56 * r], true, 2), p.beret, 2.5);
      g.rect(0.0, -0.84 * r, 0.04 * r, 0.1 * r).fill(p.stem);
    },
    weapon: epee,
    gait: { swing: 0.5, bounce: 0.04, lean: 0.04 },
  },

  /** Havarti: a wheel of cheese, ascended. Stood on her edge on stubby legs, wings behind, a halo, a serene face. */
  havarti: {
    size: sized(HUMAN, { thigh: 0.28, shin: 0.26, torso: 1.25, shoulder: 0.95, shoulderX: 0.34, upper: 0.32, fore: 0.3, legW: 0.24, armW: 0.2, foot: 0.24, headH: 0.36 }),
    arms: [0.9, 0.9, 1.6, 0.3],
    colors: { sleeve: 'wheel', hand: 'wheel', leg: 'rind', boot: 'rind' },
    back(g, r, p) {
      // Wings spread behind the wheel, three feathers a side.
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + side * (0.7 + i * 0.32);
          const cx = Math.cos(a) * 0.62 * r - 0.1 * r;
          const cy = -0.62 * r + Math.sin(a) * 0.62 * r;
          const f = blob(cx, cy, 0.34 * r, 0.12 * r, i + (side > 0 ? 10 : 20), 0.08, 12);
          const c = Math.cos(a);
          const s = Math.sin(a);
          const turned = f.map((v, j) => (j % 2 ? cy + (f[j - 1] - cx) * s + (v - cy) * c : cx + (v - cx) * c - (f[j + 1] - cy) * s));
          inked(g, turned, side < 0 ? shade(p.wing, 0.12) : p.wing, 2, p.wingEdge);
        }
      }
    },
    torso(g, r, p) {
      // The wheel itself, on its edge: rind round the rim, the cut face with its holes.
      const wheel = blob(0, -0.62 * r, 0.66 * r, 0.64 * r, 31, 0.03, 40);
      inked(g, wheel, p.rind, 3);
      g.poly(blob(0.04 * r, -0.62 * r, 0.54 * r, 0.52 * r, 31, 0.03, 40)).fill(p.wheel);
      for (const [x, y, s] of [[-0.3, -0.8, 0.08], [-0.3, -0.42, 0.06], [-0.02, -0.3, 0.07], [0.3, -0.42, 0.05], [-0.1, -1.0, 0.05]]) g.ellipse(x * r, y * r, s * r, s * 0.85 * r).fill(p.holes).stroke({ width: 1.2, color: shade(p.holes, 0.3) });
      // Her face, serene, up near the top of the wheel.
      for (const x of [0.08, 0.3]) g.moveTo((x - 0.06) * r, -0.86 * r).quadraticCurveTo(x * r, -0.81 * r, (x + 0.06) * r, -0.86 * r).stroke({ width: 2.6, color: p.eyes, cap: 'round' }); // closed, content eyes
      g.moveTo(0.1 * r, -0.7 * r).quadraticCurveTo(0.19 * r, -0.63 * r, 0.28 * r, -0.7 * r).stroke({ width: 2.4, color: p.eyes, cap: 'round' });
      for (const x of [0.02, 0.36]) g.circle(x * r, -0.75 * r, 0.05 * r).fill({ color: 0xff9a7a, alpha: 0.45 }); // rosy
    },
    head(g, r, p) {
      // No head as such: the halo floats over the wheel.
      g.ellipse(0.0, -0.18 * r, 0.3 * r, 0.09 * r).stroke({ width: 6, color: p.halo, alpha: 0.35 });
      g.ellipse(0.0, -0.18 * r, 0.3 * r, 0.09 * r).stroke({ width: 3, color: p.halo });
    },
    hand: (g, r, p) => mitt(g, r * 0.85, p.wheel),
    weapon: cheeseKnife,
    gait: { swing: 0.65, bounce: 0.12, lean: 0.0, knee: 0.6, arm: 0.6 },
  },

  /** Daltonomo: the Jester of the Deep. Harlequin diamonds, a ruff, a white grinning mask, belled hat, a knife in each hand. */
  daltonomo: {
    size: sized(HUMAN, { thigh: 0.5, shin: 0.48, legW: 0.24, armW: 0.21, upper: 0.44, fore: 0.44, torso: 0.76 }),
    arms: [0.9, 0.9, 1.0, 1.0],
    colors: { sleeve: 'tunicB', hand: 'face', leg: 'tunicA', legBack: 'tunicB', boot: 'tunicA' },
    torso(g, r, p) {
      const body = trunk(r, 0.76, 0.34, 0.34, 1.0, 0.95, 0.16);
      inked(g, body, p.tunicA, 3);
      // Diamonds down the front.
      for (const [x, y] of [[0.0, -0.58], [0.0, -0.22], [-0.2, -0.4], [0.2, -0.4], [-0.2, -0.04], [0.2, -0.04]]) {
        const s = 0.13 * r;
        g.poly([x * r - s * 0.8, y * r, x * r, y * r - s, x * r + s * 0.8, y * r, x * r, y * r + s]).fill(p.tunicB);
      }
      for (const x of [-0.3, -0.1, 0.1, 0.3]) g.poly([(x - 0.07) * r, 0.12 * r, x * r, 0.26 * r, (x + 0.07) * r, 0.12 * r]).fill(x < 0 ? p.tunicA : p.tunicB).stroke({ width: 1.2, color: inkOf(p.tunicA) });
    },
    head(g, r, p) {
      // The ruff.
      const ruff: Pts = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const rr = i % 2 ? 0.2 : 0.28;
        ruff.push(Math.cos(a) * rr * 1.3 * r, -0.02 * r + Math.sin(a) * rr * 0.45 * r);
      }
      inked(g, ruff, p.ruff, 2);
      // The mask: white, a too-wide grin, diamond eyes.
      inked(g, skull(0.06 * r, -0.36 * r, 0.27 * r, 0.31 * r, 17), p.face, 3);
      g.moveTo(0.02 * r, -0.26 * r).quadraticCurveTo(0.22 * r, -0.06 * r, 0.38 * r, -0.3 * r).stroke({ width: 3, color: p.grin, cap: 'round' });
      g.moveTo(0.1 * r, -0.2 * r).lineTo(0.3 * r, -0.2 * r).stroke({ width: 1.5, color: p.grin, alpha: 0.6 });
      for (const [x, s] of [[0.2, 0.07], [0.34, 0.05]] as const) g.poly([x * r, -0.5 * r, (x + s * 0.6) * r, -0.42 * r, x * r, -0.34 * r, (x - s * 0.6) * r, -0.42 * r]).fill(p.eye);
      g.moveTo(0.18 * r, -0.36 * r).lineTo(0.16 * r, -0.28 * r).stroke({ width: 1.5, color: p.eye, alpha: 0.6 }); // a painted tear
      // The hat: three floppy points, each with a bell.
      const points: [number, number, number][] = [[-0.5, -0.5, p.hatA], [-0.1, -1.0, p.hatB], [0.38, -0.78, p.hatA]];
      for (const [tx, ty, c] of points) {
        const base = smooth([-0.24 * r, -0.54 * r, tx * r, ty * r, 0.3 * r, -0.56 * r], true, 1);
        inked(g, [...base, 0.04 * r, -0.66 * r], c, 2.5);
        g.circle(tx * r, ty * r + 0.04 * r, 0.06 * r).fill(p.bell).stroke({ width: 1.5, color: inkOf(p.bell) });
      }
      g.rect(-0.26 * r, -0.6 * r, 0.6 * r, 0.08 * r).fill(p.hatB).stroke({ width: 1.5, color: inkOf(p.hatB) });
    },
    foot(g, r, p, front) {
      // Curled toes, with a bell on the end.
      const c = front ? p.tunicA : p.tunicB;
      boot(g, r, 0.26 * r, c);
      g.moveTo(0.24 * r, -0.02 * r).quadraticCurveTo(0.4 * r, -0.02 * r, 0.36 * r, -0.16 * r).stroke({ width: 3.5, color: c, cap: 'round' });
      g.circle(0.36 * r, -0.18 * r, 0.04 * r).fill(p.bell);
    },
    weapon: dagger(0.4),
    offhand: dagger(0.6),
    gait: { swing: 0.6, bounce: 0.1, lean: 0.12, knee: 1.1, arm: 0.6 },
  },
};

// ─── Everyone else on two legs ────────────────────────────────────────────────

const CHUD_SKIN = 0x87916c;

/** Colors for a unit that isn't a champion: the team color goes on their hood, tabard or shield. */
export function unitPalette(team: number, skin = CHUD_SKIN): Palette {
  return { body: skin, hood: team, hoodDark: shade(team, 0.35), eyes: 0xffe066, wood: 0x6b4a2b, stone: 0x8d8d8d, cloth: 0x5a4a32, steel: 0xb8bec6, steelDark: 0x6a707a, rope: 0x8a6a44 };
}

const chudHead = (spiked: boolean) => (g: Graphics, r: number, p: Palette) => {
  // A big lumpy head under a team-colored hood with a floppy point, yellow eyes glowing out.
  inked(g, skull(0.1 * r, -0.36 * r, 0.36 * r, 0.34 * r, spiked ? 41 : 43), p.body, 3);
  g.moveTo(0.2 * r, -0.18 * r).quadraticCurveTo(0.34 * r, -0.12 * r, 0.44 * r, -0.2 * r).stroke({ width: 2.2, color: 0x1a1414 });
  g.poly([0.3 * r, -0.17 * r, 0.34 * r, -0.08 * r, 0.37 * r, -0.17 * r]).fill(0xf2efe6); // a snaggletooth
  const hood = smooth([-0.34 * r, -0.08 * r, -0.4 * r, -0.5 * r, -0.62 * r, -0.86 * r, -0.2 * r, -0.74 * r, 0.22 * r, -0.72 * r, 0.42 * r, -0.5 * r, 0.12 * r, -0.5 * r, -0.08 * r, -0.2 * r], true, 2);
  inked(g, hood, p.hood, 2.5);
  for (const x of [0.26, 0.38]) {
    g.circle(x * r, -0.38 * r, 0.075 * r).fill({ color: p.eyes, alpha: 0.35 });
    g.circle(x * r, -0.38 * r, 0.045 * r).fill(p.eyes);
  }
  if (spiked) {
    for (const [x, y, a] of [[-0.3, -0.62, -2.4], [-0.05, -0.76, -1.9], [0.22, -0.7, -1.3]]) {
      const tx = x * r + Math.cos(a) * 0.22 * r;
      const ty = y * r + Math.sin(a) * 0.22 * r;
      inked(g, [x * r - 0.06 * r, y * r + 0.02 * r, tx, ty, x * r + 0.06 * r, y * r + 0.02 * r], p.steel, 1.5);
    }
  }
};

const chudTorso = (g: Graphics, r: number, p: Palette) => {
  inked(g, trunk(r, 0.74, 0.4, 0.4, 0.95, 1.15, 0.06), p.body, 3);
  // A ragged loincloth and a strap.
  const cloth = smooth([-0.4 * r, -0.1 * r, 0.44 * r, -0.12 * r, 0.4 * r, 0.24 * r, 0.12 * r, 0.16 * r, -0.08 * r, 0.26 * r, -0.36 * r, 0.18 * r], true, 1);
  inked(g, cloth, p.cloth, 2);
  g.moveTo(-0.32 * r, -0.66 * r).lineTo(0.3 * r, -0.12 * r).stroke({ width: 3.5, color: p.hoodDark });
};

const club = (len: number, spikes: boolean): Held => ({
  hold: -1.0,
  draw(g, r, p) {
    const pts = smooth([0, -0.06 * r, len * 0.55 * r, -0.1 * r, len * r, -0.17 * r, (len + 0.08) * r, 0, len * r, 0.17 * r, len * 0.55 * r, 0.1 * r, 0, 0.06 * r], true, 1);
    inked(g, pts, p.wood, 2.5);
    g.moveTo(0.1 * r, 0).lineTo(len * 0.7 * r, -0.03 * r).stroke({ width: 1.5, color: shade(p.wood, 0.3) });
    if (spikes) for (const x of [0.6, 0.8, 0.95]) inked(g, [x * len * r, -0.12 * r, (x * len + 0.05) * r, -0.3 * r, (x * len + 0.1) * r, -0.12 * r], p.steel, 1.2);
  },
});

const sling: Held = {
  hold: 1.3,
  draw(g, r, p) {
    g.moveTo(0, 0).lineTo(0.42 * r, 0.06 * r).stroke({ width: 2, color: p.rope });
    inked(g, blob(0.48 * r, 0.06 * r, 0.12 * r, 0.11 * r, 5, 0.2, 10), p.stone, 1.8);
  },
};

const spear: Held = {
  hold: -1.35,
  draw(g, r, p) {
    limb(g, 1.5 * r, 0.08 * r, 0.07 * r, p.wood);
    limb(g, -0.4 * r, 0.08 * r, 0.07 * r, p.wood);
    inked(g, [1.45 * r, -0.08 * r, 1.78 * r, 0, 1.45 * r, 0.08 * r], p.steel, 1.6);
    g.rect(1.38 * r, -0.07 * r, 0.06 * r, 0.14 * r).fill(p.hood);
  },
};

const shield: Held = {
  hold: 0,
  draw(g, r, p) {
    inked(g, blob(0.05 * r, 0, 0.3 * r, 0.36 * r, 7, 0.02, 24), p.hood, 2.5);
    g.ellipse(0.05 * r, 0, 0.3 * r, 0.36 * r).stroke({ width: 4, color: p.steel });
    g.circle(0.05 * r, 0, 0.08 * r).fill(p.steel).stroke({ width: 1.5, color: p.steelDark });
  },
};

const shackle: Held = {
  hold: 1.25,
  draw(g, r, p) {
    // A length of chain hanging from the fist, and the shackle at the end of it.
    for (let i = 0; i < 4; i++) g.ellipse(0.08 * r + i * 0.1 * r, 0, i % 2 ? 0.035 * r : 0.06 * r, i % 2 ? 0.06 * r : 0.035 * r).stroke({ width: 3, color: p.steel });
    g.circle(0.6 * r, 0, 0.17 * r).stroke({ width: 7, color: inkOf(p.steel) });
    g.circle(0.6 * r, 0, 0.17 * r).stroke({ width: 4.5, color: p.steel });
  },
};

export type UnitBuildKey = 'chud:melee' | 'chud:ranged' | 'chud:brute' | 'guard' | 'monster:warden';

/** Builds for everything else that walks on two legs, keyed like the attack moves ("chud:melee"). */
export const UNIT_BUILDS: Record<UnitBuildKey, Build> = {
  'chud:melee': {
    size: sized(CHUD, { headH: 0.84 }),
    arms: [1.3, 0.5, 1.5, 0.2],
    colors: { sleeve: 'body', hand: 'body', leg: 'body', boot: 'body' },
    torso: chudTorso,
    head: chudHead(false),
    foot: (g, r, p) => bareFoot(g, r, p.body),
    weapon: club(0.8, false),
    gait: { swing: 0.6, bounce: 0.1, lean: 0.18 },
  },
  'chud:ranged': {
    size: sized(CHUD, { headH: 0.84, legW: 0.28, armW: 0.24 }),
    arms: [1.2, 0.6, 1.5, 0.2],
    colors: { sleeve: 'body', hand: 'body', leg: 'body', boot: 'body' },
    torso: chudTorso,
    head: chudHead(false),
    back(g, r, p) {
      // A pouch of stones on the hip.
      inked(g, blob(-0.36 * r, -0.12 * r, 0.16 * r, 0.14 * r, 9, 0.15, 12), p.cloth, 2);
    },
    foot: (g, r, p) => bareFoot(g, r, p.body),
    weapon: sling,
    gait: { swing: 0.6, bounce: 0.1, lean: 0.2 },
  },
  'chud:brute': {
    size: sized(CHUD, { torso: 0.86, legW: 0.38, armW: 0.36, upper: 0.48, fore: 0.46, headH: 0.82 }),
    arms: [1.25, 0.55, 1.5, 0.2],
    colors: { sleeve: 'body', hand: 'body', leg: 'body', boot: 'body' },
    prep: () => ({ body: 0x6c7652 }),
    torso(g, r, p) {
      chudTorso(g, r, p);
      // Scraps of armor, in the team's color.
      inked(g, blob(0.0, -0.64 * r, 0.36 * r, 0.16 * r, 3, 0.15, 14), p.hood, 2.5);
    },
    head: chudHead(true),
    foot: (g, r, p) => bareFoot(g, r, p.body),
    weapon: club(1.15, true),
    gait: { swing: 0.5, bounce: 0.07, lean: 0.14, arm: 0.3 },
  },
  guard: {
    size: sized(HUMAN, { torso: 0.82, legW: 0.28 }),
    arms: [1.25, 0.9, 1.15, 0.5],
    colors: { sleeve: 'hood', hand: 'steel', leg: 'steelDark', boot: 'wood' },
    torso(g, r, p) {
      inked(g, trunk(r, 0.82, 0.36, 0.38, 1.0, 1.0, 0.1), p.steelDark, 3);
      // A team tabard over the mail, with the crown's badge.
      inked(g, smooth([-0.24 * r, -0.8 * r, 0.3 * r, -0.8 * r, 0.32 * r, 0.24 * r, -0.24 * r, 0.24 * r], true, 1), p.hood, 2.5);
      g.poly([0.04 * r, -0.62 * r, 0.12 * r, -0.48 * r, 0.04 * r, -0.34 * r, -0.04 * r, -0.48 * r]).fill(0xffd166);
      g.rect(-0.36 * r, -0.12 * r, 0.74 * r, 0.08 * r).fill(p.wood);
    },
    head(g, r, p) {
      inked(g, skull(0.08 * r, -0.34 * r, 0.28 * r, 0.32 * r, 23), 0xd6a274, 3);
      eye(g, 0.24 * r, -0.36 * r, 0.05 * r, 0x2a3a5a);
      g.moveTo(0.18 * r, -0.16 * r).lineTo(0.32 * r, -0.17 * r).stroke({ width: 2, color: 0x1a1414 });
      // A kettle helmet with a brim.
      inked(g, smooth([-0.26 * r, -0.44 * r, -0.2 * r, -0.74 * r, 0.12 * r, -0.8 * r, 0.36 * r, -0.62 * r, 0.38 * r, -0.44 * r], true, 2), p.steel, 2.5);
      inked(g, [-0.36 * r, -0.44 * r, 0.5 * r, -0.44 * r, 0.46 * r, -0.38 * r, -0.32 * r, -0.38 * r], p.steel, 2);
    },
    weapon: spear,
    offhand: shield,
    gait: { swing: 0.45, bounce: 0.05, lean: 0.04 },
  },
  'monster:warden': {
    size: sized(HUMAN, { thigh: 0.36, shin: 0.34, torso: 0.82, legW: 0.38, armW: 0.34, upper: 0.48, fore: 0.46, headH: 0.5, shoulderX: 0.0 }),
    arms: [1.35, 0.4, 1.5, 0.3],
    colors: { sleeve: 'steelDark', hand: 'steelDark', leg: 'steelDark', boot: 'iron' },
    prep: () => ({ steel: 0x8a9099, steelDark: 0x4a4f58, iron: 0x2c3038, visor: 0x7fe3ff }),
    back(g, r, p) {
      // Coils of chain slung over the back.
      for (let i = 0; i < 9; i++) {
        const a = -2.6 + i * 0.32;
        g.ellipse(-0.2 * r + Math.cos(a) * 0.5 * r, -0.5 * r + Math.sin(a) * 0.45 * r, i % 2 ? 0.05 * r : 0.09 * r, i % 2 ? 0.09 * r : 0.05 * r).stroke({ width: 4, color: p.steel });
      }
    },
    torso(g, r, p) {
      // A riveted iron barrel of a body.
      const body = smooth([-0.5 * r, 0.06 * r, -0.56 * r, -0.5 * r, -0.4 * r, -0.86 * r, 0.3 * r, -0.88 * r, 0.56 * r, -0.5 * r, 0.5 * r, 0.06 * r], true, 2);
      inked(g, body, p.steelDark, 4);
      for (const y of [-0.66, -0.36, -0.08]) {
        g.moveTo(-0.52 * r, y * r).lineTo(0.52 * r, y * r).stroke({ width: 3, color: p.iron });
        for (const x of [-0.36, -0.12, 0.12, 0.36]) g.circle(x * r, (y - 0.05) * r, 0.03 * r).fill(p.steel);
      }
      // Moss and rot from the Deep, creeping up from the hem.
      for (const [x, y, s] of [[-0.3, 0.0, 0.1], [0.1, -0.02, 0.08], [0.35, -0.1, 0.06]]) g.circle(x * r, y * r, s * r).fill({ color: 0x8fd14f, alpha: 0.45 });
    },
    head(g, r, p) {
      // A great helm sunk between the shoulders, a visor slit glowing.
      inked(g, smooth([-0.34 * r, 0.04 * r, -0.36 * r, -0.4 * r, -0.1 * r, -0.56 * r, 0.3 * r, -0.5 * r, 0.42 * r, -0.2 * r, 0.36 * r, 0.04 * r], true, 2), p.steelDark, 4);
      g.roundRect(0.0, -0.32 * r, 0.42 * r, 0.1 * r, 0.03 * r).fill(0x0e1014);
      g.roundRect(0.06 * r, -0.3 * r, 0.32 * r, 0.06 * r, 0.02 * r).fill(p.visor);
      g.roundRect(0.0, -0.36 * r, 0.42 * r, 0.18 * r, 0.05 * r).fill({ color: p.visor, alpha: 0.18 });
      for (const x of [-0.24, 0.24]) g.circle(x * r, -0.08 * r, 0.035 * r).fill(p.steel);
    },
    hand: (g, r, p) => mitt(g, r, p.iron, true),
    weapon: shackle,
    gait: { swing: 0.35, bounce: 0.04, lean: 0.06, arm: 0.25 },
  },
};
