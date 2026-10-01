import { Container, Graphics } from 'pixi.js';
import type { PlayerTeam } from '../../shared/constants';
import type { MapData } from '../../shared/map/mapData';
import type { Vec2 } from '../../shared/math';
import type { FxLayer } from './fx';
import type { FlickerLight } from './props';

// Old Wick, the peddler at each team's fountain, drawn standing up like the lanterns are: a hunched figure
// in a long coat and a deep hood with two glowing eyes, a pack stuffed with junk on his back, and a crooked
// staff with a lantern that burns purple. Moths circle it and wisps drift off it. He breathes, blinks,
// watches whoever comes near, opens his coat to show his wares, and shakes when he laughs.

const INK = { width: 2.5, color: 0x0b0f14 };
const COAT = 0x30263a;
const COAT_DARK = 0x1f1828;
const LINING = 0x47204d;
const PACK = 0x5d4630;
const SCARF = 0x6e2a36;
const VIOLET = 0xa66bff;
const FLAME = 0xf3e2ff;
const EYES = 0xeedcff;

/** Where Wick keeps shop: a little behind each team's fountain, toward the map's edge, facing the base. */
export function wickSpot(map: MapData, team: PlayerTeam): Vec2 & { facing: 1 | -1 } {
  const s = map.spawns[team];
  const left = s.x < map.width / 2;
  return { x: s.x + (left ? -40 : 40), y: s.y - 300, facing: left ? 1 : -1 };
}

export class Shopkeeper {
  /** The rug, his wares and his shadow: on the ground, under everyone. */
  readonly ground = new Graphics();
  /** Wick himself. */
  readonly body = new Container();
  /** The lantern's flame and his eyes: on the glowing layer, so they shine in the dark. */
  readonly glow = new Graphics();
  /** The purple pool his lantern throws on the ground (for the light map). */
  readonly light: FlickerLight;
  private readonly g = new Graphics();
  private clock = Math.random() * 10;
  private nextBlink = 2 + Math.random() * 3;
  private blink = 0;
  private laughing = 0;
  private open = 0;
  private openFor = 0;
  private look = 0;
  private kick = 0;
  private wisp = 0;

  constructor(
    readonly x: number,
    readonly y: number,
    private readonly facing: 1 | -1,
    private readonly fx: FxLayer,
  ) {
    this.body.addChild(this.g);
    this.body.position.set(x, y);
    this.body.scale.x = facing;
    this.glow.position.set(x, y);
    this.glow.scale.x = facing;
    this.light = { x: x + 34 * facing, y: y - 30, r: 430, color: 0x9b5cff, alpha: 0.7, base: 0.7, flicker: 0.22, phase: x, speed: 6 };
    this.paintGround();
  }

  /** Where a speech bubble goes: over his hood. */
  get anchor(): { x: number; y: number; r: number } {
    return { x: this.x + 14 * this.facing, y: this.y, r: 128 };
  }

  /** A good laugh: he shakes, the lantern swings, and the coat falls open for a moment. */
  chuckle(): void {
    this.laughing = 1;
    this.kick = 0.35;
    this.showWares(2.5);
  }

  /** Opens his coat to show what's hanging inside, for `seconds`. */
  showWares(seconds = 3): void {
    this.openFor = Math.max(this.openFor, seconds);
  }

  /** `customer`: someone close by for him to watch, if anyone. */
  update(dt: number, customer: Vec2 | null): void {
    this.clock += dt;
    this.laughing = Math.max(0, this.laughing - dt * 1.1);
    this.kick *= Math.exp(-dt * 1.6);
    this.openFor = Math.max(0, this.openFor - dt);
    this.open += ((this.openFor > 0 ? 1 : 0) - this.open) * Math.min(1, dt * 7);
    // He keeps an eye on customers, turning his head toward them.
    const want = customer ? Math.max(-1, Math.min(1, ((customer.x - this.x) * this.facing) / 300)) : Math.sin(this.clock * 0.4) * 0.3;
    this.look += (want - this.look) * Math.min(1, dt * 3);
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.14;
      this.nextBlink = 2.5 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt);
    this.draw();
    // Wisps of purple smoke drift up off the flame.
    this.wisp -= dt;
    if (this.wisp <= 0) {
      this.wisp = 0.22 + Math.random() * 0.2;
      const l = this.lantern();
      this.fx.particles.emit({ shape: 'mote', x: this.x + l.x * this.facing, y: this.y + l.y + 6, vx: (Math.random() - 0.5) * 14, vy: -22 - Math.random() * 16, life: 1.4 + Math.random() * 0.8, size: 7, size2: 1, color: 0xc9a2ff, color2: 0x6a3cb0, drag: 0.2 });
    }
  }

  /** The lantern's center, relative to his feet (before mirroring). It hangs off the staff's hook and sways. */
  private lantern(): Vec2 {
    const t = this.clock;
    const angle = 0.12 * Math.sin(t * 1.25) + 0.05 * Math.sin(t * 2.9) + this.kick * Math.sin(t * 8);
    return { x: 58 + Math.sin(angle) * 20, y: -122 + Math.cos(angle) * 20 + 10 };
  }

  private draw(): void {
    const g = this.g.clear();
    const t = this.clock;
    const breathe = Math.sin(t * 1.7) * 0.012;
    const shake = this.laughing > 0 ? Math.abs(Math.sin(t * 19)) * 2.6 * this.laughing : 0;
    this.body.scale.y = 1 + breathe;
    const lift = -shake; // shoulders and head bob as he laughs
    const o = this.open;

    // The pack on his back, with a bedroll on top, a pickaxe and a pot hanging off it.
    g.moveTo(-22, -118 + lift).lineTo(-44, -152 + lift).stroke({ width: 4, color: 0x6b4a2e });
    g.poly([-50, -156 + lift, -38, -150 + lift, -40, -146 + lift, -52, -151 + lift]).fill(0x8a8f99).stroke({ width: 1.5, color: INK.color });
    g.roundRect(-36, -112 + lift, 50, 62, 14).fill(PACK).stroke(INK);
    g.moveTo(-30, -92 + lift).lineTo(8, -92 + lift).stroke({ width: 2, color: 0x3d2c1a });
    g.roundRect(-40, -124 + lift, 58, 16, 8).fill(0x7a5136).stroke(INK);
    for (const sx of [-26, 2]) g.moveTo(sx, -124 + lift).lineTo(sx, -108 + lift).stroke({ width: 2, color: 0x3d2c1a });
    g.moveTo(-38, -64 + lift).lineTo(-40, -56 + lift).stroke({ width: 1.5, color: 0x2a2a2a });
    g.circle(-40, -50 + lift, 7).fill(0x3a3f46).stroke({ width: 2, color: INK.color });

    // Boots peeking out under the coat.
    g.ellipse(-8, -3, 9, 5).fill(0x1a1410);
    g.ellipse(14, -3, 9, 5).fill(0x1a1410);

    // The long coat, hunched forward, its hem ragged.
    g.poly([
      -16, -98 + lift, 28, -98 + lift, 36, -60, 38, -8, 30, -2, 22, -8, 14, -1, 6, -8, -2, -1, -10, -8, -18, -2, -26, -8, -32, -6, -30, -60,
    ]).fill(COAT).stroke(INK);
    // Folds.
    g.moveTo(-14, -70).lineTo(-20, -10).stroke({ width: 2, color: COAT_DARK });
    g.moveTo(26, -64).lineTo(30, -12).stroke({ width: 2, color: COAT_DARK });

    // Inside the coat: a purple lining with his wares hanging in it, shown when it falls open.
    const gap = 3 + o * 15;
    g.poly([7, -90 + lift, 11, -90 + lift, 12 + gap, -8, 6 - gap, -8]).fill(LINING).stroke({ width: 2, color: INK.color });
    if (o > 0.15) {
      const wares: [number, number, number][] = [
        [-0.7, -66, 0xff5a6e],
        [0.7, -66, 0x5cff9a],
        [-0.8, -40, 0x6ab8ff],
        [0.8, -40, 0xffd166],
        [0, -26, 0xd0d6e0],
      ];
      for (const [side, wy, color] of wares) {
        const wx = 9 + side * gap * 0.9;
        g.moveTo(wx, wy - 8).lineTo(wx, wy - 4).stroke({ width: 1, color: 0x2a1a2a, alpha: o });
        if (color === 0xd0d6e0) g.poly([wx - 2, wy - 4, wx + 2, wy - 4, wx + 1, wy + 10, wx - 1, wy + 10]).fill({ color, alpha: o });
        else g.roundRect(wx - 3, wy - 4, 6, 9, 2).fill({ color, alpha: o }).stroke({ width: 1, color: INK.color, alpha: o });
        g.circle(wx - 1, wy - 2, 1).fill({ color: 0xffffff, alpha: o * 0.8 });
      }
    }
    // The coat's front edges, swinging open.
    g.moveTo(7, -90 + lift).lineTo(6 - gap, -8).stroke({ width: 2.5, color: COAT_DARK });
    g.moveTo(11, -90 + lift).lineTo(12 + gap, -8).stroke({ width: 2.5, color: COAT_DARK });
    // A belt with a brass buckle.
    g.moveTo(-30, -56).lineTo(36, -56).stroke({ width: 5, color: 0x3a2a1c });
    g.rect(14, -59, 7, 6).fill(0xd9b25a).stroke({ width: 1, color: INK.color });

    // The back arm, rubbing his hands when he laughs.
    const rub = this.laughing > 0 ? Math.sin(t * 22) * 3 * this.laughing : 0;
    this.limb(g, -10, -90 + lift, 10 + rub, -60 + lift);

    // The lantern arm, holding the crooked staff.
    const hand = { x: 38, y: -62 + lift };
    this.limb(g, 22, -90 + lift, hand.x, hand.y);
    g.moveTo(hand.x - 4, hand.y + 28).lineTo(hand.x + 8, -126).stroke({ width: 4, color: 0x5a4026 });
    g.moveTo(hand.x + 8, -126).quadraticCurveTo(hand.x + 12, -136, hand.x + 20, -130).stroke({ width: 3.5, color: 0x5a4026 });
    g.circle(hand.x, hand.y, 5).fill(0x2a2228).stroke({ width: 1.5, color: INK.color });

    // The hood, forward and low, with only darkness and two eyes inside. A scarf across the face.
    const hx = 14 + this.look * 2;
    const hy = -110 + lift * 1.3;
    g.poly([hx - 16, hy + 6, hx - 14, hy - 12, hx - 4, hy - 22, hx + 8, hy - 20, hx + 17, hy - 8, hx + 17, hy + 10, hx + 8, hy + 18, hx - 10, hy + 18]).fill(COAT_DARK).stroke(INK);
    g.ellipse(hx + 7 + this.look * 2, hy, 8, 11).fill(0x050308);
    // Lantern light catching the rim of the hood.
    g.moveTo(hx + 16, hy - 8).quadraticCurveTo(hx + 20, hy + 2, hx + 16, hy + 10).stroke({ width: 2, color: VIOLET, alpha: 0.55 });
    g.poly([hx - 1, hy + 4, hx + 17, hy + 4, hx + 17, hy + 11, hx - 1, hy + 10]).fill(SCARF).stroke({ width: 1.5, color: INK.color });
    g.poly([hx - 6, hy + 8, hx - 14, hy + 22, hx - 9, hy + 24, hx - 1, hy + 10]).fill(SCARF).stroke({ width: 1.5, color: INK.color });

    // The lantern, swinging on its hook.
    const l = this.lantern();
    g.moveTo(hand.x + 20, -130).lineTo(l.x, l.y - 12).stroke({ width: 1.5, color: 0x2a2a2a });
    g.poly([l.x - 7, l.y - 9, l.x, l.y - 14, l.x + 7, l.y - 9]).fill(0x2a2018).stroke({ width: 1.5, color: INK.color });
    g.roundRect(l.x - 7, l.y - 9, 14, 19, 3).fill({ color: VIOLET, alpha: 0.85 }).stroke({ width: 2, color: 0x2a2018 });
    g.moveTo(l.x, l.y - 9).lineTo(l.x, l.y + 10).stroke({ width: 1.5, color: 0x2a2018 });
    g.rect(l.x - 8, l.y + 9, 16, 4).fill(0x2a2018);

    // On the glowing layer: the flame, a halo, his eyes, and moths.
    const flicker = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29) * 0.07;
    const gl = this.glow.clear();
    gl.circle(l.x, l.y, 46 * flicker).fill({ color: VIOLET, alpha: 0.16 });
    gl.circle(l.x, l.y, 20 * flicker).fill({ color: VIOLET, alpha: 0.35 });
    gl.ellipse(l.x, l.y + 1, 3.5, 6 * flicker).fill({ color: FLAME, alpha: 0.95 });
    const open = this.blink > 0 ? 0.15 : 1;
    for (const ex of [hx + 4 + this.look * 3, hx + 10 + this.look * 3]) {
      gl.circle(ex, hy - 1, 5).fill({ color: VIOLET, alpha: 0.35 });
      gl.ellipse(ex, hy - 1, 2.2, 1.8 * open).fill({ color: EYES, alpha: 0.95 });
    }
    for (let i = 0; i < 3; i++) {
      const a = t * (2.2 + i * 0.7) + i * 2.1;
      const rr = 14 + i * 5 + Math.sin(t * 3 + i) * 3;
      const mx = l.x + Math.cos(a) * rr;
      const my = l.y + Math.sin(a * 1.3) * rr * 0.7;
      const wing = Math.abs(Math.sin(t * 40 + i)) * 2 + 0.5;
      gl.ellipse(mx, my, wing, 1.2).fill({ color: 0xf2e8ff, alpha: 0.85 });
    }
  }

  /** A sleeve from shoulder to hand: a thick dark stroke under a coat-colored one. */
  private limb(g: Graphics, x0: number, y0: number, x1: number, y1: number): void {
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 13, color: INK.color, cap: 'round' });
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 9, color: COAT, cap: 'round' });
  }

  /** His rug, laid out in front of him with a few things for sale on it, and his shadow. */
  private paintGround(): void {
    const g = this.ground;
    const f = this.facing;
    g.ellipse(this.x + 6 * f, this.y, 40, 13).fill({ color: 0x000000, alpha: 0.35 });
    const cx = this.x + 92 * f;
    const cy = this.y + 18;
    const corners = [-58, -30, 54, -36, 60, 32, -52, 36];
    const pts = corners.map((v, i) => (i % 2 === 0 ? cx + v * f : cy + v));
    g.poly(pts).fill(0x4a2340).stroke({ width: 3, color: 0x1a0d18 });
    // A border and a pattern down the middle.
    const inner = corners.map((v, i) => (i % 2 === 0 ? cx + v * 0.8 * f : cy + v * 0.75));
    g.poly(inner).stroke({ width: 3, color: 0xb0743a, alpha: 0.8 });
    for (let i = -2; i <= 2; i++) g.poly([cx + i * 16 * f, cy - 7, cx + (i * 16 + 6) * f, cy, cx + i * 16 * f, cy + 7, cx + (i * 16 - 6) * f, cy]).fill({ color: 0xc48a3a, alpha: 0.7 });
    // Fringe at the short ends.
    for (let i = 0; i < 7; i++) {
      const fy = cy - 30 + i * 10;
      g.moveTo(cx - 56 * f, fy).lineTo(cx - 64 * f, fy + 2).stroke({ width: 2, color: 0xb0743a });
      g.moveTo(cx + 58 * f, fy).lineTo(cx + 66 * f, fy + 2).stroke({ width: 2, color: 0xb0743a });
    }
    // Wares: potions, a sword, a little pile of coins, and a skull nobody asks about.
    const potions: [number, number, number][] = [
      [-30, -12, 0xff5a6e],
      [-18, -18, 0x5cff9a],
      [-24, 4, 0x6ab8ff],
    ];
    for (const [px, py, color] of potions) {
      g.circle(cx + px * f, cy + py, 7).fill(color).stroke({ width: 2, color: 0x0b0f14 });
      g.circle(cx + px * f, cy + py, 3).fill(0x8a5a2a);
      g.circle(cx + (px - 2) * f, cy + py - 3, 1.5).fill({ color: 0xffffff, alpha: 0.8 });
    }
    g.moveTo(cx + 2 * f, cy + 16).lineTo(cx + 40 * f, cy - 14).stroke({ width: 4, color: 0xd0d6e0 });
    g.moveTo(cx - 2 * f, cy + 13).lineTo(cx + 8 * f, cy + 22).stroke({ width: 4, color: 0x6b4a2e });
    for (const [gx, gy] of [[30, 14], [36, 18], [33, 10], [40, 12]]) g.circle(cx + gx * f, cy + gy, 4).fill(0xffd166).stroke({ width: 1, color: 0x8a6420 });
    g.ellipse(cx + 12 * f, cy - 20, 8, 7).fill(0xe8e0cc).stroke({ width: 1.5, color: 0x0b0f14 });
    g.circle(cx + 9 * f, cy - 21, 2).fill(0x0b0f14);
    g.circle(cx + 15 * f, cy - 21, 2).fill(0x0b0f14);
  }
}
