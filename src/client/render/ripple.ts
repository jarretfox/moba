import { DisplacementFilter, Sprite, Texture } from 'pixi.js';

// A shockwave that bends the picture: a ring of displacement sweeping out from a big impact, pushing
// everything under it outward for a moment. One at a time (the newest wins); it only costs anything
// while it's running.

const SIZE = 256;
/** Seconds the ripple takes to sweep out and fade. */
const LIFE = 0.55;

/** A ring of outward pushes, neutral (no push) everywhere else, including the edges. */
function ringTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  const h = SIZE / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (x + 0.5 - h) / h;
      const dy = (y + 0.5 - h) / h;
      const d = Math.hypot(dx, dy) || 1;
      const ring = d > 0.97 ? 0 : Math.exp(-(((d - 0.72) / 0.13) ** 2));
      const i = (y * SIZE + x) * 4;
      img.data[i] = 128 + 127 * (dx / d) * ring;
      img.data[i + 1] = 128 + 127 * (dy / d) * ring;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(canvas);
}

export class Ripple {
  /** The displacement map; lives on the stage (in screen space) but is never drawn itself. */
  readonly sprite: Sprite;
  readonly filter: DisplacementFilter;
  private t = 1;
  private x = 0;
  private y = 0;
  private radius = 0;
  private strength = 0;

  constructor() {
    this.sprite = new Sprite(ringTexture());
    this.sprite.anchor.set(0.5);
    this.sprite.renderable = false;
    this.filter = new DisplacementFilter({ sprite: this.sprite, scale: 0 });
  }

  get active(): boolean {
    return this.t < 1;
  }

  /** Starts a ripple at a screen position, sweeping out to \`radius\` screen pixels. */
  start(x: number, y: number, radius: number, strength = 1): void {
    this.t = 0;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.strength = strength;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.t = Math.min(1, this.t + dt / LIFE);
    const k = 1 - (1 - this.t) * (1 - this.t);
    this.sprite.position.set(this.x, this.y);
    this.sprite.scale.set((this.radius * 2 * (0.25 + 0.95 * k)) / SIZE);
    const s = 34 * this.strength * (1 - this.t);
    this.filter.scale.x = s;
    this.filter.scale.y = s;
  }
}
