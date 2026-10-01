import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { MapData } from '../../shared/map/mapData';
import type { Weather } from '../../shared/weather';
import { mix } from './particles';

// The match's weather, drawn: rain streaking down the screen with splashes on the ground, a storm's
// lightning lighting everything up, or mist rolling slowly over the map. It also tints the sky.

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

export class WeatherView {
  /** In screen space, over everything: rain and lightning. */
  readonly screen = new Container();
  /** On the map, above the trees: splashes and mist. */
  readonly world = new Container();
  private readonly rain = new Graphics();
  private readonly flashLayer = new Graphics();
  private readonly splashes = new Graphics();
  private drops: Drop[] = [];
  private splashList: Splash[] = [];
  private readonly banks: Bank[] = [];
  private flash = 0;
  private nextBolt = 6 + Math.random() * 8;
  /** Lightning just struck: the game plays the thunder (a moment later, it's far off). */
  onBolt: (() => void) | null = null;

  constructor(
    readonly kind: Weather,
    private readonly map: MapData,
  ) {
    this.screen.addChild(this.rain, this.flashLayer);
    this.world.addChild(this.splashes);
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

  /** The sky under this weather: darker and bluer in rain, paler in mist, lit up by lightning. */
  sky(color: number): number {
    let c = color;
    if (this.kind === 'rain') c = mix(c, 0x55607a, 0.22);
    if (this.kind === 'storm') c = mix(c, 0x3e4860, 0.35);
    if (this.kind === 'mist') c = mix(c, 0xb6bfcc, 0.18);
    return this.flash > 0 ? mix(c, 0xe8f0ff, Math.min(1, this.flash)) : c;
  }

  update(dt: number, w: number, h: number, cam: { x: number; y: number; zoom: number }): void {
    // Rain: streaks in screen space, wrapping round as they fall.
    const want = Math.round(this.wetness * 420 * ((w * h) / (1280 * 720)));
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
}
