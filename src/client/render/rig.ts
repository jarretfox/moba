import { Container, Graphics, GraphicsContext } from 'pixi.js';
import type { ItemId } from '../../shared/items';
import { drawGear, type GearLayers } from './gear';
import { inkOf, shade, type Pts } from './organic';

// Upright figures with joints. A champion stands on the spot the game says they're at, seen from the side
// and a little above, facing left or right. Each body part (torso, head, upper and lower arms and legs,
// feet, a weapon) is drawn once, in the hand-inked style, and then posed every frame: the legs walk, the
// arms swing, the chest breathes, and the animation tracks (turn, reach, twist, lunge, grow, stretch)
// move the joints. On top of that the figure is alive: capes, tails and hats swing behind its movement,
// it blinks and pulls faces, it flinches when hit, reels when stunned, flips when knocked into the air,
// crumples when it dies (dropping its weapon, its hat flying off), and leaves a swoosh behind a swing.
// Recalls can pose it sitting, lying down or bowing. All sizes are in units of the unit's radius `r`,
// facing right (+x), up is −y.

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
  /** How far its business end is from the grip, in r (where a swing's swoosh is drawn). */
  tip?: number;
}

/** Something that hangs off the head and swings behind the movement: a hat, a cap, a crown, a halo. */
export interface Dangle {
  /** Drawn in head space (the neck at (0, 0)), like the head. */
  draw(g: Graphics, r: number, p: Palette): void;
  /** Where it's attached, in head space (in r): it swings about this point. */
  at: readonly [number, number];
  /** How loosely it swings (1 = a floppy hat). */
  give?: number;
  /** When they die: it flies off (the default), floats away (a halo), or stays on. */
  off?: 'pop' | 'float' | 'stay';
}

/** Where a face is, so it can blink, wince and grin. All in head (or torso) space, in r. */
export interface Face {
  on?: 'head' | 'torso';
  /** Each eye: x, y, size. */
  eyes?: readonly (readonly [number, number, number])[];
  /** Palette key for the eyelids. */
  skin: string;
  /** The mouth: x, y, width. Left out where a beard or a mask is in the way. */
  mouth?: readonly [number, number, number];
  /** Palette key for the skin round the mouth, if not the same as the lids. */
  mouthSkin?: string;
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
  /** Where the back piece hangs from (torso space, in r) and how freely it swings; `flap` for wings. */
  backSway?: { at: readonly [number, number]; give: number; flap?: boolean };
  /** A hat (or crown, or halo) that swings and comes off. */
  dangle?: Dangle;
  face?: Face;
  /** Hands, if not plain ones (fists, paws). */
  hand?(g: Graphics, r: number, p: Palette, front: boolean): void;
  /** Feet, if not plain boots (heel at (0, 0), toe forward). */
  foot?(g: Graphics, r: number, p: Palette, front: boolean): void;
  /** Over the top of the front arm: a pauldron, a puffed sleeve. Origin at the shoulder. */
  cap?(g: Graphics, r: number, p: Palette): void;
  weapon?: Held;
  offhand?: Held;
  /** A swoosh behind a fast swing (or punch), in this color. */
  streak?: number;
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

/** A held pose: sitting on a throne, lying down for a nap or push-ups, bowing over a bin. */
export interface Posture {
  sit?: number;
  /** Lying flat: + face down, head forward (push-ups); − on the back, head behind (a nap). */
  lie?: number;
  bow?: number;
  /** Head tilt: − looks up. */
  look?: number;
  /** Arm angles to hold, [shoulder, elbow], front and back. */
  armF?: readonly [number, number];
  armB?: readonly [number, number];
  /** How much of it applies (0–1), to ease in and out. */
  weight?: number;
}

/** A face to pull: wincing, grinning, asleep, or out cold (X-ed eyes without falling down: a portrait). */
export type Expression = 'hurt' | 'grin' | 'sleep' | 'ko' | null;

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
  /** Speed across the screen (+ right), for things that swing behind. */
  vx?: number;
  /** A hit this frame: + knocks them back, − forward; about 1 for a big one. */
  recoil?: number;
  /** Stunned: reeling, 0–1. */
  dizzy?: number;
  /** How far through a knocked-up backflip, 0–1. */
  tumble?: number;
  /** Seconds since dying (0 while alive). */
  dead?: number;
  /** Where they're looking: − up, + down. */
  look?: number;
  expression?: Expression;
  posture?: Posture;
  /** 1 while a basic attack's animation plays: the weapon trails a swoosh however fast it moves. */
  swing?: number;
  /** A flash at the weapon's tip as a blow lands, 1 at the moment of impact and dying away. */
  glint?: number;
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

export type PartName =
  | 'back' | 'offhand' | 'backUpper' | 'backFore' | 'backHand' | 'backThigh' | 'backShin' | 'backFoot'
  | 'frontThigh' | 'frontShin' | 'frontFoot' | 'torso' | 'head' | 'dangle' | 'headProp' | 'streak' | 'weapon'
  | 'frontUpper' | 'cap' | 'frontFore' | 'frontHand' | 'handProp' | 'glint';

/** The parts drawn from the build (shareable); the rest are drawn as they go. */
const DRAWN: readonly PartName[] = ['back', 'offhand', 'backUpper', 'backFore', 'backHand', 'backThigh', 'backShin', 'backFoot', 'frontThigh', 'frontShin', 'frontFoot', 'torso', 'head', 'dangle', 'weapon', 'frontUpper', 'cap', 'frontFore', 'frontHand'];

/** Back to front. The face goes just above whichever part it's on. */
const ORDER: readonly PartName[] = ['back', 'offhand', 'backUpper', 'backFore', 'backHand', 'backThigh', 'backShin', 'backFoot', 'frontThigh', 'frontShin', 'frontFoot', 'torso', 'head', 'dangle', 'headProp', 'streak', 'weapon', 'frontUpper', 'cap', 'frontFore', 'frontHand', 'handProp', 'glint'];

/** Shapes drawn once for looks that many units share, by name. */
const SHARED = new Map<string, Map<PartName, GraphicsContext>>();

const ease = (k: number) => k * k * (3 - 2 * k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** A swinging value: pulled toward a target, overshooting a little, settling. */
interface Spring {
  a: number;
  v: number;
}

function spring(s: Spring, target: number, dt: number, stiff = 60, damp = 7): void {
  s.v += ((target - s.a) * stiff - s.v * damp) * dt;
  s.a += s.v * dt;
}

/** A piece knocked loose when they die: falls (or floats), bounces once, settles. */
interface Loose {
  g: Graphics;
  vx: number;
  vy: number;
  spin: number;
  floats: boolean;
  age: number;
  bounced: boolean;
  ground: number;
}

/** The face's moods, each a layer shown over the drawn face. */
interface FaceLayers {
  root: Container;
  lids: Graphics;
  happy: Graphics;
  ko: Graphics;
  hurt: Graphics;
  grin: Graphics;
}

export class Rig implements Figure {
  /** The whole figure; its origin is between the feet. */
  readonly root = new Container();
  /** How tall it stands, in world units (soles to the top of the head). */
  readonly height: number;
  /** Each body part, posed by update (exposed so effects and recalls can find a hand or a head). */
  readonly part = {} as Record<PartName, Graphics>;
  private readonly z = new Container();
  private readonly face: FaceLayers | null = null;
  private phase = Math.random() * Math.PI * 2;
  private stride = 0;
  private clock = Math.random() * 10;
  private flip = 1;
  private readonly sway: Spring = { a: 0, v: 0 };
  private readonly hat: Spring = { a: 0, v: 0 };
  private readonly flinch: Spring = { a: 0, v: 0 };
  private blink = 2 + Math.random() * 3;
  /** The swoosh: where the weapon's tip (and a point nearer the grip) was, these last moments. */
  private trail: { tx: number; ty: number; ix: number; iy: number; t: number }[] = [];
  private lastTip: [number, number] | null = null;
  private streaking = false;
  private loose: Loose[] = [];
  /** What they've bought, worn on the figure (made the first time they buy something). */
  private gear: GearLayers | null = null;
  private gearKey = '';

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
      const ctx = DRAWN.includes(name) ? (cached?.get(name) ?? (share ? new GraphicsContext() : undefined)) : undefined;
      if (ctx) made.set(name, ctx);
      const g = ctx ? new Graphics(ctx) : new Graphics();
      this.part[name] = g;
      this.z.addChild(g);
    }
    this.part.glint.blendMode = 'add';
    const p = { ...palette, ...build.prep?.(palette) };
    if (build.face) {
      this.face = makeFace(build.face, r, p);
      const over = build.face.on === 'torso' ? this.part.torso : this.part.head;
      this.z.addChildAt(this.face.root, this.z.getChildIndex(over) + 1);
    }
    if (build.dangle) this.part.dangle.pivot.set(build.dangle.at[0] * r, build.dangle.at[1] * r);
    if (build.backSway) this.part.back.pivot.set(build.backSway.at[0] * r, build.backSway.at[1] * r);
    if (cached) return;
    if (share) SHARED.set(share, made);
    const { sleeve, hand, leg, boot: bootColor } = build.colors;
    build.back?.(this.part.back, r, p);
    build.torso(this.part.torso, r, p);
    build.head(this.part.head, r, p);
    build.dangle?.draw(this.part.dangle, r, p);
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
    const dead = input.dead ?? 0;
    const pose = input.posture;
    const pw = pose ? (pose.weight ?? 1) : 0;
    const sit = (pose?.sit ?? 0) * pw;
    const lie = (pose?.lie ?? 0) * pw;
    const bow = (pose?.bow ?? 0) * pw;
    const dizzy = input.dizzy ?? 0;
    // Dying: they topple over backward, everything going slack.
    const fall = dead > 0 ? ease(Math.min(1, dead / 0.55)) : 0;

    // Walking: the faster they go, the longer the stride; the cycle speeds up too, to a point.
    const moving = input.speed > 30 && !dead;
    this.stride = moving ? Math.min(1, this.stride + dt * 6) : Math.max(0, this.stride - dt * 5);
    const cycles = Math.min(2.3, input.speed / (3.2 * r));
    if (moving) this.phase += dt * cycles * Math.PI * 2;
    const st = this.stride * (1 - Math.max(sit, Math.abs(lie)));
    const sin = Math.sin(this.phase);
    const cos = Math.cos(this.phase);
    const swing = (gait.swing ?? 0.5) * st;
    const knee = (gait.knee ?? 0.9) * st;
    const breath = Math.sin(this.clock * 2.4) * (1 - st);

    // Turning round flings whatever hangs off them; so does running, the other way.
    if (input.facing !== 0 && !dead) {
      if (input.facing !== this.flip) {
        this.sway.v += 5;
        this.hat.v += 7;
      }
      this.flip = input.facing;
    }
    const drag = Math.max(-1, Math.min(1, ((input.vx ?? 0) * this.flip) / 420));
    spring(this.sway, drag * 0.4 + Math.sin(this.phase * 2) * 0.05 * st, dt);
    spring(this.hat, drag * 0.3 + Math.sin(this.phase * 2) * 0.04 * st - this.flinch.a * 0.6, dt, 50, 5);
    if (input.recoil) {
      this.flinch.v += input.recoil * 9;
      this.hat.v -= input.recoil * 4;
    }
    spring(this.flinch, 0, dt, 90, 11);

    // Twisting turns the whole figure about its middle (a spin, a look back over the shoulder). Lying
    // down, falling over and backflips turn it about its feet.
    const twistW = Math.cos(input.twist);
    this.z.scale.set(this.flip * twistW * (1 + input.grow), 1 + input.grow * 1.1);
    this.z.rotation = this.flip * (lie * Math.PI * 0.5 - fall * 1.45 - (input.tumble ?? 0) * Math.PI * 2);
    const lift = Math.abs(lie) * 0.34 * r + fall * 0.22 * r;
    this.z.position.set(this.flip * (input.lunge * 0.7 * r - lie * 0.42 * this.height), -input.air * 0.9 * r - lift);

    // The hips: lower at full stride, higher as the legs pass; down on the seat when sitting.
    const bob = (gait.bounce ?? 0.07) * r * st * (1 - Math.abs(cos)) - breath * 0.01 * r;
    const stand = -(s.thigh + s.shin) * r + bob + (input.air > 0 ? -0.05 * r * input.air : 0);
    const hipY = lerp(stand, -(s.shin + 0.05) * r, sit);
    const lean =
      (gait.lean ?? 0.08) * st + input.lunge * 1.1 - input.grow * 0.6 + Math.sin(input.twist) * 0.15 + bow * 1.25 - this.flinch.a * 0.35 + Math.sin(this.clock * 3.1) * 0.09 * dizzy;

    // Legs: thighs swing in turn; the knee bends on the leg coming forward. Sitting folds them; dying,
    // the knees give.
    const leg = (name: 'front' | 'back', dir: number) => {
      let a = Math.PI / 2 + dir * swing * sin - input.air * 0.6 * (dir > 0 ? 1 : 0.3);
      let bend = 0.05 + knee * Math.max(0, dir * cos) + input.air * 0.9;
      a = lerp(a, 0.12 + dir * 0.05, sit);
      bend = lerp(bend, Math.PI / 2 - 0.12, sit) + fall * (dir > 0 ? 0.8 : 0.5);
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

    // The body leans from the hips; the head rides on top, nodding with the step, snapping back from a
    // hit, rolling when stunned, lolling when dead.
    const ux = Math.sin(lean);
    const uy = -Math.cos(lean);
    this.place('torso', 0, hipY, lean);
    this.part.torso.scale.set(1, 1 + breath * 0.02);
    const neckX = ux * s.torso * r;
    const neckY = hipY + uy * s.torso * r;
    const headRot =
      lean * 0.6 + Math.sin(this.phase * 2) * 0.03 * st + (input.look ?? 0) * (1 - pw) + (pose?.look ?? 0) * pw - this.flinch.a * 0.5 + Math.sin(this.clock * 6) * 0.22 * dizzy + fall * 0.45;
    this.place('head', neckX, neckY, headRot);
    this.place('headProp', neckX, neckY, headRot);

    // What hangs off them swings behind: the cape or tail from its pivot, the hat from the head.
    if (build.backSway) {
      const [bx, by] = build.backSway.at;
      this.place('back', Math.cos(lean) * bx * r - Math.sin(lean) * by * r, hipY + Math.sin(lean) * bx * r + Math.cos(lean) * by * r, lean + this.sway.a * build.backSway.give);
      if (build.backSway.flap) this.part.back.scale.y = 1 + Math.sin(this.clock * (moving ? 12 : 4)) * (moving ? 0.1 : 0.04);
    } else this.place('back', 0, hipY, lean);
    if (build.dangle) {
      const [ax, ay] = build.dangle.at;
      const c = Math.cos(headRot);
      const sn = Math.sin(headRot);
      this.place('dangle', neckX + c * ax * r - sn * ay * r, neckY + sn * ax * r + c * ay * r, headRot + this.hat.a * (build.dangle.give ?? 1) * 0.6);
    }

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
    const arm = (name: 'front' | 'back', a0: number, b0: number, dir: number, acting: boolean, hold?: readonly [number, number]): [number, number, number] => {
      let a = a0 - dir * armSwing * sin + breath * 0.03 + lean + dizzy * 0.25;
      let b = b0 + st * 0.15;
      if (acting) {
        a += raise;
        // Reaching straightens the arm out in front.
        a = a + (0 - a) * reachK;
        b = b * (1 - reachK);
      }
      if (hold) {
        a = lerp(a, hold[0] + lean, pw);
        b = lerp(b, hold[1], pw);
      }
      a = lerp(a, 1.25 + lean, fall);
      b = lerp(b, 0.35, fall);
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
    arm('back', ba, bb, -1, false, pose?.armB);
    const [hx, hy, fore] = arm('front', fa, fb, 1, true, pose?.armF);
    this.place('handProp', hx, hy, fore);
    const [cx, cy] = shoulder(1);
    this.place('cap', cx, cy, lean);
    const back = this.part.backHand;
    let tipAngle = fore;
    if (build.weapon) {
      // The weapon keeps its own angle on screen, turned by the move, pushed out by a reach or a draw.
      const w = this.part.weapon;
      const pull = input.reach < 0 ? input.reach * r : 0;
      w.position.set(hx + pull, hy);
      w.rotation = build.weapon.hold + input.turn * 1.2 + Math.sin(this.clock * 1.7) * 0.03 * (1 - st) + fall * 1.2;
      w.scale.x = 1 + input.stretch;
      tipAngle = w.rotation;
    }
    if (build.offhand) {
      const o = this.part.offhand;
      o.position.set(back.x, back.y);
      o.rotation = build.offhand.hold - armSwing * sin * 0.5;
    }
    this.updateStreak(hx, hy, tipAngle, dt, input.swing ?? 0, input.glint ?? 0);
    if (this.gear) {
      const follow = (g: Graphics, on: Graphics) => {
        g.position.copyFrom(on.position);
        g.rotation = on.rotation;
        g.scale.copyFrom(on.scale);
        g.visible = on.visible;
      };
      follow(this.gear.torso, this.part.torso);
      follow(this.gear.back, this.part.torso);
      follow(this.gear.cap, this.part.cap);
      follow(this.gear.arm, this.part.frontFore);
      follow(this.gear.footF, this.part.frontFoot);
      follow(this.gear.footB, this.part.backFoot);
    }
    this.updateFace(input, dt, dead > 0, pose);
    this.updateLoose(dead, dt);
  }

  /**
   * A swoosh where the weapon's tip has just been: while it's moving fast, or (`swing`) however it moves
   * during a basic attack, so every attack is seen to happen. And the glint: a bright star bursting at the
   * tip as the blow lands.
   */
  private updateStreak(hx: number, hy: number, angle: number, dt: number, swing: number, glint: number): void {
    const len = (this.build.weapon?.tip ?? 0.22) * this.r;
    const tx = hx + Math.cos(angle) * len;
    const ty = hy + Math.sin(angle) * len;
    const gl = this.part.glint.clear();
    if (glint > 0.01) {
      const s = (0.14 + 0.34 * glint) * this.r;
      const w = s * 0.26;
      gl.poly([tx, ty - s, tx + w, ty - w, tx + s, ty, tx + w, ty + w, tx, ty + s, tx - w, ty + w, tx - s, ty, tx - w, ty - w]).fill({ color: 0xffffff, alpha: 0.9 * glint });
      gl.circle(tx, ty, s * 0.42).fill({ color: 0xffffff, alpha: 0.55 * glint });
    }
    const g = this.part.streak;
    const color = this.build.streak;
    if (color === undefined) return;
    const ix = hx + Math.cos(angle) * len * 0.35;
    const iy = hy + Math.sin(angle) * len * 0.35;
    const speed = this.lastTip && dt > 0 ? Math.hypot(tx - this.lastTip[0], ty - this.lastTip[1]) / dt : 0;
    this.lastTip = [tx, ty];
    if (speed > (swing > 0 ? 1.5 : 6.5) * this.r) this.trail.push({ tx, ty, ix, iy, t: this.clock });
    this.trail = this.trail.filter((p) => this.clock - p.t < 0.12);
    if (this.trail.length < 2) {
      if (this.streaking) g.clear();
      this.streaking = false;
      return;
    }
    g.clear();
    this.streaking = true;
    const outer: Pts = [];
    const inner: Pts = [];
    for (const p of this.trail) {
      outer.push(p.tx, p.ty);
      inner.unshift(p.ix, p.iy);
    }
    outer.push(tx, ty);
    inner.unshift(ix, iy);
    g.poly([...outer, ...inner]).fill({ color, alpha: 0.32 });
    g.moveTo(outer[0], outer[1]);
    for (let i = 2; i < outer.length; i += 2) g.lineTo(outer[i], outer[i + 1]);
    g.stroke({ width: 3, color: 0xffffff, alpha: 0.55, cap: 'round', join: 'round' });
  }

  /** Blinking, wincing, grinning, and out cold. */
  private updateFace(input: RigInput, dt: number, dead: boolean, pose: Posture | undefined): void {
    const face = this.face;
    if (!face) return;
    const on = this.build.face?.on === 'torso' ? this.part.torso : this.part.head;
    face.root.position.copyFrom(on.position);
    face.root.rotation = on.rotation;
    face.root.scale.copyFrom(on.scale);
    this.blink -= dt;
    if (this.blink < -0.13) this.blink = 2 + Math.random() * 3.5;
    const mood = dead ? null : input.expression ?? null;
    const asleep = (pose?.lie ?? 0) < 0 && (pose?.weight ?? 1) > 0.5;
    const out = dead || mood === 'ko';
    face.ko.visible = out;
    face.happy.visible = mood === 'grin';
    face.grin.visible = mood === 'grin';
    face.hurt.visible = mood === 'hurt';
    face.lids.visible = !out && mood !== 'grin' && (mood === 'hurt' || mood === 'sleep' || asleep || this.blink < 0);
  }

  /** On death the weapon drops and the hat flies off; they're put back when the champion comes back. */
  private updateLoose(dead: number, dt: number): void {
    if (dead > 0 && !this.loose.length && (this.build.weapon || this.build.offhand || this.build.dangle)) {
      const knock = (part: Graphics, floats: boolean, vx: number, vy: number, spin: number) => {
        this.z.updateLocalTransform();
        part.updateLocalTransform();
        const g = new Graphics(part.context);
        g.tint = part.tint;
        g.setFromMatrix(this.z.localTransform.clone().append(part.localTransform));
        this.root.addChild(g);
        part.visible = false;
        this.loose.push({ g, vx, vy, spin, floats, age: 0, bounced: false, ground: (Math.random() - 0.5) * 0.2 * this.r });
      };
      const f = this.flip;
      if (this.build.weapon) knock(this.part.weapon, false, f * (40 + Math.random() * 60), -120, f * (2 + Math.random() * 3));
      if (this.build.offhand) knock(this.part.offhand, false, -f * 50, -90, -f * 3);
      const off = this.build.dangle?.off ?? 'pop';
      if (this.build.dangle && off !== 'stay') knock(this.part.dangle, off === 'float', -f * (90 + Math.random() * 50), off === 'float' ? -30 : -420, -f * 7);
    }
    if (!dead && this.loose.length) {
      for (const l of this.loose) l.g.destroy();
      this.loose = [];
      this.part.weapon.visible = this.part.offhand.visible = this.part.dangle.visible = true;
      return;
    }
    for (const l of this.loose) {
      l.age += dt;
      if (l.floats) {
        l.g.y += l.vy * dt;
        l.g.alpha = Math.max(0, 1 - l.age / 1.8);
        continue;
      }
      if (l.vy === 0 && l.bounced) continue;
      l.vy += 1500 * dt;
      l.g.x += l.vx * dt;
      l.g.y += l.vy * dt;
      l.g.rotation += l.spin * dt;
      if (l.g.y >= l.ground && l.vy > 0) {
        l.g.y = l.ground;
        if (l.bounced) {
          l.vy = 0;
          l.vx = 0;
          // Settle flat on the ground.
          l.g.rotation = Math.round(l.g.rotation / Math.PI) * Math.PI;
        } else {
          l.bounced = true;
          l.vy = -l.vy * 0.3;
          l.vx *= 0.5;
          l.spin *= 0.4;
        }
      }
    }
  }

  /**
   * Shows what they've bought on the figure: a breastplate, a shield or a drum on the back, heavy boots,
   * a lantern at the belt (see gear.ts). Bloodreaver stains the weapon (or the fists) red.
   */
  setGear(items: readonly ItemId[]): void {
    const key = [...new Set(items)].sort().join(',');
    if (key === this.gearKey) return;
    this.gearKey = key;
    if (!this.gear) {
      const at = (after: PartName, before = false) => {
        const g = new Graphics();
        this.z.addChildAt(g, this.z.getChildIndex(this.part[after]) + (before ? 0 : 1));
        return g;
      };
      // Each just over the part it's worn on (the back piece just behind the body).
      this.gear = { back: at('backUpper', true), torso: at('torso'), cap: at('cap'), arm: at('frontFore'), footF: at('frontFoot'), footB: at('backFoot') };
    }
    drawGear(this.gear, items, this.r, this.build.size);
    const red = items.includes('reaver') ? 0xff8a80 : 0xffffff;
    if (this.build.weapon) this.part.weapon.tint = red;
    else this.part.frontHand.tint = this.part.backHand.tint = red;
  }

  private place(name: PartName, x: number, y: number, rotation: number): void {
    const g = this.part[name];
    g.position.set(x, y);
    g.rotation = rotation;
  }
}

/** The layers a face can show over what's drawn: closed lids, happy squints, X-ed out, a wince, a grin. */
function makeFace(face: Face, r: number, p: Palette): FaceLayers {
  const root = new Container();
  const lids = new Graphics();
  const happy = new Graphics();
  const ko = new Graphics();
  const hurt = new Graphics();
  const grin = new Graphics();
  const skin = p[face.skin] ?? 0xd6a274;
  const line = inkOf(skin);
  for (const [ex, ey, es] of face.eyes ?? []) {
    const x = ex * r;
    const y = ey * r;
    const s = es * r;
    for (const g of [lids, happy, ko]) g.ellipse(x, y, s * 1.05, s * 1.25).fill(skin);
    lids.moveTo(x - s * 0.95, y).quadraticCurveTo(x, y + s * 0.6, x + s * 0.95, y).stroke({ width: 2, color: line, cap: 'round' });
    happy.moveTo(x - s * 0.9, y + s * 0.3).quadraticCurveTo(x, y - s * 0.7, x + s * 0.9, y + s * 0.3).stroke({ width: 2.4, color: 0x1a1414, cap: 'round' });
    ko.moveTo(x - s * 0.7, y - s * 0.7).lineTo(x + s * 0.7, y + s * 0.7).moveTo(x + s * 0.7, y - s * 0.7).lineTo(x - s * 0.7, y + s * 0.7).stroke({ width: 2.4, color: 0x1a1414, cap: 'round' });
  }
  if (face.mouth) {
    const [mx, my, mw] = face.mouth;
    const x = mx * r;
    const y = my * r;
    const w = mw * r;
    const mskin = p[face.mouthSkin ?? face.skin] ?? skin;
    for (const g of [hurt, grin]) g.ellipse(x, y, w * 0.62, w * 0.36).fill(mskin);
    // Gritted teeth.
    hurt.roundRect(x - w * 0.42, y - w * 0.14, w * 0.84, w * 0.28, w * 0.08).fill(0xf6f0e0).stroke({ width: 1.8, color: 0x1a1414 });
    hurt.moveTo(x - w * 0.42, y).lineTo(x + w * 0.42, y).stroke({ width: 1.2, color: 0x1a1414 });
    // A big open grin.
    grin.moveTo(x - w * 0.5, y - w * 0.12).quadraticCurveTo(x, y + w * 0.5, x + w * 0.5, y - w * 0.12).closePath().fill(0x3a1414).stroke({ width: 1.8, color: 0x1a1414 });
    grin.rect(x - w * 0.36, y - w * 0.11, w * 0.72, w * 0.1).fill(0xf6f0e0);
  }
  root.addChild(lids, happy, ko, hurt, grin);
  for (const g of root.children) g.visible = false;
  return { root, lids, happy, ko, hurt, grin };
}
