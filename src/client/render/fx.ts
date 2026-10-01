import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { DamageType } from '../../shared/protocol';
import type { Light } from './lighting';
import { Particles, mix } from './particles';

interface Effect {
  obj: Container;
  age: number;
  life: number;
  /** t runs 0→1 over the effect's life. */
  tick(t: number): void;
}

export const DAMAGE_COLORS: Record<DamageType, number> = {
  physical: 0xff9b3d,
  magic: 0xb57bff,
  true: 0xffffff,
};

const FONT = "'Lilita One', 'Nunito', system-ui, sans-serif";

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
/** 0→1 over the first `inShare` of t, 1 in the middle, 1→0 over the last `outShare`. */
const envelope = (t: number, inShare: number, outShare: number) => (t < inShare ? t / inShare : t > 1 - outShare ? (1 - t) / outShare : 1);

type Layer = 'under' | 'mid' | 'top';

/**
 * Short-lived cosmetic effects. Nothing here feeds back into the game. The building blocks live here
 * (rings, rune circles, slashes, light, cracks, lightning, particles); spells.ts puts them together.
 */
export class FxLayer {
  /** Above units: flashes, particles, numbers. */
  readonly container = new Container();
  /** On the ground under units: rune circles, cracks, warning areas. */
  readonly under = new Container();
  readonly particles = new Particles();
  private readonly mid = new Container();
  /** Numbers and labels: kept out of the bloom pass so they stay crisp. */
  readonly top = new Container();
  private effects: Effect[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private glows: { light: Light; strength: number; age: number; life: number }[] = [];
  /** Marks left on the ground, oldest first; only so many at once. */
  private scars: Effect[] = [];
  private clock = 0;
  /** This frame's step, for effects that spray particles while they last. */
  dt = 0;
  /** How many of those to spray (thinned out on low graphics). */
  density = 1;

  constructor() {
    this.container.addChild(this.mid, this.particles.container, this.top);
  }

  update(dt: number): void {
    this.dt = dt;
    this.clock += dt;
    if (this.timers.length) {
      const due = this.timers.filter((t) => t.at <= this.clock);
      this.timers = this.timers.filter((t) => t.at > this.clock);
      for (const t of due) t.fn();
    }
    for (const e of this.effects) {
      e.age += dt;
      e.tick(Math.min(1, e.age / e.life));
    }
    const done = this.effects.filter((e) => e.age >= e.life);
    if (done.length) {
      for (const e of done) e.obj.destroy({ children: true });
      this.effects = this.effects.filter((e) => e.age < e.life);
    }
    this.particles.update(dt);
    for (const l of this.glows) {
      l.age += dt;
      l.light.alpha = l.strength * (1 - l.age / l.life);
    }
    this.glows = this.glows.filter((l) => l.age < l.life);
  }

  /** Light an effect throws on the ground around it, fading out over `life` (see lighting.ts). */
  light(x: number, y: number, r: number, color: number, life: number, strength = 0.6): void {
    this.glows.push({ light: { x, y, r, color, alpha: strength }, strength, age: 0, life });
  }

  /** The lights effects are casting right now. */
  get lights(): Light[] {
    return this.glows.map((l) => l.light);
  }

  /** Run something a moment from now (staggered rings, a splash when a lob lands). */
  later(seconds: number, fn: () => void): void {
    this.timers.push({ at: this.clock + seconds, fn });
  }

  /** How many to spray this frame for something emitting `perSecond`. */
  rate(perSecond: number): number {
    const n = perSecond * this.dt * this.density;
    return Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
  }

  // ─── Numbers and markers ────────────────────────────────────────────────

  damageNumber(x: number, y: number, amount: number, type: DamageType): void {
    // Bigger hits get bigger numbers that slam in and shudder.
    const weight = Math.min(1, amount / 300);
    const heavy = amount >= 150;
    const txt = new Text({ text: heavy ? `${amount}!` : String(amount), style: { fontFamily: FONT, fontSize: 22 + 20 * weight, fill: DAMAGE_COLORS[type], stroke: { color: 0x000000, width: 5 + 2 * weight } } });
    txt.anchor.set(0.5);
    const drift = (Math.random() - 0.5) * 36;
    const life = 0.9 + 0.4 * weight;
    this.add(txt, life, (t) => {
      const jitter = heavy && t < 0.15 ? (Math.random() - 0.5) * 8 : 0;
      txt.position.set(x + drift * t + jitter, y - 30 - t * 55 + jitter);
      const pop = heavy ? 1.8 : 1.4;
      txt.scale.set(t < 0.1 ? pop - (t / 0.1) * (pop - 1) : 1);
      txt.alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
    }, 'top');
  }

  /** An ultimate's name punching up over whoever cast it. */
  callout(x: number, y: number, text: string, color: number): void {
    const txt = new Text({ text, style: { fontFamily: FONT, fontSize: 36, fill: 0xffffff, stroke: { color, width: 8 }, letterSpacing: 2, dropShadow: { color: 0x000000, alpha: 0.6, blur: 4, distance: 4, angle: Math.PI / 2 } } });
    txt.anchor.set(0.5);
    this.add(txt, 1.5, (t) => {
      const jitter = t < 0.12 ? (Math.random() - 0.5) * 10 : 0;
      txt.position.set(x + jitter, y - 20 - t * 40 + jitter);
      txt.scale.set(t < 0.1 ? 2.2 - (t / 0.1) * 1.2 : 1 + Math.max(0, 0.05 - (t - 0.1) * 0.2));
      txt.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    }, 'top');
  }

  /**
   * A mark left on the ground that lasts a while: scorched earth, cracks, goo, or a faint royal seal.
   * Drawn once and slowly faded; the oldest go first if there are too many.
   */
  scar(x: number, y: number, r: number, kind: 'scorch' | 'crack' | 'goo' | 'seal', color = 0x000000, life = 16): void {
    const g = new Graphics();
    switch (kind) {
      case 'scorch':
        for (let i = 0; i < 9; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * r * 0.45;
          g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.35 + Math.random() * 0.3)).fill({ color: 0x0c0806, alpha: 0.16 });
        }
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * r * 0.7;
          g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, 2 + Math.random() * 2.5).fill({ color: 0xff7a2f, alpha: 0.5 });
        }
        break;
      case 'crack': {
        const count = 6 + Math.round(r / 60);
        for (let i = 0; i < count; i++) {
          let a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
          let d = r * 0.1;
          g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
          while (d < r * (0.6 + Math.random() * 0.35)) {
            a += (Math.random() - 0.5) * 0.7;
            d += r * (0.1 + Math.random() * 0.12);
            g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
          }
        }
        g.stroke({ width: 6, color: 0x120c08, alpha: 0.6, join: 'round', cap: 'round' });
        if (color !== 0x000000) {
          g.circle(x, y, r * 0.3).fill({ color, alpha: 0.08 });
        }
        g.circle(x, y, r * 0.18).fill({ color: 0x120c08, alpha: 0.35 });
        break;
      }
      case 'goo':
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.random() * r * 0.6;
          const s = r * (0.15 + Math.random() * 0.22);
          g.circle(x + Math.cos(a) * d, y + Math.sin(a) * d, s).fill({ color: color === 0x000000 ? 0x4f7a2a : color, alpha: 0.42 });
          g.circle(x + Math.cos(a) * d - s * 0.3, y + Math.sin(a) * d - s * 0.3, s * 0.25).fill({ color: 0xc9f59a, alpha: 0.35 });
        }
        break;
      case 'seal':
        g.circle(x, y, r).stroke({ width: 3, color, alpha: 0.35 });
        g.circle(x, y, r * 0.8).stroke({ width: 1.5, color, alpha: 0.25 });
        for (let i = 0; i < 6; i++) {
          const p = (k: number) => [x + Math.cos((k / 6) * Math.PI * 2) * r * 0.78, y + Math.sin((k / 6) * Math.PI * 2) * r * 0.78] as const;
          g.moveTo(...p(i)).lineTo(...p(i + 2));
        }
        g.stroke({ width: 1.5, color, alpha: 0.22 });
        break;
    }
    this.add(g, life, (t) => (g.alpha = t < 0.7 ? 1 : (1 - t) / 0.3), 'under');
    this.scars.push(this.effects[this.effects.length - 1]);
    this.scars = this.scars.filter((s) => s.age < s.life);
    if (this.scars.length > 36) this.scars.shift()!.age = Infinity;
  }

  healNumber(x: number, y: number, amount: number): void {
    const txt = new Text({ text: `+${amount}`, style: { fontFamily: FONT, fontSize: 22, fill: 0x4ade80, stroke: { color: 0x000000, width: 5 } } });
    txt.anchor.set(0.5);
    this.add(txt, 0.9, (t) => {
      txt.position.set(x, y - 20 - t * 45);
      txt.alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
    }, 'top');
    for (let i = 0; i < 6; i++) {
      this.particles.emit({ shape: 'mote', x: x + (Math.random() - 0.5) * 50, y: y + 20 + Math.random() * 30, vy: -50 - Math.random() * 40, life: 0.8, size: 8, size2: 3, color: 0x7cf29a });
    }
  }

  /** Gold you just earned, floating off whatever paid it. */
  goldNumber(x: number, y: number, amount: number): void {
    const txt = new Text({ text: `+${amount}g`, style: { fontFamily: FONT, fontSize: 20, fill: 0xffd166, stroke: { color: 0x000000, width: 5 } } });
    txt.anchor.set(0.5);
    this.add(txt, 1.1, (t) => {
      txt.position.set(x, y - 10 - t * 40);
      txt.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    }, 'top');
    this.particles.burst(4, { shape: 'star', x, y, life: 0.5, size: 14, size2: 2, color: 0xffe29a, drag: 0.1, spin: 4 }, [40, 90]);
  }

  /** A pillar of golden light, a rune circle and a "LEVEL n" banner over your champion. */
  levelUp(x: number, y: number, r: number, level: number): void {
    this.pillar(x, y, r * 1.1, 0xffd166, 1.1);
    this.sigil(x, y, r * 2.2, 0xffd166, 1.1, 1.2);
    this.shockwave(x, y, r * 3, 0xffd166, 0.6);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * r * 1.4;
      this.particles.emit({ shape: i % 3 ? 'mote' : 'star', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6, vy: -90 - Math.random() * 120, drag: 0.4, life: 1 + Math.random() * 0.5, size: 10, size2: 2, color: 0xfff1b8, color2: 0xffb030, spin: 3 });
    }
    const txt = new Text({ text: `LEVEL ${level}`, style: { fontFamily: FONT, fontSize: 24, fill: 0xffe29a, stroke: { color: 0x000000, width: 6 }, letterSpacing: 2 } });
    txt.anchor.set(0.5);
    this.add(txt, 1.4, (t) => {
      txt.position.set(x, y - r - 40 - t * 30);
      txt.scale.set(t < 0.15 ? 0.6 + (t / 0.15) * 0.4 : 1);
      txt.alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    }, 'top');
  }

  /** A teammate's ping: a marker drops in with rings pulsing under it and who pinged above it. */
  ping(x: number, y: number, color: number, glyph: string, label: string): void {
    const c = new Container();
    const g = new Graphics();
    const mark = new Text({ text: glyph, style: { fontFamily: FONT, fontSize: 28, fill: 0xffffff, stroke: { color: 0x000000, width: 5 } } });
    const name = new Text({ text: label, style: { fontFamily: FONT, fontSize: 17, fill: color, stroke: { color: 0x000000, width: 5 } } });
    mark.anchor.set(0.5);
    name.anchor.set(0.5);
    c.addChild(g, mark, name);
    this.light(x, y, 260, color, 3, 0.55);
    this.add(c, 3, (t) => {
      const drop = t < 0.1 ? (1 - t / 0.1) * 70 : Math.abs(Math.sin(t * 30)) * 6 * Math.max(0, 1 - t * 4);
      const top = y - 46 - drop;
      g.clear();
      for (const k of [0, 0.33, 0.66]) {
        const p = (t * 3 + k) % 1;
        g.ellipse(x, y, 20 + p * 90, (20 + p * 90) * 0.6).stroke({ width: 4, color, alpha: (1 - p) * 0.9 });
      }
      g.moveTo(x, y).lineTo(x, top + 16).stroke({ width: 4, color: 0x000000, alpha: 0.6 });
      g.moveTo(x, y).lineTo(x, top + 16).stroke({ width: 2, color });
      g.circle(x, top, 20).fill(color).stroke({ width: 3, color: 0x000000 });
      mark.position.set(x, top);
      name.position.set(x, top - 36);
      c.alpha = t > 0.8 ? (1 - t) / 0.2 : 1;
    }, 'top');
  }

  clickMarker(x: number, y: number, attack: boolean): void {
    const g = new Graphics();
    const color = attack ? 0xff5a5f : 0x7cf29a;
    this.add(g, 0.35, (t) => {
      g.clear().circle(x, y, 8 + 26 * (1 - t)).stroke({ width: 3, color, alpha: 1 - t });
    }, 'under');
  }

  // ─── Hits and deaths ────────────────────────────────────────────────────

  /** Sparks flying off whatever just got hit, in the damage type's color. */
  impact(x: number, y: number, r: number, type: DamageType, heavy: boolean): void {
    const color = DAMAGE_COLORS[type];
    this.flash(x, y, r * (heavy ? 2.2 : 1.5), color, heavy ? 0.3 : 0.2, heavy ? 0.7 : 0.45);
    this.particles.burst(heavy ? 12 : 6, { shape: 'spark', x, y, life: heavy ? 0.35 : 0.25, size: 10, size2: 4, stretch: 0.06, drag: 0.02, color: 0xffffff, color2: color }, [180, heavy ? 520 : 340]);
    if (type === 'magic') this.particles.burst(heavy ? 6 : 3, { shape: 'star', x, y, life: 0.4, size: 16, size2: 2, color: 0xe4d6ff, color2: color, drag: 0.05, spin: 6 }, [60, 160]);
  }

  /** A puff of dust and chunks where something died; champions and monsters also give up a rising soul. */
  death(x: number, y: number, r: number, soul: boolean): void {
    this.particles.burst(8, { shape: 'smoke', glow: false, x, y, life: 0.7, size: r * 0.8, size2: r * 1.8, color: 0xd8cfc0, alpha: 0.4, drag: 0.08 }, [30, 90]);
    this.particles.burst(8, { shape: 'shard', glow: false, x, y, life: 0.6, size: 9, size2: 4, color: 0x6b5a42, drag: 0.1, spin: 8 }, [80, 200]);
    if (!soul) return;
    this.pillar(x, y, r * 0.8, 0xbfe9ff, 1.2);
    for (let i = 0; i < 18; i++) {
      this.particles.emit({ shape: 'glow', x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r * 0.5, vx: (Math.random() - 0.5) * 30, vy: -60 - Math.random() * 90, drag: 0.6, life: 1.2 + Math.random() * 0.6, size: 18, size2: 4, color: 0xe6f7ff, color2: 0x7cc4ff, alpha: 0.8, fadeIn: 0.25 });
    }
  }

  // ─── Building blocks ────────────────────────────────────────────────────

  /** A soft round flash of light. */
  flash(x: number, y: number, r: number, color: number, life = 0.3, alpha = 0.8): void {
    this.light(x, y, r * 4, color, life * 1.6, alpha * 0.7);
    this.particles.emit({ shape: 'glow', x, y, life, size: r * 2.6, size2: r * 3.4, color, alpha, fadeIn: 0.05 });
  }

  /** A ring that sweeps out to `radius`. */
  shockwave(x: number, y: number, radius: number, color: number, life = 0.4): void {
    this.light(x, y, radius * 1.2, color, life, 0.35);
    const g = new Graphics();
    g.blendMode = 'add';
    this.add(g, life, (t) => {
      const k = easeOut(t);
      g.clear()
        .circle(x, y, radius * (0.25 + 0.75 * k))
        .fill({ color, alpha: 0.1 * (1 - t) })
        .stroke({ width: 10 * (1 - t) + 2, color, alpha: 1 - t })
        .circle(x, y, radius * (0.25 + 0.75 * k) - 6)
        .stroke({ width: 3 * (1 - t) + 1, color: 0xffffff, alpha: 0.6 * (1 - t) });
    });
  }

  /** A thin bright ring popping outward. */
  burst(x: number, y: number, color: number, radius = 90): void {
    const g = new Graphics();
    g.blendMode = 'add';
    this.add(g, 0.4, (t) => {
      g.clear().circle(x, y, 20 + (radius - 20) * easeOut(t)).stroke({ width: 6 * (1 - t) + 1, color, alpha: 1 - t });
    });
  }

  /** A circle of runes turning on the ground: summonings, marks, casts. */
  sigil(x: number, y: number, r: number, color: number, life: number, spin = 1): void {
    this.light(x, y, r * 1.6, color, life, 0.5);
    const g = new Graphics();
    g.blendMode = 'add';
    g.position.set(x, y);
    const marks = 8 + Math.round(r / 25);
    const light = mix(color, 0xffffff, 0.45);
    this.add(g, life, (t) => {
      const a = envelope(t, 0.15, 0.35);
      const rr = r * (0.65 + 0.35 * easeOut(Math.min(1, t / 0.2)));
      g.rotation = spin * t * life * 0.9;
      g.clear();
      g.circle(0, 0, rr).fill({ color, alpha: 0.1 * a }).stroke({ width: 3.5, color, alpha: 0.95 * a });
      g.circle(0, 0, rr * 0.8).stroke({ width: 1.5, color, alpha: 0.7 * a });
      // A six-pointed star inside
      const p = (i: number) => [Math.cos((i / 6) * Math.PI * 2) * rr * 0.78, Math.sin((i / 6) * Math.PI * 2) * rr * 0.78] as const;
      for (let i = 0; i < 6; i++) g.moveTo(...p(i)).lineTo(...p(i + 2));
      g.stroke({ width: 1.5, color, alpha: 0.5 * a });
      // Runes between the two rings
      const s = Math.max(4, rr * 0.055);
      for (let i = 0; i < marks; i++) {
        const ang = (i / marks) * Math.PI * 2;
        const gx = Math.cos(ang) * rr * 0.9;
        const gy = Math.sin(ang) * rr * 0.9;
        switch (i % 4) {
          case 0:
            g.moveTo(gx, gy - s).lineTo(gx, gy + s).moveTo(gx - s * 0.6, gy - s * 0.2).lineTo(gx + s * 0.6, gy - s * 0.2);
            break;
          case 1:
            g.poly([gx, gy - s, gx + s * 0.8, gy + s * 0.7, gx - s * 0.8, gy + s * 0.7]);
            break;
          case 2:
            g.circle(gx, gy, s * 0.55);
            break;
          default:
            g.poly([gx, gy - s, gx + s * 0.6, gy, gx, gy + s, gx - s * 0.6, gy]);
        }
      }
      g.stroke({ width: 2, color: light, alpha: 0.85 * a });
    }, 'under');
  }

  /** A crescent swipe: the blade sweeps across, bright on the leading edge, then fades. */
  slash(x: number, y: number, angle: number, radius: number, spread: number, color: number, life = 0.3): void {
    const g = new Graphics();
    g.blendMode = 'add';
    this.add(g, life, (t) => {
      const sweep = easeOut(Math.min(1, t / 0.4));
      const fade = 1 - Math.max(0, (t - 0.4) / 0.6);
      const a0 = angle - spread / 2;
      const a1 = a0 + spread * sweep;
      // A crescent band from the edge inward: thin at the tail, fat at the head.
      const band = (depth: number, edge: number) => {
        const outer: number[] = [];
        const inner: number[] = [];
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
          const k = i / steps;
          const a = a0 + (a1 - a0) * k;
          const thick = depth * (0.15 + 0.85 * k * k);
          outer.push(x + Math.cos(a) * radius * edge, y + Math.sin(a) * radius * edge);
          inner.unshift(x + Math.cos(a) * radius * (edge - thick), y + Math.sin(a) * radius * (edge - thick));
        }
        return [...outer, ...inner];
      };
      g.clear();
      g.poly(band(0.6, 1.06)).fill({ color, alpha: 0.22 * fade }); // soft glow around it
      g.poly(band(0.42, 1)).fill({ color, alpha: 0.6 * fade });
      g.poly(band(0.13, 1)).fill({ color: 0xffffff, alpha: 0.85 * fade }); // the hot edge
    });
  }

  /** A column of light rising from a spot (seen from above, it reaches up the screen). */
  pillar(x: number, y: number, r: number, color: number, life: number): void {
    this.light(x, y, r * 5, color, life, 0.7);
    const g = new Graphics();
    g.blendMode = 'add';
    this.add(g, life, (t) => {
      const a = envelope(t, 0.12, 0.6);
      const h = r * 5 * easeOut(Math.min(1, t / 0.2));
      g.clear();
      for (let i = 0; i < 4; i++) {
        const w = r * (1 - i * 0.22);
        g.roundRect(x - w, y - h, w * 2, h, w).fill({ color: i === 3 ? 0xffffff : color, alpha: 0.13 * a });
      }
      g.ellipse(x, y, r * 1.3, r * 0.55).fill({ color, alpha: 0.35 * a });
      g.ellipse(x, y, r * 0.7, r * 0.3).fill({ color: 0xffffff, alpha: 0.4 * a });
    });
  }

  /** Jagged cracks splitting the ground outward, glowing in `color`. */
  cracks(x: number, y: number, r: number, color: number, life = 1, count = 7): void {
    const lines = Array.from({ length: count }, (_, i) => {
      let a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const pts = [x + Math.cos(a) * r * 0.12, y + Math.sin(a) * r * 0.12];
      let d = r * 0.12;
      while (d < r * (0.7 + Math.random() * 0.3)) {
        a += (Math.random() - 0.5) * 0.7;
        d += r * (0.12 + Math.random() * 0.12);
        pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
      }
      return pts;
    });
    const dark = new Graphics();
    const glow = new Graphics();
    glow.blendMode = 'add';
    const draw = (g: Graphics, t: number, width: number, c: number, alpha: number) => {
      const grow = easeOut(Math.min(1, t / 0.15));
      g.clear();
      for (const pts of lines) {
        const n = Math.max(2, Math.ceil((pts.length / 2) * grow));
        g.moveTo(pts[0], pts[1]);
        for (let i = 1; i < n; i++) g.lineTo(pts[i * 2], pts[i * 2 + 1]);
      }
      g.stroke({ width, color: c, alpha, join: 'round', cap: 'round' });
    };
    this.add(dark, life, (t) => draw(dark, t, 7, 0x140e08, 0.7 * envelope(t, 0.05, 0.4)), 'under');
    this.add(glow, life, (t) => draw(glow, t, 3, color, 0.9 * envelope(t, 0.05, 0.7)), 'under');
  }

  /** A crackling bolt between two points, redrawn every frame so it flickers. */
  lightning(x: number, y: number, x2: number, y2: number, color: number, life = 0.2, width = 3): void {
    const g = new Graphics();
    g.blendMode = 'add';
    const len = Math.hypot(x2 - x, y2 - y);
    const nx = -(y2 - y) / (len || 1);
    const ny = (x2 - x) / (len || 1);
    const steps = Math.max(4, Math.round(len / 28));
    this.add(g, life, (t) => {
      g.clear().moveTo(x, y);
      for (let i = 1; i < steps; i++) {
        const k = i / steps;
        const off = (Math.random() - 0.5) * len * 0.12;
        g.lineTo(x + (x2 - x) * k + nx * off, y + (y2 - y) * k + ny * off);
      }
      g.lineTo(x2, y2);
      g.stroke({ width: width + 5, color, alpha: 0.35 * (1 - t) }).stroke({ width, color: 0xffffff, alpha: 0.95 * (1 - t) });
    });
  }

  /** A see-through glowing picture (an ability's icon) that grows, drifts and fades: spirits of a spell. */
  ghost(texture: Texture, x: number, y: number, o: { size: number; size2?: number; dx?: number; dy?: number; life: number; alpha?: number; tint?: number }): void {
    const s = new Sprite(texture);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    if (o.tint !== undefined) s.tint = o.tint;
    this.add(s, o.life, (t) => {
      const k = easeOut(t);
      s.position.set(x + (o.dx ?? 0) * k, y + (o.dy ?? 0) * k);
      s.scale.set((o.size + ((o.size2 ?? o.size) - o.size) * k) / texture.width);
      s.alpha = (o.alpha ?? 0.8) * envelope(t, 0.15, 0.5);
    });
  }

  /** The Warden's slam warning: a red circle that fills in over the wind-up. Get out before it's full. */
  telegraph(x: number, y: number, r: number, dur: number, color = 0xff3b30): void {
    const g = new Graphics();
    this.add(g, dur, (t) => {
      g.clear()
        .circle(x, y, r)
        .fill({ color, alpha: 0.12 })
        .stroke({ width: 3, color, alpha: 0.8 })
        .circle(x, y, r * t)
        .fill({ color, alpha: 0.22 });
    }, 'under');
  }

  /** Telegraph for a delayed shot: a line that tightens and brightens as it's about to fire. */
  aimLine(x: number, y: number, x2: number, y2: number, dur: number, friendly: boolean): void {
    const g = new Graphics();
    const color = friendly ? 0x7cc4ff : 0xff5a5f;
    this.add(g, dur, (t) => {
      g.clear()
        .moveTo(x, y)
        .lineTo(x2, y2)
        .stroke({ width: 26 * (1 - t) + 4, color, alpha: 0.12 + 0.35 * t });
    }, 'under');
  }

  /** A filled wedge that flashes and fades. (x2, y2) is the tip; spread is in degrees. */
  wedge(x: number, y: number, x2: number, y2: number, spreadDeg: number, color: number, life = 0.25): void {
    const g = new Graphics();
    g.blendMode = 'add';
    const a = Math.atan2(y2 - y, x2 - x);
    const range = Math.hypot(x2 - x, y2 - y);
    const half = ((spreadDeg / 2) * Math.PI) / 180;
    this.add(g, life, (t) => {
      g.clear()
        .moveTo(x, y)
        .arc(x, y, range * (0.7 + 0.3 * t), a - half, a + half)
        .closePath()
        .fill({ color, alpha: 0.4 * (1 - t) });
    });
  }

  /** A chain of links between two points, fading out. */
  chain(x: number, y: number, x2: number, y2: number, life: number): void {
    // Drawn along +x, then turned to point from (x, y) to (x2, y2).
    const g = new Graphics();
    const len = Math.hypot(x2 - x, y2 - y);
    const links = Math.max(2, Math.floor(len / 16));
    g.position.set(x, y);
    g.rotation = Math.atan2(y2 - y, x2 - x);
    this.add(g, Math.max(0.2, life), (t) => {
      g.clear();
      for (let i = 0; i < links; i++) {
        const lx = ((i + 0.5) / links) * len;
        if (i % 2 === 0) g.ellipse(lx, 0, 10, 5);
        else g.moveTo(lx - 7, 0).lineTo(lx + 7, 0);
      }
      g.stroke({ width: 3.5, color: 0x8a9099, alpha: 1 - t * 0.7 });
    });
  }

  /** Anything else that's just a Graphics redrawn over its life. */
  custom(life: number, draw: (g: Graphics, t: number) => void, layer: Layer = 'mid', glow = false): void {
    const g = new Graphics();
    if (glow) g.blendMode = 'add';
    this.add(g, life, (t) => draw(g.clear(), t), layer);
  }

  private add(obj: Container, life: number, tick: (t: number) => void, layer: Layer = 'mid'): void {
    tick(0);
    (layer === 'under' ? this.under : layer === 'top' ? this.top : this.mid).addChild(obj);
    this.effects.push({ obj, age: 0, life, tick });
  }
}
