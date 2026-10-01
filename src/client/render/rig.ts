import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { inkOf, shade, type Pts } from './organic';

// Upright figures with joints. A champion stands on the spot the game says they're at, seen from the side
// and a little above, facing left or right. Each body part (torso, head, upper and lower arms and legs,
// feet, a weapon) is drawn once, in the hand-inked style, and then posed every frame: the legs walk, the
// arms swing, the chest breathes, and the old animation tracks (turn, reach, twist, lunge, grow, stretch)
// move the joints. All sizes are in units of the unit's radius `r`, facing right (+x), up is −y.

export type Palette = Record<string, number>;

export interface Proportions {
  /** Upper and lower leg. Together they're the hip height. */
  thigh: number;
  shin: number;
  /** Hip to the base of the neck. */
  torso: number;
  /** How far below the neck the shoulders sit, and how far forward of the spine. */
  shoulder: number;
  shoulderX: number;
  upper: number;
  fore: number;
  /** Limb thickness at the joint they hang from. */
  legW: number;
  armW: number;
  foot: number;
  /** Head height above the neck (just for working out how tall the figure stands). */
  headH: number;
}

/** Something held: a weapon, a staff, a lighter. Drawn with the grip at (0, 0), pointing along +x. */
export interface Held {
  draw(g: Graphics, r: number, p: Palette): void;
  /** Its angle at rest (0 points forward, −π/2 straight up). */
  hold: number;
}

export interface Build {
  size: Proportions;
  /** Arms at rest: front shoulder, front elbow, back shoulder, back elbow (0 = forward, π/2 = down). */
  arms?: readonly [number, number, number, number];
  /** Palette keys for the plain parts (the far leg can differ: a jester's hose). */
  colors: { sleeve: string; hand: string; leg: string; boot: string; legBack?: string };
  /** Extra colors worked out from the palette (so every skin gets matching trousers). */
  prep?(p: Palette): Palette;
  /** The body, from the hips (0, 0) up to the neck (0, −torso). */
  torso(g: Graphics, r: number, p: Palette): void;
  /** The head, from the neck (0, 0) up. */
  head(g: Graphics, r: number, p: Palette): void;
  /** Behind everything, moving with the body: a cape, a quiver, a sack, wings, a tail. */
  back?(g: Graphics, r: number, p: Palette): void;
  /** Hands, if not plain ones (fists, paws). */
  hand?(g: Graphics, r: number, p: Palette, front: boolean): void;
  /** Feet, if not plain boots (heel at (0, 0), toe forward). */
  foot?(g: Graphics, r: number, p: Palette, front: boolean): void;
  /** Over the top of the front arm: a pauldron, a puffed sleeve. Origin at the shoulder. */
  cap?(g: Graphics, r: number, p: Palette): void;
  weapon?: Held;
  offhand?: Held;
  /** How they walk: leg swing (radians), bounce (in r), forward lean, knee bend. */
  gait?: { swing?: number; bounce?: number; lean?: number; knee?: number; arm?: number };
}

/** Anything upright the unit view can pose: a rigged figure (rig.ts) or a simpler creature (beasts.ts). */
export interface Figure {
  /** Its origin is the spot on the ground it stands on. */
  readonly root: Container;
  /** How tall it stands, in world units. */
  readonly height: number;
  update(input: RigInput): void;
}

/** What the view tells the rig each frame. */
export interface RigInput {
  dt: number;
  /** Ground speed, world units per second. */
  speed: number;
  /** +1 facing right, −1 left. */
  facing: number;
  /** The animation tracks' current values. */
  turn: number;
  reach: number;
  twist: number;
  lunge: number;
  grow: number;
  stretch: number;
  /** 0 on the ground, 1 at the top of a leap. */
  air: number;
}

/** A tapered limb from (0, 0) to (len, 0): round at both ends, inked, shaded on one side. */
export function limb(g: Graphics, len: number, w0: number, w1: number, color: number): Graphics {
  const pts: Pts = [];
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 - (i / n) * Math.PI;
    pts.push(Math.cos(a) * w0 * 0.5, Math.sin(a) * w0 * 0.5);
  }
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 - (i / n) * Math.PI;
    pts.push(len + Math.cos(a) * w1 * 0.5, Math.sin(a) * w1 * 0.5);
  }
  const ink = inkOf(color);
  g.poly(pts).fill(color);
  // The side away from the light, darker.
  g.poly([0, w0 * 0.12, len, w1 * 0.12, len, w1 * 0.5, 0, w0 * 0.5]).fill({ color: shade(color, 0.28), alpha: 0.55 });
  return g.poly(pts).stroke({ width: 2.2, color: ink, join: 'round' });
}

/** A plain hand: a little mitten. */
export function plainHand(g: Graphics, r: number, color: number): void {
  g.ellipse(0.04 * r, 0, 0.13 * r, 0.11 * r).fill(color).stroke({ width: 2, color: inkOf(color) });
  g.ellipse(0.1 * r, -0.06 * r, 0.05 * r, 0.04 * r).fill(color).stroke({ width: 1.5, color: inkOf(color) }); // thumb
}

/** A boot, heel at the ankle (0, 0), toe forward. */
export function boot(g: Graphics, r: number, len: number, color: number): void {
  const h = 0.16 * r;
  const pts: Pts = [-0.1 * r, -h, 0.1 * r, -h, len * 0.55, -h * 0.5, len, -h * 0.15, len * 1.02, h * 0.5, -0.12 * r, h * 0.5];
  g.poly(pts).fill(color).stroke({ width: 2.2, color: inkOf(color), join: 'round' });
  g.moveTo(-0.12 * r, h * 0.35).lineTo(len * 1.0, h * 0.35).stroke({ width: 2, color: shade(color, 0.4) }); // the sole
}

export type PartName = 'back' | 'backUpper' | 'backFore' | 'backHand' | 'offhand' | 'backThigh' | 'backShin' | 'backFoot' | 'frontThigh' | 'frontShin' | 'frontFoot' | 'torso' | 'head' | 'frontUpper' | 'cap' | 'frontFore' | 'frontHand' | 'weapon';

/** Shapes drawn once for looks that many units share, by name. */
const SHARED = new Map<string, Map<PartName, GraphicsContext>>();

/** Back to front. */
const ORDER: readonly PartName[] = ['back', 'offhand', 'backUpper', 'backFore', 'backHand', 'backThigh', 'backShin', 'backFoot', 'frontThigh', 'frontShin', 'frontFoot', 'torso', 'head', 'weapon', 'frontUpper', 'cap', 'frontFore', 'frontHand'];

export class Rig implements Figure {
  /** The whole figure; its origin is between the feet. */
  readonly root = new Container();
  /** How tall it stands, in world units (soles to the top of the head). */
  readonly height: number;
  /** Each body part, posed by update (exposed so effects can find a hand or a head). */
  readonly part = {} as Record<PartName, Graphics>;
  private readonly z = new Container();
  private phase = Math.random() * Math.PI * 2;
  private stride = 0;
  private clock = Math.random() * 10;
  private flip = 1;

  /**
   * `share` names a look many units have in common (a Chud of one team and size): those draw their parts
   * once and every later one reuses the shapes.
   */
  constructor(private readonly build: Build, private readonly r: number, palette: Palette, share?: string) {
    const s = build.size;
    this.height = (s.thigh + s.shin + s.torso + s.headH) * r;
    this.root.addChild(this.z);
    const cached = share ? SHARED.get(share) : undefined;
    const made = new Map<PartName, GraphicsContext>();
    for (const name of ORDER) {
      // A context handed to a Graphics isn't destroyed with it, so shared shapes outlive any one Chud.
      const ctx = cached?.get(name) ?? (share ? new GraphicsContext() : undefined);
      if (ctx) made.set(name, ctx);
      const g = ctx ? new Graphics(ctx) : new Graphics();
      this.part[name] = g;
      this.z.addChild(g);
    }
    if (cached) return;
    if (share) SHARED.set(share, made);
    const p = { ...palette, ...build.prep?.(palette) };
    const { sleeve, hand, leg, boot: bootColor } = build.colors;
    build.back?.(this.part.back, r, p);
    build.torso(this.part.torso, r, p);
    build.head(this.part.head, r, p);
    for (const side of ['front', 'back'] as const) {
      // The far side is a shade darker, so the two read apart.
      const dim = side === 'back' ? 0.22 : 0;
      limb(this.part[`${side}Upper`], s.upper * r, s.armW * r, s.armW * 0.85 * r, shade(p[sleeve], dim));
      limb(this.part[`${side}Fore`], s.fore * r, s.armW * 0.85 * r, s.armW * 0.7 * r, shade(p[sleeve], dim));
      if (build.hand) build.hand(this.part[`${side}Hand`], r, p, side === 'front');
      else plainHand(this.part[`${side}Hand`], r, shade(p[hand], dim));
      const legColor = shade(p[side === 'back' ? (build.colors.legBack ?? leg) : leg], dim);
      limb(this.part[`${side}Thigh`], s.thigh * r, s.legW * r, s.legW * 0.85 * r, legColor);
      limb(this.part[`${side}Shin`], s.shin * r, s.legW * 0.85 * r, s.legW * 0.7 * r, legColor);
      if (build.foot) build.foot(this.part[`${side}Foot`], r, p, side === 'front');
      else boot(this.part[`${side}Foot`], r, s.foot * r, shade(p[bootColor], dim));
    }
    build.cap?.(this.part.cap, r, p);
    build.weapon?.draw(this.part.weapon, r, p);
    build.offhand?.draw(this.part.offhand, r, p);
  }

  update(input: RigInput): void {
    const { r, build } = this;
    const s = build.size;
    const gait = build.gait ?? {};
    const { dt } = input;
    this.clock += dt;
    // Walking: the faster they go, the longer the stride; the cycle speeds up too, to a point.
    const moving = input.speed > 30;
    this.stride = moving ? Math.min(1, this.stride + dt * 6) : Math.max(0, this.stride - dt * 5);
    const cycles = Math.min(2.3, input.speed / (3.2 * r));
    if (moving) this.phase += dt * cycles * Math.PI * 2;
    const st = this.stride;
    const sin = Math.sin(this.phase);
    const cos = Math.cos(this.phase);
    const swing = (gait.swing ?? 0.5) * st;
    const knee = (gait.knee ?? 0.9) * st;
    const breath = Math.sin(this.clock * 2.4) * (1 - st);

    // Twisting turns the whole figure about its middle (a spin, a look back over the shoulder).
    const twistW = Math.cos(input.twist);
    if (input.facing !== 0) this.flip = input.facing;
    this.z.scale.set(this.flip * twistW * (1 + input.grow), 1 + input.grow * 1.1);
    this.z.position.set(this.flip * input.lunge * 0.7 * r, -input.air * 0.9 * r);

    // The hips: lower at full stride, higher as the legs pass.
    const bob = (gait.bounce ?? 0.07) * r * st * (1 - Math.abs(cos)) - breath * 0.01 * r;
    const hipY = -(s.thigh + s.shin) * r + bob + (input.air > 0 ? -0.05 * r * input.air : 0);
    const lean = (gait.lean ?? 0.08) * st + input.lunge * 1.1 - input.grow * 0.6 + Math.sin(input.twist) * 0.15;

    // Legs: thighs swing in turn; the knee bends on the leg coming forward.
    const leg = (name: 'front' | 'back', dir: number) => {
      const a = Math.PI / 2 + dir * swing * sin - input.air * 0.6 * (dir > 0 ? 1 : 0.3);
      const bend = 0.05 + knee * Math.max(0, dir * cos) + input.air * 0.9;
      const hx = dir * 0.05 * r;
      const kx = hx + Math.cos(a) * s.thigh * r;
      const ky = hipY + Math.sin(a) * s.thigh * r;
      const sa = a + bend;
      const fx = kx + Math.cos(sa) * s.shin * r;
      const fy = ky + Math.sin(sa) * s.shin * r;
      this.place(`${name}Thigh`, hx, hipY, a);
      this.place(`${name}Shin`, kx, ky, sa);
      // Feet stay flat, tipping a little as they leave the ground.
      this.place(`${name}Foot`, fx, fy, (sa - Math.PI / 2) * 0.35);
    };
    leg('back', -1);
    leg('front', 1);

    // The body leans from the hips; the head rides on top, nodding with the step.
    const ux = Math.sin(lean);
    const uy = -Math.cos(lean);
    this.place('torso', 0, hipY, lean);
    this.part.torso.scale.set(1, 1 + breath * 0.02);
    this.place('back', 0, hipY, lean);
    const neckX = ux * s.torso * r;
    const neckY = hipY + uy * s.torso * r;
    this.place('head', neckX, neckY, lean * 0.6 + Math.sin(this.phase * 2) * 0.03 * st);

    // Arms: from the shoulders, swinging against the legs; the moves act on the front one.
    const [fa, fb, ba, bb] = build.arms ?? [1.35, 0.25, 1.45, 0.2];
    const armSwing = (gait.arm ?? 0.45) * st;
    const shoulder = (dir: number) => {
      const along = (s.torso - s.shoulder) * r;
      const sx = ux * along + Math.cos(lean) * s.shoulderX * r * (dir > 0 ? 1 : -0.4);
      const sy = hipY + uy * along + Math.sin(lean) * s.shoulderX * r;
      return [sx, sy];
    };
    const reachK = Math.max(0, Math.min(1, input.reach * 1.6));
    const raise = input.turn * 1.4;
    const arm = (name: 'front' | 'back', a0: number, b0: number, dir: number, acting: boolean): [number, number, number] => {
      let a = a0 - dir * armSwing * sin + breath * 0.03 + lean;
      let b = b0 + st * 0.15;
      if (acting) {
        a += raise;
        // Reaching straightens the arm out in front.
        a = a + (0 - a) * reachK;
        b = b * (1 - reachK);
      }
      const [sx, sy] = shoulder(dir);
      const ex = sx + Math.cos(a) * s.upper * r;
      const ey = sy + Math.sin(a) * s.upper * r;
      const fa2 = a - b;
      const hx = ex + Math.cos(fa2) * s.fore * r;
      const hy = ey + Math.sin(fa2) * s.fore * r;
      this.place(`${name}Upper`, sx, sy, a);
      this.place(`${name}Fore`, ex, ey, fa2);
      this.place(`${name}Hand`, hx, hy, fa2 * 0.4);
      return [hx, hy, fa2];
    };
    arm('back', ba, bb, -1, false);
    const [hx, hy] = arm('front', fa, fb, 1, true);
    const [cx, cy] = shoulder(1);
    this.place('cap', cx, cy, lean);
    const back = this.part.backHand;
    if (build.weapon) {
      // The weapon keeps its own angle on screen, turned by the move, pushed out by a reach or a draw.
      const w = this.part.weapon;
      const pull = input.reach < 0 ? input.reach * r : 0;
      w.position.set(hx + pull, hy);
      w.rotation = build.weapon.hold + input.turn * 1.2 + Math.sin(this.clock * 1.7) * 0.03 * (1 - st);
      w.scale.x = 1 + input.stretch;
    }
    if (build.offhand) {
      const o = this.part.offhand;
      o.position.set(back.x, back.y);
      o.rotation = build.offhand.hold - armSwing * sin * 0.5;
    }
  }

  private place(name: PartName, x: number, y: number, rotation: number): void {
    const g = this.part[name];
    g.position.set(x, y);
    g.rotation = rotation;
  }
}
