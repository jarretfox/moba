import { Container, Graphics } from 'pixi.js';
import type { PlayerTeam } from '../../shared/constants';
import type { MapData } from '../../shared/map/mapData';
import type { Vec2 } from '../../shared/math';
import { FOUNTAIN_RADIUS } from '../../shared/sim/fountain';
import type { FlickerLight } from './props';
import { blob, inkLine, inkOf, inked, mix, shade } from './organic';

// Each team's fountain: the platform where you heal, ringed so its edge is plain to see, and the guardian
// crystal on its plinth at the back that zaps enemies who step on (or shoot into) it.

const STONE = 0x6a707a;
const STONE_LIGHT = 0x8a909a;
const INK = 0x1c1e24;

/** Where the crystal stands: at the back of the platform, toward the map's edge. */
export function crystalSpot(map: MapData, team: PlayerTeam): Vec2 {
  const s = map.spawns[team];
  const left = s.x < map.width / 2;
  return { x: s.x + (left ? -200 : 200), y: s.y + 60 };
}

export class FountainView {
  /** The platform's ring and glow, on the ground under everyone. */
  readonly ground = new Graphics();
  /** The crystal on its plinth, sorted in with the units. */
  readonly body = new Container();
  /** The crystal's light and its zaps, on the glowing layer. */
  readonly glow = new Graphics();
  readonly light: FlickerLight;
  private readonly plinth = new Graphics();
  private readonly gem = new Graphics();
  private clock = Math.random() * 10;
  private zaps: { x: number; y: number; age: number; seed: number }[] = [];
  private color = 0x3d8bfd;
  private readonly tip: Vec2;

  constructor(
    private readonly spawn: Vec2,
    readonly at: Vec2,
  ) {
    this.body.addChild(this.plinth, this.gem);
    this.body.position.set(at.x, at.y);
    this.body.zIndex = at.y;
    this.glow.blendMode = 'add';
    this.tip = { x: at.x, y: at.y - 175 };
    this.light = { x: at.x, y: at.y - 40, r: 520, color: this.color, alpha: 0.65, base: 0.65, flicker: 0.12, phase: at.x, speed: 2 };
    this.drawPlinth();
  }

  /** Colors it for whoever's looking: your fountain in your team's blue, theirs in red. */
  paint(color: number): void {
    this.color = color;
    this.light.color = color;
    const g = this.ground.clear();
    const { x, y } = this.spawn;
    const R = FOUNTAIN_RADIUS;
    // A soft pool of the team's color over the platform, brighter toward its edge.
    for (let i = 0; i < 6; i++) g.circle(x, y, R * (0.4 + i * 0.12)).fill({ color, alpha: 0.025 });
    // The edge: a broad inked stone curb with the team's color running along it, and runes set into it.
    g.circle(x, y, R + 10).stroke({ width: 26, color: INK, alpha: 0.35 });
    g.circle(x, y, R).stroke({ width: 18, color: STONE, alpha: 0.9 });
    g.circle(x, y, R).stroke({ width: 6, color, alpha: 0.85 });
    g.circle(x, y, R - 13).stroke({ width: 2, color: mix(color, 0xffffff, 0.4), alpha: 0.5 });
    g.circle(x, y, R + 9).stroke({ width: 2.5, color: INK, alpha: 0.8 });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rx = x + Math.cos(a) * R;
      const ry = y + Math.sin(a) * R;
      g.poly([rx, ry - 7, rx + 5, ry, rx, ry + 7, rx - 5, ry]).fill({ color: mix(color, 0xffffff, 0.55), alpha: 0.9 });
    }
    this.drawGem();
  }

  private drawPlinth(): void {
    const g = this.plinth.clear();
    g.ellipse(6, 8, 70, 24).fill({ color: 0x000000, alpha: 0.3 });
    // A stepped stone plinth, inked, with a bowl on top.
    inked(g, [-62, 6, -54, -22, 54, -22, 62, 6, 40, 16, -40, 16], STONE, 3, INK);
    inked(g, [-44, -22, -38, -66, 38, -66, 44, -22], STONE_LIGHT, 3, INK);
    g.poly([14, -22, 38, -22, 34, -64, 12, -64]).fill({ color: 0x000000, alpha: 0.18 });
    for (const yy of [-36, -50]) inkLine(g, -40, yy, 40, yy, 1.5, { color: INK, alpha: 0.4 }, 0);
    inked(g, blob(0, -70, 52, 14, 9, 0.1, 18), shade(STONE_LIGHT, 0.1), 3, INK);
    g.ellipse(0, -72, 40, 9).fill({ color: 0x15171c, alpha: 0.85 });
    // Moss at the foot.
    for (const [mx, s] of [[-46, 12], [30, 9], [52, 7]]) inked(g, blob(mx, 10, s, s * 0.5, mx, 0.3, 10), 0x3f6b33, 1.5);
  }

  /** The crystal itself: a tall faceted shard in the team's color, floating over the bowl. */
  private drawGem(): void {
    const g = this.gem.clear();
    const c = this.color;
    const pts = [0, -190, 22, -140, 14, -96, 0, -84, -14, -96, -22, -140];
    inked(g, pts, c, 3, inkOf(c));
    g.poly([0, -190, 22, -140, 14, -96, 0, -84]).fill({ color: 0x000000, alpha: 0.22 });
    g.poly([0, -190, -10, -142, 0, -100, -22, -140]).fill({ color: 0xffffff, alpha: 0.35 });
    inkLine(g, 0, -186, 0, -88, 1.5, { color: mix(c, 0xffffff, 0.6), alpha: 0.7 }, 0);
  }

  /** The crystal lashing out at someone standing at (x, y). */
  zap(x: number, y: number): void {
    this.zaps.push({ x, y, age: 0, seed: Math.random() * 1000 });
  }

  update(dt: number): void {
    this.clock += dt;
    this.gem.y = Math.sin(this.clock * 1.7) * 5;
    const g = this.glow.clear();
    const tip = { x: this.tip.x, y: this.tip.y + this.gem.y };
    // The crystal's glow: a halo that breathes, brighter for a moment after each zap.
    const hot = this.zaps.length ? 1 : 0;
    g.circle(tip.x, tip.y + 40, 70 + 8 * Math.sin(this.clock * 2) + 30 * hot).fill({ color: this.color, alpha: 0.16 + 0.2 * hot });
    g.circle(tip.x, tip.y + 40, 34).fill({ color: mix(this.color, 0xffffff, 0.5), alpha: 0.18 + 0.3 * hot });
    for (const z of this.zaps) {
      z.age += dt;
      const t = z.age / 0.28;
      if (t >= 1) continue;
      const alpha = 1 - t;
      // A forked bolt from the crystal to the target, re-jagged every frame.
      for (const [w, a, color] of [[14, 0.25, this.color], [6, 0.7, mix(this.color, 0xffffff, 0.5)], [2.5, 1, 0xffffff]] as const) {
        g.moveTo(tip.x, tip.y + 30);
        const steps = 9;
        for (let i = 1; i <= steps; i++) {
          const u = i / steps;
          const jag = i === steps ? 0 : Math.sin(z.seed + i * 12.7 + this.clock * 40) * 26 * Math.sin(u * Math.PI);
          const nx = tip.x + (z.x - tip.x) * u;
          const ny = tip.y + 30 + (z.y - 60 - tip.y - 30) * u;
          g.lineTo(nx + jag, ny + jag * 0.4);
        }
        g.stroke({ width: w, color, alpha: a * alpha });
      }
      g.circle(z.x, z.y - 60, 40 * (1 + t)).fill({ color: this.color, alpha: 0.35 * alpha });
      g.circle(z.x, z.y - 60, 16).fill({ color: 0xffffff, alpha: 0.7 * alpha });
    }
    this.zaps = this.zaps.filter((z) => z.age < 0.28);
  }
}
