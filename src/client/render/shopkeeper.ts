import { Container, Graphics } from 'pixi.js';
import type { PlayerTeam } from '../../shared/constants';
import type { MapData } from '../../shared/map/mapData';
import type { Vec2 } from '../../shared/math';
import type { FxLayer } from './fx';
import { blob, inkLine, inkOf, inked, shade, smooth, type Pts } from './organic';
import type { FlickerLight } from './props';
import { Rig, type Build } from './rig';

// Old Wick, the peddler at each team's fountain, standing up like everyone else: a hunched figure in a
// long coat and a deep hood with two glowing eyes, a pack stuffed with junk on his back, and a crooked staff
// with a lantern that burns purple swinging from its hook. Moths circle it and wisps drift off it. He
// breathes, blinks, watches whoever comes near, opens his coat to show his wares, and shakes when he laughs.

const COAT = 0x30263a;
const COAT_DARK = 0x1f1828;
const LINING = 0x47204d;
const PACK = 0x5d4630;
const SCARF = 0x6e2a36;
const VIOLET = 0xa66bff;
const FLAME = 0xf3e2ff;
const EYES = 0xeedcff;
const R = 56;

const WICK: Build = {
  size: { thigh: 0.42, shin: 0.38, torso: 0.95, shoulder: 0.16, shoulderX: 0.14, upper: 0.44, fore: 0.42, legW: 0.26, armW: 0.25, foot: 0.3, headH: 0.62 },
  arms: [0.95, 0.85, 1.25, 1.4],
  colors: { sleeve: 'coat', hand: 'glove', leg: 'coatDark', boot: 'boot' },
  back(g, r) {
    // The pack, with a bedroll on top, a pickaxe poking out and a pot hanging off it.
    inkLine(g, -0.3 * r, -1.0 * r, -0.62 * r, -1.62 * r, 5, { color: 0x6b4a2e, tip: 1 }, 0);
    inked(g, [-0.72 * r, -1.66 * r, -0.5 * r, -1.58 * r, -0.54 * r, -1.5 * r, -0.76 * r, -1.58 * r], 0x8a8f99, 1.6);
    inked(g, smooth([-0.72 * r, -0.4 * r, -0.74 * r, -1.1 * r, -0.04 * r, -1.14 * r, -0.04 * r, -0.4 * r], true, 2), PACK, 3);
    g.moveTo(-0.64 * r, -0.76 * r).lineTo(-0.1 * r, -0.76 * r).stroke({ width: 2, color: 0x3d2c1a });
    inked(g, smooth([-0.8 * r, -1.08 * r, -0.8 * r, -1.3 * r, 0.04 * r, -1.3 * r, 0.04 * r, -1.08 * r], true, 2), 0x7a5136, 2.5);
    for (const sx of [-0.55, -0.15]) g.moveTo(sx * r, -1.28 * r).lineTo(sx * r, -1.1 * r).stroke({ width: 2, color: 0x3d2c1a });
    inkLine(g, -0.74 * r, -0.5 * r, -0.76 * r, -0.36 * r, 1.5, { color: 0x2a2a2a }, 0);
    inked(g, blob(-0.76 * r, -0.28 * r, 0.12 * r, 0.11 * r, 3, 0.1, 12), 0x3a3f46, 2);
  },
  torso(g, r, p) {
    // The long coat, hunched, its hem ragged down near his boots.
    const coat = smooth([-0.36 * r, 0.62 * r, -0.4 * r, -0.2 * r, -0.44 * r, -0.8 * r, -0.2 * r, -1.0 * r, 0.3 * r, -0.98 * r, 0.42 * r, -0.6 * r, 0.42 * r, 0.1 * r, 0.44 * r, 0.62 * r], true, 2);
    inked(g, coat, p.coat, 3);
    const hem: Pts = [];
    for (let i = 0; i <= 8; i++) hem.push(-0.36 * r + (i / 8) * 0.8 * r, 0.62 * r + (i % 2 ? -0.08 : 0.02) * r);
    g.poly([...hem, 0.44 * r, 0.5 * r, -0.36 * r, 0.5 * r]).fill(p.coat);
    inkLine(g, -0.24 * r, -0.6 * r, -0.3 * r, 0.5 * r, 2, { color: p.coatDark }, 0.05); // folds
    inkLine(g, 0.3 * r, -0.5 * r, 0.34 * r, 0.5 * r, 2, { color: p.coatDark }, -0.05);
    // A belt with a brass buckle.
    g.moveTo(-0.42 * r, -0.36 * r).lineTo(0.43 * r, -0.36 * r).stroke({ width: 5, color: 0x3a2a1c });
    inked(g, [0.2 * r, -0.41 * r, 0.3 * r, -0.41 * r, 0.3 * r, -0.31 * r, 0.2 * r, -0.31 * r], 0xd9b25a, 1.2);
  },
  head(g, r, p) {
    // The hood, forward and low, with only darkness inside (his eyes glow on their own layer); a scarf.
    const hood = smooth([-0.3 * r, 0.04 * r, -0.34 * r, -0.36 * r, -0.2 * r, -0.62 * r, 0.12 * r, -0.62 * r, 0.36 * r, -0.4 * r, 0.4 * r, -0.08 * r, 0.24 * r, 0.06 * r], true, 2);
    inked(g, hood, p.coatDark, 3);
    g.poly(blob(0.2 * r, -0.28 * r, 0.15 * r, 0.2 * r, 5, 0.06, 14)).fill(0x050308);
    g.moveTo(0.36 * r, -0.4 * r).quadraticCurveTo(0.44 * r, -0.22 * r, 0.38 * r, -0.06 * r).stroke({ width: 2.5, color: VIOLET, alpha: 0.5 }); // lantern light on the hood's rim
    inked(g, smooth([0.04 * r, -0.16 * r, 0.4 * r, -0.16 * r, 0.4 * r, -0.04 * r, 0.04 * r, -0.04 * r], true, 1), SCARF, 1.8);
    inked(g, [-0.04 * r, -0.08 * r, -0.2 * r, 0.2 * r, -0.1 * r, 0.24 * r, 0.06 * r, -0.04 * r], SCARF, 1.6);
  },
  weapon: {
    hold: -1.42,
    draw(g, r) {
      // The crooked staff, its top bent over into a hook for the lantern.
      g.moveTo(-0.55 * r, 0).lineTo(0.4 * r, -0.03 * r).lineTo(1.15 * r, 0.04 * r).lineTo(1.55 * r, -0.02 * r).stroke({ width: 7, color: inkOf(0x5a4026), join: 'round', cap: 'round' });
      g.moveTo(-0.55 * r, 0).lineTo(0.4 * r, -0.03 * r).lineTo(1.15 * r, 0.04 * r).lineTo(1.55 * r, -0.02 * r).stroke({ width: 4.5, color: 0x5a4026, join: 'round', cap: 'round' });
      g.moveTo(1.55 * r, -0.02 * r).quadraticCurveTo(1.72 * r, 0.02 * r, 1.66 * r, 0.16 * r).stroke({ width: 4, color: 0x5a4026, cap: 'round' });
    },
  },
  hand: (g, r) => {
    g.ellipse(0.04 * r, 0, 0.12 * r, 0.1 * r).fill(0x2a2228).stroke({ width: 2, color: 0x0b0f14 });
  },
  gait: { swing: 0.3, bounce: 0.03, lean: 0.1 },
};

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
  private readonly rig = new Rig(WICK, R, { coat: COAT, coatDark: COAT_DARK, glove: 0x2a2228, boot: 0x1a1410 });
  /** Drawn every frame: the coat falling open over his wares, and the lantern on its hook. */
  private readonly coat = new Graphics();
  private readonly lamp = new Graphics();
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
    this.body.addChild(this.rig.root, this.coat, this.lamp);
    this.body.position.set(x, y);
    this.body.scale.x = facing;
    this.body.zIndex = y;
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
    // He keeps an eye on customers, tipping his hood toward them.
    const want = customer ? Math.max(-1, Math.min(1, ((customer.x - this.x) * this.facing) / 300)) : Math.sin(this.clock * 0.4) * 0.3;
    this.look += (want - this.look) * Math.min(1, dt * 3);
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0.14;
      this.nextBlink = 2.5 + Math.random() * 4;
    }
    this.blink = Math.max(0, this.blink - dt);
    const t = this.clock;
    const shake = this.laughing > 0 ? Math.abs(Math.sin(t * 19)) * 0.04 * this.laughing : 0;
    const rub = this.laughing > 0 ? Math.sin(t * 22) * 0.3 * this.laughing : 0;
    this.rig.update({
      dt,
      speed: 0,
      facing: 1,
      turn: 0,
      reach: 0,
      twist: 0,
      lunge: 0,
      grow: shake,
      stretch: 0,
      air: 0,
      // A permanent stoop; the back hand rubs against the other when he laughs.
      posture: { bow: 0.22, look: 0.15 - this.look * 0.1, armB: [1.0 + rub, 1.6] },
    });
    this.draw();
    // Wisps of purple smoke drift up off the flame.
    this.wisp -= dt;
    if (this.wisp <= 0) {
      this.wisp = 0.22 + Math.random() * 0.2;
      const l = this.lantern();
      this.fx.particles.emit({ shape: 'mote', x: this.x + l.x * this.facing, y: this.y + l.y + 6, vx: (Math.random() - 0.5) * 14, vy: -22 - Math.random() * 16, life: 1.4 + Math.random() * 0.8, size: 7, size2: 1, color: 0xc9a2ff, color2: 0x6a3cb0, drag: 0.2 });
    }
  }

  /** The staff's hook, from the weapon part's place (before mirroring). */
  private hook(): Vec2 {
    const w = this.rig.part.weapon;
    const c = Math.cos(w.rotation);
    const s = Math.sin(w.rotation);
    const hx = 1.66 * R;
    const hy = 0.16 * R;
    return { x: w.x + hx * c - hy * s, y: w.y + hx * s + hy * c };
  }

  /** The lantern's center, swinging under the hook. */
  private lantern(): Vec2 {
    const t = this.clock;
    const h = this.hook();
    const angle = 0.12 * Math.sin(t * 1.25) + 0.05 * Math.sin(t * 2.9) + this.kick * Math.sin(t * 8);
    return { x: h.x + Math.sin(angle) * 18, y: h.y + Math.cos(angle) * 18 + 10 };
  }

  private draw(): void {
    const t = this.clock;
    // The coat falling open, a purple lining with his wares hanging in it.
    const torso = this.rig.part.torso;
    const c = this.coat.clear();
    c.position.copyFrom(torso.position);
    c.rotation = torso.rotation;
    const o = this.open;
    const gap = 3 + o * 15;
    c.poly([0.16 * R - 2, -0.92 * R, 0.16 * R + 2, -0.92 * R, 0.16 * R + 2 + gap, 0.48 * R, 0.16 * R - 2 - gap, 0.48 * R]).fill(LINING).stroke({ width: 2, color: 0x0b0f14 });
    if (o > 0.15) {
      const wares: [number, number, number][] = [
        [-0.7, -0.68, 0xff5a6e],
        [0.7, -0.68, 0x5cff9a],
        [-0.8, -0.2, 0x6ab8ff],
        [0.8, -0.2, 0xffd166],
        [0, 0.1, 0xd0d6e0],
      ];
      for (const [side, wy, color] of wares) {
        const wx = 0.16 * R + side * gap * 0.9;
        const y = wy * R;
        c.moveTo(wx, y - 8).lineTo(wx, y - 4).stroke({ width: 1, color: 0x2a1a2a, alpha: o });
        if (color === 0xd0d6e0) c.poly([wx - 2, y - 4, wx + 2, y - 4, wx + 1, y + 12, wx - 1, y + 12]).fill({ color, alpha: o });
        else c.roundRect(wx - 3.5, y - 4, 7, 10, 2).fill({ color, alpha: o }).stroke({ width: 1.5, color: inkOf(color), alpha: o });
        c.circle(wx - 1, y - 2, 1).fill({ color: 0xffffff, alpha: o * 0.8 });
      }
    }
    c.moveTo(0.16 * R - 2, -0.92 * R).lineTo(0.16 * R - 2 - gap, 0.48 * R).stroke({ width: 3, color: COAT_DARK });
    c.moveTo(0.16 * R + 2, -0.92 * R).lineTo(0.16 * R + 2 + gap, 0.48 * R).stroke({ width: 3, color: COAT_DARK });

    // The lantern on its hook.
    const h = this.hook();
    const l = this.lantern();
    const g = this.lamp.clear();
    g.moveTo(h.x, h.y).lineTo(l.x, l.y - 12).stroke({ width: 1.5, color: 0x2a2a2a });
    inked(g, [l.x - 7, l.y - 9, l.x, l.y - 15, l.x + 7, l.y - 9], 0x2a2018, 1.5);
    g.roundRect(l.x - 7, l.y - 9, 14, 19, 3).fill({ color: VIOLET, alpha: 0.85 }).stroke({ width: 2.5, color: 0x2a2018 });
    g.moveTo(l.x, l.y - 9).lineTo(l.x, l.y + 10).stroke({ width: 1.5, color: 0x2a2018 });
    inked(g, [l.x - 8, l.y + 9, l.x + 8, l.y + 9, l.x + 7, l.y + 13, l.x - 7, l.y + 13], 0x2a2018, 1.2);

    // On the glowing layer: the flame, a halo, his eyes, and moths.
    const flicker = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 29) * 0.07;
    const gl = this.glow.clear();
    gl.circle(l.x, l.y, 46 * flicker).fill({ color: VIOLET, alpha: 0.16 });
    gl.circle(l.x, l.y, 20 * flicker).fill({ color: VIOLET, alpha: 0.35 });
    gl.ellipse(l.x, l.y + 1, 3.5, 6 * flicker).fill({ color: FLAME, alpha: 0.95 });
    const head = this.rig.part.head;
    const hc = Math.cos(head.rotation);
    const hs = Math.sin(head.rotation);
    const open = this.blink > 0 ? 0.15 : 1;
    for (const ex of [0.14 + this.look * 0.04, 0.27 + this.look * 0.04]) {
      const x = head.x + ex * R * hc + 0.29 * R * hs;
      const y = head.y + ex * R * hs - 0.29 * R * hc;
      gl.circle(x, y, 5).fill({ color: VIOLET, alpha: 0.35 });
      gl.ellipse(x, y, 2.2, 1.8 * open).fill({ color: EYES, alpha: 0.95 });
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

  /** His rug, laid out in front of him with a few things for sale on it, and his shadow. */
  private paintGround(): void {
    const g = this.ground;
    const f = this.facing;
    g.ellipse(this.x + 6 * f, this.y, 46, 14).fill({ color: 0x000000, alpha: 0.35 });
    const cx = this.x + 92 * f;
    const cy = this.y + 18;
    const corners = [-58, -30, 54, -36, 60, 32, -52, 36];
    const pts = smooth(corners.map((v, i) => (i % 2 === 0 ? cx + v * f : cy + v)), true, 1);
    inked(g, pts, 0x4a2340, 3);
    // A border and a pattern down the middle.
    const inner = corners.map((v, i) => (i % 2 === 0 ? cx + v * 0.8 * f : cy + v * 0.75));
    g.poly(inner).stroke({ width: 3, color: 0xb0743a, alpha: 0.8 });
    for (let i = -2; i <= 2; i++) g.poly([cx + i * 16 * f, cy - 7, cx + (i * 16 + 6) * f, cy, cx + i * 16 * f, cy + 7, cx + (i * 16 - 6) * f, cy]).fill({ color: 0xc48a3a, alpha: 0.7 });
    // Fringe at the short ends.
    for (let i = 0; i < 7; i++) {
      const fy = cy - 30 + i * 10;
      inkLine(g, cx - 56 * f, fy, cx - 64 * f, fy + 2, 2, { color: 0xb0743a }, 0);
      inkLine(g, cx + 58 * f, fy, cx + 66 * f, fy + 2, 2, { color: 0xb0743a }, 0);
    }
    // Wares: potions, a sword, a little pile of coins, and a skull nobody asks about.
    const potions: [number, number, number][] = [
      [-30, -12, 0xff5a6e],
      [-18, -18, 0x5cff9a],
      [-24, 4, 0x6ab8ff],
    ];
    for (const [px, py, color] of potions) {
      inked(g, blob(cx + px * f, cy + py, 7, 7, px, 0.05, 12), color, 2);
      g.circle(cx + px * f, cy + py - 6, 3).fill(0x8a5a2a);
      g.circle(cx + (px - 2) * f, cy + py - 2, 1.5).fill({ color: 0xffffff, alpha: 0.8 });
    }
    inkLine(g, cx + 2 * f, cy + 16, cx + 40 * f, cy - 14, 4, { color: 0xd0d6e0, tip: 0.3 }, 0);
    inkLine(g, cx - 2 * f, cy + 13, cx + 8 * f, cy + 22, 5, { color: 0x6b4a2e }, 0);
    for (const [gx, gy] of [[30, 14], [36, 18], [33, 10], [40, 12]]) inked(g, blob(cx + gx * f, cy + gy, 4, 3.5, gx + gy, 0.1, 8), 0xffd166, 1.2);
    inked(g, blob(cx + 12 * f, cy - 20, 8, 7, 9, 0.08, 12), 0xe8e0cc, 1.8);
    g.circle(cx + 9 * f, cy - 21, 2).fill(0x0b0f14);
    g.circle(cx + 15 * f, cy - 21, 2).fill(0x0b0f14);
    g.rect(cx + 9 * f, cy - 16, 6 * f, 2).fill(shade(0xe8e0cc, 0.3));
  }
}
