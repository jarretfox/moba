import { Graphics } from 'pixi.js';
import type { MapData } from '../../shared/map/mapData';
import { shapeContains } from '../../shared/map/shapes';
import { LAMP_HEIGHT, propSpots, type FlickerLight } from './props';

// The map as night comes on. The lanterns are dark through the golden evening; as dusk falls they're lit
// one by one, each sputtering a moment before it catches. Once it's properly night the moon shows in the
// river, a pale smudge broken up by the ripples, sliding along the water as you move about. (The Shootie
// windows lighting up are on the towers themselves; the fireflies gathering round the lights, in
// ambience.ts.) Everything here glows, so it's drawn on the layer above the light map.

/** How far into dusk it is (0–1): from five minutes in, as the sky starts to cool, to eleven. */
export function duskAt(time: number): number {
  return Math.max(0, Math.min(1, (time - 300) / 360));
}

/** Seconds a lantern sputters before it catches. */
const SPUTTER = 0.9;

/** How lit a lantern is, `t` seconds after someone set about lighting it. */
export function catching(t: number): number {
  if (t < 0) return 0;
  if (t >= SPUTTER) return 1;
  // Flickering on and off, steadier the longer it goes.
  const on = Math.sin(t * 31) + Math.sin(t * 17 + 1) > 0.4 - t;
  return (on ? 0.85 : 0.1) * Math.min(1, 0.4 + t);
}

export class NightLife {
  readonly glow = new Graphics();
  /** How lit each lantern is (0–1), in the order of propSpots' lanterns. */
  readonly lit: number[];
  private readonly lanterns: { x: number; y: number }[];
  /** At what point in the dusk each lantern gets lit (they don't all go at once). */
  private readonly lightAt: number[];
  /** When each lantern started catching (or null while it's dark). */
  private readonly since: (number | null)[];
  /** Points well out in the river, where the moon can show. */
  private readonly water: { x: number; y: number }[] = [];
  private moon: { x: number; y: number } | null = null;
  private moonAlpha = 0;
  private clock = 0;

  /** `lights` are the lanterns' lights in the light map, dimmed and brightened along with them. */
  constructor(
    map: MapData,
    private readonly lights: readonly FlickerLight[] = [],
  ) {
    this.glow.blendMode = 'add';
    this.lanterns = propSpots(map).lanterns;
    this.lit = this.lanterns.map(() => 0);
    this.since = this.lanterns.map(() => null);
    this.lightAt = this.lanterns.map((_, i) => 0.05 + ((i * 0.618034) % 1) * 0.75);
    const river = map.ground.filter((p) => p.style === 'river');
    const wet = (x: number, y: number) => river.some((p) => shapeContains(p.shape, x, y));
    for (let y = 0; y < map.height; y += 70) {
      for (let x = 0; x < map.width; x += 70) if (wet(x, y) && wet(x - 70, y) && wet(x + 70, y)) this.water.push({ x, y });
    }
  }

  /**
   * `time` is the match clock; `night` how far into the night (0–1); `view` the part of the map on
   * screen (center and size), to put the moon's reflection somewhere you can see it.
   */
  update(dt: number, time: number, night: number, view: { x: number; y: number; w: number; h: number }): void {
    this.clock += dt;
    const dusk = duskAt(time);
    const g = this.glow.clear();
    this.lanterns.forEach((p, i) => {
      const due = dusk >= this.lightAt[i];
      if (due && this.since[i] === null) this.since[i] = this.clock;
      if (!due) this.since[i] = null;
      const lit = (this.lit[i] = this.since[i] === null ? 0 : catching(this.clock - this.since[i]!));
      if (this.lights[i]) this.lights[i].lit = lit;
      if (lit < 0.01) return;
      const f = lit * (0.85 + 0.15 * Math.sin(this.clock * 9 + i * 1.7));
      const y = p.y - LAMP_HEIGHT;
      g.circle(p.x, y, 26).fill({ color: 0xffc070, alpha: 0.18 * f });
      g.circle(p.x, y, 12).fill({ color: 0xffe2a8, alpha: 0.5 * f });
      g.circle(p.x, y + 2, 4).fill({ color: 0xfff4d8, alpha: 0.8 * f });
    });
    this.drawMoon(dt, night, view);
  }

  /** The moon in the river: up and to the left of the middle of the screen, where the moonlight comes from. */
  private drawMoon(dt: number, night: number, view: { x: number; y: number; w: number; h: number }): void {
    const want = Math.max(0, (night - 0.15) / 0.85);
    const tx = view.x - view.w * 0.12;
    const ty = view.y - view.h * 0.18;
    let best: { x: number; y: number } | null = null;
    let bestD = Math.max(view.w, view.h) * 0.6;
    for (const p of this.water) {
      const d = Math.hypot(p.x - tx, p.y - ty);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    // Slides along the water (and fades) rather than jumping about.
    if (best) this.moon = this.moon ? { x: this.moon.x + (best.x - this.moon.x) * Math.min(1, dt * 2), y: this.moon.y + (best.y - this.moon.y) * Math.min(1, dt * 2) } : { ...best };
    this.moonAlpha += ((best ? want : 0) - this.moonAlpha) * Math.min(1, dt * 1.5);
    const a = this.moonAlpha;
    if (!this.moon || a < 0.01) return;
    const { x, y } = this.moon;
    const g = this.glow;
    g.ellipse(x, y, 74, 34).fill({ color: 0x9fb8e8, alpha: 0.1 * a });
    g.ellipse(x, y, 36, 16).fill({ color: 0xcfe0ff, alpha: 0.26 * a });
    g.ellipse(x, y, 19, 8).fill({ color: 0xf4f8ff, alpha: 0.55 * a });
    // Broken into strips by the ripples, shifting.
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const w = (26 - Math.abs(k) * 5) * (0.7 + 0.3 * Math.sin(this.clock * 1.7 + k * 2.1));
      const dx = Math.sin(this.clock * 0.9 + k) * 6;
      g.moveTo(x + dx - w, y + k * 7).lineTo(x + dx + w, y + k * 7).stroke({ width: 2.5, color: 0xe4eeff, alpha: (0.4 - Math.abs(k) * 0.08) * a });
    }
  }
}
