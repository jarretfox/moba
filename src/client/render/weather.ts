import { ColorMatrixFilter, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { MapData } from '../../shared/map/mapData';
import { shapeContains } from '../../shared/map/shapes';
import type { Weather } from '../../shared/weather';
import { blob, inkOf, rng, shapeOutline } from './organic';
import { mix } from './particles';
import type { Wind } from './wind';

// The match's weather, drawn: rain streaking down the screen with splashes on the ground, a storm's
// lightning lighting everything up, or mist rolling slowly over the map. Snow drifts down, frosts the
// ground (not the river) and settles on the treetops, champions' breath puffs white and their feet sink
// in. An autumn wind turns the canopy orange, strews the ground with fallen leaves and blows more across
// the map. It also tints the sky.

interface Drop {
  x: number;
  y: number;
  speed: number;
  len: number;
}

interface Splash {
  x: number;
  y: number;
  age: number;
}

interface Bank {
  x: number;
  y: number;
  size: number;
  sprite: Sprite;
}

function softTexture(): Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

/** Rain falls at a slant: this much sideways per unit down. */
const SLANT = 0.22;

interface Flake {
  x: number;
  y: number;
  speed: number;
  size: number;
  phase: number;
}

interface Leaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  turn: number;
  size: number;
  color: number;
  age: number;
  life: number;
}

const LEAF_COLORS = [0xd9772b, 0xc4502a, 0xe8a83a, 0xa8462a, 0x8a5a2a];

/** One leaf, `size` long, pointing along `a`; `flat` squashes it as it tumbles. */
function leafPts(x: number, y: number, size: number, a: number, flat: number): number[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const pts: number[] = [];
  for (const [u, v] of [[-0.5, 0], [-0.2, -0.28], [0.2, -0.24], [0.5, 0], [0.2, 0.24], [-0.2, 0.28]]) {
    const px = u * size;
    const py = v * size * flat;
    pts.push(x + px * c - py * s, y + px * s + py * c);
  }
  return pts;
}

/** Frost on the ground: soft pale patches, and glints. Tiled over the map. */
function frostTexture(): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const random = rng(808);
  for (let i = 0; i < 70; i++) {
    const x = random() * size;
    const y = random() * size;
    const r = 10 + random() * 40;
    // Drawn three times over, wrapped, so the tile joins up seamlessly.
    for (const [ox, oy] of [[0, 0], [-size, 0], [size, 0], [0, -size], [0, size]]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, `rgba(240,246,255,${0.35 + random() * 0.3})`);
      g.addColorStop(1, 'rgba(240,246,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.4 + random() * 0.6})`;
    ctx.fillRect(Math.floor(random() * size), Math.floor(random() * size), 1 + Math.floor(random() * 2), 1);
  }
  return Texture.from(canvas);
}

export class WeatherView {
  /** In screen space, over everything: rain, snowfall and lightning. */
  readonly screen = new Container();
  /** On the map, above the trees: splashes, mist and blowing leaves. */
  readonly world = new Container();
  /** On the ground, under everything standing: frost, fallen leaves. */
  readonly ground = new Container();
  /** On the treetops (snow), added to the canopy layer. */
  readonly treetops = new Graphics();
  private turned: ColorMatrixFilter | null = null;
  private readonly snow = new Graphics();
  private flakes: Flake[] = [];
  private readonly leafLayer = new Graphics();
  private leaves: Leaf[] = [];
  private leafClock = 0;
  private readonly rain = new Graphics();
  private readonly flashLayer = new Graphics();
  private readonly splashes = new Graphics();
  private drops: Drop[] = [];
  private splashList: Splash[] = [];
  private readonly banks: Bank[] = [];
  private flash = 0;
  /** Thins the rain out on low graphics. */
  density = 1;
  private nextBolt = 6 + Math.random() * 8;
  /** Lightning just struck: the game plays the thunder (a moment later, it's far off). */
  onBolt: (() => void) | null = null;

  constructor(
    readonly kind: Weather,
    private readonly map: MapData,
  ) {
    this.screen.addChild(this.rain, this.snow, this.flashLayer);
    this.world.addChild(this.splashes, this.leafLayer);
    if (kind === 'snow') this.frost(map);
    if (kind === 'autumn') this.litter(map);
    if (kind === 'mist') {
      const tex = softTexture();
      for (let i = 0; i < 14; i++) {
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.tint = 0xd8dee8;
        sprite.alpha = 0.24 + (i % 3) * 0.05;
        const size = 900 + ((i * 337) % 900);
        this.banks.push({ x: ((i * 4637) % 100) / 100 * map.width, y: ((i * 7919) % 100) / 100 * map.height, size, sprite });
        this.world.addChild(sprite);
      }
    }
  }

  /** How strongly it's raining, 0–1. */
  get wetness(): number {
    return this.kind === 'storm' ? 1 : this.kind === 'rain' ? 0.6 : 0;
  }

  /** Turns the canopy orange and rust (autumn), or null. Made the first time it's asked for. */
  get canopyFilter(): ColorMatrixFilter | null {
    if (this.kind !== 'autumn') return null;
    if (!this.turned) {
      this.turned = new ColorMatrixFilter();
      this.turned.hue(-84, false);
      this.turned.saturate(0.7, true);
      this.turned.brightness(1.18, true);
    }
    return this.turned;
  }

  /** Snow on the ground: feet sink in and breath shows. */
  get snowy(): boolean {
    return this.kind === 'snow';
  }

  /** Snow settled on the treetops: a cap on the lit side of each crown, a few patches round it. */
  dustTrees(crowns: readonly { x: number; y: number; r: number; deep: boolean }[]): void {
    if (this.kind !== 'snow') return;
    const g = this.treetops.clear();
    for (const [i, t] of crowns.entries()) {
      const cap = blob(t.x - t.r * 0.18, t.y - t.r * 0.24, t.r * 0.42, t.r * 0.3, i, 0.38, t.deep ? 10 : 14);
      // A blue-grey shadow where it overhangs, then the snow.
      g.poly(cap.map((v, k) => v + (k % 2 ? 4 : 2))).fill({ color: 0x8a9cb4, alpha: 0.45 });
      g.poly(cap).fill({ color: 0xf2f6fb, alpha: 0.92 });
      if (!t.deep) g.poly(cap).stroke({ width: 1.5, color: inkOf(0xc8d4e2), alpha: 0.6 });
      for (let k = 0; k < (t.deep ? 1 : 3); k++) {
        const a = i * 1.3 + k * 2.2;
        g.poly(blob(t.x + Math.cos(a) * t.r * 0.42, t.y + Math.sin(a) * t.r * 0.36, t.r * 0.16, t.r * 0.12, i * 7 + k, 0.3, 8)).fill({ color: 0xe8eef6, alpha: 0.85 });
      }
    }
  }

  /** Frost over the map, but not on the river. */
  private frost(map: MapData): void {
    const sheet = new TilingSprite({ texture: frostTexture(), width: map.width + 2000, height: map.height + 2000 });
    sheet.position.set(-1000, -1000);
    sheet.tileScale.set(2);
    sheet.alpha = 0.7;
    const river = new Graphics();
    for (const p of map.ground) if (p.style === 'river') river.poly(shapeOutline(p.shape, 24)).fill(0xffffff);
    this.ground.addChild(sheet, river);
    sheet.setMask({ mask: river, inverse: true });
  }

  /** Fallen leaves strewn over the ground (not in the river). */
  private litter(map: MapData): void {
    const g = new Graphics();
    const random = rng(4242);
    const wet = (x: number, y: number) => map.ground.some((p) => p.style === 'river' && shapeContains(p.shape, x, y));
    for (let i = 0; i < 1400; i++) {
      const x = random() * map.width;
      const y = random() * map.height;
      if (wet(x, y)) continue;
      const color = LEAF_COLORS[Math.floor(random() * LEAF_COLORS.length)];
      g.poly(leafPts(x, y, 9 + random() * 7, random() * Math.PI * 2, 0.8 + random() * 0.2)).fill({ color, alpha: 0.75 });
    }
    this.ground.addChild(g);
  }

  /** The sky under this weather: darker and bluer in rain, paler in mist, lit up by lightning. */
  sky(color: number): number {
    let c = color;
    if (this.kind === 'rain') c = mix(c, 0x55607a, 0.22);
    if (this.kind === 'storm') c = mix(c, 0x3e4860, 0.35);
    if (this.kind === 'mist') c = mix(c, 0xb6bfcc, 0.18);
    // Snow light: bright and cool. Autumn: a warm amber haze.
    if (this.kind === 'snow') c = mix(c, 0xe6eef8, 0.3);
    if (this.kind === 'autumn') c = mix(c, 0xe8b27a, 0.14);
    return this.flash > 0 ? mix(c, 0xe8f0ff, Math.min(1, this.flash)) : c;
  }

  update(dt: number, w: number, h: number, cam: { x: number; y: number; zoom: number }, wind?: Wind): void {
    this.snowfall(dt, w, h, wind);
    this.blowLeaves(dt, w, h, cam, wind);
    // Rain: streaks in screen space, wrapping round as they fall.
    const want = Math.round(this.wetness * 420 * this.density * ((w * h) / (1280 * 720)));
    while (this.drops.length < want) this.drops.push({ x: Math.random() * (w + 200) - 100, y: Math.random() * h, speed: 1100 + Math.random() * 700, len: 18 + Math.random() * 22 });
    if (this.drops.length > want) this.drops.length = want;
    const g = this.rain.clear();
    for (const d of this.drops) {
      d.y += d.speed * dt;
      d.x += d.speed * SLANT * dt;
      if (d.y > h + 40) {
        d.y = -40 - Math.random() * 60;
        d.x = Math.random() * (w + 200) - 200;
      }
      g.moveTo(d.x, d.y).lineTo(d.x - d.len * SLANT, d.y - d.len);
    }
    if (this.drops.length) g.stroke({ width: 1.5, color: 0xcfe3f5, alpha: 0.32 });

    // Splashes where it lands, near the camera.
    const s = this.splashes.clear();
    if (this.wetness > 0) {
      const halfW = w / 2 / cam.zoom;
      const halfH = h / 2 / cam.zoom;
      const n = Math.floor(this.wetness * 70 * dt * 10) + (Math.random() < (this.wetness * 70 * dt * 10) % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) this.splashList.push({ x: cam.x + (Math.random() * 2 - 1) * halfW, y: cam.y + (Math.random() * 2 - 1) * halfH, age: 0 });
      this.splashList = this.splashList.filter((p) => (p.age += dt) < 0.35);
      for (const p of this.splashList) {
        const t = p.age / 0.35;
        s.ellipse(p.x, p.y, 4 + 10 * t, (4 + 10 * t) * 0.5).stroke({ width: 1.5, color: 0xdcecf8, alpha: 0.5 * (1 - t) });
      }
    }

    // Mist banks drift slowly and come back round the other side.
    for (const b of this.banks) {
      b.x += 14 * dt;
      b.y += 4 * dt;
      if (b.x - b.size > this.map.width + 400) b.x = -b.size - 400;
      if (b.y - b.size > this.map.height + 400) b.y = -b.size - 400;
      b.sprite.position.set(b.x, b.y);
      b.sprite.scale.set((b.size * 2) / 128, (b.size * 1.2) / 128);
    }

    // Storms: now and then, lightning.
    if (this.kind === 'storm') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flash = 1.1;
        this.nextBolt = 9 + Math.random() * 14;
        this.onBolt?.();
      }
    }
    // A flash flickers: bright, dim, bright again, then fades.
    this.flash = Math.max(0, this.flash - dt * 2.2);
    const f = this.flash > 0.75 || (this.flash > 0.35 && this.flash < 0.55) ? this.flash : this.flash * 0.3;
    this.flashLayer.clear();
    if (f > 0.02) this.flashLayer.rect(0, 0, w, h).fill({ color: 0xeef4ff, alpha: Math.min(0.35, f * 0.3) });
  }

  /** Snow: flakes of all sizes drifting down the screen, swaying, carried a little by the wind. */
  private snowfall(dt: number, w: number, h: number, wind?: Wind): void {
    if (this.kind !== 'snow') return;
    const want = Math.round(320 * this.density * ((w * h) / (1280 * 720)));
    while (this.flakes.length < want) this.flakes.push({ x: Math.random() * w, y: Math.random() * h, speed: 30 + Math.random() * 70, size: 1.2 + Math.random() * 2.6, phase: Math.random() * 10 });
    if (this.flakes.length > want) this.flakes.length = want;
    const drift = (wind?.at(0, 0) ?? 0) * 30;
    const g = this.snow.clear();
    for (const f of this.flakes) {
      f.phase += dt;
      // Bigger flakes are nearer: they fall faster.
      f.y += f.speed * (0.6 + f.size * 0.25) * dt;
      f.x += (Math.sin(f.phase * 1.4) * 18 + drift) * dt;
      if (f.y > h + 10) {
        f.y = -10;
        f.x = Math.random() * w;
      }
      if (f.x < -10) f.x += w + 20;
      if (f.x > w + 10) f.x -= w + 20;
      g.circle(f.x, f.y, f.size);
    }
    if (this.flakes.length) g.fill({ color: 0xffffff, alpha: 0.8 });
  }

  /** Autumn: leaves blown across the map near the camera, tumbling as they go. */
  private blowLeaves(dt: number, w: number, h: number, cam: { x: number; y: number; zoom: number }, wind?: Wind): void {
    if (this.kind !== 'autumn') return;
    const halfW = w / 2 / cam.zoom;
    const halfH = h / 2 / cam.zoom;
    const gust = wind?.gust() ?? 1;
    // More of them in a gust; they come in from the upwind (left) edge and anywhere over the view.
    this.leafClock += dt * 14 * this.density * gust;
    while (this.leafClock >= 1 && this.leaves.length < 90) {
      this.leafClock -= 1;
      const fromEdge = Math.random() < 0.6;
      this.leaves.push({
        x: fromEdge ? cam.x - halfW - 40 : cam.x + (Math.random() * 2 - 1) * halfW,
        y: cam.y + (Math.random() * 2 - 1) * halfH,
        vx: 160 + Math.random() * 120,
        vy: 20 + Math.random() * 40,
        spin: Math.random() * Math.PI * 2,
        turn: (Math.random() - 0.5) * 8,
        size: 10 + Math.random() * 8,
        color: LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)],
        age: 0,
        life: 4 + Math.random() * 3,
      });
    }
    if (this.leafClock > 1) this.leafClock = 1;
    const g = this.leafLayer.clear();
    this.leaves = this.leaves.filter((l) => (l.age += dt) < l.life);
    for (const l of this.leaves) {
      l.x += l.vx * gust * dt;
      l.y += (l.vy + Math.sin(l.age * 3 + l.spin) * 40) * dt;
      l.spin += l.turn * dt;
      const fade = Math.min(1, l.age * 3, (l.life - l.age) * 2);
      const pts = leafPts(l.x, l.y, l.size, l.spin, 0.25 + 0.75 * Math.abs(Math.cos(l.age * 4 + l.spin)));
      g.poly(pts).fill({ color: l.color, alpha: fade }).stroke({ width: 1.2, color: inkOf(l.color), alpha: fade });
    }
  }
}
