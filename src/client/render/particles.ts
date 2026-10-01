import { Container, Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js';

// A small particle engine for spell effects: thousands of tinted sprites cut from one generated sheet,
// moved on the CPU and drawn in two batches (glowing additive ones, and plain ones like smoke and dirt).

export type Shape = 'glow' | 'spark' | 'star' | 'smoke' | 'shard' | 'ring' | 'mote' | 'leaf';

const SHAPES: Shape[] = ['glow', 'spark', 'star', 'smoke', 'shard', 'ring', 'mote', 'leaf'];
const CELL = 64;

export interface Emit {
  shape: Shape;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  /** Constant pull, e.g. negative `ay` to rise, positive to fall back down. */
  ax?: number;
  ay?: number;
  /** Share of velocity kept after one second (1 = none lost, 0.1 = slows hard). */
  drag?: number;
  life: number;
  /** Size in world units at birth and at death. */
  size: number;
  size2?: number;
  color: number;
  /** Color it fades to over its life. */
  color2?: number;
  alpha?: number;
  rotation?: number;
  spin?: number;
  /** Lie along the direction of travel and stretch with speed (sparks, streaks). */
  stretch?: number;
  /** Glowing (additive) or solid. Default glowing. */
  glow?: boolean;
  /** Share of life spent fading in. */
  fadeIn?: number;
}

interface Live {
  p: Particle;
  e: Emit;
  vx: number;
  vy: number;
  age: number;
  rot: number;
}

/** One canvas holding every shape, white so they can be tinted. */
function buildSheet(): Record<Shape, Texture> {
  const canvas = document.createElement('canvas');
  canvas.width = CELL * SHAPES.length;
  canvas.height = CELL;
  const ctx = canvas.getContext('2d')!;
  const h = CELL / 2;
  const soft = (cx: number, cy: number, r: number, stops: [number, number][]) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [at, a] of stops) g.addColorStop(at, `rgba(255,255,255,${a})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  SHAPES.forEach((shape, i) => {
    const cx = i * CELL + h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(i * CELL, 0, CELL, CELL);
    ctx.clip();
    switch (shape) {
      case 'glow':
        soft(cx, h, h, [[0, 1], [0.3, 0.7], [0.65, 0.25], [1, 0]]);
        break;
      case 'spark':
        ctx.translate(cx, h);
        ctx.scale(1, 0.16);
        soft(0, 0, h, [[0, 1], [0.5, 0.7], [1, 0]]);
        break;
      case 'star':
        soft(cx, h, h * 0.5, [[0, 1], [1, 0]]);
        ctx.translate(cx, h);
        for (const a of [0, Math.PI / 2]) {
          ctx.save();
          ctx.rotate(a);
          ctx.scale(1, 0.08);
          soft(0, 0, h, [[0, 1], [1, 0]]);
          ctx.restore();
        }
        break;
      case 'smoke':
        for (const [dx, dy, r] of [[-7, -4, 18], [6, -6, 16], [2, 6, 19], [-4, 4, 14], [8, 4, 13]]) soft(cx + dx, h + dy, r, [[0, 0.55], [0.6, 0.3], [1, 0]]);
        break;
      case 'shard':
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(cx, 6);
        ctx.lineTo(cx + 12, h);
        ctx.lineTo(cx, CELL - 6);
        ctx.lineTo(cx - 12, h);
        ctx.closePath();
        ctx.fill();
        break;
      case 'ring': {
        const g = ctx.createRadialGradient(cx, h, h * 0.55, cx, h, h);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(i * CELL, 0, CELL, CELL);
        break;
      }
      case 'mote':
        soft(cx, h, h * 0.45, [[0, 1], [0.55, 1], [1, 0]]);
        break;
      case 'leaf':
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(cx - 22, h);
        ctx.quadraticCurveTo(cx, h - 16, cx + 22, h);
        ctx.quadraticCurveTo(cx, h + 16, cx - 22, h);
        ctx.fill();
        break;
    }
    ctx.restore();
  });
  const source = Texture.from(canvas).source;
  return Object.fromEntries(SHAPES.map((s, i) => [s, new Texture({ source, frame: new Rectangle(i * CELL, 0, CELL, CELL) })])) as Record<Shape, Texture>;
}

/** Most particles alive at once; past this, new ones are skipped (cosmetic, so nothing breaks). */
const MAX = 3000;

export class Particles {
  /** Plain particles (smoke, dirt) go under the glowing ones. */
  readonly container = new Container();
  private readonly solid: ParticleContainer;
  private readonly glow: ParticleContainer;
  private readonly sheet = buildSheet();
  private live: Live[] = [];
  /** Particles were added since the batches were last rebuilt. */
  private dirty = false;

  constructor() {
    const dynamicProperties = { position: true, rotation: true, vertex: true, color: true, uvs: false };
    this.solid = new ParticleContainer({ dynamicProperties, texture: this.sheet.glow });
    this.glow = new ParticleContainer({ dynamicProperties, texture: this.sheet.glow });
    this.glow.blendMode = 'add';
    // They move all over the map; skip bounds math and never cull them.
    for (const c of [this.solid, this.glow]) c.boundsArea = new Rectangle(-1e5, -1e5, 2e5, 2e5);
    this.container.addChild(this.solid, this.glow);
  }

  get count(): number {
    return this.live.length;
  }

  emit(e: Emit): void {
    if (this.live.length >= MAX) return;
    const p = new Particle({ texture: this.sheet[e.shape], anchorX: 0.5, anchorY: 0.5, x: e.x, y: e.y });
    this.live.push({ p, e, vx: e.vx ?? 0, vy: e.vy ?? 0, age: 0, rot: e.rotation ?? Math.random() * Math.PI * 2 });
    this.place(this.live[this.live.length - 1], 0);
    (e.glow === false ? this.solid : this.glow).particleChildren.push(p);
    this.dirty = true;
  }

  /** `n` particles spraying out of a point: `speed` is [min, max], `spread` an angle range around `angle`. */
  burst(n: number, base: Emit, speed: [number, number], angle = 0, spread = Math.PI * 2): void {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const v = speed[0] + Math.random() * (speed[1] - speed[0]);
      this.emit({ ...base, vx: (base.vx ?? 0) + Math.cos(a) * v, vy: (base.vy ?? 0) + Math.sin(a) * v, life: base.life * (0.7 + Math.random() * 0.6) });
    }
  }

  update(dt: number): void {
    let removed = false;
    const next: Live[] = [];
    for (const l of this.live) {
      l.age += dt;
      if (l.age >= l.e.life) {
        removed = true;
        continue;
      }
      const keep = Math.pow(l.e.drag ?? 1, dt);
      l.vx = (l.vx + (l.e.ax ?? 0) * dt) * keep;
      l.vy = (l.vy + (l.e.ay ?? 0) * dt) * keep;
      l.p.x += l.vx * dt;
      l.p.y += l.vy * dt;
      l.rot += (l.e.spin ?? 0) * dt;
      this.place(l, l.age / l.e.life);
      next.push(l);
    }
    this.live = next;
    if (removed || this.dirty) {
      this.dirty = false;
      for (const c of [this.solid, this.glow]) c.particleChildren.length = 0;
      for (const l of this.live) (l.e.glow === false ? this.solid : this.glow).particleChildren.push(l.p);
      this.solid.update();
      this.glow.update();
    }
  }

  private place(l: Live, t: number): void {
    const e = l.e;
    const size = e.size + ((e.size2 ?? e.size) - e.size) * t;
    const fadeIn = e.fadeIn ?? 0.1;
    const a = (e.alpha ?? 1) * (t < fadeIn ? t / fadeIn : 1 - (t - fadeIn) / (1 - fadeIn));
    const p = l.p;
    if (e.stretch) {
      const speed = Math.hypot(l.vx, l.vy);
      p.rotation = Math.atan2(l.vy, l.vx);
      p.scaleX = (size + speed * e.stretch) / CELL;
      p.scaleY = size / CELL;
    } else {
      p.rotation = l.rot;
      p.scaleX = p.scaleY = size / CELL;
    }
    p.tint = e.color2 === undefined ? e.color : mix(e.color, e.color2, t);
    p.alpha = Math.max(0, a);
  }
}

/** Blends two colors: t = 0 gives `a`, 1 gives `b`. */
export function mix(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
