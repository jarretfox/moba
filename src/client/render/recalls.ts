import type { Graphics } from 'pixi.js';
import type { ChampionId } from '../../shared/champions/types';
import type { EntitySnap } from '../../shared/protocol';
import type { FxLayer } from './fx';
import { blob, inkLine, inked, shade } from './organic';
import type { Expression } from './rig';

// Signature recalls: the four seconds a champion spends channeling home, each in character. Dongmaster
// drops for push-ups, King Rix sits on a throne that appears for him, Havarti melts into a fondue pot,
// Daltonomo juggles, Jordini fills in the paperwork, The Oak scans the sky in a tinfoil hat, Logan lies
// down for a nap, Paris sits down for an espresso, and so on. Each routine poses the figure (its body
// and arms, and a face), draws props round it and in its hands, and gives off particles. Everything here
// is local: the sim only knows they're recalling.
//
// Props are drawn facing right with the feet at (0, 0) and up as −y (the view mirrors them when the
// champion faces left); `r` is the champion's radius (they stand about 2.5r tall).

type Palette = Record<string, number>;

/** The figure's pose: the animation tracks, plus held postures (see Posture in rig.ts). */
export interface Pose {
  turn?: number;
  reach?: number;
  twist?: number;
  lunge?: number;
  grow?: number;
  sit?: number;
  lie?: number;
  bow?: number;
  look?: number;
  armF?: readonly [number, number];
  armB?: readonly [number, number];
  face?: Expression;
}

/** Puts a line of text over the champion (pooled by the view). */
export type Say = (text: string, x: number, y: number, size: number, color: number, alpha?: number) => void;

export interface RecallRoutine {
  /** The figure at `t` seconds into the recall. */
  pose(t: number): Pose;
  /** Props behind the figure: a throne, a chair, the back of a mushroom ring. */
  under?(g: Graphics, t: number, r: number, p: Palette): void;
  /** Props in front: a bin, a pot, juggling balls, words. */
  over?(g: Graphics, t: number, r: number, p: Palette, say: Say): void;
  /** In the front hand (origin at the hand, +x along the forearm): a cup, a clipboard. */
  held?(g: Graphics, t: number, r: number, p: Palette): void;
  /** On the head (origin at the neck, up −y): a tinfoil hat. */
  worn?(g: Graphics, t: number, r: number, p: Palette): void;
  /** Particles while it plays. */
  fx?(fx: FxLayer, s: EntitySnap): void;
  /** Puts the weapon away for it (two hands needed for a cup and saucer). */
  stow?: boolean;
}

const INK = { width: 2, color: 0x0b0f14 };
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** 0 → 1 over the first `secs` of the recall, eased. */
const appear = (t: number, secs = 0.35) => {
  const k = Math.min(1, t / secs);
  return k * k * (3 - 2 * k);
};
/** Which way the champion faces, for particles (+1 right). */
const sideOf = (s: EntitySnap) => (Math.cos(s.f) < 0 ? -1 : 1);

export const RECALLS: Record<ChampionId, RecallRoutine> = {
  // Jordini fills in the paperwork for going home, then stamps it.
  marksman: {
    pose: (t) => ({ armB: [0.55, 1.75 + Math.sin(t * 14) * 0.15], armF: [0.75, 1.3], look: 0.35, bow: 0.08 }),
    over(g, t, r, _p, say) {
      const a = appear(t);
      const x = 0.42 * r;
      const y = -1.5 * r;
      g.roundRect(x, y, 0.55 * r * a, 0.7 * r * a, 3).fill(0x8a6a44).stroke(INK); // clipboard
      g.rect(x + 0.05 * r, y + 0.07 * r, 0.45 * r * a, 0.58 * r * a).fill(0xf6f0e0);
      g.rect(x + 0.18 * r, y - 0.03 * r, 0.2 * r * a, 0.07 * r).fill(0x9aa1ab);
      for (let i = 0; i < 4; i++) {
        const k = Math.max(0, Math.min(1, (t - i * 0.6) / 0.6));
        if (k > 0) g.moveTo(x + 0.1 * r, y + (0.17 + i * 0.12) * r).lineTo(x + (0.1 + 0.34 * k) * r, y + (0.17 + i * 0.12) * r).stroke({ width: 1.5, color: 0x5a5a6a });
      }
      if (t > 3) {
        const k = Math.min(1, (t - 3) * 5);
        g.circle(x + 0.36 * r, y + 0.52 * r, 0.11 * r * k).stroke({ width: 2.5, color: 0x3a9a3a, alpha: 0.85 });
        say('APPROVED', 0.3 * r, -2.95 * r, 14, 0x3a9a3a, k);
      }
    },
  },

  // The Oak puts on a tinfoil hat and points at the sky: drones (or birds, which are the same thing).
  barbarian: {
    pose: (t) => ({ look: -0.5 + Math.sin(t * 1.3) * 0.12, armB: [-1.9 + Math.sin(t * 1.3) * 0.25, 0.15], twist: Math.sin(t * 0.9) * 0.35 }),
    worn(g, t, r) {
      const a = appear(t, 0.5);
      // A cone of foil over the helmet, crinkled.
      const tip = -0.95 * r - 0.75 * r * a;
      g.poly([-0.36 * r, -0.62 * r, 0.06 * r, tip, 0.44 * r, -0.62 * r]).fill(0xdfe6ee).stroke(INK);
      for (const [x0, y0, x1, y1] of [[-0.18, -0.72, 0.0, -0.95], [0.12, -0.7, 0.22, -0.86], [-0.05, -0.85, 0.08, -1.05]]) g.moveTo(x0 * r, y0 * r).lineTo(x1 * r, y1 * r).stroke({ width: 1.5, color: 0xffffff, alpha: 0.85 * a });
      g.moveTo(-0.36 * r, -0.62 * r).lineTo(0.44 * r, -0.62 * r).stroke({ width: 3, color: 0x9aa1ab });
    },
    over(_g, t, r, _p, say) {
      if (Math.floor(t * 1.2) % 2 === 1) say('?!', -0.9 * r, -3.0 * r, 22, 0xffd166);
    },
  },

  // Willmore dives head first into a bin he found, flinging junk over his shoulder.
  willmore: {
    pose: (t) => ({ bow: 0.85 * appear(t) + Math.sin(t * 8) * 0.05, armF: [0.9, 0.1], armB: [-2.2 + Math.sin(t * 7) * 0.8, 0.3] }),
    over(g, t, r) {
      const a = appear(t, 0.3);
      const x = 0.95 * r;
      const h = 1.05 * r * a;
      g.ellipse(x, 0, 0.42 * r, 0.12 * r).fill({ color: 0x000000, alpha: 0.25 });
      inked(g, [x - 0.4 * r, 0, x - 0.44 * r, -h, x + 0.44 * r, -h, x + 0.4 * r, 0], 0x7d848e, 2.5);
      for (const k of [0.3, 0.6]) g.moveTo(x - 0.42 * r, -h * k).lineTo(x + 0.42 * r, -h * k).stroke({ width: 2, color: 0x5d636d });
      g.ellipse(x, -h, 0.44 * r, 0.12 * r).fill(0x2a2e34).stroke(INK);
    },
    fx(fx, s) {
      if (Math.random() > fx.dt * 6) return;
      const side = sideOf(s);
      const colors = [0x9aa1ab, 0x6b4a2b, 0x8fd14f, 0xc8945a];
      fx.particles.emit({ shape: 'shard', glow: false, x: s.x + side * s.r * 0.9, y: s.y - s.r * 1.1, vx: -side * rand(80, 220), vy: rand(-320, -200), ay: 620, life: 0.9, size: 10, size2: 8, color: colors[Math.floor(Math.random() * colors.length)], spin: 10 });
    },
  },

  // HunnaG raises her staff while a ring of mushrooms comes up round her.
  hunnag: {
    pose: (t) => ({ armF: [-1.4, 0.4], armB: [-2.0 + Math.sin(t * 3) * 0.2, 0.3], look: -0.25, grow: Math.sin(t * 2) * 0.03 }),
    under(g, t, r) {
      ring(g, t, r, false);
    },
    over(g, t, r) {
      ring(g, t, r, true);
    },
    fx(fx, s) {
      if (Math.random() < fx.dt * 12) fx.particles.emit({ shape: 'mote', x: s.x + rand(-70, 70), y: s.y - rand(0, 80), vy: rand(-60, -25), life: 1.1, size: 7, size2: 2, color: 0xc9f59a, color2: 0x8fd14f });
    },
  },

  // Logan lies down on his back for a nap.
  logan: {
    pose: (t) => ({ lie: -0.96 * appear(t, 0.6) + Math.sin(t * 2.2) * 0.01, armF: [1.0, 1.6], armB: [1.2, 1.4] }),
    over(_g, t, r, _p, say) {
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.6 + i / 3) % 1;
        say('z', -1.3 * r + k * 0.5 * r, -0.7 * r - k * 1.3 * r, 14 + k * 12, 0xe6f6ff, Math.sin(k * Math.PI) * appear(t, 0.8));
      }
    },
  },

  // A throne appears for King Rix, and he settles into it, scepter raised.
  kingrix: {
    pose: (t) => ({ sit: appear(t, 0.5), armF: [-0.4, 0.6], armB: [0.55, 1.2], look: -0.1 }),
    under(g, t, r) {
      const a = appear(t, 0.4);
      const seat = -0.45 * r;
      const top = seat - 2.1 * r * a;
      // The back, in red and gold, rising behind him.
      inked(g, [-0.62 * r, seat, -0.66 * r, top + 0.2 * r, -0.2 * r, top, 0.22 * r, top + 0.2 * r, 0.18 * r, seat], 0xa8232e, 3);
      g.circle(-0.22 * r, top + 0.05 * r, 0.12 * r * a).fill(0xffd166).stroke(INK);
      g.moveTo(-0.62 * r, top + 0.25 * r).lineTo(0.2 * r, top + 0.25 * r).stroke({ width: 4, color: 0xd9a52b });
      // The seat and its legs.
      inked(g, [-0.62 * r, seat, 0.6 * r, seat, 0.62 * r, seat + 0.14 * r, -0.62 * r, seat + 0.14 * r], 0xd9a52b, 2.5);
      for (const x of [-0.56, 0.5]) g.rect(x * r, seat + 0.14 * r, 0.08 * r, 0.3 * r).fill(0xa8822a).stroke(INK);
    },
    fx(fx, s) {
      if (Math.random() < fx.dt * 5) fx.particles.emit({ shape: 'star', x: s.x + rand(-50, 50), y: s.y - rand(80, 150), vy: -30, life: 0.7, size: 12, size2: 2, color: 0xfff1b8, color2: 0xffd166, spin: 4 });
    },
  },

  // Dongmaster drops and gives you push-ups, counting out loud.
  dongmaster: {
    pose: (t) => {
      const down = Math.max(0, Math.sin(t * 5.5));
      return { lie: appear(t, 0.4) * (0.82 + down * 0.14), armF: [0.15 + down * 0.6, down * 1.4], armB: [0.2 + down * 0.6, down * 1.4], face: down > 0.7 ? 'hurt' : null };
    },
    over(_g, t, r, _p, say) {
      say(String(Math.floor((t * 5.5) / (Math.PI * 2)) + 1), 0.3 * r, -1.7 * r, 26, 0xffd166);
    },
    fx(fx, s) {
      if (Math.random() < fx.dt * 5) fx.particles.emit({ shape: 'mote', glow: false, x: s.x + sideOf(s) * rand(10, 50), y: s.y - 40, vx: rand(-60, 60), vy: rand(-120, -60), ay: 400, life: 0.5, size: 6, size2: 3, color: 0x9fd6ff });
    },
  },

  // The Dark Dabber crouches down for a long pull on his rig, and vanishes into the cloud.
  dabber: {
    pose: (t) => ({ sit: 0.6 * appear(t), bow: 0.15, ...(t < 1.6 ? { turn: -1.6 * appear(t, 0.4) } : { turn: -1.6 + 1.6 * appear(t - 1.6, 0.4), look: -0.35 }), face: t > 1.8 ? 'grin' : null }),
    fx(fx, s) {
      if (Math.random() < fx.dt * 14) {
        fx.particles.emit({ shape: 'smoke', x: s.x + rand(-40, 40), y: s.y - rand(20, 90), vy: rand(-40, -15), life: 1.6, size: 26, size2: 70, color: 0xc8d6b0, color2: 0x5a6a4a, alpha: 0.45, fadeIn: 0.3 });
      }
    },
  },

  // Master Paris sits down at a café table for one last espresso.
  paris: {
    stow: true,
    pose: (t) => {
      // Sip, put it down, sip.
      const sip = Math.max(0, Math.sin(t * 1.8 - 0.6));
      return { sit: appear(t, 0.45), armF: [0.95 - sip * 0.9, 1.0 + sip * 1.25], armB: [1.3, 0.5], look: -sip * 0.2 };
    },
    under(g, t, r) {
      const a = appear(t, 0.35);
      // A little bistro chair.
      g.moveTo(-0.3 * r, -0.45 * r).lineTo(-0.36 * r, -1.35 * r * a - 0.45 * r).stroke({ width: 4, color: 0x2a2a30 });
      inked(g, [-0.38 * r, -0.5 * r, 0.32 * r, -0.5 * r, 0.32 * r, -0.42 * r, -0.38 * r, -0.42 * r], 0x8a2a2a, 2);
      for (const x of [-0.3, 0.26]) g.moveTo(x * r, -0.42 * r).lineTo((x + (x < 0 ? -0.05 : 0.05)) * r, 0).stroke({ width: 3, color: 0x2a2a30 });
    },
    over(g, t, r) {
      const a = appear(t, 0.35);
      // A round café table in front of him.
      const x = 0.95 * r;
      g.moveTo(x, -0.82 * r * a).lineTo(x, 0).stroke({ width: 4, color: 0x2a2a30 });
      g.moveTo(x - 0.2 * r, 0).lineTo(x + 0.2 * r, 0).stroke({ width: 3, color: 0x2a2a30 });
      g.ellipse(x, -0.84 * r * a, 0.42 * r, 0.1 * r).fill(0xf2efe6).stroke(INK);
    },
    held(g, t, r) {
      const a = appear(t, 0.35);
      // The cup and saucer, level whichever way the arm's turned (near enough).
      g.ellipse(0.12 * r, 0, 0.14 * r * a, 0.04 * r * a).fill(0xffffff).stroke(INK);
      g.roundRect(0.04 * r, -0.14 * r * a, 0.16 * r * a, 0.14 * r * a, 3).fill(0xffffff).stroke(INK);
    },
    fx(fx, s) {
      if (Math.random() < fx.dt * 5) fx.particles.emit({ shape: 'smoke', x: s.x + sideOf(s) * s.r * 0.6, y: s.y - s.r * 1.4, vy: rand(-40, -25), life: 1.2, size: 6, size2: 16, color: 0xffffff, color2: 0xd8d0c0, alpha: 0.5, fadeIn: 0.3 });
    },
  },

  // Havarti sinks into a pot of fondue, melting as she goes (and reforms at home).
  havarti: {
    pose: (t) => ({ grow: -0.45 * appear(t, 3.6), armF: [-1.2, 0.3], armB: [-1.6, 0.3], face: 'grin' }),
    over(g, t, r) {
      const a = appear(t, 0.4);
      const w = 0.85 * r;
      const top = -0.62 * r * a;
      // The pot, with melted cheese welling up over the rim.
      inked(g, [-w, top, -w * 0.9, -0.05 * r, -w * 0.5, 0.06 * r, w * 0.5, 0.06 * r, w * 0.9, -0.05 * r, w, top], 0x3a3a42, 3);
      g.ellipse(0, top, w, 0.16 * r).fill(0xf3dc8a).stroke({ width: 2, color: 0xd9a52b });
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.8 + i / 3) % 1;
        g.circle((-0.4 + i * 0.4) * r, top - k * 0.2 * r, 0.06 * r * (1 - k)).stroke({ width: 1.5, color: 0xd9a52b, alpha: 1 - k });
      }
      g.moveTo(-w * 0.6, top + 0.02 * r).quadraticCurveTo(-w * 0.75, top + 0.2 * r, -w * 0.7, top + 0.32 * r).stroke({ width: 5, color: 0xf3dc8a, cap: 'round' }); // a drip over the side
    },
    fx(fx, s) {
      if (Math.random() < fx.dt * 8) fx.particles.emit({ shape: 'mote', glow: false, x: s.x + rand(-40, 40), y: s.y - rand(20, 40), vy: rand(-60, -20), ay: 120, life: 0.6, size: 7, size2: 3, color: 0xffe29a });
    },
  },

  // Daltonomo juggles three balls for an audience of nobody, grinning.
  daltonomo: {
    pose: (t) => ({ armF: [-0.5 + Math.sin(t * 9) * 0.45, 1.1], armB: [-0.5 - Math.sin(t * 9) * 0.45, 1.1], look: -0.3, face: 'grin' }),
    over(g, t, r) {
      const colors = [0xff6b8a, 0xffd166, 0x7fe3ff];
      for (let i = 0; i < 3; i++) {
        const k = (t * 1.4 + i / 3) % 1;
        const x = 0.15 * r + Math.cos(k * Math.PI * 2) * 0.45 * r;
        const y = -2.3 * r - Math.abs(Math.sin(k * Math.PI * 2)) * 0.9 * r;
        inked(g, blob(x, y, 0.12 * r, 0.12 * r, i, 0.05, 12), colors[i], 2);
      }
      inkLine(g, -0.35 * r, -2.6 * r, 0.65 * r, -2.6 * r, 1.5, { color: 0xffffff, alpha: 0.2 }, -0.25);
    },
  },
};

/** HunnaG's mushroom ring: the back half behind her, the front half in front. */
function ring(g: Graphics, t: number, r: number, front: boolean): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (Math.sin(a) > 0 !== front) continue;
    const k = Math.max(0, Math.min(1, (t - i * 0.35) / 0.5));
    if (k <= 0) continue;
    const x = Math.cos(a) * 1.3 * r;
    const y = Math.sin(a) * 0.45 * r;
    const h = 0.32 * r * k;
    g.rect(x - 0.05 * r, y - h, 0.1 * r, h).fill(0xe8dcc0).stroke({ width: 1.5, color: 0x0b0f14 });
    const cap = i % 2 ? 0x7a3fb0 : 0x9a4fd0;
    inked(g, [x - 0.2 * r * k, y - h, x - 0.14 * r * k, y - h - 0.14 * r * k, x + 0.14 * r * k, y - h - 0.14 * r * k, x + 0.2 * r * k, y - h], cap, 1.8);
    g.circle(x - 0.06 * r * k, y - h - 0.08 * r * k, 0.035 * r * k).fill(shade(cap, -0.7));
  }
}
