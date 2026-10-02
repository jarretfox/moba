import type { Graphics } from 'pixi.js';
import type { ChampionId } from '../../shared/champions/types';
import type { Slot } from '../../shared/constants';
import type { EntitySnap } from '../../shared/protocol';
import type { FxLayer } from './fx';
import { inkOf, inkStroke } from './organic';
import { chestHeight, standHeight } from './stature';

// Each champion's cast signature: the mark that appears on and around them whenever they cast anything,
// so you can tell at a glance who's casting without reading the spell itself. The Oak splits the ground,
// Jordini stamps a big red NO, HunnaG's fairy ring sprouts, King Rix drops a crown, Daltonomo's harlequin
// diamonds spin... all in the champion's own colors. Ultimates get the bigger version. Purely cosmetic.

/** Each champion's magic has its own colors, so you can tell whose spell just went off. */
export const CAST_COLORS: Record<ChampionId, number> = {
  marksman: 0x7fe3ff,
  barbarian: 0xff5a2a,
  willmore: 0xc8945a,
  hunnag: 0x8fd14f,
  logan: 0xffc04d,
  kingrix: 0xffd166,
  dongmaster: 0xffb070,
  dabber: 0x9be15d,
  paris: 0xff8fb0,
  havarti: 0xffe29a,
  daltonomo: 0xb98be0,
  scrimby: 0xff8a3d,
  bigwhale: 0x8ad6ff,
};

/** Where a signature goes: the champion's spot on the ground, their size and color, how tall they stand, and whether it's their ultimate. */
export interface SigSpot {
  x: number;
  y: number;
  r: number;
  color: number;
  /** The middle of the body, and the top of the head, above (x, y). */
  chest: number;
  top: number;
  big: boolean;
}

type Signature = (fx: FxLayer, s: SigSpot) => void;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

// ─── Motifs shared with the spells (spells.ts) ───────────────────────────────

/** A little mushroom standing on (0, 0), about `s` tall: a pale stalk and a spotted cap, purple or `color` by turns. */
export function drawMushroom(g: Graphics, s: number, i: number, color: number): void {
  g.roundRect(-s * 0.18, -s * 0.9, s * 0.36, s * 0.95, s * 0.1).fill(0xe8e0cc).stroke({ width: 1.5, color: 0x5a4a3a });
  g.ellipse(0, -s * 0.95, s * 0.62, s * 0.4).fill(i % 2 ? 0x7a3fb0 : color).stroke({ width: 1.6, color: i % 2 ? 0x2a1a3a : 0x2d4a14 });
  g.circle(-s * 0.22, -s * 1.02, s * 0.1).fill(0xe8d7ff);
  g.circle(s * 0.25, -s * 0.9, s * 0.08).fill(0xe8d7ff);
}

/** A harlequin diamond, purple or gold by turns. */
export function drawDiamond(g: Graphics, s: number, i: number): void {
  const c = i % 2 ? 0x7a3fb0 : 0xffd166;
  g.poly([0, -s, s * 0.6, 0, 0, s, -s * 0.6, 0]).fill(c).stroke({ width: 2, color: inkOf(c), join: 'round' });
}

/** A crown lying round (0, 0): the band flat on the ground, jewelled points standing up along its front. */
export function drawCrown(g: Graphics, R: number, color: number): void {
  const ink = inkOf(color);
  g.ellipse(0, 0, R, R * 0.42).stroke({ width: 10, color: ink, alpha: 0.9 });
  g.ellipse(0, 0, R, R * 0.42).stroke({ width: 6, color });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.08 + (i / 6) * 0.84);
    const px = Math.cos(a) * R;
    const py = Math.sin(a) * R * 0.42;
    const h = R * (i % 2 ? 0.32 : 0.46);
    g.poly([px - R * 0.1, py, px, py - h, px + R * 0.1, py]).fill(color).stroke({ width: 2, color: ink, join: 'round' });
    g.circle(px, py - h * 0.45, R * 0.035).fill(i % 2 ? 0x3d8bfd : 0xc0182b);
  }
}

/** A paw print round (0, 0), toes up the screen. */
export function drawPaw(g: Graphics, R: number, color: number): void {
  const ink = inkOf(color);
  g.ellipse(0, R * 0.2, R * 0.55, R * 0.42).fill({ color, alpha: 0.85 }).stroke({ width: 2.5, color: ink });
  for (const [tx, ty, s] of [[-0.62, -0.3, 0.2], [-0.22, -0.55, 0.22], [0.22, -0.55, 0.22], [0.62, -0.3, 0.2]] as const) {
    g.ellipse(tx * R, ty * R, s * R, s * R * 1.2).fill({ color, alpha: 0.85 }).stroke({ width: 2.5, color: ink });
  }
}

/** A handful of jester's confetti. */
function scraps(fx: FxLayer, x: number, y: number, count: number, speed: number): void {
  const colors = [0xff6b8a, 0xffd166, 0x7fe3ff, 0x9be15d, 0xb98be0];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    fx.particles.emit({ shape: 'shard', glow: false, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, drag: 0.08, ay: 220, life: rand(0.7, 1.1), size: 8, size2: 6, color: colors[i % colors.length], spin: 12 });
  }
}

export const SIGNATURES: Record<ChampionId, Signature> = {
  // The Oak: the ground splits under him, wood splinters fly, and the axe throws a few embers.
  barbarian(fx, { x, y, r, color, chest, big }) {
    const R = r * (big ? 2.8 : 2.2);
    fx.cracks(x, y, R, color, 0.6, big ? 8 : 6);
    fx.speedLines(x, y, R * 1.1, color, 7, 0.3);
    fx.particles.burst(10, { shape: 'shard', glow: false, x, y, life: 0.55, size: 10, size2: 5, color: 0x8a5a2b, drag: 0.1, spin: 12, ay: 420 }, [120, 320], -Math.PI / 2, Math.PI * 1.2);
    fx.particles.burst(6, { shape: 'spark', x, y: y - chest, life: 0.3, size: 10, size2: 3, stretch: 0.05, color: 0xffe0a0, color2: color }, [150, 320]);
  },

  // Jordini: a big red NO stamped on the ground under him, and the paperwork goes flying.
  marksman(fx, { x, y, r, color, chest, big }) {
    const R = r * (big ? 2.2 : 1.7);
    const red = 0xd93636;
    fx.stamp(x, y, 0.6, (g) => {
      g.circle(0, 0, R).stroke({ width: R * 0.17, color: inkOf(red), alpha: 0.9 });
      g.circle(0, 0, R).stroke({ width: R * 0.11, color: red });
      g.moveTo(-R * 0.66, -R * 0.66).lineTo(R * 0.66, R * 0.66).stroke({ width: R * 0.17, color: inkOf(red), cap: 'round' });
      g.moveTo(-R * 0.66, -R * 0.66).lineTo(R * 0.66, R * 0.66).stroke({ width: R * 0.11, color: red, cap: 'round' });
      g.circle(0, 0, R * 0.8).stroke({ width: 1.5, color, alpha: 0.5 });
    }, { layer: 'under', from: 1.9, alpha: 0.9 });
    fx.particles.burst(8, { shape: 'shard', glow: false, x, y: y - chest, life: 0.9, size: 12, size2: 10, color: 0xf6f0e0, drag: 0.2, ay: 90, spin: 4 }, [80, 200]);
  },

  // Willmore: the bin lid comes down with a CLANG: a dented grey ring, still ringing, and bits of junk.
  willmore(fx, { x, y, r, chest, big }) {
    const R = r * (big ? 2.1 : 1.6);
    fx.stamp(x, y, 0.5, (g) => {
      const pts: number[] = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const k = 1 + Math.sin(i * 2.7) * 0.06;
        pts.push(Math.cos(a) * R * k, Math.sin(a) * R * k * 0.6);
      }
      g.poly(pts).stroke({ width: 9, color: 0x3f444c, alpha: 0.9, join: 'round' });
      g.poly(pts).stroke({ width: 5, color: 0x9aa1ab, join: 'round' });
      g.poly(pts.map((v) => v * 0.78)).stroke({ width: 2, color: 0x6a707a, alpha: 0.8, join: 'round' });
      g.ellipse(0, 0, R * 0.22, R * 0.13).fill(0x5d636d).stroke({ width: 2, color: 0x3f444c });
    }, { layer: 'under', from: 1.5 });
    fx.vibrate(x, y - chest * 0.6, r * 1.3, 0xdfe6ee, 0.35);
    fx.particles.burst(7, { shape: 'shard', glow: false, x, y: y - chest, life: 0.6, size: 9, size2: 6, color: 0x9aa1ab, drag: 0.1, spin: 10, ay: 380 }, [120, 260]);
    fx.particles.burst(4, { shape: 'smoke', glow: false, x, y, life: 0.5, size: 16, size2: 36, color: 0xb9a68a, alpha: 0.35, drag: 0.1 }, [40, 90]);
  },

  // HunnaG: a fairy ring of little mushrooms springs up round her feet and puffs out spores.
  hunnag(fx, { x, y, r, color, big }) {
    const R = r * (big ? 2.2 : 1.7);
    fx.motifRing(x, y, R, big ? 10 : 8, 0.8, (g, i) => drawMushroom(g, r * 0.26 * (0.8 + (i % 3) * 0.15), i, color), { layer: 'under', squash: 0.5 });
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      fx.particles.emit({ shape: i % 3 ? 'mote' : 'ring', x: x + Math.cos(a) * R, y: y + Math.sin(a) * R * 0.5, vy: -40 - Math.random() * 40, life: 0.8, size: 8, size2: 14, color: 0xc9f59a, color2: color, alpha: 0.8 });
    }
  },

  // Logan: a golden paw print pressed into the ground, and his mane shaken out.
  logan(fx, { x, y, r, color, chest, big }) {
    const R = r * (big ? 1.5 : 1.15);
    fx.stamp(x, y, 0.6, (g) => drawPaw(g, R, color), { layer: 'under', from: 1.5, alpha: 0.9 });
    fx.particles.burst(10, { shape: 'leaf', glow: false, x, y: y - chest, life: 0.7, size: 11, size2: 8, color: 0xd98a2b, drag: 0.2, ay: 60, spin: 4 }, [100, 220]);
    fx.speedLines(x, y - chest, r * 2, color, 6, 0.25);
  },

  // King Rix: a golden crown drops round his feet, and coins spin off it.
  kingrix(fx, { x, y, r, color, chest, big }) {
    const R = r * (big ? 2.1 : 1.6);
    fx.stamp(x, y, 0.65, (g) => drawCrown(g, R, color), { layer: 'under', from: 1.6, alpha: 0.95 });
    fx.particles.burst(10, { shape: 'star', x, y: y - chest, life: 0.6, size: 14, size2: 2, color: 0xfff1b8, color2: color, drag: 0.1, spin: 6 }, [100, 240]);
  },

  // Dongmaster: an iron plate slams down round his feet, the dust jumps, and the jaw catches the light.
  dongmaster(fx, { x, y, r, chest, big }) {
    const R = r * (big ? 2.1 : 1.6);
    fx.stamp(x, y, 0.5, (g) => {
      g.ellipse(0, 0, R, R * 0.45).stroke({ width: 12, color: 0x23262c, alpha: 0.95 });
      g.ellipse(0, 0, R, R * 0.45).stroke({ width: 7, color: 0x5a5f6a });
      g.ellipse(0, 0, R * 0.72, R * 0.45 * 0.72).stroke({ width: 2, color: 0x8a8f9a, alpha: 0.7 });
      for (const a of [0.3, 1.3, 1.85, 2.85]) g.circle(Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.39, R * 0.05).fill(0x8a8f9a).stroke({ width: 1.5, color: 0x23262c });
    }, { layer: 'under', from: 1.6 });
    fx.speedLines(x, y, R * 1.3, 0xffb070, 8, 0.25);
    fx.particles.burst(6, { shape: 'smoke', glow: false, x, y, life: 0.5, size: 18, size2: 40, color: 0xc9b89a, alpha: 0.4, drag: 0.1 }, [60, 140]);
    fx.particles.emit({ shape: 'star', x: x + r * 0.35, y: y - chest * 1.3, life: 0.4, size: 22, size2: 4, color: 0xffffff, color2: 0xffe29a, spin: 4 });
  },

  // The Dark Dabber: a ring of smoke rolls out from round his feet, with an ember or two.
  dabber(fx, { x, y, r, big }) {
    const R = r * (big ? 1.4 : 1.0);
    const n = big ? 16 : 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      fx.particles.emit({ shape: 'smoke', x: x + Math.cos(a) * R, y: y + Math.sin(a) * R * 0.6, vx: Math.cos(a) * 70, vy: Math.sin(a) * 40 - 15, drag: 0.3, life: rand(0.9, 1.3), size: r * 0.5, size2: r * 1.2, color: 0xc8d6b0, color2: 0x5a6a4a, alpha: 0.5, fadeIn: 0.15 });
    }
    fx.particles.burst(4, { shape: 'mote', x, y: y - r, life: 0.6, size: 6, size2: 2, color: 0xffd9a8, color2: 0xff7a2f, drag: 0.3 }, [40, 120]);
  },

  // Master Paris: the blade signs the air with a flourish (a Z, naturally), and a petal or two fall.
  paris(fx, { x, y, r, color, chest, big }) {
    const s = r * (big ? 1.3 : 1.0);
    const cx = x;
    const cy = y - chest;
    const path = [cx - s * 0.7, cy - s * 0.6, cx + s * 0.7, cy - s * 0.65, cx - s * 0.6, cy + s * 0.5, cx + s * 0.8, cy + s * 0.45];
    const ink = inkOf(color);
    fx.custom(0.5, (g, t) => {
      const k = easeOut(Math.min(1, t / 0.35)) * 3;
      const fade = 1 - Math.max(0, (t - 0.35) / 0.65);
      const pts: number[] = [path[0], path[1]];
      for (let seg = 0; seg < 3; seg++) {
        const part = Math.max(0, Math.min(1, k - seg));
        if (part <= 0) break;
        const ax = path[seg * 2];
        const ay = path[seg * 2 + 1];
        pts.push(ax + (path[seg * 2 + 2] - ax) * part, ay + (path[seg * 2 + 3] - ay) * part);
      }
      if (pts.length < 4) return;
      inkStroke(g, pts, 6, { color: ink, alpha: 0.8 * fade, tip: 0.15 });
      inkStroke(g, pts, 3, { color: 0xffffff, alpha: 0.95 * fade, tip: 0.1 });
      inkStroke(g, pts, 9, { color, alpha: 0.2 * fade, tip: 0.2 });
    });
    fx.later(0.3, () => fx.particles.burst(5, { shape: 'star', x: path[6], y: path[7], life: 0.4, size: 14, size2: 2, color: 0xffffff, color2: color, spin: 6 }, [60, 160]));
    fx.particles.burst(4, { shape: 'leaf', glow: false, x: cx, y: cy, life: 1, size: 10, size2: 8, color: 0xff6b8a, drag: 0.3, ay: 50, spin: 5 }, [40, 120]);
  },

  // Havarti: a halo blazes over her and feathers drift down.
  havarti(fx, { x, y, r, color, top, big }) {
    const R = r * (big ? 1.2 : 0.9);
    const hy = y - top - r * 0.3;
    fx.stamp(x, hy, 0.6, (g) => {
      g.ellipse(0, 0, R, R * 0.32).stroke({ width: 9, color, alpha: 0.4 });
      g.ellipse(0, 0, R, R * 0.32).stroke({ width: 3.5, color: 0xfff6dc });
    }, { glow: true, from: 0.6, rise: -14 });
    fx.flash(x, hy, r * 0.6, 0xfff1b8, 0.3, 0.6);
    fx.particles.burst(8, { shape: 'leaf', glow: false, x, y: hy, life: 1.2, size: 12, size2: 9, color: 0xfff6dc, drag: 0.25, ay: 50, spin: 3 }, [60, 160]);
  },

  // Daltonomo: a ring of harlequin diamonds spins round him, a bell chimes, and confetti flies.
  daltonomo(fx, { x, y, r, chest, big }) {
    const R = r * (big ? 2.2 : 1.7);
    fx.motifRing(x, y, R, big ? 12 : 10, 0.6, (g, i) => drawDiamond(g, r * 0.3, i), { layer: 'under', spin: 2.5, squash: 0.5, stagger: 0.3 });
    scraps(fx, x, y - chest, big ? 22 : 12, 180);
    fx.particles.burst(2, { shape: 'star', x, y: y - chest * 1.8, life: 0.4, size: 16, size2: 2, color: 0xffffff, color2: 0xffe29a, spin: 6 }, [30, 90]);
  },
  // Scrimby: a subway map's colored lines streak out from his feet, and the token glints.
  scrimby(fx, { x, y, r, chest, big }) {
    const R = r * (big ? 2.2 : 1.6);
    fx.stamp(x, y, 0.5, (g) => {
      for (const [color, a] of [[0xff8a3d, 0], [0x3d8bfd, 1.2], [0x22aa55, 2.4], [0xffd166, 3.6]] as const) {
        g.moveTo(0, 0).lineTo(Math.cos(a) * R, Math.sin(a) * R * 0.45).stroke({ width: 6, color, cap: 'round' });
        g.circle(Math.cos(a) * R, Math.sin(a) * R * 0.45, 5).fill(0xffffff).stroke({ width: 2, color });
      }
    }, { layer: 'under', from: 0.6, alpha: 0.9 });
    fx.particles.burst(6, { shape: 'spark', x, y: y - chest, life: 0.35, size: 12, size2: 2, stretch: 0.05, color: 0xfff1b8, color2: 0xff8a3d }, [100, 220]);
  },

  // Big Whale: a ring of water and a shower of coins.
  bigwhale(fx, { x, y, r, chest, big }) {
    const R = r * (big ? 2.2 : 1.6);
    fx.shockwave(x, y, R, 0x8ad6ff, 0.45);
    fx.particles.burst(big ? 14 : 8, { shape: 'mote', glow: false, x, y: y - chest, life: 0.8, size: 9, size2: 6, color: 0xffd166, ay: 420, spin: 8 }, [100, 240], -Math.PI / 2, 1.8);
  },
};

/** The champion's mark, on and around them, as they cast `slot` (bigger for the ultimate). */
export function castSignature(fx: FxLayer, caster: EntitySnap, slot?: Slot): void {
  if (!caster.champ) return;
  const color = CAST_COLORS[caster.champ];
  const chest = chestHeight(caster);
  SIGNATURES[caster.champ](fx, { x: caster.x, y: caster.y, r: caster.r, color, chest, top: standHeight(caster), big: slot === 3 });
  // And a breath of their color off the body, so the figure itself reads as the one casting.
  fx.particles.burst(6, { shape: 'mote', x: caster.x, y: caster.y - chest, life: 0.4, size: 8, size2: 2, color: 0xffffff, color2: color, drag: 0.1 }, [80, 180]);
}
