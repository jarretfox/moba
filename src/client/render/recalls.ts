import type { Graphics } from 'pixi.js';
import type { ChampionId } from '../../shared/champions/types';
import type { EntitySnap } from '../../shared/protocol';
import { arc } from './draw';
import type { FxLayer } from './fx';

// Signature recalls: the four seconds a champion spends channeling home, each in character. Dongmaster
// does push-ups, King Rix sits on a throne that appears for him, Havarti melts into fondue, Daltonomo
// juggles, Jordini fills in paperwork, The Oak scans the sky in a tinfoil hat, Logan naps, and so on.
// Each routine moves the figure (a pose, as a function of time), draws props around it, and gives off
// particles. Everything here is local: the sim only knows they're recalling.

type Palette = Record<string, number>;

/** How far the figure turns, reaches, twists, lunges and grows (like the animation tracks). */
export interface Pose {
  turn?: number;
  reach?: number;
  twist?: number;
  lunge?: number;
  grow?: number;
}

/** Puts a line of text over the champion (pooled by the view). */
export type Say = (text: string, x: number, y: number, size: number, color: number, alpha?: number) => void;

export interface RecallRoutine {
  /** The figure at `t` seconds into the recall. */
  pose(t: number): Pose;
  /** Props behind the figure, around the unit's center (screen-up is -y), `r` its radius. */
  under?(g: Graphics, t: number, r: number, p: Palette): void;
  /** Props in front: a hat, a cup, juggling balls, words. */
  over?(g: Graphics, t: number, r: number, p: Palette, say: Say): void;
  /** Particles while it plays. */
  fx?(fx: FxLayer, s: EntitySnap): void;
}

const INK = { width: 2, color: 0x0b0f14 };
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** 0 → 1 over the first `secs` of the recall, eased. */
const appear = (t: number, secs = 0.35) => {
  const k = Math.min(1, t / secs);
  return k * k * (3 - 2 * k);
};

export const RECALLS: Record<ChampionId, RecallRoutine> = {
  // Jordini fills in the paperwork for going home, then stamps it.
  marksman: {
    pose: (t) => ({ reach: -0.25, twist: Math.sin(t * 14) * 0.05, grow: -0.04 }),
    over(g, t, r, _p, say) {
      const a = appear(t);
      g.roundRect(0.5 * r, -0.2 * r, 0.7 * r * a, 0.85 * r * a, 3).fill(0x8a6a44).stroke(INK); // clipboard
      g.rect(0.56 * r, -0.12 * r, 0.58 * r * a, 0.72 * r * a).fill(0xf6f0e0);
      for (let i = 0; i < 4; i++) g.moveTo(0.62 * r, (-0.02 + i * 0.14) * r).lineTo((0.62 + 0.42 * Math.min(1, (t - i * 0.5) / 0.5)) * r, (-0.02 + i * 0.14) * r).stroke({ width: 1.5, color: 0x5a5a6a, alpha: t > i * 0.5 ? 1 : 0 });
      if (t > 3) say('APPROVED', 0.85 * r, 0.2 * r, 13, 0x3a9a3a, Math.min(1, (t - 3) * 4));
    },
  },
  // The Oak puts on a tinfoil hat and watches the sky for drones (or birds, which are the same thing).
  barbarian: {
    pose: (t) => ({ twist: Math.sin(t * 1.4) * 0.7, grow: Math.abs(Math.sin(t * 3)) * 0.03 }),
    over(g, t, r, _p, say) {
      const a = appear(t, 0.5);
      const hx = 0;
      g.poly([hx - 0.42 * r * a, -0.1 * r, hx, -0.95 * r * a - 0.1 * r, hx + 0.42 * r * a, -0.1 * r]).fill(0xdfe6ee).stroke(INK); // the hat
      for (const [x0, y0, x1, y1] of [[-0.2, -0.3, 0.05, -0.5], [0.1, -0.25, 0.25, -0.45]]) g.moveTo(hx + x0 * r * a, y0 * r * a).lineTo(hx + x1 * r * a, y1 * r * a).stroke({ width: 1.5, color: 0xffffff, alpha: 0.8 });
      if (Math.floor(t * 1.2) % 2 === 1) say('?!', 1.15 * r, -0.5 * r, 20, 0xffd166);
    },
  },
  // Willmore digs through a bin he found, flinging junk over his shoulder.
  willmore: {
    pose: (t) => ({ twist: 2.4 + Math.sin(t * 9) * 0.15, turn: Math.sin(t * 6) * 0.6 }),
    under(g, t, r) {
      const a = appear(t);
      g.circle(-0.95 * r, 0, 0.42 * r * a).fill(0x7d848e).stroke(INK);
      g.circle(-0.95 * r, 0, 0.3 * r * a).fill(0x2a2e34);
    },
    fx(fx, s) {
      if (Math.random() > fx.dt * 6) return;
      const colors = [0x9aa1ab, 0x6b4a2b, 0x8fd14f, 0xc8945a];
      fx.particles.emit({ shape: 'shard', glow: false, x: s.x, y: s.y, vx: rand(-160, 160), vy: rand(-260, -160), ay: 520, life: 0.8, size: 10, size2: 8, color: colors[Math.floor(Math.random() * colors.length)], spin: 10 });
    },
  },
  // HunnaG sinks into herself while a ring of mushrooms comes up round her.
  hunnag: {
    pose: (t) => ({ grow: Math.sin(t * 2) * 0.05 - 0.05 }),
    under(g, t, r) {
      for (let i = 0; i < 7; i++) {
        const k = Math.max(0, Math.min(1, (t - i * 0.4) / 0.5));
        if (k <= 0) continue;
        const a = (i / 7) * Math.PI * 2;
        const x = Math.cos(a) * 1.5 * r;
        const y = Math.sin(a) * 1.5 * r;
        g.circle(x, y, 0.28 * r * k).fill(i % 2 ? 0x7a3fb0 : 0x9a4fd0).stroke(INK);
        g.circle(x - 0.06 * r, y - 0.06 * r, 0.07 * r * k).fill(0xe8d7ff);
      }
    },
    fx(fx, s) {
      if (Math.random() < fx.dt * 12) fx.particles.emit({ shape: 'mote', x: s.x + rand(-60, 60), y: s.y + rand(-40, 40), vy: rand(-50, -20), life: 1, size: 7, size2: 2, color: 0xc9f59a, color2: 0x8fd14f });
    },
  },
  // Logan curls up for a nap.
  logan: {
    pose: (t) => ({ grow: -0.14 * appear(t, 0.6) + Math.sin(t * 2.2) * 0.02, twist: 0.6 * appear(t, 0.6), reach: -0.3 * appear(t, 0.6) }),
    over(_g, t, r, _p, say) {
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.6 + i / 3) % 1;
        say('z', 1.0 * r + k * 0.8 * r, -0.2 * r - k * 1.2 * r, 14 + k * 12, 0xe6f6ff, Math.sin(k * Math.PI));
      }
    },
  },
  // A throne appears behind King Rix, and he settles into it.
  kingrix: {
    pose: (t) => ({ grow: 0.05 * appear(t), turn: -0.8 * appear(t), lunge: -0.15 * appear(t) }),
    under(g, t, r) {
      const a = appear(t, 0.4);
      const w = 1.3 * r * a;
      g.roundRect(-0.55 * r - 0.5 * w, -w * 0.55, w, w * 1.1, 6).fill(0xa8232e).stroke(INK); // seat back
      g.roundRect(-0.55 * r - 0.5 * w - 6, -w * 0.62, w + 12, 12, 4).fill(0xd9a52b).stroke(INK);
      for (const side of [-1, 1]) g.roundRect(-0.6 * r, side * w * 0.55 - 6, 0.9 * r * a, 12, 4).fill(0xd9a52b).stroke(INK); // armrests
    },
    fx(fx, s) {
      if (Math.random() < fx.dt * 5) fx.particles.emit({ shape: 'star', x: s.x + rand(-50, 50), y: s.y - rand(20, 60), vy: -30, life: 0.7, size: 12, size2: 2, color: 0xfff1b8, color2: 0xffd166, spin: 4 });
    },
  },
  // Dongmaster drops and gives you push-ups, counting out loud.
  dongmaster: {
    pose: (t) => ({ lunge: 0.12 + Math.sin(t * 6) * 0.08, grow: -0.06 + Math.abs(Math.sin(t * 3)) * 0.08 }),
    over(_g, t, r, _p, say) {
      say(String(Math.floor(t * 0.95) + 1), 1.15 * r, -0.4 * r, 24, 0xffd166);
    },
    fx(fx, s) {
      if (Math.random() < fx.dt * 5) fx.particles.emit({ shape: 'mote', glow: false, x: s.x + rand(-20, 20), y: s.y - 20, vx: rand(-60, 60), vy: rand(-120, -60), ay: 400, life: 0.5, size: 6, size2: 3, color: 0x9fd6ff });
    },
  },
  // The Dark Dabber takes a long pull on his rig and vanishes into the cloud.
  dabber: {
    pose: (t) => (t < 1.6 ? { turn: -1.6 * appear(t, 0.4) } : { turn: -1.6 + 1.6 * appear(t - 1.6, 0.4), grow: 0.06 }),
    fx(fx, s) {
      if (Math.random() < fx.dt * 14) {
        fx.particles.emit({ shape: 'smoke', x: s.x + rand(-30, 30), y: s.y + rand(-30, 20), vy: rand(-40, -15), life: 1.6, size: 26, size2: 70, color: 0xc8d6b0, color2: 0x5a6a4a, alpha: 0.45, fadeIn: 0.3 });
      }
    },
  },
  // Master Paris pauses for one last espresso.
  paris: {
    pose: (t) => ({ turn: 0.9 * appear(t), twist: Math.sin(t * 1.5) * 0.08 }),
    over(g, t, r) {
      const a = appear(t);
      g.ellipse(0.75 * r, 0.35 * r, 0.22 * r * a, 0.07 * r * a).fill(0xffffff).stroke(INK); // saucer
      g.roundRect(0.64 * r, 0.12 * r, 0.22 * r * a, 0.22 * r * a, 3).fill(0xffffff).stroke(INK); // cup
      g.circle(0.75 * r, 0.17 * r, 0.07 * r * a).fill(0x5a3a1a);
    },
    fx(fx, s) {
      if (Math.random() < fx.dt * 5) fx.particles.emit({ shape: 'smoke', x: s.x + s.r * 0.75, y: s.y + s.r * 0.05, vy: rand(-40, -25), life: 1.2, size: 6, size2: 16, color: 0xffffff, color2: 0xd8d0c0, alpha: 0.5, fadeIn: 0.3 });
    },
  },
  // Havarti melts into a puddle of fondue (and reforms at home).
  havarti: {
    pose: (t) => ({ grow: -0.5 * appear(t, 3.6) }),
    under(g, t, r) {
      const k = appear(t, 3.6);
      g.ellipse(0, 0.1 * r, (0.6 + 0.9 * k) * r, (0.45 + 0.6 * k) * r).fill({ color: 0xf3dc8a, alpha: 0.85 }).stroke({ width: 2, color: 0xd9a52b });
      for (const [x, y] of [[-0.4, 0.3], [0.5, -0.1], [0.1, 0.5]]) g.circle(x * r * (1 + k), y * r * (1 + k), 0.08 * r * (0.5 + k)).stroke({ width: 1.5, color: 0xd9a52b });
    },
    fx(fx, s) {
      if (Math.random() < fx.dt * 8) fx.particles.emit({ shape: 'mote', glow: false, x: s.x + rand(-40, 40), y: s.y + rand(-30, 30), vy: rand(-40, -10), ay: 120, life: 0.6, size: 7, size2: 3, color: 0xffe29a });
    },
  },
  // Daltonomo juggles three balls for an audience of nobody.
  daltonomo: {
    pose: (t) => ({ turn: Math.sin(t * 9) * 0.5, twist: Math.sin(t * 4.5) * 0.1 }),
    over(g, t, r) {
      const colors = [0xff6b8a, 0xffd166, 0x7fe3ff];
      for (let i = 0; i < 3; i++) {
        const k = (t * 1.4 + i / 3) % 1;
        const x = Math.cos(k * Math.PI * 2) * 0.55 * r;
        const y = -2.3 * r - Math.abs(Math.sin(k * Math.PI * 2)) * 0.9 * r;
        g.circle(x, y, 0.13 * r).fill(colors[i]).stroke(INK);
      }
      arc(g, 0, -1.8 * r, 0.62 * r, Math.PI * 1.1, Math.PI * 1.9).stroke({ width: 1.5, color: 0xffffff, alpha: 0.25 });
    },
  },
};
