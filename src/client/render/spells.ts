import type { EntitySnap, GameEvent } from '../../shared/protocol';
import type { ChampionId } from '../../shared/champions/types';
import type { FxLayer } from './fx';
import { iconTexture } from './icons';
import type { Emit } from './particles';
import { arc } from './draw';

// What every spell looks like: the building blocks in fx.ts put together per ability, plus the trails
// behind projectiles and the auras around units with statuses. Purely cosmetic.

type FxEvent = Extract<GameEvent, { e: 'fx' }>;

/** Each champion's magic has its own colors, so you can tell whose spell just went off. */
export const CAST_COLORS: Record<ChampionId, number> = {
  marksman: 0x7fe3ff,
  barbarian: 0xff5a2a,
  willmore: 0xc8945a,
  hunnag: 0x8fd14f,
  logan: 0xffc04d,
  kingrix: 0xffd166,
};

const GOLD = 0xffd166;
const TOXIC = 0x8fd14f;
const VOID = 0xb98be0;
const FIRE = 0xff7a2f;
const ARCANE = 0x7fe3ff;
const DIRT = 0x7a5a36;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** A spray of dirt clods and dust: digging in, bursting out, landing hard. */
function dirtBurst(fx: FxLayer, x: number, y: number, r: number): void {
  const p = fx.particles;
  p.burst(Math.round(8 + r / 20), { shape: 'smoke', glow: false, x, y, life: 0.9, size: r * 0.35, size2: r * 0.8, color: 0xa08560, alpha: 0.55, drag: 0.05 }, [r * 0.6, r * 1.4]);
  p.burst(Math.round(10 + r / 15), { shape: 'shard', glow: false, x, y, life: 0.7, size: 12, size2: 6, color: DIRT, drag: 0.15, spin: 10, ay: 260 }, [r * 1.2, r * 2.6]);
}

/** Flames licking upward from an area. */
function flames(fx: FxLayer, x: number, y: number, r: number, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * r;
    fx.particles.emit({ shape: 'glow', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, vx: rand(-20, 20), vy: rand(-160, -60), drag: 0.5, life: rand(0.4, 0.8), size: rand(18, 30), size2: 4, color: 0xfff1a8, color2: 0xff3b1f, alpha: 0.9 });
  }
}

/** A footstep: a puff of dust on the paths, or leaves kicked up in the brush. */
export function footstep(fx: FxLayer, x: number, y: number, r: number, ground: 'dust' | 'brush' | 'grass'): void {
  const p = fx.particles;
  if (ground === 'brush') {
    for (let i = 0; i < 3; i++) p.emit({ shape: 'leaf', glow: false, x: x + rand(-r, r) * 0.6, y: y + rand(-r, r) * 0.6, vx: rand(-60, 60), vy: rand(-70, -10), ay: 120, drag: 0.3, life: rand(0.5, 0.8), size: 12, size2: 8, color: 0x4f8a2b, color2: 0x2c4a1a, spin: rand(-8, 8) });
    return;
  }
  const color = ground === 'dust' ? 0xb9a27c : 0x7d8a5a;
  p.emit({ shape: 'smoke', glow: false, x: x + rand(-r, r) * 0.3, y: y + r * 0.4, vx: rand(-20, 20), vy: rand(-15, 5), drag: 0.2, life: rand(0.45, 0.7), size: r * 0.5, size2: r * 1.1, color, alpha: ground === 'dust' ? 0.4 : 0.2 });
}

/** The fire in a brazier: a few flames a frame while it's on screen. */
export function brazierFire(fx: FxLayer, x: number, y: number): void {
  for (let i = 0; i < fx.rate(26); i++) {
    fx.particles.emit({ shape: 'glow', x: x + rand(-12, 12), y: y + rand(-8, 8), vx: rand(-10, 10), vy: rand(-110, -50), drag: 0.5, life: rand(0.4, 0.75), size: rand(18, 28), size2: 4, color: 0xfff1a8, color2: 0xff3b1f, alpha: 0.85 });
  }
  if (Math.random() < fx.dt * 4) fx.particles.emit({ shape: 'mote', x, y, vx: rand(-30, 30), vy: rand(-160, -90), drag: 0.6, life: 1.2, size: 5, size2: 2, color: 0xffd9a8, color2: FIRE });
}

/** Toxic bubbles and fumes. */
function fumes(fx: FxLayer, x: number, y: number, r: number, n: number): void {
  const p = fx.particles;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * r;
    p.emit({ shape: 'smoke', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: rand(-15, 15), vy: rand(-40, -10), drag: 0.4, life: rand(0.8, 1.4), size: r * 0.3, size2: r * 0.7, color: 0x6fae2e, color2: 0x3d5a1a, alpha: 0.35, fadeIn: 0.2 });
    if (i % 2) p.emit({ shape: 'ring', x: x + Math.cos(a) * d * 0.8, y: y + Math.sin(a) * d * 0.8, vy: rand(-50, -20), life: rand(0.5, 0.9), size: 8, size2: 18, color: 0xc9f59a, alpha: 0.8 });
  }
}

/** Plays one fx event from the simulation. */
export function playSpell(fx: FxLayer, ev: FxEvent, friendly: boolean): void {
  const p = fx.particles;
  const { x, y } = ev;
  const x2 = ev.x2 ?? x;
  const y2 = ev.y2 ?? y;
  const angle = Math.atan2(y2 - y, x2 - x);
  const dist = Math.hypot(x2 - x, y2 - y);
  switch (ev.fx) {
    // ── Marksman
    case 'aimLine': {
      // Longshot charging: fire pulled into the bow, then loosed.
      const dur = ev.dur ?? 1;
      fx.aimLine(x, y, x2, y2, dur, friendly);
      fx.sigil(x, y, 90, FIRE, dur + 0.3, 3);
      fx.custom(dur, (g, t) => {
        for (let i = 0; i < fx.rate(70); i++) {
          const a = Math.random() * Math.PI * 2;
          const d = rand(70, 120);
          p.emit({ shape: 'spark', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3, life: 0.3, size: 10, size2: 4, stretch: 0.04, color: 0xffd9a8, color2: FIRE });
        }
        g.circle(x, y, 20 + 30 * t).fill({ color: FIRE, alpha: 0.25 + 0.3 * t });
      }, 'mid', true);
      return;
    }
    case 'trapSnap':
      fx.burst(x, y, GOLD, 110);
      fx.flash(x, y, 50, GOLD, 0.25);
      p.burst(14, { shape: 'spark', x, y, life: 0.35, size: 12, size2: 4, stretch: 0.05, color: 0xffffff, color2: GOLD, drag: 0.02 }, [250, 520]);
      p.burst(8, { shape: 'shard', glow: false, x, y, life: 0.5, size: 10, size2: 5, color: 0x9aa1ab, drag: 0.1, spin: 12 }, [120, 260]);
      return;
    case 'roll': {
      // A gust: streaks of wind along the path and a puff where it started.
      fx.custom(0.3, (g, t) => g.moveTo(x, y).lineTo(x2, y2).stroke({ width: 34 * (1 - t), color: 0xe6f6ff, alpha: 0.22 * (1 - t), cap: 'round' }), 'mid', true);
      for (let i = 0; i < 16; i++) {
        const k = Math.random();
        const off = rand(-22, 22);
        p.emit({ shape: 'spark', x: x + (x2 - x) * k - Math.sin(angle) * off, y: y + (y2 - y) * k + Math.cos(angle) * off, vx: Math.cos(angle) * 260, vy: Math.sin(angle) * 260, drag: 0.02, life: rand(0.2, 0.4), size: 10, size2: 3, stretch: 0.12, color: 0xffffff, color2: 0x9bd4ff, alpha: 0.8 });
      }
      p.burst(6, { shape: 'smoke', glow: false, x, y, life: 0.5, size: 22, size2: 50, color: 0xcfc6b4, alpha: 0.45, drag: 0.05 }, [40, 90], angle + Math.PI, 1.6);
      return;
    }

    // ── Barbarian
    case 'cleave': {
      const spread = ((ev.r ?? 90) * Math.PI) / 180;
      fx.slash(x, y, angle, dist, spread, 0xff8a3d, 0.32);
      for (let i = 0; i < 14; i++) {
        const a = angle - spread / 2 + Math.random() * spread;
        p.emit({ shape: 'spark', x: x + Math.cos(a) * dist * 0.9, y: y + Math.sin(a) * dist * 0.9, vx: Math.cos(a) * rand(150, 350), vy: Math.sin(a) * rand(150, 350), drag: 0.03, life: rand(0.2, 0.4), size: 10, size2: 3, stretch: 0.05, color: 0xfff1c1, color2: FIRE });
      }
      return;
    }
    case 'warCry': {
      const r = ev.r ?? 300;
      for (let i = 0; i < 3; i++) fx.later(i * 0.09, () => fx.shockwave(x, y, r * (1 - i * 0.18), i === 1 ? 0xffffff : 0xff5a2a, 0.5));
      fx.flash(x, y, 70, 0xff5a2a, 0.35);
      flames(fx, x, y, 60, 26);
      p.burst(18, { shape: 'spark', x, y, life: 0.5, size: 14, size2: 4, stretch: 0.04, color: 0xffd9a8, color2: 0xff3b1f, drag: 0.05 }, [300, 600]);
      return;
    }
    case 'slam': {
      // Leap landing: the ground splits.
      const r = ev.r ?? 180;
      fx.cracks(x, y, r, FIRE, 1.1, 8);
      fx.shockwave(x, y, r, 0xffc27a, 0.4);
      fx.flash(x, y, r * 0.5, 0xffb070, 0.25);
      dirtBurst(fx, x, y, r);
      return;
    }
    case 'berserk': {
      const r = (ev.r ?? 45) * 1.5;
      fx.sigil(x, y, r * 2.2, 0xff3b30, 0.9, -2);
      fx.shockwave(x, y, r * 3, 0xff3b30, 0.5);
      fx.pillar(x, y, r, 0xff5a2a, 0.8);
      flames(fx, x, y, r, 50);
      const t = iconTexture('😡');
      if (t) fx.ghost(t, x, y - r * 1.5, { size: r * 2, size2: r * 3.5, dy: -60, life: 0.9, alpha: 0.7 });
      return;
    }

    // ── Everyone
    case 'recall':
      for (const [px, py] of [[x, y], [x2, y2]] as const) {
        fx.sigil(px, py, 110, 0x7cc4ff, 0.9, 2);
        fx.pillar(px, py, 50, 0x7cc4ff, 0.9);
        for (let i = 0; i < 20; i++) p.emit({ shape: i % 4 ? 'mote' : 'star', x: px + rand(-60, 60), y: py + rand(-25, 25), vy: rand(-220, -90), drag: 0.5, life: rand(0.6, 1.1), size: 10, size2: 2, color: 0xe6f6ff, color2: 0x3d8bfd, spin: 4 });
      }
      return;

    // ── The Warden
    case 'wardenMark': {
      const r = ev.r ?? 200;
      const dur = ev.dur ?? 1;
      fx.telegraph(x, y, r, dur);
      fx.sigil(x, y, r * 0.95, 0xff3b30, dur, -1.5);
      return;
    }
    case 'wardenSlam': {
      const r = ev.r ?? 200;
      fx.chain(x2, y2, x, y, 0.35);
      fx.cracks(x, y, r * 1.2, ARCANE, 1.4, 10);
      fx.shockwave(x, y, r * 1.2, 0xc9d1dc, 0.45);
      fx.burst(x, y, 0xffffff, r);
      fx.flash(x, y, r * 0.6, ARCANE, 0.3);
      dirtBurst(fx, x, y, r);
      p.burst(16, { shape: 'spark', x, y, life: 0.5, size: 16, size2: 4, stretch: 0.04, color: 0xffffff, color2: ARCANE, drag: 0.05 }, [300, 700]);
      return;
    }

    // ── Willmore
    case 'burrow':
      dirtBurst(fx, x, y, 90);
      fx.shockwave(x, y, 90, 0xa08560, 0.35);
      return;
    case 'surface': {
      const r = ev.r ?? 200;
      fx.cracks(x, y, r, 0xffb070, 1, 9);
      fx.shockwave(x, y, r, 0xc8945a, 0.45);
      dirtBurst(fx, x, y, r);
      return;
    }
    case 'hookPull': {
      const dur = ev.dur ?? 0.3;
      fx.chain(x, y, x2, y2, dur);
      p.burst(10, { shape: 'spark', x: x2, y: y2, life: 0.3, size: 10, size2: 3, stretch: 0.05, color: 0xffe0b0, color2: 0xc8945a, drag: 0.03 }, [150, 350], angle + Math.PI, 1.4);
      p.burst(5, { shape: 'spark', x, y, life: 0.3, size: 10, size2: 3, stretch: 0.05, color: 0xffe0b0, color2: 0xc8945a, drag: 0.03 }, [100, 250]);
      return;
    }
    case 'tunnel': {
      const dur = ev.dur ?? 1.5;
      fx.custom(dur + 0.6, (g, t) => {
        const k = Math.min(1, (t * (dur + 0.6)) / dur);
        const fade = k < 1 ? 1 : 1 - (t * (dur + 0.6) - dur) / 0.6;
        const mx = x + (x2 - x) * k;
        const my = y + (y2 - y) * k;
        g.moveTo(x, y).lineTo(mx, my).stroke({ width: 18, color: 0x5a4127, alpha: 0.4 * fade });
        g.ellipse(mx, my, 36, 26).fill({ color: 0x6b4f2e, alpha: 0.9 * fade }).stroke({ width: 3, color: 0x3d2a18, alpha: fade });
        if (k < 1) for (let i = 0; i < fx.rate(40); i++) p.emit({ shape: 'shard', glow: false, x: mx + rand(-20, 20), y: my + rand(-14, 14), vx: rand(-80, 80), vy: rand(-80, 20), ay: 200, life: 0.4, size: 9, size2: 4, color: DIRT, spin: 8 });
      }, 'under');
      dirtBurst(fx, x, y, 80);
      return;
    }

    // ── HunnaG
    case 'lob': {
      const dur = ev.dur ?? 0.5;
      const height = Math.min(220, dist * 0.35);
      fx.custom(dur, (g, t) => {
        const px = x + (x2 - x) * t;
        const py = y + (y2 - y) * t - Math.sin(t * Math.PI) * height;
        g.circle(x2, y2, 30 + 30 * t).fill({ color: 0x000000, alpha: 0.15 + 0.15 * t });
        g.circle(px, py, 18).fill(0x6fae2e).stroke({ width: 2, color: 0x3d6a14 });
        g.circle(px - 5, py - 5, 6).fill({ color: 0xc9f59a, alpha: 0.8 });
        for (let i = 0; i < fx.rate(50); i++) p.emit({ shape: 'mote', x: px + rand(-10, 10), y: py + rand(-10, 10), vy: rand(20, 80), life: 0.5, size: 9, size2: 3, color: 0xc9f59a, color2: TOXIC });
      });
      fx.later(dur, () => {
        fx.flash(x2, y2, 70, TOXIC, 0.3);
        fx.shockwave(x2, y2, 120, TOXIC, 0.4);
        p.burst(14, { shape: 'mote', glow: false, x: x2, y: y2, life: 0.5, size: 12, size2: 5, color: 0x6fae2e, drag: 0.1, ay: 200 }, [120, 300]);
        fumes(fx, x2, y2, 80, 10);
      });
      return;
    }
    case 'rotBurst': {
      const r = ev.r ?? 80;
      fx.shockwave(x, y, r * 1.4, TOXIC, 0.45);
      fumes(fx, x, y, r, 12);
      fx.flash(x, y, r * 0.6, TOXIC, 0.3, 0.6);
      return;
    }
    case 'pulse': {
      const r = ev.r ?? 400;
      fx.shockwave(x, y, r, VOID, 0.7);
      fx.sigil(x, y, r * 0.35, TOXIC, 0.8, 2);
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        p.emit({ shape: i % 3 ? 'mote' : 'leaf', x, y, vx: Math.cos(a) * r * 1.3, vy: Math.sin(a) * r * 1.3, drag: 0.08, life: 0.8, size: 12, size2: 4, color: 0xd8b4ff, color2: TOXIC, spin: 5 });
      }
      return;
    }
    case 'hop':
      for (const [px, py] of [[x, y], [x2, y2]] as const) {
        dirtBurst(fx, px, py, 70);
        fx.sigil(px, py, 70, TOXIC, 0.6, 3);
      }
      return;
    case 'deepMark': {
      const r = ev.r ?? 350;
      const dur = ev.dur ?? 0.75;
      fx.telegraph(x, y, r, dur, TOXIC);
      fx.sigil(x, y, r, VOID, dur + 0.25, -1.2);
      fx.custom(dur, () => {
        for (let i = 0; i < fx.rate(60); i++) {
          const a = Math.random() * Math.PI * 2;
          const d = r * Math.sqrt(Math.random());
          p.emit({ shape: 'glow', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vy: rand(-90, -40), life: rand(0.5, 0.9), size: 16, size2: 4, color: 0xc9f59a, color2: VOID, alpha: 0.7, fadeIn: 0.3 });
        }
      });
      return;
    }
    case 'deepHands': {
      const r = ev.r ?? 350;
      fx.cracks(x, y, r, VOID, 1.4, 11);
      fx.shockwave(x, y, r, TOXIC, 0.5);
      fx.flash(x, y, r * 0.6, VOID, 0.4, 0.6);
      const spots = Array.from({ length: 12 }, (_, i) => ({ a: i * 2.4, d: r * (0.25 + ((i * 37) % 70) / 100) }));
      fx.custom(0.8, (g, t) => {
        const rise = t < 0.3 ? t / 0.3 : 1;
        for (const s of spots) {
          const hx = x + Math.cos(s.a) * s.d;
          const hy = y + Math.sin(s.a) * s.d;
          g.ellipse(hx, hy - 14 * rise, 12, 20 * rise).fill({ color: 0x6f8f52, alpha: 1 - t * 0.8 }).stroke({ width: 2, color: 0x23301a, alpha: 1 - t });
          for (let f = -1; f <= 1; f++) g.moveTo(hx + f * 6, hy - 20 * rise).lineTo(hx + f * 8, hy - 36 * rise).stroke({ width: 4, color: 0x6f8f52, alpha: 1 - t, cap: 'round' });
        }
      });
      for (const s of spots) {
        const hx = x + Math.cos(s.a) * s.d;
        const hy = y + Math.sin(s.a) * s.d;
        for (let i = 0; i < 4; i++) p.emit({ shape: 'glow', x: hx + rand(-10, 10), y: hy, vy: rand(-200, -100), drag: 0.3, life: rand(0.5, 0.9), size: 22, size2: 4, color: 0xd6ffb0, color2: VOID });
      }
      const t = iconTexture('✋');
      if (t) fx.ghost(t, x, y, { size: r * 0.6, size2: r * 1.2, dy: -r * 0.5, life: 1, alpha: 0.5 });
      return;
    }

    // ── Logan
    case 'pounce': {
      fx.custom(0.4, (g, t) => g.moveTo(x, y).lineTo(x2, y2).stroke({ width: 26 * (1 - t), color: GOLD, alpha: 0.35 * (1 - t), cap: 'round' }), 'mid', true);
      for (let i = 0; i < 18; i++) {
        const k = Math.random();
        p.emit({ shape: i % 3 ? 'mote' : 'star', x: x + (x2 - x) * k + rand(-14, 14), y: y + (y2 - y) * k + rand(-14, 14), vy: rand(-60, -20), life: rand(0.4, 0.8), size: 10, size2: 2, color: 0xfff1b8, color2: 0xff9f43, spin: 4 });
      }
      const t = iconTexture('🐾');
      if (t) fx.ghost(t, x2, y2, { size: 50, size2: 90, life: 0.5, alpha: 0.7 });
      dirtBurst(fx, x2, y2, 50);
      return;
    }
    case 'maul': {
      // Three claw rakes across the swing.
      const spread = ((ev.r ?? 70) * Math.PI) / 180;
      for (let i = 0; i < 3; i++) {
        fx.later(i * 0.05, () => {
          const off = (i - 1) * 16;
          const ox = x - Math.sin(angle) * off;
          const oy = y + Math.cos(angle) * off;
          fx.slash(ox, oy, angle, dist * (0.85 + i * 0.07), spread * 0.8, 0xff3b3b, 0.3);
        });
      }
      p.burst(12, { shape: 'mote', glow: false, x: x + Math.cos(angle) * dist * 0.8, y: y + Math.sin(angle) * dist * 0.8, life: 0.5, size: 8, size2: 4, color: 0xb3202a, drag: 0.1, ay: 300 }, [100, 260], angle, 1.6);
      return;
    }
    case 'lionheart': {
      // A golden lion spirit runs to the ally in trouble.
      fx.custom(0.6, (g, t) => {
        const k = Math.min(1, t * 2);
        g.moveTo(x, y).lineTo(x + (x2 - x) * k, y + (y2 - y) * k).stroke({ width: 10 * (1 - t) + 2, color: GOLD, alpha: 1 - t, cap: 'round' });
      }, 'mid', true);
      fx.shockwave(x, y, 90, GOLD, 0.5);
      const t = iconTexture('🦁');
      if (t) fx.ghost(t, x, y, { size: 70, size2: 110, dx: x2 - x, dy: y2 - y, life: 0.6, alpha: 0.8 });
      const h = iconTexture('❤️');
      if (h) fx.later(0.3, () => fx.ghost(h, x2, y2 - 40, { size: 40, size2: 80, dy: -40, life: 0.8, alpha: 0.8 }));
      fx.later(0.3, () => fx.flash(x2, y2, 60, GOLD, 0.4));
      return;
    }
    case 'mane': {
      // A golden barrier: shards orbit in and lock together.
      const r = (ev.r ?? 60) * 1.2;
      fx.custom(0.7, (g, t) => {
        const a = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
        const sides = 6;
        const pts: number[] = [];
        for (let i = 0; i < sides; i++) pts.push(x + Math.cos((i / sides) * Math.PI * 2 + t * 2) * r, y + Math.sin((i / sides) * Math.PI * 2 + t * 2) * r);
        g.poly(pts).fill({ color: GOLD, alpha: 0.15 * a }).stroke({ width: 4, color: 0xfff1b8, alpha: 0.9 * a });
      }, 'mid', true);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        p.emit({ shape: 'shard', x: x + Math.cos(a) * r * 2.2, y: y + Math.sin(a) * r * 2.2, vx: -Math.cos(a) * r * 4, vy: -Math.sin(a) * r * 4, drag: 0.02, life: 0.3, size: 14, size2: 8, color: 0xfff1b8, color2: GOLD, rotation: a });
      }
      fx.later(0.25, () => fx.burst(x, y, GOLD, r * 1.6));
      return;
    }
    case 'roar': {
      const spread = ev.r ?? 100;
      const rad = (spread * Math.PI) / 180;
      for (let i = 0; i < 4; i++) {
        fx.later(i * 0.07, () => {
          fx.custom(0.45, (g, t) => {
            const rr = dist * (0.25 + 0.85 * t);
            arc(g, x, y, rr, angle - rad / 2, angle + rad / 2).stroke({ width: 10 * (1 - t) + 2, color: i % 2 ? 0xffffff : 0xff9f43, alpha: 0.9 * (1 - t), cap: 'round' });
          }, 'mid', true);
        });
      }
      for (let i = 0; i < 24; i++) {
        const a = angle + (Math.random() - 0.5) * rad;
        p.emit({ shape: 'spark', x, y, vx: Math.cos(a) * rand(300, 700), vy: Math.sin(a) * rand(300, 700), drag: 0.05, life: rand(0.3, 0.5), size: 12, size2: 3, stretch: 0.04, color: 0xfff1c1, color2: 0xff9f43 });
      }
      const t = iconTexture('🦁');
      if (t) fx.ghost(t, x + Math.cos(angle) * 40, y + Math.sin(angle) * 40, { size: 90, size2: 220, dx: Math.cos(angle) * dist * 0.6, dy: Math.sin(angle) * dist * 0.6, life: 0.7, alpha: 0.75 });
      return;
    }

    // ── King Rix
    case 'summon': {
      const r = ev.r ?? 110;
      fx.sigil(x, y, r * 1.3, GOLD, 1.1, 1.5);
      fx.pillar(x, y, r * 0.5, GOLD, 1);
      fx.later(0.15, () => fx.shockwave(x, y, r * 1.5, GOLD, 0.5));
      for (let i = 0; i < 24; i++) p.emit({ shape: i % 3 ? 'mote' : 'star', x: x + rand(-r, r) * 0.8, y: y + rand(-r, r) * 0.4, vy: rand(-260, -80), drag: 0.5, life: rand(0.6, 1.1), size: 12, size2: 2, color: 0xfff1b8, color2: GOLD, spin: 4 });
      const t = iconTexture('💂');
      if (t) fx.ghost(t, x, y - r, { size: 60, size2: 110, dy: -50, life: 0.9, alpha: 0.7 });
      return;
    }
    case 'kneel': {
      // A great crown comes down on everyone in front of him.
      const spread = ev.r ?? 70;
      fx.wedge(x, y, x2, y2, spread, GOLD, 0.45);
      const mx = x + Math.cos(angle) * dist * 0.6;
      const my = y + Math.sin(angle) * dist * 0.6;
      const t = iconTexture('🙇');
      if (t) fx.ghost(t, mx, my - 120, { size: 220, size2: 140, dy: 120, life: 0.45, alpha: 0.85 });
      fx.later(0.3, () => {
        fx.shockwave(mx, my, dist * 0.5, GOLD, 0.45);
        fx.cracks(mx, my, dist * 0.45, GOLD, 0.9, 6);
        p.burst(18, { shape: 'star', x: mx, y: my, life: 0.6, size: 16, size2: 3, color: 0xfff1b8, color2: GOLD, drag: 0.05, spin: 6 }, [150, 400]);
      });
      return;
    }
    case 'decree': {
      // The royal seal stamped on the target.
      const r = ev.r ?? 90;
      fx.sigil(x, y, r * 1.2, 0xb38cff, 1, 2);
      fx.burst(x, y, GOLD, r * 1.4);
      fx.flash(x, y, r * 0.6, GOLD, 0.4);
      const t = iconTexture('📜');
      if (t) fx.ghost(t, x, y - r * 1.2, { size: 120, size2: 60, dy: r * 0.9, life: 0.45, alpha: 0.85 });
      fx.later(0.4, () => p.burst(16, { shape: 'star', x, y, life: 0.6, size: 14, size2: 2, color: 0xffffff, color2: GOLD, drag: 0.05, spin: 6 }, [120, 300]));
      return;
    }    default: {
      // Every effect the simulation can send needs a look here.
      const unhandled: never = ev.fx;
      void unhandled;
    }
  }
}

/**
 * A structure coming down: dust, rubble and a shockwave. Da Base goes out with a string of blasts, a
 * pillar of light and a ring that sweeps the screen: the end of the match.
 */
export function structureCollapse(fx: FxLayer, x: number, y: number, r: number, finale: boolean): void {
  const p = fx.particles;
  fx.shockwave(x, y, r * 3, 0xffc27a, 0.6);
  fx.cracks(x, y, r * 2, FIRE, 1.6, 9);
  fx.flash(x, y, r, 0xffb070, 0.4);
  p.burst(16, { shape: 'smoke', glow: false, x, y, life: 1.6, size: r * 0.7, size2: r * 1.8, color: 0x9a8f80, alpha: 0.6, drag: 0.15 }, [r * 0.8, r * 2]);
  p.burst(26, { shape: 'shard', glow: false, x, y, life: 1, size: 16, size2: 8, color: 0x6b6f78, drag: 0.2, spin: 10, ay: 220 }, [r * 1.5, r * 4]);
  p.burst(20, { shape: 'spark', x, y, life: 0.6, size: 18, size2: 4, stretch: 0.05, color: 0xfff1c1, color2: FIRE, drag: 0.05 }, [300, 800]);
  if (!finale) return;
  for (let i = 0; i < 6; i++) {
    fx.later(0.25 + i * 0.22, () => {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r * 0.9;
      const bx = x + Math.cos(a) * d;
      const by = y + Math.sin(a) * d;
      fx.flash(bx, by, r * 0.6, 0xffd9a8, 0.35);
      fx.shockwave(bx, by, r * 1.4, FIRE, 0.45);
      flames(fx, bx, by, r * 0.4, 20);
    });
  }
  fx.later(1.6, () => {
    fx.pillar(x, y, r * 0.9, 0xffffff, 2);
    fx.shockwave(x, y, r * 12, 0xffffff, 1.4);
    fx.flash(x, y, r * 2, 0xffffff, 0.8, 1);
    p.burst(60, { shape: 'spark', x, y, life: 1.2, size: 24, size2: 6, stretch: 0.04, color: 0xffffff, color2: GOLD, drag: 0.1 }, [400, 1400]);
  });
}

/** A small rune circle in the champion's colors under anyone casting an ability. */
export function castFlash(fx: FxLayer, caster: EntitySnap): void {
  if (!caster.champ) return;
  const color = CAST_COLORS[caster.champ];
  fx.sigil(caster.x, caster.y, caster.r * 1.9, color, 0.55, 3);
  fx.particles.burst(8, { shape: 'mote', x: caster.x, y: caster.y, life: 0.4, size: 8, size2: 2, color: 0xffffff, color2: color, drag: 0.1 }, [80, 180]);
}

/** The glow around each kind of projectile's head: [color, size]. */
const HEADS: Record<string, [number, number]> = {
  bolt: [ARCANE, 90],
  longshot: [FIRE, 260],
  arrowHeavy: [GOLD, 60],
  scepter: [GOLD, 60],
  levy: [GOLD, 60],
  spore: [TOXIC, 55],
  junk_sludge: [TOXIC, 45],
};

/** A glow on the projectile's head, and sparkles and smoke streaming out behind it, by what it is. */
export function projectileTrail(fx: FxLayer, s: EntitySnap, friendly: boolean): void {
  const p = fx.particles;
  const back = s.f + Math.PI;
  const bx = Math.cos(back);
  const by = Math.sin(back);
  const spray = (n: number, e: Omit<Emit, 'x' | 'y'>, jitter = 6, speed = 60) => {
    for (let i = 0; i < n; i++) {
      p.emit({ ...e, x: s.x + rand(-jitter, jitter), y: s.y + rand(-jitter, jitter), vx: (e.vx ?? 0) + bx * speed + rand(-25, 25), vy: (e.vy ?? 0) + by * speed + rand(-25, 25) });
    }
  };
  const head = s.vis === 'shootie' ? ([friendly ? 0x3d8bfd : 0xe5484d, 80] as [number, number]) : HEADS[s.vis ?? ''];
  // Lives about a frame, so there's always one glowing on the projectile as it moves.
  if (head) p.emit({ shape: 'glow', x: s.x, y: s.y, life: 0.05, size: head[1], color: head[0], alpha: 0.75, fadeIn: 0.01 });
  switch (s.vis) {
    case 'bolt':
      spray(fx.rate(160), { shape: 'spark', life: 0.3, size: 18, size2: 4, stretch: 0.06, color: 0xffffff, color2: ARCANE }, 12, 140);
      spray(fx.rate(50), { shape: 'star', life: 0.5, size: 20, size2: 3, color: 0xe8fbff, color2: ARCANE, spin: 8 }, 16, 30);
      if (Math.random() < fx.dt * 10) fx.lightning(s.x, s.y, s.x + bx * 90 + rand(-25, 25), s.y + by * 90 + rand(-25, 25), ARCANE, 0.08, 2);
      return;
    case 'longshot':
      spray(fx.rate(200), { shape: 'glow', life: 0.5, size: 48, size2: 8, color: 0xfff1a8, color2: 0xff3b1f, drag: 0.3 }, s.r * 0.5, 90);
      spray(fx.rate(50), { shape: 'smoke', glow: false, life: 1, size: 40, size2: 90, color: 0x5a4a3a, alpha: 0.35, drag: 0.3 }, s.r * 0.4, 40);
      spray(fx.rate(80), { shape: 'spark', life: 0.45, size: 18, size2: 4, stretch: 0.05, color: 0xffe0a0, color2: FIRE }, s.r * 0.6, 220);
      return;
    case 'arrowHeavy':
      spray(fx.rate(80), { shape: 'star', life: 0.45, size: 20, size2: 3, color: 0xfff1b8, color2: GOLD, spin: 6 }, 8, 40);
      return;
    case 'arrow':
      spray(fx.rate(40), { shape: 'mote', life: 0.3, size: 8, size2: 2, color: 0xfff6dc, alpha: 0.8 }, 3, 20);
      return;
    case 'scepter':
      spray(fx.rate(90), { shape: 'mote', life: 0.45, size: 14, size2: 3, color: 0xfff1b8, color2: GOLD }, 6, 30);
      spray(fx.rate(20), { shape: 'star', life: 0.55, size: 22, size2: 3, color: 0xffffff, color2: GOLD, spin: 6 }, 10, 10);
      return;
    case 'levy':
      spray(fx.rate(55), { shape: 'star', life: 0.5, size: 22, size2: 3, color: 0xffffff, color2: GOLD, spin: 6 }, 12, 30);
      return;
    case 'spore':
      spray(fx.rate(60), { shape: 'mote', life: 0.55, size: 12, size2: 3, color: 0xc9f59a, color2: TOXIC }, 8, 30);
      spray(fx.rate(10), { shape: 'leaf', life: 0.8, size: 18, size2: 8, color: TOXIC, spin: 5 }, 8, 20);
      return;
    case 'junk_sludge':
      spray(fx.rate(45), { shape: 'mote', glow: false, life: 0.55, size: 13, size2: 5, color: 0x6fae2e, ay: 200 }, 10, 30);
      return;
    case 'junk_can':
    case 'junk_boot':
    case 'pebble':
    case 'boulder':
      spray(fx.rate(16), { shape: 'smoke', glow: false, life: 0.55, size: 18, size2: 36, color: 0xb9a68a, alpha: 0.4 }, 5, 20);
      return;
    case 'hook':
      spray(fx.rate(35), { shape: 'spark', life: 0.25, size: 12, size2: 3, stretch: 0.05, color: 0xffe0b0, color2: 0xc8945a }, 5, 100);
      return;
    case 'shootie':
      spray(fx.rate(90), { shape: 'glow', life: 0.4, size: 26, size2: 5, color: 0xffffff, color2: head![0] }, 10, 50);
      return;
  }
}

/** The glowing monsters give off their own: embers off the Ember Toad, spores off the Glowcap, cold light from the Warden's visor. */
export function monsterAura(fx: FxLayer, s: EntitySnap): void {
  const p = fx.particles;
  const r = s.r;
  switch (s.mon) {
    case 'emberToad':
      for (let i = 0; i < fx.rate(16); i++) p.emit({ shape: 'glow', x: s.x + rand(-r, r) * 0.7, y: s.y + rand(-r, r) * 0.6, vy: rand(-70, -30), drag: 0.6, life: rand(0.6, 1.1), size: 12, size2: 3, color: 0xffd9a8, color2: 0xff5a1f, alpha: 0.8 });
      return;
    case 'glowcap':
      for (let i = 0; i < fx.rate(12); i++) {
        const a = Math.random() * Math.PI * 2;
        p.emit({ shape: 'mote', x: s.x + Math.cos(a) * r * 0.8, y: s.y + Math.sin(a) * r * 0.8, vx: Math.cos(a) * 20, vy: rand(-30, -10), life: rand(1, 1.8), size: 7, size2: 2, color: 0xdff7ff, color2: 0x6fd6ff, fadeIn: 0.3 });
      }
      return;
    case 'warden': {
      const fx2 = s.x + Math.cos(s.f) * r * 0.4;
      const fy = s.y + Math.sin(s.f) * r * 0.4;
      for (let i = 0; i < fx.rate(18); i++) p.emit({ shape: 'glow', x: fx2 + rand(-8, 8), y: fy + rand(-8, 8), vx: rand(-15, 15), vy: rand(-50, -20), drag: 0.5, life: 0.9, size: 18, size2: 4, color: 0xe6fbff, color2: ARCANE, alpha: 0.6, fadeIn: 0.2 });
      if (Math.random() < fx.dt * 2) {
        const a = Math.random() * Math.PI * 2;
        p.emit({ shape: 'star', x: s.x + Math.cos(a) * r * 0.86, y: s.y + Math.sin(a) * r * 0.86, life: 0.4, size: 16, size2: 2, color: 0xffffff, color2: ARCANE, spin: 5 });
      }
      return;
    }
  }
}

/** Particles that hang around a unit while it has a status: flames for berserk, bubbles for rot, and so on. */
export function statusAura(fx: FxLayer, s: EntitySnap, time: number): void {
  const st = s.st;
  const shielded = (s.sh ?? 0) > 0;
  if ((!st?.length && !shielded) || s.dead) return;
  const p = fx.particles;
  const r = s.r;
  const around = (spread = 1) => {
    const a = Math.random() * Math.PI * 2;
    const d = r * spread * Math.sqrt(Math.random());
    return { x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d };
  };
  for (const k of st ?? []) {
    switch (k) {
      case 'berserk':
        for (let i = 0; i < fx.rate(70); i++) p.emit({ shape: 'glow', ...around(0.9), vx: rand(-15, 15), vy: rand(-140, -60), drag: 0.5, life: rand(0.35, 0.65), size: rand(26, 40), size2: 4, color: 0xfff1a8, color2: 0xff2a1a, alpha: 0.85 });
        break;
      case 'ember':
        for (let i = 0; i < fx.rate(10); i++) p.emit({ shape: 'mote', ...around(), vy: rand(-80, -30), life: 0.7, size: 6, size2: 2, color: 0xffd9a8, color2: FIRE });
        break;
      case 'glowcap':
        for (let i = 0; i < fx.rate(10); i++) p.emit({ shape: 'mote', ...around(1.2), vy: rand(-40, -15), life: 1, size: 7, size2: 2, color: 0xd6f6ff, color2: 0x6fd6ff, fadeIn: 0.3 });
        break;
      case 'unchained':
        for (let i = 0; i < fx.rate(25); i++) p.emit({ shape: 'glow', ...around(1.1), vy: rand(-90, -40), drag: 0.6, life: 0.8, size: 16, size2: 3, color: 0xe6fbff, color2: ARCANE, alpha: 0.6, fadeIn: 0.3 });
        break;
      case 'rot':
        for (let i = 0; i < fx.rate(10); i++) p.emit({ shape: 'ring', ...around(0.8), vy: rand(-50, -20), life: rand(0.5, 0.9), size: 6, size2: 14, color: 0xc9f59a, alpha: 0.8 });
        break;
      case 'decreed':
        for (let i = 0; i < fx.rate(12); i++) p.emit({ shape: 'star', x: s.x + rand(-r, r), y: s.y - r * 1.6, vy: rand(30, 70), life: 0.8, size: 12, size2: 3, color: 0xfff1b8, color2: GOLD, spin: 4 });
        break;
      case 'royal':
        for (let i = 0; i < fx.rate(3); i++) p.emit({ shape: 'star', ...around(), vy: -30, life: 0.6, size: 10, size2: 2, color: 0xfff1b8, color2: GOLD, spin: 4 });
        break;
      case 'bleed':
        for (let i = 0; i < fx.rate(10); i++) p.emit({ shape: 'mote', glow: false, ...around(0.8), vy: rand(10, 40), ay: 250, life: 0.5, size: 7, size2: 4, color: 0xb3202a });
        break;
      case 'fear':
        for (let i = 0; i < fx.rate(18); i++) p.emit({ shape: 'smoke', ...around(1), vy: rand(-60, -30), life: 0.8, size: 14, size2: 30, color: 0x9b59d0, color2: 0x3a1a5a, alpha: 0.5, fadeIn: 0.3 });
        break;
      case 'speed':
        for (let i = 0; i < fx.rate(20); i++) {
          const b = s.f + Math.PI;
          p.emit({ shape: 'spark', ...around(0.9), vx: Math.cos(b) * 160, vy: Math.sin(b) * 160, drag: 0.05, life: 0.25, size: 8, size2: 3, stretch: 0.08, color: 0xffffff, color2: 0xfff3b0, alpha: 0.7 });
        }
        break;
      case 'stun':
        // Stars circling over the head.
        for (let i = 0; i < 3; i++) {
          if (Math.random() > fx.dt * 30) continue;
          const a = time * 6 + (i / 3) * Math.PI * 2;
          p.emit({ shape: 'star', x: s.x + Math.cos(a) * r * 0.9, y: s.y - r * 1.3 + Math.sin(a) * r * 0.35, life: 0.25, size: 14, size2: 6, color: 0xfff1b8, color2: GOLD });
        }
        break;
      case 'root':
        for (let i = 0; i < fx.rate(8); i++) p.emit({ shape: 'leaf', glow: false, ...around(1.2), life: 0.8, size: 12, size2: 8, color: 0x6fae2e, color2: 0x3d6a14, spin: 3, fadeIn: 0.3 });
        break;
      case 'slow':
        for (let i = 0; i < fx.rate(10); i++) p.emit({ shape: 'mote', ...around(1), vy: rand(10, 30), life: 0.7, size: 6, size2: 2, color: 0xe6f6ff, color2: 0x9bd4ff });
        break;
      case 'weaken':
        for (let i = 0; i < fx.rate(6); i++) p.emit({ shape: 'mote', ...around(0.8), vy: rand(20, 50), life: 0.6, size: 7, size2: 3, color: 0xd8b4ff, color2: 0x7a4ac0 });
        break;
      case 'recall':
        for (let i = 0; i < fx.rate(45); i++) {
          const a = Math.random() * Math.PI * 2;
          p.emit({ shape: i % 5 ? 'mote' : 'star', x: s.x + Math.cos(a) * r * 1.6, y: s.y + Math.sin(a) * r * 0.7, vy: rand(-160, -70), drag: 0.6, life: 0.8, size: 9, size2: 2, color: 0xe6f6ff, color2: 0x3d8bfd, spin: 4 });
        }
        break;
    }
  }
  if (shielded) {
    for (let i = 0; i < fx.rate(14); i++) {
      const a = Math.random() * Math.PI * 2;
      p.emit({ shape: 'star', x: s.x + Math.cos(a) * (r + 10), y: s.y + Math.sin(a) * (r + 10), life: 0.4, size: 10, size2: 2, color: 0xffffff, color2: GOLD, spin: 5 });
    }
  }
}
