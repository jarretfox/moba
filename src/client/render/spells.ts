import type { EntitySnap, GameEvent } from '../../shared/protocol';
import { fxArt } from './art';
import type { FxLayer } from './fx';
import { iconTexture } from './icons';
import type { Emit } from './particles';
import { RECALLS } from './recalls';
import { PALETTE } from './views';
import { arc } from './draw';
import { inkOf } from './organic';
import { drawCrown, drawDiamond, drawMushroom, drawPaw } from './signatures';
import { chestHeight, standHeight } from './stature';

// What every spell looks like: the building blocks in fx.ts put together per ability, plus the trails
// behind projectiles and the auras around units with statuses. Purely cosmetic.

type FxEvent = Extract<GameEvent, { e: 'fx' }>;

// Each champion's cast colors live with their cast signatures (signatures.ts); still exported from here.
export { CAST_COLORS } from './signatures';

const GOLD = 0xffd166;
const TOXIC = 0x8fd14f;
const VOID = 0xb98be0;
const FIRE = 0xff7a2f;
const ARCANE = 0x7fe3ff;
const DIRT = 0x7a5a36;
/** Jordini's red: the color of a rejection stamp. */
const DENY = 0xd93636;

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
  // A painted version of the effect, if there is one: over the drawn one, or instead of it (art.ts).
  const book = fxArt(ev.fx);
  if (book) {
    fx.flipbook(ev.x, ev.y, book, book.spec.absolute ? book.spec.size : book.spec.size * (ev.r ?? 100));
    if (book.spec.replace) return;
  }
  const p = fx.particles;
  const { x, y } = ev;
  const x2 = ev.x2 ?? x;
  const y2 = ev.y2 ?? y;
  const angle = Math.atan2(y2 - y, x2 - x);
  const dist = Math.hypot(x2 - x, y2 - y);
  switch (ev.fx) {
    // ── Marksman
    case 'aimLine': {
      // Final Notice: the big red NO grows under him as he draws, the air pulled into the bow, then loosed.
      const dur = ev.dur ?? 1;
      fx.aimLine(x, y, x2, y2, dur, friendly);
      rune(fx, x, y, 90, DENY, dur + 0.3, 2);
      p.emit({ shape: 'flare', x, y: y - 40, life: dur, size: 40, size2: 110, color: 0xfff1b8, alpha: 0.8, fadeIn: 0.7 });
      const R = 90;
      fx.custom(dur + 0.3, (g, t) => {
        const k = Math.min(1, (t * (dur + 0.3)) / dur);
        const a = t > 0.85 ? (1 - t) / 0.15 : 1;
        const rr = R * (0.4 + 0.6 * k);
        g.circle(x, y, rr).stroke({ width: rr * 0.16, color: inkOf(DENY), alpha: 0.9 * a });
        g.circle(x, y, rr).stroke({ width: rr * 0.1, color: DENY, alpha: a });
        g.moveTo(x - rr * 0.66, y - rr * 0.66).lineTo(x + rr * 0.66, y + rr * 0.66).stroke({ width: rr * 0.16, color: inkOf(DENY), alpha: 0.9 * a, cap: 'round' });
        g.moveTo(x - rr * 0.66, y - rr * 0.66).lineTo(x + rr * 0.66, y + rr * 0.66).stroke({ width: rr * 0.1, color: DENY, alpha: a, cap: 'round' });
        g.circle(x, y, rr * 0.8).stroke({ width: 1.5, color: ARCANE, alpha: 0.5 * a });
      }, 'under');
      fx.custom(dur, (g, t) => {
        for (let i = 0; i < fx.rate(70); i++) {
          const a = Math.random() * Math.PI * 2;
          const d = rand(70, 120);
          p.emit({ shape: 'spark', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: -Math.cos(a) * d * 3, vy: -Math.sin(a) * d * 3, life: 0.3, size: 10, size2: 4, stretch: 0.04, color: 0xffffff, color2: i % 3 ? ARCANE : DENY });
        }
        g.circle(x, y, 20 + 30 * t).fill({ color: ARCANE, alpha: 0.2 + 0.3 * t });
      }, 'mid', true);
      return;
    }
    case 'trapSnap':
      // Red Tape: the trap springs shut in a snap of red ribbon, a cross of tape left on the ground.
      fx.burst(x, y, DENY, 110);
      fx.flash(x, y, 50, DENY, 0.25);
      fx.stamp(x, y, 1.2, (g) => {
        for (const s of [-1, 1]) {
          g.poly([-40, -40 * s - 7, 40, 40 * s - 7, 40, 40 * s + 7, -40, -40 * s + 7]).fill(DENY).stroke({ width: 2, color: inkOf(DENY), join: 'round' });
        }
      }, { layer: 'under', from: 1.6, alpha: 0.85 });
      p.burst(12, { shape: 'spark', x, y, life: 0.4, size: 14, size2: 4, stretch: 0.08, color: 0xffffff, color2: DENY, drag: 0.02 }, [220, 480]);
      p.burst(10, { shape: 'shard', glow: false, x, y, life: 0.7, size: 12, size2: 8, color: DENY, drag: 0.15, spin: 16, ay: 200 }, [120, 300]);
      impact(fx, x, y - 10, 70, DENY);
      p.emit({ shape: 'circle', x, y, life: 0.4, size: 40, size2: 170, color: 0xffffff, color2: DENY, alpha: 0.8 });
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
      clouds(fx, x, y, 60, 5, 0xe8dcc4, { alpha: 0.55, rise: 10, life: 0.7 });
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
      swoosh(fx, x + Math.cos(angle) * dist * 0.45, y + Math.sin(angle) * dist * 0.45, angle, dist * 1.1, 0xfff1c1, 0xff8a3d);
      return;
    }
    case 'warCry': {
      // WAKE UP!: three ragged rings of a bellow, and exclamation marks popping up all round.
      const r = ev.r ?? 300;
      for (let i = 0; i < 3; i++) fx.later(i * 0.09, () => fx.shockwave(x, y, r * (1 - i * 0.18), i === 1 ? 0xffffff : 0xff5a2a, 0.5));
      fx.flash(x, y, 70, 0xff5a2a, 0.35);
      fx.motifRing(x, y, r * 0.55, 7, 0.7, (g, i) => {
        const s = 14 + (i % 2) * 4;
        g.roundRect(-s * 0.18, -s * 1.6, s * 0.36, s * 1.1, s * 0.1).fill(0xfff1c1).stroke({ width: 2.5, color: 0x5a1a10, join: 'round' });
        g.circle(0, -s * 0.2, s * 0.22).fill(0xfff1c1).stroke({ width: 2.5, color: 0x5a1a10 });
      }, { squash: 0.5, stagger: 0.35 });
      fx.speedLines(x, y - 30, r * 0.5, 0xff5a2a, 10, 0.3);
      p.burst(14, { shape: 'spark', x, y, life: 0.5, size: 14, size2: 4, stretch: 0.04, color: 0xffd9a8, color2: 0xff3b1f, drag: 0.05 }, [300, 600]);
      p.emit({ shape: 'circle', x, y, life: 0.5, size: 60, size2: r * 1.8, color: 0xffd9a8, color2: 0xff3b1f, alpha: 0.9 });
      impact(fx, x, y - 40, 90, 0xff7a3a);
      return;
    }
    case 'slam': {
      // Leap landing: the ground splits.
      const r = ev.r ?? 180;
      fx.cracks(x, y, r, FIRE, 1.1, 8);
      fx.scar(x, y, r, 'crack', FIRE);
      fx.scar(x, y, r * 0.7, 'scorch');
      fx.shockwave(x, y, r, 0xffc27a, 0.4);
      fx.flash(x, y, r * 0.5, 0xffb070, 0.25);
      dirtBurst(fx, x, y, r);
      clouds(fx, x, y, r * 0.8, 10, 0xd8c4a0, { alpha: 0.65, rise: 20 });
      p.burst(8, { shape: 'dirt', glow: false, x, y, life: 0.7, size: 30, size2: 50, color: 0x8a6a44, drag: 0.1, ay: 300 }, [150, 350], -Math.PI / 2, 2.5);
      return;
    }
    case 'berserk': {
      // IT'S ALL CONNECTED: the conspiracy board, red string strung between pins all round him.
      const r = (ev.r ?? 45) * 1.5;
      const pins = Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + rand(-0.2, 0.2);
        const d = r * rand(1.6, 3.2);
        return { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7 };
      });
      const strings: [number, number][] = [];
      for (let i = 0; i < pins.length; i++) {
        strings.push([i, (i + 1) % pins.length]);
        if (i % 2 === 0) strings.push([i, (i + 4) % pins.length]);
      }
      fx.custom(1.1, (g, t) => {
        const drawn = Math.min(1, t / 0.35) * strings.length;
        const a = t > 0.7 ? (1 - t) / 0.3 : 1;
        strings.forEach(([i, j], k) => {
          const part = Math.max(0, Math.min(1, drawn - k));
          if (part <= 0) return;
          const p0 = pins[i];
          const p1 = pins[j];
          g.moveTo(p0.x, p0.y).lineTo(p0.x + (p1.x - p0.x) * part, p0.y + (p1.y - p0.y) * part).stroke({ width: 2.5, color: 0xe5262b, alpha: 0.9 * a });
        });
        for (const pin of pins) {
          g.circle(pin.x, pin.y, 5).fill({ color: 0xe5262b, alpha: a }).stroke({ width: 1.5, color: 0x3a0a0a, alpha: a });
          g.circle(pin.x - 1.5, pin.y - 1.5, 1.8).fill({ color: 0xffffff, alpha: 0.8 * a });
        }
      }, 'under');
      fx.shockwave(x, y, r * 3, 0xff3b30, 0.5);
      fx.pillar(x, y, r, 0xff5a2a, 0.8);
      fx.scar(x, y, r * 1.6, 'scorch');
      flames(fx, x, y, r, 30);
      flamesUp(fx, x, y, r, 12);
      p.emit({ shape: 'flash', glow: false, x, y: y - 30, life: 0.3, size: r * 1.5, size2: r * 2.6, color: 0xff8a6a, fadeIn: 0.02 });
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
      fx.scar(x, y, r * 1.2, 'crack', ARCANE, 22);
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
      clouds(fx, x, y, 80, 6, 0xb8a080, { alpha: 0.6 });
      p.burst(5, { shape: 'dirt', glow: false, x, y, life: 0.6, size: 24, size2: 40, color: 0x6a5030, ay: 300 }, [100, 260], -Math.PI / 2, 2);
      return;
    case 'surface': {
      const r = ev.r ?? 200;
      fx.cracks(x, y, r, 0xffb070, 1, 9);
      fx.scar(x, y, r * 0.9, 'crack');
      fx.shockwave(x, y, r, 0xc8945a, 0.45);
      dirtBurst(fx, x, y, r);
      clouds(fx, x, y, r * 0.8, 9, 0xb8a080, { alpha: 0.6, rise: 30 });
      p.burst(9, { shape: 'dirt', glow: false, x, y, life: 0.8, size: 30, size2: 50, color: 0x6a5030, ay: 320 }, [160, 380], -Math.PI / 2, 2.4);
      return;
    }
    case 'hookPull': {
      const dur = ev.dur ?? 0.3;
      fx.chain(x, y, x2, y2, dur);
      p.burst(10, { shape: 'spark', x: x2, y: y2, life: 0.3, size: 10, size2: 3, stretch: 0.05, color: 0xffe0b0, color2: 0xc8945a, drag: 0.03 }, [150, 350], angle + Math.PI, 1.4);
      p.burst(5, { shape: 'spark', x, y, life: 0.3, size: 10, size2: 3, stretch: 0.05, color: 0xffe0b0, color2: 0xc8945a, drag: 0.03 }, [100, 250]);
      impact(fx, x2, y2, 50, 0xffe0b0);
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
        clouds(fx, x2, y2, 90, 7, 0xa8d86a, { alpha: 0.5, rise: 25 });
        fx.scar(x2, y2, 90, 'goo');
      });
      return;
    }
    case 'rotBurst': {
      const r = ev.r ?? 80;
      fx.shockwave(x, y, r * 1.4, TOXIC, 0.45);
      fx.scar(x, y, r * 1.1, 'goo', 0x4f7a2a, 10);
      fumes(fx, x, y, r, 12);
      fx.flash(x, y, r * 0.6, TOXIC, 0.3, 0.6);
      clouds(fx, x, y, r, 6, 0x9fd06a, { alpha: 0.5 });
      rune(fx, x, y, r * 0.7, TOXIC, 0.6);
      return;
    }
    case 'pulse': {
      // The totem's pulse: a wave of rot, and a fairy ring of mushrooms springing up round it.
      const r = ev.r ?? 400;
      fx.shockwave(x, y, r, VOID, 0.7);
      fx.motifRing(x, y, r * 0.3, 8, 0.9, (g, i) => drawMushroom(g, 12 + (i % 3) * 3, i, TOXIC), { layer: 'under', squash: 0.5 });
      p.emit({ shape: 'circle', x, y, life: 0.7, size: 40, size2: r * 2, color: 0xd8b4ff, color2: VOID, alpha: 0.8 });
      rune(fx, x, y, 70, 0xd8b4ff, 0.8);
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        p.emit({ shape: i % 3 ? 'mote' : 'leaf', x, y, vx: Math.cos(a) * r * 1.3, vy: Math.sin(a) * r * 1.3, drag: 0.08, life: 0.8, size: 12, size2: 4, color: 0xd8b4ff, color2: TOXIC, spin: 5 });
      }
      return;
    }
    case 'hop':
      // Mole Hole: dirt flies at both ends, and mushrooms sprout round each hole.
      for (const [px, py] of [[x, y], [x2, y2]] as const) {
        dirtBurst(fx, px, py, 70);
        fx.motifRing(px, py, 60, 6, 0.7, (g, i) => drawMushroom(g, 10 + (i % 2) * 3, i, TOXIC), { layer: 'under', squash: 0.5 });
        clouds(fx, px, py, 60, 4, 0xb8a080, { alpha: 0.55 });
      }
      return;
    case 'deepMark': {
      // The Deep Calls: a circle of rot spreads, and fingers claw up through it as the hands get ready.
      const r = ev.r ?? 350;
      const dur = ev.dur ?? 0.75;
      fx.telegraph(x, y, r, dur, TOXIC);
      rune(fx, x, y, r * 0.75, VOID, dur + 0.2, 1);
      const claws = Array.from({ length: 14 }, (_, i) => ({ a: i * 2.4 + 0.7, d: r * (0.3 + ((i * 41) % 60) / 100) }));
      fx.custom(dur + 0.2, (g, t) => {
        const k = Math.min(1, (t * (dur + 0.2)) / dur);
        const a = t > 0.85 ? (1 - t) / 0.15 : 1;
        g.circle(x, y, r * (0.5 + 0.5 * k)).stroke({ width: 8, color: VOID, alpha: 0.5 * a });
        g.circle(x, y, r * 0.95).stroke({ width: 3, color: 0x4f7a2a, alpha: 0.7 * a });
        for (const c of claws) {
          const cx = x + Math.cos(c.a) * c.d;
          const cy = y + Math.sin(c.a) * c.d;
          const h = 16 * k;
          for (let f = -1; f <= 1; f++) g.moveTo(cx + f * 6, cy).lineTo(cx + f * 8, cy - h).stroke({ width: 4, color: 0x6f8f52, alpha: 0.9 * a, cap: 'round' });
          g.ellipse(cx, cy, 12, 5).fill({ color: 0x2a1a3a, alpha: 0.6 * a });
        }
      }, 'under');
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
      fx.scar(x, y, r, 'crack', VOID, 20);
      fx.scar(x, y, r * 0.7, 'goo');
      fx.shockwave(x, y, r, TOXIC, 0.5);
      fx.flash(x, y, r * 0.6, VOID, 0.4, 0.6);
      clouds(fx, x, y, r, 10, 0x6a5a8a, { shape: 'soot', alpha: 0.45, rise: 50 });
      p.emit({ shape: 'flash', glow: false, x, y, life: 0.3, size: r * 0.9, size2: r * 1.7, color: 0xc9f59a, fadeIn: 0.02 });
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
    // ── Daltonomo
    case 'nowYouSeeMe':
      // Now you don't: a ring of harlequin diamonds spins where he was, in a puff of purple smoke and confetti.
      fx.motifRing(x, y, 60, 8, 0.5, (g, i) => drawDiamond(g, 11, i), { layer: 'under', spin: 4, squash: 0.5, stagger: 0.2 });
      confetti(fx, x, y, 22, 200);
      for (let i = 0; i < 10; i++) p.emit({ shape: 'smoke', x: x + rand(-25, 25), y: y + rand(-25, 25), vy: rand(-40, -10), life: 1, size: 24, size2: 60, color: 0xd8c8f0, color2: 0x6a3a9a, alpha: 0.5, fadeIn: 0.2 });
      clouds(fx, x, y, 70, 8, 0xc8a8f0, { alpha: 0.7, rise: 20 });
      p.emit({ shape: 'flash', glow: false, x, y: y - 30, life: 0.25, size: 60, size2: 120, color: 0xd8b8ff, fadeIn: 0.02 });
      return;
    case 'backstab': {
      fx.flash(x, y, 40, 0xffd166, 0.2);
      p.burst(8, { shape: 'star', x, y, life: 0.4, size: 14, size2: 2, color: 0xffffff, color2: 0xb98be0, spin: 6 }, [100, 220]);
      swoosh(fx, x, y - 30, rand(0, Math.PI * 2), 90, 0xffffff, 0xb98be0);
      const t = iconTexture('🃏');
      if (t) fx.ghost(t, x, y - 40, { size: 30, size2: 50, dy: -40, life: 0.6, alpha: 0.9 });
      return;
    }
    case 'jackbox': {
      // Pop goes the box: a ring of fright and a shower of confetti.
      const r = ev.r ?? 300;
      fx.shockwave(x, y, r, 0xb98be0, 0.45);
      fx.flash(x, y, 60, 0xffd166, 0.3);
      confetti(fx, x, y, 34, 320);
      impact(fx, x, y - 30, 90, 0xffd166);
      clouds(fx, x, y, 90, 6, 0xe8d8ff, { alpha: 0.55 });
      const t = iconTexture('🎁');
      if (t) fx.ghost(t, x, y - 30, { size: 40, size2: 80, dy: -50, life: 0.7, alpha: 0.9 });
      return;
    }
    case 'boxShot':
      fx.custom(0.15, (g, t) => g.moveTo(x, y).lineTo(x2, y2).stroke({ width: 5 * (1 - t) + 1, color: 0xffd166, alpha: 0.9 * (1 - t), cap: 'round' }), 'mid', true);
      p.burst(4, { shape: 'spark', x: x2, y: y2, life: 0.25, size: 9, size2: 2, color: 0xffffff, color2: 0xb98be0 }, [80, 180]);
      return;
    case 'doubleAct': {
      // Now there are two of him.
      for (const [cx, cy] of [[x, y], [x2, y2]]) {
        fx.motifRing(cx, cy, 56, 8, 0.6, (g, i) => drawDiamond(g, 10, i), { layer: 'under', spin: -3, squash: 0.5, stagger: 0.2 });
        confetti(fx, cx, cy, 16, 160);
        for (let i = 0; i < 6; i++) p.emit({ shape: 'smoke', x: cx + rand(-20, 20), y: cy + rand(-20, 20), vy: -20, life: 0.9, size: 22, size2: 50, color: 0xd8c8f0, color2: 0x6a3a9a, alpha: 0.5 });
        clouds(fx, cx, cy, 60, 5, 0xc8a8f0, { alpha: 0.6, rise: 15 });
      }
      const t = iconTexture('🎭');
      if (t) fx.ghost(t, x, y - 70, { size: 50, size2: 90, dy: -40, life: 0.9, alpha: 0.85 });
      return;
    }
    case 'cloneBoom': {
      // The double bursts: confetti, smoke and knives flying out.
      const r = ev.r ?? 250;
      fx.flash(x, y, r * 0.6, 0xffd166, 0.35);
      fx.shockwave(x, y, r, 0xb98be0, 0.45);
      confetti(fx, x, y, 40, 380);
      p.burst(10, { shape: 'shard', glow: false, x, y, life: 0.6, size: 12, size2: 6, color: 0xd8dde6, drag: 0.05, spin: 10 }, [300, 560]);
      blast(fx, x, y, r * 0.55, 0xe8d0ff);
      return;
    }
    // ── Havarti
    case 'curdle': {
      // The wheel lands: a golden flash and a spray of crumbs.
      const r = ev.r ?? 40;
      fx.flash(x, y, r * 1.8, 0xffe29a, 0.3);
      fx.shockwave(x, y, r * 2.4, 0xffd166, 0.35);
      p.burst(14, { shape: 'shard', glow: false, x, y, life: 0.6, size: 9, size2: 5, color: 0xf3dc8a, drag: 0.1, ay: 260, spin: 6 }, [120, 300]);
      rune(fx, x, y, r * 1.6, 0xffe29a, 0.5, 2);
      p.emit({ shape: 'flare', x, y, life: 0.3, size: r * 2, size2: r * 3.5, color: 0xfff1b8 });
      return;
    }
    case 'fondue': {
      // A ribbon of warm gold from her to whoever needed it most, and healing light on both.
      if (dist > 10) fx.custom(0.5, (g, t) => g.moveTo(x, y).lineTo(x2, y2).stroke({ width: 10 * (1 - t) + 2, color: 0xffe29a, alpha: 0.7 * (1 - t), cap: 'round' }), 'mid', true);
      for (const [hx, hy] of dist > 10 ? [[x, y], [x2, y2]] : [[x, y]]) {
        fx.flash(hx, hy, 60, 0xfff1b8, 0.35);
        for (let i = 0; i < 10; i++) p.emit({ shape: i % 3 ? 'mote' : 'star', x: hx + rand(-30, 30), y: hy + rand(-20, 20), vy: rand(-90, -40), life: 0.9, size: 10, size2: 2, color: 0xffffff, color2: 0xa8e6a0, spin: 3 });
        p.emit({ shape: 'flare', x: hx, y: hy - 30, life: 0.7, size: 50, size2: 120, color: 0xfff1b8, alpha: 0.8 });
      }
      return;
    }
    case 'rindBlade': {
      fx.flash(x, y, 55, 0xffd166, 0.3);
      for (let i = 0; i < 12; i++) p.emit({ shape: 'glow', x: x + rand(-20, 20), y: y + rand(-20, 20), vy: rand(-140, -60), drag: 0.4, life: 0.5, size: 18, size2: 3, color: 0xfff1b8, color2: 0xff9f43, alpha: 0.8 });
      swoosh(fx, x, y - 20, rand(0, Math.PI * 2), 90, 0xfff1b8, 0xffb347);
      return;
    }
    case 'divineFondue': {
      // A golden dome settles over them, a halo above, for as long as it lasts.
      const dur = ev.dur ?? 2;
      const r = (ev.r ?? 40) * 2.2;
      fx.pillar(x, y, r * 0.6, 0xfff1b8, 0.8);
      fx.custom(dur, (g, t) => {
        const a = t < 0.1 ? t / 0.1 : t > 0.9 ? (1 - t) / 0.1 : 1;
        g.circle(x, y, r).fill({ color: 0xffd166, alpha: 0.16 * a }).stroke({ width: 4, color: 0xfff1b8, alpha: 0.85 * a });
        g.circle(x, y - r * 1.2, r * 0.35).stroke({ width: 4, color: 0xffe29a, alpha: 0.9 * a });
      }, 'mid', true);
      for (let i = 0; i < Math.round(dur * 6); i++) fx.later(i / 6, () => p.emit({ shape: 'star', x: x + rand(-r, r), y: y + rand(-r, r), vy: -30, life: 0.6, size: 12, size2: 2, color: 0xffffff, color2: GOLD, spin: 4 }));
      rune(fx, x, y, r, GOLD, dur, 0.8);
      p.emit({ shape: 'flare', x, y: y - r * 1.2, life: dur, size: r * 0.8, size2: r * 1.1, color: 0xfff1b8, alpha: 0.7, fadeIn: 0.1 });
      return;
    }
    case 'fondueEruption': {
      // The fondue boils over: a golden blast, molten cheese thrown everywhere.
      const r = ev.r ?? 450;
      fx.flash(x, y, r * 0.7, 0xffe29a, 0.4);
      fx.shockwave(x, y, r, 0xffd166, 0.5);
      fx.later(0.08, () => fx.shockwave(x, y, r * 0.75, 0xff9f43, 0.45));
      fx.cracks(x, y, r * 0.7, 0xffd166, 1.4, 8);
      p.burst(40, { shape: 'mote', glow: false, x, y, life: 0.9, size: 14, size2: 6, color: 0xf3dc8a, drag: 0.15, ay: 320 }, [200, 620]);
      fx.scar(x, y, r * 0.6, 'goo', 0xc9a23a);
      blast(fx, x, y, r * 0.4, 0xffe9a0);
      clouds(fx, x, y, r * 0.6, 8, 0xfff1c8, { alpha: 0.45, rise: 40 });
      return;
    }
    case 'cheeseWave': {
      // Vintage: a crescent of molten cheese rolling on past the target.
      fx.custom(0.35, (g, t) => {
        const k = Math.min(1, t * 1.6);
        g.moveTo(x, y).lineTo(x + (x2 - x) * k, y + (y2 - y) * k).stroke({ width: 22 * (1 - t) + 4, color: 0xffd166, alpha: 0.55 * (1 - t), cap: 'round' });
      }, 'mid', true);
      p.burst(6, { shape: 'mote', glow: false, x: x2, y: y2, life: 0.5, size: 9, size2: 4, color: 0xf3dc8a, drag: 0.1, ay: 200 }, [60, 160]);
      return;
    }
    case 'ascend': {
      // She ripens a tier: a pillar of light, wings flung wide in a burst of feathers.
      const tier = ev.r ?? 1;
      fx.pillar(x, y, 60 + tier * 20, 0xfff1b8, 1.4);
      fx.shockwave(x, y, 160 + tier * 60, 0xffe29a, 0.6);
      p.burst(16 + tier * 8, { shape: 'leaf', glow: false, x, y, life: 1.4, size: 14, size2: 10, color: 0xfff6dc, drag: 0.2, ay: 40, spin: 3 }, [150, 360]);
      p.emit({ shape: 'flare', x, y: y - 60, life: 1, size: 120, size2: 280, color: 0xfff1b8, alpha: 0.8 });
      rune(fx, x, y, 80 + tier * 20, GOLD, 1.2);
      p.burst(12, { shape: 'star', x, y, life: 1, size: 14, size2: 2, color: 0xffffff, color2: GOLD, spin: 4 }, [80, 220]);
      return;
    }
    // ── Master Paris
    case 'fleche': {
      // A flash of steel from one spot to the next, rose petals in its wake.
      fx.custom(0.3, (g, t) => g.moveTo(x, y).lineTo(x2, y2).stroke({ width: 10 * (1 - t) + 1, color: 0xffffff, alpha: 0.9 * (1 - t), cap: 'round' }), 'mid', true);
      fx.custom(0.45, (g, t) => g.moveTo(x, y).lineTo(x2, y2).stroke({ width: 26 * (1 - t), color: 0xff8fb0, alpha: 0.25 * (1 - t), cap: 'round' }), 'mid', true);
      for (let i = 0; i < 8; i++) {
        const k = Math.random();
        p.emit({ shape: 'leaf', glow: false, x: x + (x2 - x) * k, y: y + (y2 - y) * k, vx: rand(-50, 50), vy: rand(-60, -10), ay: 40, life: rand(0.6, 1.1), size: 10, size2: 8, color: 0xff6b8a, spin: 5 });
      }
      p.burst(6, { shape: 'star', x: x2, y: y2, life: 0.35, size: 14, size2: 2, color: 0xffffff, color2: 0xff8fb0, spin: 6 }, [120, 260]);
      swoosh(fx, x2, y2 - 25, angle, 90, 0xffffff, 0xff8fb0);
      p.emit({ shape: 'flare', x: x2, y: y2 - 25, life: 0.2, size: 40, size2: 100, color: 0xffffff });
      return;
    }
    case 'cafeBreak': {
      // He stops for coffee: steam curling up, a calm ring, a cup.
      const r = ev.r ?? 70;
      fx.shockwave(x, y, r * 1.6, 0xc8a07a, 0.6);
      for (let i = 0; i < 10; i++) fx.later(i * 0.12, () => p.emit({ shape: 'smoke', x: x + rand(-14, 14), y: y - r * 0.6, vx: rand(-10, 10), vy: rand(-50, -30), life: 1.4, size: 10, size2: 26, color: 0xffffff, color2: 0xd8d0c0, alpha: 0.45, fadeIn: 0.3 }));
      const t = iconTexture('☕');
      for (let i = 0; i < 3; i++) fx.later(0.3 + i * 0.25, () => p.emit({ shape: 'heart', x: x + rand(-20, 20), y: y - r, vy: -40, life: 1.2, size: 14, size2: 22, color: 0xff8fb0, rotation: 0, fadeIn: 0.2 }));
      if (t) fx.ghost(t, x, y - r, { size: 40, size2: 56, dy: -50, life: 1.3, alpha: 0.85 });
      return;
    }
    case 'touche': {
      // His blade catches the light.
      fx.flash(x, y, 50, 0xffffff, 0.25, 0.5);
      p.burst(10, { shape: 'star', x, y, life: 0.5, size: 16, size2: 2, color: 0xffffff, color2: 0xdfe6ff, spin: 7 }, [80, 200]);
      impact(fx, x, y - 20, 60, 0xffffff);
      const t = iconTexture('✨');
      if (t) fx.ghost(t, x, y - 50, { size: 36, size2: 60, dy: -30, life: 0.7, alpha: 0.8 });
      return;
    }
    case 'encore': {
      // The spotlight finds him, and the crowd throws roses.
      const r = ev.r ?? 100;
      fx.custom(1.2, (g, t) => {
        const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        g.circle(x, y, r * (1.1 - 0.2 * t)).fill({ color: 0xfff6e0, alpha: 0.25 * a });
        g.circle(x, y, r * 0.6).fill({ color: 0xffffff, alpha: 0.15 * a });
      }, 'mid', true);
      for (let i = 0; i < 18; i++) fx.later(i * 0.05, () => p.emit({ shape: 'leaf', glow: false, x: x + rand(-r * 1.5, r * 1.5), y: y - rand(r * 1.2, r * 2.4), vx: rand(-30, 30), vy: rand(60, 140), life: 1.2, size: 12, size2: 10, color: i % 3 ? 0xe5484d : 0xff8fb0, spin: 6 }));
      p.burst(12, { shape: 'star', x, y, life: 0.8, size: 14, size2: 2, color: 0xfff1b8, color2: GOLD, drag: 0.3, spin: 4 }, [100, 260]);
      const t = iconTexture('🌹');
      p.emit({ shape: 'flare', x, y: y - 40, life: 1.2, size: r * 1.5, size2: r * 2.3, color: 0xfff6e0, alpha: 0.6, fadeIn: 0.15 });
      for (let i = 0; i < 5; i++) fx.later(i * 0.12, () => p.emit({ shape: 'heart', x: x + rand(-r, r), y: y - rand(r * 0.6, r * 1.4), vy: -30, life: 1, size: 14, size2: 24, color: i % 2 ? 0xe5484d : 0xff8fb0, rotation: 0, fadeIn: 0.2 }));
      if (t) fx.ghost(t, x, y - r, { size: 60, size2: 110, dy: -40, life: 1, alpha: 0.8 });
      return;
    }
    // ── Dark Dabber
    case 'hotbox': {
      // A billowing cloud of smoke.
      const r = ev.r ?? 100;
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = r * Math.sqrt(Math.random());
        p.emit({ shape: 'smoke', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: Math.cos(a) * rand(10, 40), vy: Math.sin(a) * rand(10, 40) - 15, drag: 0.4, life: rand(1.4, 2.4), size: rand(30, 45), size2: rand(70, 110), color: 0xc8d6b0, color2: 0x5a6a4a, alpha: 0.55, fadeIn: 0.25 });
      }
      clouds(fx, x, y, r, 10, 0xc8d6b0, { alpha: 0.45, rise: 8, life: 2 });
      return;
    }
    case 'stickyIcky': {
      // A glob of amber resin, arcing over and splatting.
      const dur = ev.dur ?? 0.35;
      const height = Math.min(200, dist * 0.3);
      fx.custom(dur, (g, t) => {
        const px = x + (x2 - x) * t;
        const py = y + (y2 - y) * t - Math.sin(t * Math.PI) * height;
        g.circle(x2, y2, 30 + 40 * t).fill({ color: 0x000000, alpha: 0.12 + 0.12 * t });
        g.circle(px, py, 16).fill(0xd98a1e).stroke({ width: 2, color: 0x6a3a0a });
        g.circle(px - 5, py - 5, 5).fill({ color: 0xffe2a0, alpha: 0.85 });
      });
      fx.later(dur, () => {
        const r = ev.r ?? 200;
        fx.flash(x2, y2, r * 0.35, 0xd98a1e, 0.25, 0.35);
        p.burst(18, { shape: 'mote', glow: false, x: x2, y: y2, life: 0.6, size: 12, size2: 5, color: 0xd98a1e, drag: 0.1, ay: 220 }, [120, 320]);
        for (let i = 0; i < 6; i++) p.emit({ shape: 'smoke', x: x2 + rand(-r / 2, r / 2), y: y2 + rand(-r / 2, r / 2), vy: -20, life: 1.2, size: 26, size2: 60, color: 0xc8d6b0, color2: 0x7a8a5a, alpha: 0.4, fadeIn: 0.2 });
        fx.scar(x2, y2, r * 0.7, 'goo', 0x8a5a14);
      });
      return;
    }
    case 'lightItUp': {
      // The resin on them catches: flames up, sparks out, more the more there was.
      const stacks = ev.r ?? 1;
      fx.flash(x, y, 50 + stacks * 10, 0xffb347, 0.35);
      fx.shockwave(x, y, 60 + stacks * 14, 0xff7a2f, 0.35);
      for (let i = 0; i < 6 + stacks * 4; i++) p.emit({ shape: 'glow', x: x + rand(-25, 25), y: y + rand(-20, 20), vx: rand(-40, 40), vy: rand(-220, -90), drag: 0.3, life: rand(0.4, 0.8), size: rand(18, 30), size2: 4, color: 0xffe0a0, color2: 0xff3a10, alpha: 0.9 });
      p.burst(6 + stacks * 2, { shape: 'spark', x, y, life: 0.35, size: 10, size2: 2, stretch: 0.05, color: 0xfff1b8, color2: 0xff7a2f }, [200, 450]);
      flamesUp(fx, x, y, 28, 4 + stacks * 2);
      if (stacks >= 4) blast(fx, x, y, 50 + stacks * 8);
      return;
    }
    case 'cloudNine': {
      // A great swirl of smoke rolls out around him, glittering.
      const r = ev.r ?? 160;
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        p.emit({ shape: 'smoke', x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.4, vx: Math.cos(a + 1.2) * 120, vy: Math.sin(a + 1.2) * 120, drag: 0.6, life: rand(1.2, 2), size: 34, size2: 90, color: 0xd8f0c0, color2: 0x6a8a4a, alpha: 0.5, fadeIn: 0.2 });
      }
      p.burst(16, { shape: 'star', x, y, life: 0.9, size: 12, size2: 2, color: 0xffffff, color2: 0xb8f07a, drag: 0.3, spin: 4 }, [80, 240]);
      fx.shockwave(x, y, r * 1.4, 0xb8f07a, 0.6);
      clouds(fx, x, y, r, 12, 0xd8f0c0, { alpha: 0.5, rise: 20, life: 1.6 });
      rune(fx, x, y, r * 0.8, 0xb8f07a, 1);
      return;
    }
    // ── Dongmaster
    case 'chinCheck': {
      // A charge: a hot streak with speed lines, and a star-burst where the uppercut lands.
      fx.custom(0.35, (g, t) => g.moveTo(x, y).lineTo(x2, y2).stroke({ width: 34 * (1 - t), color: 0xffb070, alpha: 0.4 * (1 - t), cap: 'round' }), 'mid', true);
      for (let i = 0; i < 10; i++) {
        const k = Math.random();
        const side = (Math.random() - 0.5) * 50;
        const sx = x + (x2 - x) * k - Math.sin(angle) * side;
        const sy = y + (y2 - y) * k + Math.cos(angle) * side;
        p.emit({ shape: 'spark', x: sx, y: sy, vx: -Math.cos(angle) * 300, vy: -Math.sin(angle) * 300, drag: 0.1, life: 0.25, size: 14, size2: 3, stretch: 0.08, color: 0xffffff, color2: 0xffb070 });
      }
      fx.later(Math.min(0.3, dist / 1600), () => {
        fx.shockwave(x2, y2, 90, 0xffd166, 0.3);
        p.burst(10, { shape: 'star', x: x2, y: y2, life: 0.4, size: 16, size2: 3, color: 0xffffff, color2: GOLD, spin: 6 }, [150, 320]);
        impact(fx, x2, y2 - 30, 80, 0xffd166);
        p.emit({ shape: 'flash', glow: false, x: x2, y: y2 - 30, life: 0.18, size: 60, size2: 120, color: 0xffffff, fadeIn: 0.02 });
        dirtBurst(fx, x2, y2, 40);
      });
      return;
    }
    case 'mewing': {
      // Perfect posture: a pale gold bubble, and the jaw catching the light.
      const r = (ev.r ?? 60) * 1.15;
      fx.custom(0.8, (g, t) => {
        const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        g.circle(x, y, r * (0.9 + 0.1 * t)).fill({ color: 0xfff1b8, alpha: 0.12 * a }).stroke({ width: 4, color: 0xffffff, alpha: 0.8 * a });
      }, 'mid', true);
      for (let i = 0; i < 6; i++) fx.later(i * 0.08, () => p.emit({ shape: 'star', x: x + rand(-r * 0.4, r * 0.6), y: y + rand(-r * 0.5, r * 0.3), life: 0.5, size: 18, size2: 2, color: 0xffffff, color2: GOLD, spin: 5 }));
      p.emit({ shape: 'flare', x, y: y - r * 0.6, life: 0.8, size: 40, size2: 90, color: 0xfff1b8, alpha: 0.8, fadeIn: 0.2 });
      return;
    }
    case 'sigmaStare': {
      // Two burning red lines out of his eyes, and a dark wave of pure judgment.
      const spread = ((ev.r ?? 70) * Math.PI) / 180;
      fx.custom(0.5, (g, t) => {
        const a = 1 - t;
        const rr = dist * Math.min(1, t * 3);
        g.moveTo(x, y).arc(x, y, rr, angle - spread / 2, angle + spread / 2).closePath().fill({ color: 0x2a0a2a, alpha: 0.25 * a });
        for (const side of [-1, 1]) {
          const ox = -Math.sin(angle) * side * 9;
          const oy = Math.cos(angle) * side * 9;
          g.moveTo(x + ox, y + oy).lineTo(x + ox + Math.cos(angle) * rr, y + oy + Math.sin(angle) * rr).stroke({ width: 5 * a + 1, color: 0xff3b30, alpha: 0.9 * a, cap: 'round' });
        }
      }, 'mid', true);
      const t = iconTexture('😎');
      for (let i = 0; i < 4; i++) fx.later(i * 0.06, () => p.emit({ shape: 'zap', x: x + Math.cos(angle) * dist * (0.3 + i * 0.18), y: y + Math.sin(angle) * dist * (0.3 + i * 0.18), life: 0.22, size: 50, size2: 70, color: 0xff6b5a, rotation: rand(0, 6) }));
      if (t) fx.ghost(t, x + Math.cos(angle) * 60, y + Math.sin(angle) * 60, { size: 60, size2: 120, life: 0.6, alpha: 0.7 });
      return;
    }
    case 'ascension': {
      // His final form: a golden pillar, a ring of force, the ground cracking, and a stone face watching.
      const r = ev.r ?? 300;
      fx.pillar(x, y, 90, 0xffd166, 1.2);
      fx.shockwave(x, y, r, 0xfff1b8, 0.5);
      fx.later(0.1, () => fx.shockwave(x, y, r * 0.8, 0xffb070, 0.45));
      fx.cracks(x, y, r * 0.8, 0xffd166, 1.4, 9);
      p.burst(30, { shape: 'mote', x, y, life: 1, size: 12, size2: 2, color: 0xffffff, color2: GOLD, drag: 0.3, ay: -60 }, [150, 420]);
      p.emit({ shape: 'flare', x, y: y - 80, life: 1.2, size: 140, size2: 280, color: 0xffe29a, alpha: 0.45, fadeIn: 0.1 });
      rune(fx, x, y, r * 0.6, GOLD, 1.2, 1);
      impact(fx, x, y - 40, 110, 0xffe29a);
      const t = iconTexture('🗿');
      if (t) fx.ghost(t, x, y - 80, { size: 110, size2: 220, dy: -60, life: 1, alpha: 0.6 });
      return;
    }
    case 'pounce': {
      fx.custom(0.4, (g, t) => g.moveTo(x, y).lineTo(x2, y2).stroke({ width: 26 * (1 - t), color: GOLD, alpha: 0.35 * (1 - t), cap: 'round' }), 'mid', true);
      for (let i = 0; i < 18; i++) {
        const k = Math.random();
        p.emit({ shape: i % 3 ? 'mote' : 'star', x: x + (x2 - x) * k + rand(-14, 14), y: y + (y2 - y) * k + rand(-14, 14), vy: rand(-60, -20), life: rand(0.4, 0.8), size: 10, size2: 2, color: 0xfff1b8, color2: 0xff9f43, spin: 4 });
      }
      fx.stamp(x2, y2, 0.7, (g) => drawPaw(g, 46, GOLD), { layer: 'under', from: 1.6, alpha: 0.9 });
      p.emit({ shape: 'claw', x: x2, y: y2 - 25, life: 0.32, size: 80, size2: 100, color: 0xfff1b8, color2: GOLD, rotation: angle, fadeIn: 0.04 });
      clouds(fx, x2, y2, 60, 5, 0xe8d4a8, { alpha: 0.6 });
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
      for (let i = 0; i < 2; i++) fx.later(i * 0.07, () => p.emit({ shape: 'claw', x: x + Math.cos(angle) * dist * 0.7, y: y + Math.sin(angle) * dist * 0.7 - 20, life: 0.3, size: dist * 0.9, size2: dist, color: 0xffffff, color2: 0xff3b3b, rotation: angle + rand(-0.4, 0.4), fadeIn: 0.03 }));
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
      fx.later(0.3, () => p.emit({ shape: 'flare', x: x2, y: y2 - 30, life: 0.7, size: 60, size2: 140, color: 0xfff1b8, alpha: 0.85 }));
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
      fx.later(0.25, () => p.emit({ shape: 'flare', x, y: y - r * 0.5, life: 0.6, size: r, size2: r * 2.4, color: 0xfff1b8, alpha: 0.8 }));
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
      impact(fx, x + Math.cos(angle) * 50, y + Math.sin(angle) * 50 - 30, 110, 0xffd08a);
      clouds(fx, x + Math.cos(angle) * dist * 0.5, y + Math.sin(angle) * dist * 0.5, dist * 0.4, 6, 0xe8d4a8, { alpha: 0.5, rise: 10 });
      const t = iconTexture('🦁');
      if (t) fx.ghost(t, x + Math.cos(angle) * 40, y + Math.sin(angle) * 40, { size: 90, size2: 220, dx: Math.cos(angle) * dist * 0.6, dy: Math.sin(angle) * dist * 0.6, life: 0.7, alpha: 0.75 });
      return;
    }

    // ── King Rix
    case 'summon': {
      // Call the Guard: a great crown laid on the ground, and the guards come up through the light.
      const r = ev.r ?? 110;
      fx.stamp(x, y, 1.1, (g) => drawCrown(g, r * 1.3, GOLD), { layer: 'under', from: 1.6, alpha: 0.95 });
      fx.scar(x, y, r * 1.3, 'seal', GOLD, 14);
      fx.pillar(x, y, r * 0.5, GOLD, 1);
      fx.later(0.15, () => fx.shockwave(x, y, r * 1.5, GOLD, 0.5));
      rune(fx, x, y, r, GOLD, 1.1, 1.2);
      p.emit({ shape: 'flare', x, y: y - r * 0.6, life: 0.9, size: r, size2: r * 2.4, color: 0xfff1b8, alpha: 0.8 });
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
        fx.scar(mx, my, dist * 0.45, 'crack', GOLD);
        p.burst(18, { shape: 'star', x: mx, y: my, life: 0.6, size: 16, size2: 3, color: 0xfff1b8, color2: GOLD, drag: 0.05, spin: 6 }, [150, 400]);
        impact(fx, mx, my - 30, 120, 0xffe29a);
        p.emit({ shape: 'circle', x: mx, y: my, life: 0.45, size: 40, size2: dist * 0.9, color: 0xfff1b8, color2: GOLD, alpha: 0.9 });
        clouds(fx, mx, my, dist * 0.35, 6, 0xe8d8b0, { alpha: 0.5, rise: 10 });
      });
      return;
    }
    case 'decree': {
      // Royal Decree: a blob of red wax slammed down on the target and stamped with the crown.
      const r = ev.r ?? 90;
      fx.stamp(x, y, 1, (g) => {
        const pts: number[] = [];
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2;
          const k = 1 + Math.sin(i * 3.1) * 0.08 + Math.cos(i * 1.7) * 0.05;
          pts.push(Math.cos(a) * r * k, Math.sin(a) * r * k);
        }
        g.poly(pts).fill(0xb3202a).stroke({ width: 3, color: 0x4a0a10, join: 'round' });
        g.poly(pts.map((v) => v * 0.78)).stroke({ width: 2, color: 0xe5484d, alpha: 0.7, join: 'round' });
        drawCrown(g, r * 0.5, 0xffd166);
      }, { layer: 'under', from: 2.4, alpha: 0.95 });
      fx.scar(x, y, r * 1.1, 'seal', GOLD, 12);
      fx.burst(x, y, GOLD, r * 1.4);
      fx.flash(x, y, r * 0.6, GOLD, 0.4);
      const t = iconTexture('📜');
      rune(fx, x, y, r * 1.1, GOLD, 1, -1.2);
      impact(fx, x, y - 20, r * 1.2, 0xfff1b8);
      if (t) fx.ghost(t, x, y - r * 1.2, { size: 120, size2: 60, dy: r * 0.9, life: 0.45, alpha: 0.85 });
      fx.later(0.4, () => p.burst(16, { shape: 'star', x, y, life: 0.6, size: 14, size2: 2, color: 0xffffff, color2: GOLD, drag: 0.05, spin: 6 }, [120, 300]));
      return;
    }
    case 'lanternLight': {
      // The lantern's light lobbed from the hand, landing in a burst that lights the place up for a while.
      const r = ev.r ?? 550;
      const fromX = ev.x2 ?? x;
      const fromY = ev.y2 ?? y;
      const glow = 0xd8f7a0;
      fx.custom(0.35, (g, t) => {
        const bx = fromX + (x - fromX) * t;
        const by = fromY + (y - fromY) * t - Math.sin(t * Math.PI) * 160 - 60 * (1 - t);
        g.circle(bx, by, 22).fill({ color: glow, alpha: 0.35 }).circle(bx, by, 9).fill({ color: 0xfaffe0, alpha: 0.95 });
      }, 'top', true);
      fx.later(0.35, () => {
        fx.flash(x, y, 120, glow, 0.4);
        fx.shockwave(x, y, r, glow, 0.6);
        fx.light(x, y, r * 1.1, 0xe8ffc0, 6, 0.7);
        p.burst(24, { shape: 'mote', x, y, life: 1.6, size: 10, size2: 2, color: 0xfaffe0, color2: glow, drag: 0.4, ay: -40 }, [80, 260]);
      });
      return;
    }
    case 'aegisWard': {
      // A ring of Deepstone shards bursting out, and a ward circle round everyone it covers.
      const r = ev.r ?? 600;
      fx.shockwave(x, y, r, 0x8fd0ff, 0.5);
      fx.sigil(x, y, r * 0.55, 0x8fd0ff, 0.7, -1);
      fx.flash(x, y, 90, 0xcfeaff, 0.3);
      p.burst(22, { shape: 'shard', glow: false, x, y: y - 40, life: 0.7, size: 14, size2: 6, color: 0x9fb4c8, color2: 0x5a6a7a, drag: 0.08, ay: 600, spin: 8 }, [200, 420], -Math.PI / 2, Math.PI * 1.4);
      return;
    }
    case 'drumBeat': {
      // Three beats of the war drum, rolling out, and everyone close picks up the pace.
      const r = ev.r ?? 700;
      for (let i = 0; i < 3; i++) fx.later(i * 0.16, () => fx.shockwave(x, y, r * (0.55 + i * 0.22), i === 2 ? 0xffd166 : 0xff7a2f, 0.45));
      fx.comic(x, y - 150, 'BOOM!', 0xff7a2f);
      p.burst(14, { shape: 'smoke', glow: false, x, y, life: 0.6, size: 20, size2: 44, color: 0xc9a37a, alpha: 0.4, drag: 0.06 }, [120, 260]);
      return;
    }
    // ── Item passives
    case 'static': {
      // Stormstring: a crackling jump of lightning, blue-white, with sparks where it lands.
      const x2 = ev.x2 ?? x;
      const y2 = ev.y2 ?? y;
      fx.lightning(x, y - 40, x2, y2 - 40, 0x9fd8ff, 0.22, 3);
      p.burst(8, { shape: 'spark', x: x2, y: y2 - 40, life: 0.3, size: 9, size2: 2, stretch: 0.05, color: 0xffffff, color2: 0x7fc4ff }, [120, 280]);
      return;
    }
    case 'spellblade': {
      // A Spellblade hit: a ring of light snapping shut on the target, and a bright cut.
      const r = ev.r ?? 40;
      fx.shockwave(x, y - r, r * 2.6, 0xbfe9ff, 0.25);
      fx.flash(x, y - r, r * 1.6, 0xdff4ff, 0.18, 0.8);
      p.burst(10, { shape: 'mote', x, y: y - r, life: 0.35, size: 9, size2: 2, color: 0xffffff, color2: 0x9fd8ff }, [140, 300]);
      return;
    }
    case 'royalPause': {
      // The Royal Hourglass: sand pours, a golden sigil, the figure turns to a gold statue (see the views).
      fx.sigil(x, y, (ev.r ?? 40) * 2.4, GOLD, ev.dur ?? 2.5, 2);
      fx.pillar(x, y, 60, 0xffe29a, 0.6);
      p.burst(16, { shape: 'mote', x, y: y - 60, life: 0.9, size: 7, size2: 2, color: 0xfff1b8, color2: GOLD, ay: 220 }, [40, 120]);
      return;
    }
    // ── Scrimby
    case 'mustard': {
      // Splattered: a yellow squiggle of mustard and a splash of hot dog water.
      const r = ev.r ?? 30;
      fx.stamp(x, y - r, 0.6, (g) => {
        g.moveTo(-r, 0).bezierCurveTo(-r * 0.4, -r * 0.6, r * 0.2, r * 0.6, r, -r * 0.2).stroke({ width: 6, color: 0xffd23a, cap: 'round' });
      }, { from: 0.6, alpha: 0.95 });
      p.burst(8, { shape: 'mote', glow: false, x, y: y - r, life: 0.5, size: 8, size2: 4, color: 0xd8c09a, ay: 400 }, [80, 200]);
      fx.comic(x, y - r * 2.4, 'SPLAT!', 0xffd23a);
      return;
    }
    case 'manhole': {
      // The cover rattles and lifts, steam leaking round it: get off it.
      const r = ev.r ?? 200;
      const dur = ev.dur ?? 0.6;
      fx.telegraph(x, y, r, dur, 0xffb04a);
      fx.stamp(x, y, dur, (g) => {
        g.ellipse(0, 0, r * 0.32, r * 0.15).fill(0x3a3f48).stroke({ width: 3, color: 0x1a1d22 });
        for (let i = -2; i <= 2; i++) g.moveTo(-r * 0.24, i * r * 0.05).lineTo(r * 0.24, i * r * 0.05).stroke({ width: 1.5, color: 0x5d636d });
      }, { layer: 'under', from: 1, alpha: 1 });
      for (let i = 0; i < 6; i++) fx.later(i * (dur / 6), () => p.emit({ shape: 'smoke', glow: false, x: x + rand(-20, 20), y: y - 6, vy: -60, life: 0.8, size: 14, size2: 40, color: 0xffffff, alpha: 0.4 }));
      for (let i = 0; i < 4; i++) fx.later(i * (dur / 4), () => clouds(fx, x, y - 6, 40, 1, 0xffffff, { alpha: 0.45, rise: 60, life: 0.8 }));
      return;
    }
    case 'steamBurst': {
      // The cover blows sky-high and a column of steam roars up.
      const r = ev.r ?? 200;
      fx.shockwave(x, y, r * 1.2, 0xffffff, 0.45);
      fx.pillar(x, y, r * 0.6, 0xeef4ff, 0.6);
      p.burst(26, { shape: 'smoke', glow: false, x, y: y - 20, life: 1.4, size: 30, size2: 90, color: 0xffffff, alpha: 0.45, drag: 0.1, ay: -60 }, [60, 200], -Math.PI / 2, 1.2);
      p.burst(1, { shape: 'shard', glow: false, x, y: y - 30, life: 1.0, size: 26, size2: 26, color: 0x3a3f48, ay: 500, spin: 9 }, [500, 520], -Math.PI / 2, 0.2);
      fx.comic(x, y - r * 0.9, 'FSSSHHH!', 0xeef4ff);
      clouds(fx, x, y - 20, r * 0.7, 14, 0xffffff, { alpha: 0.65, rise: 160, life: 1.4 });
      p.emit({ shape: 'flash', glow: false, x, y: y - 30, life: 0.2, size: r * 0.5, size2: r * 0.9, color: 0xeef4ff, fadeIn: 0.02 });
      return;
    }
    case 'jaywalk': {
      // Out of the way! Speed lines and a scuffed crosswalk where he went.
      const x2 = ev.x2 ?? x;
      const y2 = ev.y2 ?? y;
      const a = Math.atan2(y2 - y, x2 - x);
      fx.stamp((x + x2) / 2, (y + y2) / 2, 0.8, (g) => {
        for (let i = -2; i <= 2; i++) g.rect(-60, i * 14 - 5, 120, 8).fill({ color: 0xffffff, alpha: 0.55 });
      }, { layer: 'under', spin: 0, alpha: 0.8 });
      fx.speedLines(x2, y2 - 40, 60, 0xffffff, 8, 0.3, a + Math.PI, 0.8);
      fx.comic(x2, y2 - 110, 'HEY!', 0xff8a3d);
      clouds(fx, x2, y2, 50, 5, 0xe8dcc4, { alpha: 0.6, rise: 10, life: 0.7 });
      return;
    }
    case 'expressHorn': {
      // The horn, headlights on, sparks off the rails.
      fx.flash(x, y - 40, 120, 0xfff1b8, 0.3, 0.9);
      fx.callout(x, y - 150, 'STAND CLEAR!', 0xff8a3d);
      p.emit({ shape: 'flare', x, y: y - 40, life: 0.6, size: 120, size2: 260, color: 0xfff6c0, alpha: 0.9, fadeIn: 0.05 });
      p.burst(16, { shape: 'spark', x, y, life: 0.4, size: 12, size2: 2, stretch: 0.05, color: 0xffffff, color2: 0x7fd4ff }, [200, 420]);
      return;
    }
    case 'expressCrash': {
      // The train piles in: a huge blast, twisted metal, sparks everywhere, the ground cracked.
      const r = ev.r ?? 300;
      fx.shockwave(x, y, r * 1.3, 0xff8a3d, 0.6);
      fx.shockwave(x, y, r * 0.8, 0xffffff, 0.35);
      fx.flash(x, y - 40, r * 0.8, 0xfff1b8, 0.35, 0.9);
      fx.cracks(x, y, r * 0.9, 0x2a2a2a, 1.2, 9);
      fx.scar(x, y, r * 0.6, 'scorch');
      p.burst(24, { shape: 'spark', x, y: y - 30, life: 0.6, size: 16, size2: 3, stretch: 0.05, color: 0xffe0a0, color2: 0xff5a2a, drag: 0.03 }, [260, 640]);
      p.burst(12, { shape: 'shard', glow: false, x, y: y - 30, life: 1.0, size: 14, size2: 8, color: 0xb8bec6, ay: 600, spin: 10 }, [180, 420], -Math.PI / 2, 2);
      p.burst(10, { shape: 'smoke', glow: false, x, y, life: 1.3, size: 40, size2: 110, color: 0x5a5a60, alpha: 0.45, drag: 0.1 }, [60, 160]);
      fx.comic(x, y - r * 0.8, 'NEXT STOP!', 0xff8a3d, true);
      blast(fx, x, y, r * 0.6);
      return;
    }
    // ── Big Whale
    case 'tip': {
      // A coin flips up over whoever he just tipped.
      p.burst(3, { shape: 'mote', glow: false, x, y: y - 90, life: 0.7, size: 8, size2: 6, color: 0xffd166, ay: 400, spin: 8 }, [60, 120], -Math.PI / 2, 0.8);
      p.emit({ shape: 'star', x, y: y - 90, life: 0.4, size: 20, size2: 6, color: 0xffffff, color2: 0xffd166, spin: 4 });
      return;
    }
    case 'cashRain': {
      // Bills flutter down over the spot.
      const r = ev.r ?? 230;
      const dur = ev.dur ?? 0.3;
      fx.telegraph(x, y, r, dur, 0x5a9a4a);
      fx.later(dur * 0.6, () => {
        for (let i = 0; i < 26; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * r;
          p.emit({ shape: 'leaf', glow: false, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.5 - 140, vy: 120, life: 1.2, size: 14, size2: 12, color: 0x7ab86a, spin: 4, drag: 0.2 });
        }
        fx.comic(x, y - r * 0.6, 'MAKE IT RAIN!', 0x7ab86a);
        for (let i = 0; i < 10; i++) fx.later(i * 0.06, () => p.emit({ shape: 'star', x: x + rand(-r, r) * 0.8, y: y + rand(-r, r) * 0.4 - 60, life: 0.5, size: 16, size2: 4, color: 0xffffff, color2: 0xffd166, spin: 5 }));
      });
      return;
    }
    case 'yachtParty': {
      // Streamers and bubbles: party time (for at least one of you).
      const r = ev.r ?? 40;
      fx.shockwave(x, y, r * 2.4, 0x8ad6ff, 0.35);
      p.burst(12, { shape: 'mote', x, y: y - r, life: 0.9, size: 10, size2: 3, color: 0xffffff, color2: 0x8ad6ff, ay: -80 }, [40, 140]);
      p.burst(8, { shape: 'leaf', glow: false, x, y: y - r * 2, life: 1.0, size: 10, size2: 8, color: [0xff8fb0, 0xffd166, 0x8ad6ff][Math.floor(Math.random() * 3)], ay: 200, spin: 6 }, [80, 200]);
      p.emit({ shape: 'circle', x, y, life: 0.5, size: 30, size2: r * 3, color: 0xffffff, color2: 0x8ad6ff, alpha: 0.8 });
      for (let i = 0; i < 4; i++) fx.later(i * 0.1, () => p.emit({ shape: 'star', x: x + rand(-r, r), y: y - r * 1.5 + rand(-r, r) * 0.5, life: 0.5, size: 18, size2: 4, color: 0xffffff, color2: [0xff8fb0, 0xffd166, 0x8ad6ff][i % 3], spin: 5 }));
      return;
    }
    case 'paperwork': {
      // Buried in paperwork: pages swirl round their head while they read the fine print.
      const r = ev.r ?? 40;
      fx.comic(x, y - r * 3, 'SIGN HERE!', 0xf2efe6);
      impact(fx, x, y - r * 1.5, 60, 0xf6f0e0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        p.emit({ shape: 'shard', glow: false, x: x + Math.cos(a) * r, y: y - r * 2.2 + Math.sin(a) * r * 0.4, vx: Math.cos(a + 1.6) * 60, vy: Math.sin(a + 1.6) * 30, life: ev.dur ?? 1, size: 12, size2: 10, color: 0xf6f0e0, spin: 5 });
      }
      return;
    }
    case 'breach': {
      // Up out of the "water" in an arc, spray flying off him.
      const x2 = ev.x2 ?? x;
      const y2 = ev.y2 ?? y;
      p.burst(16, { shape: 'mote', glow: false, x, y, life: 0.6, size: 10, size2: 4, color: 0xbfe9ff, ay: 600 }, [140, 320], -Math.PI / 2, 1.4);
      clouds(fx, x, y, 70, 6, 0xd8f0ff, { alpha: 0.6, rise: 40 });
      fx.telegraph(x2, y2, 350, ev.dur ?? 0.6, 0x3d8bfd);
      return;
    }
    case 'splashZone': {
      // SPLOOSH: a ring of water, a great wave of spray, and a puddle left behind.
      const r = ev.r ?? 350;
      fx.shockwave(x, y, r * 1.2, 0x8ad6ff, 0.6);
      fx.shockwave(x, y, r * 0.7, 0xffffff, 0.4);
      p.burst(40, { shape: 'mote', glow: false, x, y: y - 20, life: 1.1, size: 12, size2: 5, color: 0xbfe9ff, ay: 700, drag: 0.05 }, [200, 520], -Math.PI / 2, 2.4);
      fx.scar(x, y, r * 0.7, 'goo', 0x3d8bfd, 6);
      clouds(fx, x, y, r * 0.8, 12, 0xd8f0ff, { alpha: 0.6, rise: 50 });
      p.emit({ shape: 'circle', x, y, life: 0.6, size: 60, size2: r * 2.6, color: 0xffffff, color2: 0x8ad6ff, alpha: 0.85 });
      fx.comic(x, y - r * 0.7, 'SPLOOSH!', 0x8ad6ff, true);
      return;
    }
    // ── The Howling Hollow
    case 'relic': {
      // A pumpkin eaten: it bursts in orange chunks and candlelight, and a green warmth rises off whoever got it.
      fx.flash(x, y - 20, 70, 0xffb04a, 0.25, 0.8);
      p.burst(12, { shape: 'shard', x, y: y - 16, life: 0.6, size: 9, size2: 4, color: 0xe8771f, color2: 0xa84a10, ay: 600 }, [140, 300]);
      p.burst(10, { shape: 'mote', x, y: y - 30, life: 0.9, size: 8, size2: 2, color: 0xffd27a, color2: 0x8fffc8, ay: -120 }, [30, 90]);
      fx.comic(x, y - 110, 'YUM!', 0xffa040);
      return;
    }
    default: {
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
  fx.scar(x, y, r * 2, 'scorch', 0x000000, 40);
  fx.scar(x, y, r * 1.8, 'crack', FIRE, 40);
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

/** Each champion goes down in character, on top of the usual death burst. */
export function championDeath(fx: FxLayer, s: EntitySnap): void {
  const p = fx.particles;
  const { x, r } = s;
  // Bursts come off the body; the last words go over where the head was.
  const y = s.y - chestHeight(s);
  const top = s.y - standHeight(s) - 10;
  switch (s.champ) {
    case 'marksman':
      // Jordini: the paperwork goes everywhere.
      p.burst(18, { shape: 'shard', glow: false, x, y, life: 1.5, size: 13, size2: 11, color: 0xf6f0e0, drag: 0.15, ay: 80, spin: 5 }, [120, 300]);
      fx.quip(x, top, 'Denied...', 0xc0392b);
      return;
    case 'barbarian':
      // The Oak: shreds of tinfoil, and one last theory.
      p.burst(12, { shape: 'shard', glow: false, x, y, life: 1, size: 10, size2: 8, color: 0xdfe6ee, drag: 0.1, ay: 300, spin: 10 }, [150, 320]);
      fx.quip(x, top, 'IT’S A SETUP!', 0xff5a2a);
      return;
    case 'willmore':
      // His sack bursts: junk everywhere (his lid flies off on its own).
      p.burst(16, { shape: 'shard', glow: false, x, y, life: 0.9, size: 11, size2: 9, color: 0x9aa1ab, drag: 0.1, ay: 400, spin: 10 }, [160, 340]);
      p.burst(8, { shape: 'shard', glow: false, x, y, life: 0.9, size: 9, size2: 7, color: 0x6b4a2b, drag: 0.1, ay: 400, spin: 10 }, [140, 300]);
      return;
    case 'hunnag':
      // She comes apart in a cloud of spores.
      for (let i = 0; i < 16; i++) p.emit({ shape: 'smoke', x: x + rand(-r, r), y: y + rand(-r, r), vy: rand(-50, -15), life: rand(1.2, 2), size: 26, size2: 70, color: 0xb8f07a, color2: 0x4f6b34, alpha: 0.45, fadeIn: 0.2 });
      p.burst(20, { shape: 'mote', x, y, life: 1.4, size: 8, size2: 2, color: 0xe8ffc8, color2: 0x8fd14f, drag: 0.3 }, [60, 200]);
      return;
    case 'logan':
      // Tufts of golden mane on the wind.
      p.burst(16, { shape: 'leaf', glow: false, x, y, life: 1.5, size: 12, size2: 9, color: 0xd98a2b, drag: 0.2, ay: 40, spin: 4 }, [80, 220]);
      fx.shockwave(x, y, r * 3, 0xffc04d, 0.6);
      return;
    case 'kingrix':
      // His coins spill (the crown's already flying).
      p.burst(14, { shape: 'star', x, y, life: 0.8, size: 12, size2: 3, color: 0xfff1b8, color2: 0xffd166, ay: 300, spin: 6 }, [120, 280]);
      return;
    case 'dongmaster':
      p.burst(10, { shape: 'mote', glow: false, x, y, life: 0.7, size: 7, size2: 3, color: 0x9fd6ff, ay: 400 }, [120, 260]);
      fx.quip(x, top, 'NOT THE JAW!', 0xe5484d);
      return;
    case 'dabber':
      // Gone in a puff of smoke.
      for (let i = 0; i < 22; i++) {
        const a = Math.random() * Math.PI * 2;
        p.emit({ shape: 'smoke', x: x + Math.cos(a) * r * 0.5, y: y + Math.sin(a) * r * 0.5, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90 - 20, drag: 0.5, life: rand(1.2, 2.2), size: 30, size2: 80, color: 0xc8d6b0, color2: 0x5a6a4a, alpha: 0.55, fadeIn: 0.1 });
      }
      return;
    case 'paris':
      // A last flourish of rose petals.
      p.burst(20, { shape: 'leaf', glow: false, x, y, life: 1.6, size: 11, size2: 9, color: 0xe5484d, drag: 0.25, ay: 50, spin: 5 }, [80, 220]);
      fx.quip(x, top, 'Adieu...', 0xff8fb0);
      return;
    case 'scrimby':
      // His cap flies off and the coffee goes everywhere.
      p.burst(12, { shape: 'mote', glow: false, x, y, life: 0.8, size: 8, size2: 5, color: 0x6a4a2a, ay: 400 }, [100, 240]);
      fx.quip(x, top, 'I gotta catch my train...', 0xff8a3d);
      return;
    case 'bigwhale':
      // Money everywhere. Nobody picks any of it up for him.
      p.burst(24, { shape: 'leaf', glow: false, x, y, life: 1.8, size: 13, size2: 11, color: 0x7ab86a, drag: 0.25, ay: 60, spin: 4 }, [100, 260]);
      fx.quip(x, top, 'Do you know who I am?!', 0x8ad6ff);
      return;
    case 'havarti':
      // She melts into a puddle of fondue, feathers drifting down.
      fx.scar(x, s.y, r * 1.6, 'goo', 0xc9a23a, 12);
      p.burst(14, { shape: 'leaf', glow: false, x, y, life: 1.6, size: 12, size2: 10, color: 0xfff6dc, drag: 0.25, ay: 40, spin: 3 }, [80, 200]);
      p.burst(12, { shape: 'mote', glow: false, x, y, life: 0.8, size: 9, size2: 4, color: 0xf3dc8a, ay: 300 }, [100, 240]);
      return;
    case 'daltonomo':
      confetti(fx, x, y, 36, 300);
      fx.quip(x, top, 'Ta-da...?', 0xb98be0);
      return;
  }
}

/** A burst of jester's confetti: little paper scraps in every color, fluttering down. */
function confetti(fx: FxLayer, x: number, y: number, count: number, speed: number): void {
  const colors = [0xff6b8a, 0xffd166, 0x7fe3ff, 0x9be15d, 0xb98be0];
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    fx.particles.emit({ shape: 'shard', glow: false, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, drag: 0.08, ay: 220, life: rand(0.8, 1.3), size: 8, size2: 6, color: colors[i % colors.length], spin: 12 });
  }
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
  resinBolt: [0xffb347, 45],
  knife: [0xd8dde6, 40],
  cheeseWheel: [GOLD, 70],
  cheeseBolt: [0xffe29a, 45],
  smokeBolt: [0xb8f07a, 90],
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
  const head = s.vis === 'shootie' ? ([friendly ? PALETTE.ally : PALETTE.enemy, 80] as [number, number]) : HEADS[s.vis ?? ''];
  // Lives about a frame, so there's always one glowing on the projectile as it moves.
  if (head) p.emit({ shape: 'glow', x: s.x, y: s.y, life: 0.05, size: head[1], color: head[0], alpha: 0.75, fadeIn: 0.01 });
  switch (s.vis) {
    case 'bolt':
      // Objection!: a strongly worded arrow, trailing ice-blue streaks and a flutter of torn paperwork.
      spray(fx.rate(140), { shape: 'spark', life: 0.3, size: 18, size2: 4, stretch: 0.06, color: 0xffffff, color2: ARCANE }, 10, 140);
      spray(fx.rate(30), { shape: 'shard', glow: false, life: 0.7, size: 11, size2: 9, color: 0xf6f0e0, spin: 8, ay: 120, drag: 0.3 }, 14, 60);
      spray(fx.rate(14), { shape: 'spark', life: 0.25, size: 14, size2: 3, stretch: 0.08, color: 0xffffff, color2: DENY }, 10, 160);
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
    case 'token':
    case 'coin':
      spray(fx.rate(50), { shape: 'mote', life: 0.4, size: 9, size2: 2, color: 0xfff1b8, color2: GOLD }, 5, 20);
      return;
    case 'hotdog':
      spray(fx.rate(40), { shape: 'mote', glow: false, life: 0.45, size: 7, size2: 3, color: 0xffd23a, ay: 300 }, 6, 20);
      return;
    case 'briefcase':
      spray(fx.rate(30), { shape: 'shard', glow: false, life: 0.6, size: 10, size2: 8, color: 0xf6f0e0, spin: 4 }, 8, 30);
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
      case 'burning':
        // A Rotroot burn: sickly green flames licking up.
        for (let i = 0; i < fx.rate(16); i++) p.emit({ shape: 'glow', ...around(0.8), vx: rand(-10, 10), vy: rand(-110, -50), drag: 0.5, life: rand(0.35, 0.6), size: rand(14, 22), size2: 3, color: 0xe8ffb0, color2: 0x6fae3a, alpha: 0.8 });
        break;
      case 'wounds':
        // Wounded: dark drops falling.
        for (let i = 0; i < fx.rate(5); i++) p.emit({ shape: 'mote', glow: false, ...around(0.7), vy: rand(30, 70), life: 0.6, size: 6, size2: 3, color: 0x7a1020 });
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
      case 'vanished':
        // His own side sees a glimmer where he is; the enemy sees nothing at all.
        if (Math.random() < fx.dt * 5) p.emit({ shape: 'star', ...around(0.8), life: 0.4, size: 10, size2: 2, color: 0xffffff, color2: 0xb98be0, spin: 4 });
        break;
      case 'blessed':
        for (let i = 0; i < fx.rate(16); i++) p.emit({ shape: i % 4 ? 'mote' : 'star', ...around(1.3), vy: rand(-60, -20), life: 0.8, size: 10, size2: 2, color: 0xffffff, color2: GOLD, spin: 3 });
        break;
      case 'curdled':
        for (let i = 0; i < fx.rate(6); i++) p.emit({ shape: 'shard', glow: false, ...around(0.8), vy: rand(10, 40), ay: 200, life: 0.6, size: 7, size2: 4, color: 0xf3dc8a, spin: 4 });
        break;
      case 'rindBlade':
        for (let i = 0; i < fx.rate(10); i++) p.emit({ shape: 'glow', x: s.x + Math.cos(s.f) * r * 1.3 + rand(-8, 8), y: s.y + Math.sin(s.f) * r * 1.3 + rand(-8, 8), vy: rand(-90, -40), life: 0.4, size: 14, size2: 3, color: 0xfff1b8, color2: 0xff9f43, alpha: 0.8 });
        break;
      case 'meditating':
        for (let i = 0; i < fx.rate(5); i++) p.emit({ shape: 'smoke', x: s.x + rand(-10, 10), y: s.y - r * 0.8, vy: rand(-40, -25), life: 1.2, size: 8, size2: 20, color: 0xffffff, color2: 0xd8d0c0, alpha: 0.4, fadeIn: 0.3 });
        break;
      case 'touche':
        if (Math.random() < fx.dt * 6) p.emit({ shape: 'star', x: s.x + Math.cos(s.f) * r * 1.6, y: s.y + Math.sin(s.f) * r * 1.6, life: 0.3, size: 12, size2: 2, color: 0xffffff, color2: 0xdfe6ff, spin: 6 });
        break;
      case 'encore':
        for (let i = 0; i < fx.rate(6); i++) p.emit({ shape: 'leaf', glow: false, ...around(1.4), vx: rand(-20, 20), vy: rand(-30, 10), ay: 30, life: 0.9, size: 9, size2: 7, color: 0xff6b8a, spin: 5 });
        break;
      case 'untargetable':
        for (let i = 0; i < fx.rate(20); i++) p.emit({ shape: 'mote', ...around(0.8), life: 0.3, size: 8, size2: 2, color: 0xffffff, color2: 0xff8fb0 });
        break;
      case 'hazed':
        // Allies see him wreathed in smoke (enemies don't see him at all).
        for (let i = 0; i < fx.rate(8); i++) p.emit({ shape: 'smoke', ...around(0.8), vy: rand(-30, -10), life: 1, size: 18, size2: 40, color: 0xc8d6b0, color2: 0x5a6a4a, alpha: 0.35, fadeIn: 0.3 });
        break;
      case 'blazed':
        for (let i = 0; i < fx.rate(10); i++) p.emit({ shape: 'mote', ...around(0.8), vy: rand(-90, -40), life: 0.6, size: 6, size2: 2, color: 0xffd9a8, color2: 0xff7a2f });
        break;
      case 'resin':
        for (let i = 0; i < fx.rate(6); i++) p.emit({ shape: 'mote', glow: false, ...around(0.8), vy: rand(10, 30), ay: 200, life: 0.6, size: 7, size2: 4, color: 0xd98a1e });
        for (let i = 0; i < fx.rate(4); i++) p.emit({ shape: 'smoke', ...around(0.6), vy: rand(-40, -20), life: 0.9, size: 10, size2: 24, color: 0xc8d6b0, color2: 0x7a8a5a, alpha: 0.35 });
        break;
      case 'cloudNine':
        for (let i = 0; i < fx.rate(16); i++) {
          const a = time * 2 + Math.random() * Math.PI * 2;
          p.emit({ shape: 'smoke', x: s.x + Math.cos(a) * r * 1.6, y: s.y + Math.sin(a) * r * 1.6, vx: Math.cos(a + 1.5) * 60, vy: Math.sin(a + 1.5) * 60, life: 0.9, size: 18, size2: 44, color: 0xd8f0c0, color2: 0x6a8a4a, alpha: 0.4 });
        }
        break;
      case 'mewing':
        if (Math.random() < fx.dt * 4) p.emit({ shape: 'star', x: s.x + Math.cos(s.f) * r * 0.5, y: s.y + Math.sin(s.f) * r * 0.5, life: 0.4, size: 14, size2: 2, color: 0xffffff, color2: GOLD, spin: 5 });
        break;
      case 'ascended':
        for (let i = 0; i < fx.rate(40); i++) p.emit({ shape: 'glow', ...around(0.9), vx: rand(-10, 10), vy: rand(-110, -50), drag: 0.5, life: rand(0.4, 0.7), size: rand(20, 32), size2: 4, color: 0xfff6d0, color2: 0xffb070, alpha: 0.7 });
        break;
      case 'recall':
        if (s.champ) RECALLS[s.champ].fx?.(fx, s);
        for (let i = 0; i < fx.rate(30); i++) {
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

// ─── Textured accents (the particle atlas: render/particles.ts) ─────────────────

/** Soft clouds billowing out and rising: steam, dust, smoke, a vanishing act. `shape` 'soot' for black smoke. */
function clouds(fx: FxLayer, x: number, y: number, r: number, n: number, color: number, o: { shape?: 'cloud' | 'soot' | 'smoke'; rise?: number; alpha?: number; life?: number } = {}): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = r * 0.3 * Math.random();
    fx.particles.emit({
      shape: o.shape ?? 'cloud',
      glow: false,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d * 0.6,
      vx: Math.cos(a) * rand(r * 0.5, r * 1.3),
      vy: Math.sin(a) * rand(r * 0.25, r * 0.7) - (o.rise ?? 30),
      drag: 0.15,
      life: rand(0.7, 1.2) * (o.life ?? 1),
      size: r * 0.35,
      size2: r * 0.95,
      color,
      alpha: o.alpha ?? 0.7,
      fadeIn: 0.08,
      spin: rand(-0.6, 0.6),
    });
  }
}

/** An explosion: a flash, rolling fire (tinted by `tint`), embers flying, black smoke after. */
function blast(fx: FxLayer, x: number, y: number, r: number, tint = 0xffffff): void {
  const p = fx.particles;
  p.emit({ shape: 'flash', glow: false, x, y: y - r * 0.2, life: 0.22, size: r * 0.9, size2: r * 1.6, color: tint, fadeIn: 0.02, rotation: rand(0, 6) });
  for (let i = 0; i < 9; i++) {
    p.emit({ shape: 'blast', glow: false, x: x + rand(-r, r) * 0.2, y: y + rand(-r, r) * 0.15, vx: rand(-r, r) * 0.9, vy: rand(-r * 1.1, -r * 0.2), drag: 0.08, life: rand(0.45, 0.8), size: r * 0.45, size2: r * 0.95, color: tint, alpha: 0.95, fadeIn: 0.03, spin: rand(-1, 1) });
  }
  p.burst(10, { shape: 'spark', x, y, life: 0.5, size: 12, size2: 3, stretch: 0.06, color: 0xfff1b8, color2: 0xff5a2a, drag: 0.05 }, [250, 600]);
  fx.later(0.15, () => clouds(fx, x, y - r * 0.2, r, 6, 0x4a4a4a, { shape: 'soot', rise: 60, alpha: 0.55 }));
}

/** A rune circle on the ground, turning and fading. */
function rune(fx: FxLayer, x: number, y: number, r: number, color: number, life = 0.8, spin = 1.5): void {
  fx.particles.emit({ shape: 'magic', x, y, life, size: r * 1.7, size2: r * 2.1, color, alpha: 0.85, spin, rotation: 0, fadeIn: 0.15 });
}

/** Flames licking up from round (x, y). */
function flamesUp(fx: FxLayer, x: number, y: number, r: number, n: number, color = 0xffd08a, color2 = 0xff3a10): void {
  for (let i = 0; i < n; i++) {
    fx.particles.emit({ shape: 'flame', x: x + rand(-r, r), y: y + rand(-r * 0.3, r * 0.3), vy: rand(-170, -70), drag: 0.4, life: rand(0.4, 0.8), size: rand(r * 0.45, r * 0.7), size2: r * 0.15, color, color2, rotation: 0, alpha: 0.95 });
  }
}

/** A blade's crescent swoosh, bulging toward `angle`. */
function swoosh(fx: FxLayer, x: number, y: number, angle: number, size: number, color: number, color2 = color): void {
  fx.particles.emit({ shape: 'slash', x, y, life: 0.26, size, size2: size * 1.2, color, color2, rotation: angle, fadeIn: 0.04 });
}

/** A starburst of impact light. */
function impact(fx: FxLayer, x: number, y: number, size: number, color: number): void {
  fx.particles.emit({ shape: 'muzzle', x, y, life: 0.24, size, size2: size * 2, color, rotation: rand(0, 6), fadeIn: 0.03 });
}
