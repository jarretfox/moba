import { ColorMatrixFilter, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { MapData } from '../../shared/map/mapData';
import { shapeContains } from '../../shared/map/shapes';
import type { Weather } from '../../shared/weather';
import { blob, inkOf, rng, shapeOutline } from './organic';
import { mix } from './particles';
import type { Wind } from './wind';

// The match's weather, drawn: rain streaking down the screen with splashes on the ground and puddles
// gathering, thunder and lightning now and then (often in a storm, with bolts that strike the ground), or
// mist rolling slowly over the map. Rain can clear up partway through: the sky brightens to a sunny day,
// a faint rainbow shows for a while, and the puddles glint in the sun as they slowly dry. Snow drifts down, frosts the
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

/** A jagged, forking bolt of lightning from (x0, y0) down to (x1, y1), as a list of points. */
function boltPoints(x0: number, y0: number, x1: number, y1: number): number[] {
  const pts = [x0, y0];
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    const jag = i === steps ? 0 : (Math.random() - 0.5) * 70 * Math.sin(u * Math.PI);
    pts.push(x0 + (x1 - x0) * u + jag, y0 + (y1 - y0) * u);
  }
  return pts;
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
  /** Lightning just struck: the game plays the thunder (a moment later, it's far off), and if it hit the ground in view, where. */
  onBolt: ((strike: { x: number; y: number } | null) => void) | null = null;
  /** The bolt being drawn across the sky: its points in screen space, and how long it has left. */
  private bolt: { pts: number[]; life: number } | null = null;
  /** The rain clearing: 0 raining, 1 a clear sky. */
  private clearing = 0;
  /** How dry it's got since it cleared, 0–1. */
  private dry = 0;
  private sunClock = 0;
  private readonly puddles = new Graphics();
  private readonly glints = new Graphics();
  private readonly rainbow = new Graphics();
  private puddleSpots: { x: number; y: number; rx: number; ry: number }[] = [];

  constructor(
    readonly kind: Weather,
    private readonly map: MapData,
  ) {
    this.screen.addChild(this.rainbow, this.rain, this.snow, this.flashLayer);
    this.world.addChild(this.splashes, this.leafLayer);
    if (kind === 'rain' || kind === 'storm') this.pools(map);
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

  /** How strongly it's raining, 0–1 (less as it clears). */
  get wetness(): number {
    return (this.kind === 'storm' ? 1 : this.kind === 'rain' ? 0.6 : 0) * (1 - this.clearing);
  }

  /** Whether the rain has cleared (or is clearing): the game hushes the rain's sound and the wind. */
  get cleared(): boolean {
    return this.clearing >= 1;
  }

  /** How far the rain has cleared, 0–1. */
  setClearing(k: number): void {
    this.clearing = Math.max(0, Math.min(1, k));
  }

  /** Puddles on the paths and the grass (not in the river), filling while it rains. */
  private pools(map: MapData): void {
    const random = rng(777);
    const river = (x: number, y: number) => map.ground.some((p) => p.style === 'river' && shapeContains(p.shape, x, y));
    const onGround = (x: number, y: number) => map.ground.some((p) => p.style !== 'river' && shapeContains(p.shape, x, y)) && !map.blockers.some((b) => shapeContains(b, x, y));
    for (let i = 0; i < 900 && this.puddleSpots.length < 170; i++) {
      const x = random() * map.width;
      const y = random() * map.height;
      if (river(x, y) || !onGround(x, y)) continue;
      const rx = 22 + random() * 46;
      this.puddleSpots.push({ x, y, rx, ry: rx * (0.32 + random() * 0.15) });
    }
    const g = this.puddles;
    for (const [i, p] of this.puddleSpots.entries()) {
      const shape = blob(p.x, p.y, p.rx, p.ry, i, 0.25, 14);
      g.poly(shape.map((v, k) => v + (k % 2 ? 2 : 0))).fill({ color: 0x1a2430, alpha: 0.35 });
      g.poly(shape).fill({ color: 0x55708a, alpha: 0.55 });
      // The sky in it: a pale streak along the far edge.
      g.moveTo(p.x - p.rx * 0.5, p.y - p.ry * 0.35).lineTo(p.x + p.rx * 0.3, p.y - p.ry * 0.5).stroke({ width: 2, color: 0xc8dcef, alpha: 0.5 });
    }
    g.alpha = 0;
    this.ground.addChild(g, this.glints);
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
    const wet = 1 - this.clearing;
    if (this.kind === 'rain') c = mix(c, 0x55607a, 0.22 * wet);
    if (this.kind === 'storm') c = mix(c, 0x3e4860, 0.35 * wet);
    // Cleared up: a bright, warm, freshly washed day.
    if (this.clearing > 0) c = mix(c, 0xfff2cf, 0.16 * this.clearing);
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

    // Thunderstorms: lightning now and then in the rain, often in a storm (and a storm's bolts sometimes
    // strike the ground in view). None once it starts to clear.
    if ((this.kind === 'storm' || this.kind === 'rain') && this.clearing < 0.3) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        const storm = this.kind === 'storm';
        this.flash = storm ? 1.1 : 0.75;
        this.nextBolt = storm ? 9 + Math.random() * 14 : 18 + Math.random() * 26;
        const strikes = storm && Math.random() < 0.45;
        const sx = w * (0.2 + Math.random() * 0.6);
        const sy = h * (0.35 + Math.random() * 0.4);
        this.bolt = { pts: boltPoints(w * (0.15 + Math.random() * 0.7), -10, strikes ? sx : w * (0.1 + Math.random() * 0.8), strikes ? sy : h * (0.25 + Math.random() * 0.25)), life: 0.22 };
        this.onBolt?.(strikes ? { x: cam.x + (sx - w / 2) / cam.zoom, y: cam.y + (sy - h / 2) / cam.zoom } : null);
      }
    }
    // A flash flickers: bright, dim, bright again, then fades.
    this.flash = Math.max(0, this.flash - dt * 2.2);
    const f = this.flash > 0.75 || (this.flash > 0.35 && this.flash < 0.55) ? this.flash : this.flash * 0.3;
    const fl = this.flashLayer.clear();
    if (f > 0.02) fl.rect(0, 0, w, h).fill({ color: 0xeef4ff, alpha: Math.min(0.35, f * 0.3) });
    if (this.bolt) {
      this.bolt.life -= dt;
      if (this.bolt.life <= 0) this.bolt = null;
      else {
        const a = Math.min(1, this.bolt.life / 0.12);
        for (const [width, color, alpha] of [[14, 0x9fc4ff, 0.25], [5, 0xdfeaff, 0.8], [2, 0xffffff, 1]] as const) {
          fl.moveTo(this.bolt.pts[0], this.bolt.pts[1]);
          for (let i = 2; i < this.bolt.pts.length; i += 2) fl.lineTo(this.bolt.pts[i], this.bolt.pts[i + 1]);
          fl.stroke({ width, color, alpha: alpha * a, join: 'round' });
        }
      }
    }
    this.updatePuddles(dt, w, h, cam);
  }

  /** Puddles fill while it rains; once it's cleared they glint in the sun and slowly dry. A rainbow shows for a while. */
  private updatePuddles(dt: number, w: number, h: number, cam: { x: number; y: number; zoom: number }): void {
    if (!this.puddleSpots.length) return;
    this.sunClock += dt;
    if (this.clearing >= 1) this.dry = Math.min(1, this.dry + dt / 300);
    this.puddles.alpha = Math.min(0.9, 0.35 + this.sunClock / 90) * (1 - this.dry);
    const g = this.glints.clear();
    if (this.clearing > 0.5 && this.dry < 1) {
      const halfW = w / 2 / cam.zoom + 100;
      const halfH = h / 2 / cam.zoom + 100;
      for (const [i, p] of this.puddleSpots.entries()) {
        if (Math.abs(p.x - cam.x) > halfW || Math.abs(p.y - cam.y) > halfH) continue;
        const twinkle = Math.max(0, Math.sin(this.sunClock * 1.7 + i * 2.3));
        if (twinkle < 0.6) continue;
        const k = (twinkle - 0.6) / 0.4;
        const gx = p.x + p.rx * 0.2;
        const gy = p.y - p.ry * 0.2;
        g.moveTo(gx - 7 * k, gy).lineTo(gx + 7 * k, gy).moveTo(gx, gy - 5 * k).lineTo(gx, gy + 5 * k).stroke({ width: 2, color: 0xffffff, alpha: 0.8 * k * (1 - this.dry) });
      }
    }
    // The rainbow: faint, high over the view, while the sky's freshly cleared.
    const rb = this.rainbow.clear();
    const show = this.clearing >= 1 ? Math.max(0, Math.min(1, this.dry * 30) * (1 - this.dry * 5)) : 0;
    if (show > 0.01) {
      const cx = w * 0.62;
      const cy = h * 1.15;
      const R = Math.max(w, h) * 0.95;
      [0xff5a5a, 0xffa94d, 0xffe066, 0x8ce99a, 0x74c0fc, 0x9775fa].forEach((color, i) => {
        rb.moveTo(cx - R + i * 9, cy).arc(cx, cy, R - i * 9, Math.PI, Math.PI * 2).stroke({ width: 9, color, alpha: 0.13 * show });
      });
    }
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
