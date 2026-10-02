import { Graphics } from 'pixi.js';
import type { MapData } from '../../shared/map/mapData';
import { shapeContains } from '../../shared/map/shapes';
import type { EntitySnap } from '../../shared/protocol';

// The river, alive: streaks of current drifting toward the Deep in the middle of the map, foam lapping
// at the banks, and rings spreading out behind anything wading through. One Graphics, redrawn each frame
// with only what's near the screen.

/** What the camera sees: its center and how wide and tall (world units). */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Within `pad` of the view. */
export function inView(view: ViewRect | undefined, x: number, y: number, pad = 100): boolean {
  return !view || (Math.abs(x - view.x) < view.w / 2 + pad && Math.abs(y - view.y) < view.h / 2 + pad);
}

interface Streak {
  x: number;
  y: number;
  len: number;
  speed: number;
  age: number;
  life: number;
  phase: number;
}

interface Foam {
  x: number;
  y: number;
  /** Which way is the bank: -1 left, 1 right. */
  side: number;
  phase: number;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  age: number;
}

const STREAKS = 140;
/** Each streak checks it's still in the river every this many frames. */
const CHECK_EVERY = 8;
/** Seconds between rings behind a wading unit. */
const RIPPLE_GAP = 0.28;
const RIPPLE_LIFE = 1;

export class Water {
  readonly container = new Graphics();
  private readonly streaks: Streak[] = [];
  private readonly foam: Foam[] = [];
  private ripples: Ripple[] = [];
  private readonly waders = new Map<number, { x: number; y: number; next: number }>();
  private clock = 0;
  private checkAt = 0;

  constructor(private readonly map: MapData) {
    for (let i = 0; i < STREAKS; i++) {
      const s = this.spawn();
      s.age = Math.random() * s.life;
      this.streaks.push(s);
    }
    // Foam: points just inside the water with dry land a little to one side.
    for (let i = 0; i < 60000 && this.foam.length < 420; i++) {
      const x = Math.random() * map.width;
      const y = Math.random() * map.height;
      if (!this.inRiver(x, y)) continue;
      const left = !this.inRiver(x - 40, y);
      const right = !this.inRiver(x + 40, y);
      if (left === right) continue;
      this.foam.push({ x, y, side: left ? -1 : 1, phase: Math.random() * 10 });
    }
  }

  inRiver(x: number, y: number): boolean {
    return this.map.ground.some((p) => p.style === 'river' && shapeContains(p.shape, x, y));
  }

  update(dt: number, ents: Iterable<EntitySnap>, view?: ViewRect): void {
    this.clock += dt;
    const g = this.container.clear();
    const mid = this.map.height / 2;
    // Whether a streak has drifted out of the river is checked a few at a time, not all of them every frame.
    this.checkAt = (this.checkAt + 1) % CHECK_EVERY;

    // Current: everything drifts toward the middle, where the river pours into the Deep.
    for (let i = 0; i < this.streaks.length; i++) {
      let s = this.streaks[i];
      s.age += dt;
      s.y += Math.sign(mid - s.y) * s.speed * dt;
      s.x += Math.sin(this.clock * 0.8 + s.phase) * 6 * dt;
      if (s.age >= s.life || (i % CHECK_EVERY === this.checkAt && !this.inRiver(s.x, s.y))) s = this.streaks[i] = this.spawn();
      if (!inView(view, s.x, s.y)) continue;
      const fade = Math.sin((s.age / s.life) * Math.PI);
      const dir = Math.sign(mid - s.y) || 1;
      const bend = Math.sin(this.clock * 2 + s.phase) * 4;
      g.moveTo(s.x, s.y - (dir * s.len) / 2)
        .quadraticCurveTo(s.x + bend, s.y, s.x, s.y + (dir * s.len) / 2)
        .stroke({ width: 3, color: 0xcdeffa, alpha: 0.22 * fade, cap: 'round' });
    }

    // Foam lapping at the banks.
    for (const f of this.foam) {
      if (!inView(view, f.x, f.y)) continue;
      const lap = Math.sin(this.clock * 1.6 + f.phase);
      const x = f.x + f.side * lap * 5;
      g.ellipse(x, f.y, 12 + lap * 3, 6).fill({ color: 0xffffff, alpha: 0.16 + 0.14 * (lap + 1) * 0.5 });
    }

    // Rings behind anything wading.
    const seen = new Set<number>();
    for (const e of ents) {
      if (e.dead || (e.k !== 'champion' && e.k !== 'chud' && e.k !== 'monster' && e.k !== 'guard')) continue;
      if (!inView(view, e.x, e.y, 300) || !this.inRiver(e.x, e.y)) continue;
      seen.add(e.id);
      const w = this.waders.get(e.id);
      if (!w) {
        // Just stepped in: a splash.
        this.ripples.push({ x: e.x, y: e.y, r: e.r * 1.3, age: 0 });
        this.waders.set(e.id, { x: e.x, y: e.y, next: this.clock + RIPPLE_GAP });
        continue;
      }
      const moved = Math.hypot(e.x - w.x, e.y - w.y);
      w.x = e.x;
      w.y = e.y;
      if (this.clock >= w.next && moved > 0.5) {
        this.ripples.push({ x: e.x, y: e.y, r: e.r, age: 0 });
        w.next = this.clock + RIPPLE_GAP;
      }
    }
    for (const id of this.waders.keys()) if (!seen.has(id)) this.waders.delete(id);
    this.ripples = this.ripples.filter((r) => (r.age += dt) < RIPPLE_LIFE);
    for (const r of this.ripples) {
      const t = r.age / RIPPLE_LIFE;
      const rr = r.r * (0.7 + 1.5 * t);
      g.ellipse(r.x, r.y + r.r * 0.3, rr, rr * 0.55).stroke({ width: 3 * (1 - t) + 1, color: 0xe6f8ff, alpha: 0.55 * (1 - t) });
    }
  }

  private spawn(): Streak {
    for (let tries = 0; tries < 30; tries++) {
      const x = Math.random() * this.map.width;
      const y = Math.random() * this.map.height;
      if (this.inRiver(x, y)) return { x, y, len: 20 + Math.random() * 40, speed: 40 + Math.random() * 50, age: 0, life: 2 + Math.random() * 3, phase: Math.random() * 10 };
    }
    return { x: -9999, y: -9999, len: 0, speed: 0, age: 0, life: 1, phase: 0 };
  }
}
