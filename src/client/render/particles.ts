import { Container, Particle, ParticleContainer, Rectangle, Texture } from 'pixi.js';
import { particleAtlas } from './art';

// A small particle engine for spell effects: thousands of tinted sprites cut from one sheet, moved on the
// CPU and drawn in two batches (glowing additive ones, and plain ones like smoke and dirt). The comic
// shapes are drawn here in the game's inked style: white inside, a gray rim, so whatever color they're
// tinted, the rim comes out a darker shade of it, like the ink lines on everything else. The textured ones
// (soft smoke, streaks, stars, flames, magic circles, slashes, explosions...) come from the particle atlas,
// free CC0 textures (dev/fxBake.ts), each with several variants picked at random; without the atlas they
// fall back to the nearest drawn shape.

/** The shapes drawn here. */
type Drawn = 'glow' | 'spark' | 'star' | 'smoke' | 'shard' | 'ring' | 'mote' | 'leaf' | 'splat' | 'pow' | 'puff';
/** The atlas's own shapes, and the drawn one each stands in for without it. */
const TEXTURED = {
  flame: 'glow',
  magic: 'ring',
  twirl: 'ring',
  slash: 'spark',
  claw: 'spark',
  circle: 'ring',
  flare: 'glow',
  scorch: 'splat',
  dirt: 'puff',
  muzzle: 'star',
  zap: 'spark',
  heart: 'star',
  cloud: 'puff',
  soot: 'smoke',
  blast: 'glow',
  flash: 'glow',
} as const satisfies Record<string, Drawn>;
export type Shape = Drawn | keyof typeof TEXTURED;

const SHAPES: Drawn[] = ['glow', 'spark', 'star', 'smoke', 'shard', 'ring', 'mote', 'leaf', 'splat', 'pow', 'puff'];
/** Drawn shapes the atlas has better versions of. */
const UPGRADED: readonly Drawn[] = ['smoke', 'spark', 'star'];
const CELL = 64;

/** A shape's textures (variants) and how big to draw them for their size. */
interface Look {
  textures: Texture[];
  scale: number;
}

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
  /** Its texture's width, and the shape's draw scale. */
  w: number;
  k: number;
  e: Emit;
  vx: number;
  vy: number;
  age: number;
  rot: number;
}

/** One canvas holding every shape (the drawn ones in a row along the top, the atlas under them), white so they can be tinted. */
function buildSheet(): Record<Shape, Look> {
  const atlas = particleAtlas();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(CELL * SHAPES.length, atlas?.image.width ?? 0);
  canvas.height = CELL + (atlas?.image.height ?? 0);
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
        // A soft, lumpy puff with a brushy darker rim.
        lumps(ctx, cx, h, [[-7, -4, 15], [6, -6, 13], [2, 6, 16], [-5, 5, 12], [8, 4, 11]], 'rgba(150,150,150,0.55)', 'rgba(255,255,255,0.5)', 2.5);
        break;
      case 'shard':
        ink(ctx, () => {
          ctx.moveTo(cx, 6);
          ctx.lineTo(cx + 12, h - 2);
          ctx.lineTo(cx + 3, CELL - 6);
          ctx.lineTo(cx - 12, h + 3);
          ctx.closePath();
        });
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
        ink(ctx, () => {
          ctx.moveTo(cx - 22, h);
          ctx.quadraticCurveTo(cx, h - 16, cx + 22, h);
          ctx.quadraticCurveTo(cx, h + 16, cx - 22, h);
          ctx.closePath();
        });
        ctx.strokeStyle = 'rgb(140,140,140)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 18, h);
        ctx.quadraticCurveTo(cx, h - 3, cx + 20, h);
        ctx.stroke();
        break;
      case 'splat': {
        // A blot of ink, and drops flung off it.
        ink(ctx, () => {
          for (let k = 0; k <= 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            const rr = (k % 2 ? 12 : 17) + Math.sin(k * 2.3) * 3;
            if (k === 0) ctx.moveTo(cx + Math.cos(a) * rr, h + Math.sin(a) * rr);
            else ctx.lineTo(cx + Math.cos(a) * rr, h + Math.sin(a) * rr);
          }
          ctx.closePath();
        });
        for (const [dx, dy, r] of [[22, -12, 4], [-20, 15, 3.5], [16, 20, 3], [-23, -9, 2.5]]) ink(ctx, () => ctx.arc(cx + dx, h + dy, r, 0, Math.PI * 2), 1.5);
        break;
      }
      case 'pow':
        // A comic impact star: spiky, uneven.
        ink(ctx, () => {
          for (let k = 0; k <= 22; k++) {
            const a = (k / 22) * Math.PI * 2;
            const rr = k % 2 ? 13 : 24 + Math.sin(k * 1.7) * 5;
            if (k === 0) ctx.moveTo(cx + Math.cos(a) * rr, h + Math.sin(a) * rr);
            else ctx.lineTo(cx + Math.cos(a) * rr, h + Math.sin(a) * rr);
          }
          ctx.closePath();
        }, 3);
        break;
      case 'puff':
        // A crisp cartoon cloud.
        lumps(ctx, cx, h, [[-9, 2, 11], [0, -6, 13], [10, 1, 11], [2, 8, 10]], 'rgb(150,150,150)', '#fff', 3);
        break;
    }
    ctx.restore();
  });
  if (atlas) ctx.drawImage(atlas.image, 0, CELL);
  const source = Texture.from(canvas).source;
  const drawn = Object.fromEntries(SHAPES.map((s, i) => [s, { textures: [new Texture({ source, frame: new Rectangle(i * CELL, 0, CELL, CELL) })], scale: 1 }])) as Record<Drawn, Look>;
  const fromAtlas = (name: string): Look | null => {
    const s = atlas?.shapes[name];
    if (!atlas || !s?.cells.length) return null;
    const cols = Math.floor(atlas.image.width / atlas.cell);
    return { textures: s.cells.map((c) => new Texture({ source, frame: new Rectangle((c % cols) * atlas.cell, CELL + Math.floor(c / cols) * atlas.cell, atlas.cell, atlas.cell) })), scale: s.scale };
  };
  const sheet = { ...drawn } as Record<Shape, Look>;
  for (const s of UPGRADED) sheet[s] = fromAtlas(s) ?? drawn[s];
  for (const [s, stand] of Object.entries(TEXTURED) as [keyof typeof TEXTURED, Drawn][]) sheet[s] = fromAtlas(s) ?? drawn[stand];
  return sheet;
}

/** Fills a shape white with a gray rim (tinted, the rim is a darker shade of the color). */
function ink(ctx: CanvasRenderingContext2D, path: () => void, width = 2.5): void {
  ctx.beginPath();
  path();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = 'rgb(140,140,140)';
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/** Overlapping round lumps, rimmed as one shape. */
function lumps(ctx: CanvasRenderingContext2D, cx: number, cy: number, parts: readonly (readonly [number, number, number])[], rim: string, fill: string, width: number): void {
  ctx.fillStyle = rim;
  for (const [dx, dy, r] of parts) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r + width, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = fill;
  for (const [dx, dy, r] of parts) {
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Most particles alive at once by default; past this, new ones are skipped (cosmetic, so nothing breaks). */
const MAX = 3000;

export class Particles {
  /** Plain particles (smoke, dirt) go under the glowing ones. */
  readonly container = new Container();
  private readonly solid: ParticleContainer;
  private readonly glow: ParticleContainer;
  private readonly sheet = buildSheet();
  private live: Live[] = [];
  /** Most alive at once (lower on low graphics). */
  limit = MAX;
  /** Particles were added since the batches were last rebuilt. */
  private dirty = false;

  constructor() {
    const dynamicProperties = { position: true, rotation: true, vertex: true, color: true, uvs: false };
    this.solid = new ParticleContainer({ dynamicProperties, texture: this.sheet.glow.textures[0] });
    this.glow = new ParticleContainer({ dynamicProperties, texture: this.sheet.glow.textures[0] });
    this.glow.blendMode = 'add';
    // They move all over the map; skip bounds math and never cull them.
    for (const c of [this.solid, this.glow]) c.boundsArea = new Rectangle(-1e5, -1e5, 2e5, 2e5);
    this.container.addChild(this.solid, this.glow);
  }

  get count(): number {
    return this.live.length;
  }

  emit(e: Emit): void {
    if (this.live.length >= this.limit) return;
    const look = this.sheet[e.shape];
    const texture = look.textures[Math.floor(Math.random() * look.textures.length)];
    const p = new Particle({ texture, anchorX: 0.5, anchorY: 0.5, x: e.x, y: e.y });
    this.live.push({ p, w: texture.frame.width, k: look.scale, e, vx: e.vx ?? 0, vy: e.vy ?? 0, age: 0, rot: e.rotation ?? Math.random() * Math.PI * 2 });
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
    const size = (e.size + ((e.size2 ?? e.size) - e.size) * t) * l.k;
    const fadeIn = e.fadeIn ?? 0.1;
    const a = (e.alpha ?? 1) * (t < fadeIn ? t / fadeIn : 1 - (t - fadeIn) / (1 - fadeIn));
    const p = l.p;
    if (e.stretch) {
      const speed = Math.hypot(l.vx, l.vy);
      p.rotation = Math.atan2(l.vy, l.vx);
      p.scaleX = (size + speed * e.stretch) / l.w;
      p.scaleY = size / l.w;
    } else {
      p.rotation = l.rot;
      p.scaleX = p.scaleY = size / l.w;
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
