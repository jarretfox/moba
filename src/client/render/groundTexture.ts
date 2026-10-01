import { Sprite, Texture } from 'pixi.js';
import { fbm, type Pts } from './organic';

// The ground is painted once onto a canvas at a quarter of world size, then stretched over the map as a
// single sprite. Painting it this way gets the things vector shapes are bad at: edges that blur softly
// into each other, brush dabs that pick up the color under them, and fine grain, like a painted backdrop.
// The crisp, inked details (tufts, pebbles, cliffs) are drawn over it as vectors.

function css(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** A soft, tiling noise texture: what the wind uses to stir the leaves. */
export function noiseTexture(size = 128): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  // Waves at whole-number frequencies across the tile, so it repeats without a seam.
  const T = Math.PI * 2;
  const wave = (u: number, v: number, k: number) =>
    0.5 + 0.22 * Math.sin(T * (2 * u + v) + k) * Math.cos(T * 3 * v + k * 2) + 0.16 * Math.sin(T * (5 * u - 3 * v) + k * 3) + 0.1 * Math.cos(T * (7 * u + 4 * v) + k);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      img.data[i] = wave(x / size, y / size, 0.7) * 255;
      img.data[i + 1] = wave(y / size, x / size, 2.1) * 255;
      img.data[i + 2] = 128;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = Texture.from(canvas);
  tex.source.addressMode = 'repeat';
  return tex;
}

export class GroundCanvas {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pw: number;
  private readonly ph: number;
  private pixels: ImageData | null = null;

  /** Covers world (x0, y0)–(x0 + w, y0 + h) at `k` canvas pixels per world unit. */
  constructor(readonly x0: number, readonly y0: number, w: number, h: number, readonly k: number) {
    this.pw = Math.ceil(w * k);
    this.ph = Math.ceil(h * k);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.pw;
    this.canvas.height = this.ph;
    this.ctx = this.canvas.getContext('2d')!;
  }

  clear(color: number): void {
    this.ctx.fillStyle = css(color);
    this.ctx.fillRect(0, 0, this.pw, this.ph);
  }

  private trace(pts: Pts): void {
    const { ctx, x0, y0, k } = this;
    ctx.moveTo((pts[0] - x0) * k, (pts[1] - y0) * k);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo((pts[i] - x0) * k, (pts[i + 1] - y0) * k);
    ctx.closePath();
  }

  /**
   * Fills polygons in one pass, softened by `blur` world units. They're one path, so where they overlap
   * the color doesn't stack up (forty overlapping tree shadows are one shadow, not forty).
   */
  fill(polys: Pts[], color: number, alpha = 1, blur = 0): void {
    const { ctx } = this;
    ctx.save();
    ctx.filter = blur > 0 ? `blur(${(blur * this.k).toFixed(1)}px)` : 'none';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = css(color);
    ctx.beginPath();
    for (const p of polys) this.trace(p);
    ctx.fill('nonzero');
    ctx.restore();
    this.pixels = null;
  }

  /** The painted color at a world point (sampled from a snapshot taken on first use after painting). */
  colorAt(x: number, y: number): number {
    if (!this.pixels) this.pixels = this.ctx.getImageData(0, 0, this.pw, this.ph);
    const px = Math.max(0, Math.min(this.pw - 1, Math.floor((x - this.x0) * this.k)));
    const py = Math.max(0, Math.min(this.ph - 1, Math.floor((y - this.y0) * this.k)));
    const i = (py * this.pw + px) * 4;
    const d = this.pixels.data;
    return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
  }

  /** One brush dab: a stretched oval at an angle. Call `beginDabs` / `endDabs` round a run of these. */
  dab(x: number, y: number, rx: number, ry: number, angle: number, color: number, alpha: number): void {
    const { ctx, x0, y0, k } = this;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = css(color);
    ctx.beginPath();
    ctx.ellipse((x - x0) * k, (y - y0) * k, rx * k, ry * k, angle, 0, Math.PI * 2);
    ctx.fill();
  }

  beginDabs(): void {
    // Snapshot the colors first, so every dab samples the base paint rather than the dabs before it.
    if (!this.pixels) this.pixels = this.ctx.getImageData(0, 0, this.pw, this.ph);
    this.ctx.save();
  }

  endDabs(): void {
    this.ctx.restore();
    this.pixels = null;
  }

  /**
   * Big soft patches of light and dark, warm and cool, laid over everything (soft-light), so no two
   * stretches of the same ground are quite the same color.
   */
  mottle(strength: number, seed: number): void {
    const step = 10; // one mottle pixel per 10 canvas pixels; smoothing does the rest
    const mw = Math.ceil(this.pw / step);
    const mh = Math.ceil(this.ph / step);
    const small = document.createElement('canvas');
    small.width = mw;
    small.height = mh;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(mw, mh);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const wx = this.x0 + (x * step) / this.k;
        const wy = this.y0 + (y * step) / this.k;
        const light = (fbm(wx / 1100, wy / 1100, 4, seed) - 0.5) * 2;
        const warm = (fbm(wx / 2400 + 40, wy / 2400, 3, seed + 9) - 0.5) * 2;
        const g = 128 + light * 80 * strength;
        const i = (y * mw + x) * 4;
        img.data[i] = g + warm * 34 * strength;
        img.data[i + 1] = g + warm * 12 * strength;
        img.data[i + 2] = g - warm * 30 * strength;
        img.data[i + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(small, 0, 0, mw * step, mh * step);
    ctx.restore();
    this.pixels = null;
  }

  /** Fine speckle over everything, like the tooth of the paper: a tile of noise, overlaid. */
  grain(amount: number, seed: number): void {
    const size = 256;
    const tile = document.createElement('canvas');
    tile.width = size;
    tile.height = size;
    const tctx = tile.getContext('2d')!;
    const img = tctx.createImageData(size, size);
    let s = seed >>> 0 || 1;
    for (let i = 0; i < img.data.length; i += 4) {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      const v = 128 + ((s >>> 0) / 4294967296 - 0.5) * amount * 2;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(tile, 'repeat')!;
    ctx.fillRect(0, 0, this.pw, this.ph);
    ctx.restore();
    this.pixels = null;
  }

  /** The finished painting as a sprite laid over its patch of the world. */
  sprite(): Sprite {
    const sprite = new Sprite(Texture.from(this.canvas));
    sprite.position.set(this.x0, this.y0);
    sprite.scale.set(1 / this.k);
    return sprite;
  }
}
