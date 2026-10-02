import { Container, Graphics, Text } from 'pixi.js';
import type { MonsterKind } from '../../shared/protocol';
import { UNIT_ATTACK } from './animation';
import { UNIT_BUILDS, unitPalette } from './builds';
import { dressChud } from './chudLife';
import { blob, inkLine, inkOf, inked, shade, smooth, type Pts } from './organic';
import { Rig, limb, type Figure, type RigInput } from './rig';

// The map events' figures (sim/events.ts), drawn in the same inked hand as everything else:
//
// - Three Chuds in a Coat: a very tall "bloke" in a long coat and a top hat. The bottom Chud's bare legs
//   trot under the hem, the middle one's eyes peer out between the buttons, and the top one's head sits on
//   the collar wearing the hat and a moustache. The back hand holds up a little sign. The whole stack
//   wobbles out of step. Each time a Chud falls out the coat gets shorter; down to one, it drowns in it.
//   Stunned (toppled), it lies flat on its face.
// - A Loose Chud: a Chud in a plain brown hood, through the ordinary Chud rig.
// - Old Wick's cart (not a unit; render/events.ts moves it): a handcart on two spoked wheels, piled with
//   crates and sacks, his purple lantern swinging from a pole.
// - The Royal Tax Stall: a booth with a striped awning, a strongbox and a TAXES DUE sign.
//
// Sizes are in the unit's radius `r`; figures face right (+x) with up as −y and their feet at the origin.

const FONT = "'Lilita One', 'Nunito', system-ui, sans-serif";
const SKIN = 0x87916c;
const HOOD = 0x6b4a2b;
const COAT_TAN = 0x9a7a52;
const COAT_LINING = 0x6a4a30;
const BELT = 0x3a2a1c;
const HAT = 0x221c26;
const WOOD = 0x8a6a3a;
const WOOD_DARK = 0x5a4024;
const IRON = 0x4a4f58;
const GOLD = 0xc9a23a;
const ROYAL = 0x5a2a80;
const WICK_PURPLE = 0x9b5cff;

// The moves the unit view plays on them (keyed like UNIT_ATTACK's own entries). Set here rather than in
// animation.ts, which belongs to the champion animation work.
/** The Coat's swat: the front sleeve swings up and forward, the whole stack leaning in. */
UNIT_ATTACK['monster:coat'] ??= { dur: 0.45, turn: [[0, 0], [0.3, -1.5], [0.55, 0.5], [1, 0]], lunge: [[0, 0], [0.55, 0.15], [1, 0]] };
UNIT_ATTACK['monster:looseChud'] ??= UNIT_ATTACK['chud:melee'];

/** Where the collar sits, in r, by how many Chuds are in the coat. */
const COLLAR: Record<number, number> = { 1: 1.1, 2: 1.95, 3: 2.75 };
/** The head on top adds this much. */
const HEAD = 0.6;

/** How tall the Coat stands at its tallest, in r (the bars stay up there as it shrinks). */
export const COAT_HEIGHT = COLLAR[3] + HEAD;

/** The figure for one of the events' monsters, or null for anything else (the view falls back to the beasts). */
export function eventFigure(kind: MonsterKind, r: number, id: number): Figure | null {
  if (kind === 'coat') return new CoatFigure(r);
  if (kind === 'looseChud') {
    const rig = new Rig(UNIT_BUILDS['chud:melee'], r, unitPalette(HOOD), `looseChud:${r}`);
    dressChud(rig.part.headProp, r, id);
    return rig;
  }
  return null;
}

/** How tall one of the events' monsters stands, in r (null for anything else). */
export function eventHeight(kind: MonsterKind | undefined): number | null {
  if (kind === 'coat') return COAT_HEIGHT;
  if (kind === 'looseChud') {
    const s = UNIT_BUILDS['chud:melee'].size;
    return s.thigh + s.shin + s.torso + s.headH;
  }
  return null;
}

/** How many Chuds the sim says are left in the coat, from its name ("Two Chuds in a Coat"). */
export function coatStage(name: string | undefined): number {
  return name?.startsWith('One') ? 1 : name?.startsWith('Two') ? 2 : 3;
}

// ─── Three Chuds in a Coat ────────────────────────────────────────────────────

export class CoatFigure implements Figure {
  readonly root = new Container();
  readonly height: number;
  private readonly z = new Container();
  private readonly farLeg = new Graphics();
  private readonly nearLeg = new Graphics();
  private readonly backArm = new Container();
  private readonly backSleeve = new Graphics();
  private readonly sign = new Container();
  private readonly body = new Graphics();
  private readonly frontArm = new Graphics();
  private readonly head = new Container();
  private readonly headG = new Graphics();
  private readonly hat = new Graphics();
  private stage = 3;
  private phase = Math.random() * Math.PI * 2;
  private stride = 0;
  private clock = Math.random() * 10;
  private flip = 1;
  private dizzy = 0;

  constructor(private readonly r: number) {
    this.height = COAT_HEIGHT * r;
    for (const [leg, near] of [[this.farLeg, false], [this.nearLeg, true]] as const) {
      const color = near ? SKIN : shade(SKIN, 0.25);
      limb(leg, 0.55 * r, 0.3 * r, 0.24 * r, color);
      // A bare foot at the end of it.
      leg.poly(smooth([0.5 * r, -0.1 * r, 0.62 * r, -0.12 * r, 0.82 * r, -0.02 * r, 0.8 * r, 0.1 * r, 0.5 * r, 0.12 * r], true, 2)).fill(color).stroke({ width: 2, color: inkOf(color), join: 'round' });
      leg.position.set((near ? 0.1 : -0.12) * r, -0.5 * r);
    }
    this.backArm.addChild(this.backSleeve, this.sign);
    this.head.addChild(this.headG, this.hat);
    this.z.addChild(this.farLeg, this.backArm, this.body, this.nearLeg, this.frontArm, this.head);
    this.root.addChild(this.z);
    this.setStage(3);
  }

  /** Redraws the coat for how many Chuds are in it. */
  setStage(stage: number): void {
    this.stage = stage;
    const r = this.r;
    const collar = COLLAR[stage] * r;
    const g = this.body.clear();
    // The coat: wide at the hem, a little narrower at the shoulders; at one Chud it pools on the floor.
    const hem = stage === 1 ? -0.08 * r : -0.36 * r;
    const flare = stage === 1 ? 0.78 : 0.62;
    const coat: Pts = smooth(
      [
        -flare * r, hem,
        -0.62 * r, hem - 0.5 * r,
        -0.56 * r, -collar + 0.3 * r,
        -0.5 * r, -collar - 0.02 * r,
        0.5 * r, -collar - 0.02 * r,
        0.58 * r, -collar + 0.3 * r,
        0.6 * r, hem - 0.5 * r,
        flare * 0.95 * r, hem,
        0.12 * r, hem + 0.06 * r,
      ],
      true,
      2,
    );
    inked(g, coat, COAT_TAN, 3.5);
    // The hem's split, the bottom Chud's eyes shining in it (at one Chud it's all him anyway).
    if (stage > 1) {
      g.poly([0.08 * r, hem, 0.02 * r, hem - 0.5 * r, 0.22 * r, hem - 0.5 * r, 0.2 * r, hem]).fill(0x1a1414);
      for (const x of [0.08, 0.16]) g.circle(x * r, hem - 0.3 * r, 0.035 * r).fill(0xffe066);
    }
    // Seams and a few creases, drawn in the darker tan.
    const seam = inkOf(COAT_TAN);
    inkLine(g, 0.1 * r, hem - 0.1 * r, 0.1 * r, -collar + 0.55 * r, 2.2, { color: seam, alpha: 0.7, tip: 0.4 }, 0.01);
    for (let i = 0; i < 3; i++) inkLine(g, -0.4 * r, hem - (0.4 + i * 0.6) * r, -0.22 * r, hem - (0.55 + i * 0.6) * r, 1.8, { color: seam, alpha: 0.45 }, 0.1);
    // Buttons down the front, and the belt round the top Chud's middle.
    for (let y = -collar + 0.6 * r; y < hem - 0.2 * r; y += 0.34 * r) g.circle(0.16 * r, y, 0.05 * r).fill(BELT).stroke({ width: 1.5, color: 0x120c08 });
    const belt = -collar + 0.95 * r;
    inked(g, [-0.56 * r, belt - 0.07 * r, 0.56 * r, belt - 0.07 * r, 0.56 * r, belt + 0.09 * r, -0.56 * r, belt + 0.09 * r], BELT, 2);
    g.roundRect(0.08 * r, belt - 0.1 * r, 0.16 * r, 0.2 * r, 0.03 * r).fill(GOLD).stroke({ width: 1.5, color: 0x5a4210 }); // the buckle
    // The middle Chud, peering out between two buttons.
    if (stage === 3) {
      const gy = -collar + 1.55 * r;
      g.poly(smooth([0.04 * r, gy - 0.16 * r, 0.3 * r, gy - 0.12 * r, 0.3 * r, gy + 0.12 * r, 0.04 * r, gy + 0.16 * r], true, 2)).fill(0x1a1414);
      for (const x of [0.11, 0.22]) {
        g.circle(x * r, gy, 0.05 * r).fill({ color: 0xffe066, alpha: 0.35 });
        g.circle(x * r, gy, 0.03 * r).fill(0xffe066);
      }
    }
    // The lapels and collar.
    inked(g, [-0.5 * r, -collar - 0.02 * r, -0.02 * r, -collar + 0.62 * r, 0.1 * r, -collar + 0.1 * r], COAT_LINING, 2);
    inked(g, [0.5 * r, -collar - 0.02 * r, 0.22 * r, -collar + 0.58 * r, 0.1 * r, -collar + 0.1 * r], COAT_LINING, 2);
    inked(g, smooth([-0.5 * r, -collar - 0.02 * r, -0.44 * r, -collar - 0.22 * r, 0.02 * r, -collar - 0.3 * r, 0.46 * r, -collar - 0.2 * r, 0.5 * r, -collar - 0.02 * r], true, 1), COAT_LINING, 2);

    // The sleeves, hanging from the shoulders; the hands poke out, except at one Chud, where they're lost in them.
    const sleeve = (s: Graphics, near: boolean) => {
      s.clear();
      const color = near ? COAT_TAN : shade(COAT_TAN, 0.22);
      const len = stage === 1 ? 1.05 * r : 0.9 * r;
      limb(s, len, 0.32 * r, 0.3 * r, color);
      s.moveTo(len * 0.86, -0.15 * r).lineTo(len * 0.86, 0.15 * r).stroke({ width: 2, color: inkOf(color) }); // the cuff
      if (stage > 1) {
        s.ellipse(len + 0.06 * r, 0, 0.13 * r, 0.11 * r).fill(SKIN).stroke({ width: 2, color: inkOf(SKIN) });
        s.ellipse(len + 0.12 * r, -0.07 * r, 0.05 * r, 0.04 * r).fill(SKIN).stroke({ width: 1.5, color: inkOf(SKIN) });
      }
    };
    sleeve(this.frontArm, true);
    sleeve(this.backSleeve, false);
    this.frontArm.position.set(0.34 * r, -collar + 0.26 * r);
    this.backArm.position.set(-0.34 * r, -collar + 0.26 * r);
    // The back hand holds up a sign (while there's a hand to hold it).
    this.sign.removeChildren().forEach((c) => c.destroy());
    this.sign.visible = stage > 1;
    if (stage > 1) {
      const board = new Graphics();
      board.moveTo(0, 0).lineTo(0, -0.7 * r).stroke({ width: 4, color: WOOD_DARK });
      inked(board, [-0.42 * r, -1.08 * r, 0.44 * r, -1.1 * r, 0.42 * r, -0.66 * r, -0.44 * r, -0.68 * r], 0xd9c9a0, 2.2);
      const words = new Text({ text: 'NORMAL\nBLOKE', style: { fontFamily: FONT, fontSize: 0.17 * r, fill: 0x3a2a1c, align: 'center', lineHeight: 0.18 * r } });
      words.anchor.set(0.5);
      words.position.set(0, -0.88 * r);
      this.sign.addChild(board, words);
      this.sign.position.set(0.95 * r, 0);
    }

    // The head on top, in a brown hood, with a moustache and a top hat.
    const h = this.headG.clear();
    UNIT_BUILDS['chud:melee'].head(h, 0.95 * r, unitPalette(HOOD));
    inked(h, blob(0.3 * r, -0.2 * r, 0.14 * r, 0.05 * r, 7, 0.3, 10), 0x1a1414, 1.5);
    inked(h, blob(0.46 * r, -0.19 * r, 0.1 * r, 0.045 * r, 9, 0.3, 10), 0x1a1414, 1.5);
    const hat = this.hat.clear();
    inked(hat, [-0.5 * r, -0.74 * r, 0.52 * r, -0.76 * r, 0.5 * r, -0.66 * r, -0.48 * r, -0.64 * r], HAT, 2.2); // the brim
    inked(hat, smooth([-0.34 * r, -0.72 * r, -0.38 * r, -1.3 * r, 0.36 * r, -1.32 * r, 0.34 * r, -0.72 * r], true, 1), HAT, 2.5);
    hat.rect(-0.37 * r, -0.92 * r, 0.72 * r, 0.1 * r).fill(ROYAL); // the band
    hat.moveTo(-0.3 * r, -1.22 * r).lineTo(0.28 * r, -1.24 * r).stroke({ width: 2, color: shade(HAT, -0.35), alpha: 0.6 });
    this.head.position.set(0.04 * r, -collar);
  }

  update(input: RigInput): void {
    const { r } = this;
    const { dt } = input;
    this.clock += dt;
    const moving = input.speed > 20;
    this.stride = moving ? Math.min(1, this.stride + dt * 5) : Math.max(0, this.stride - dt * 4);
    if (moving) this.phase += dt * Math.min(2.6, input.speed / (1.6 * r)) * Math.PI * 2;
    if (input.facing !== 0) this.flip = input.facing;
    const st = this.stride;
    // Toppled (the sim stuns it while it's down): eases flat on its face; dead, it keels over backwards.
    this.dizzy += ((input.dizzy ?? 0) - this.dizzy) * Math.min(1, dt * 7);
    const fall = input.dead ? Math.min(1, input.dead / 0.6) : 0;
    const grow = 1 + input.grow;
    this.z.scale.set(this.flip * grow * Math.cos(input.twist), grow);
    this.z.rotation = this.flip * (this.dizzy * (Math.PI / 2 - 0.12) - fall * 1.35);
    this.z.position.set(this.flip * input.lunge * 0.6 * r, -input.air * 0.6 * r);
    // The legs trot; the stack sways out of step, more the fewer Chuds are holding it up.
    const swing = 0.65 * st;
    this.nearLeg.rotation = Math.PI / 2 + swing * Math.sin(this.phase);
    this.farLeg.rotation = Math.PI / 2 + swing * Math.sin(this.phase + Math.PI);
    const wobble = this.stage === 1 ? 1.8 : this.stage === 2 ? 1.2 : 1;
    const bob = Math.abs(Math.sin(this.phase)) * 0.06 * r * st;
    this.body.y = -bob;
    this.body.skew.x = (Math.sin(this.clock * 1.6) * 0.03 + Math.sin(this.phase) * 0.045 * st) * wobble;
    const collar = COLLAR[this.stage] * r;
    this.head.position.set(0.04 * r + Math.sin(this.clock * 2.1 + 0.7) * 0.03 * r * wobble, -collar - bob + Math.sin(this.clock * 2.4) * 0.015 * r);
    this.head.rotation = (Math.sin(this.clock * 2.3 + 1) * 0.06 + Math.sin(this.phase + 0.5) * 0.06 * st) * wobble + (input.look ?? 0) * 0.15;
    // The sleeves swing with the walk; the front one swats with the attack.
    this.frontArm.rotation = Math.PI / 2 + input.turn * 0.8 + input.reach * 0.3 + Math.sin(this.phase) * 0.25 * st + Math.sin(this.clock * 1.4) * 0.03;
    this.backArm.rotation = Math.PI / 2 - Math.sin(this.phase) * 0.2 * st - 0.35 + Math.sin(this.clock * 1.1) * 0.03;
    this.frontArm.y = this.backArm.y = -collar + 0.26 * r - bob;
    this.sign.rotation = -this.backArm.rotation + Math.sin(this.clock * 1.7) * 0.06; // the sign stays upright
  }
}

// ─── Old Wick's cart ──────────────────────────────────────────────────────────

/** The cart, standing on its spot (its origin), rolling on its wheels when it moves. */
export class CartFigure {
  readonly root = new Container();
  /** Wick's lantern, for a glow in the dark. */
  readonly lantern = { x: 0, y: 0 };
  private readonly z = new Container();
  private readonly wheels: Graphics[] = [];
  private readonly lamp = new Graphics();
  private roll = 0;
  private flip = 1;
  private clock = 0;

  constructor(readonly r: number) {
    const body = new Graphics();
    // The shadow, then the bed on its axle, the rails, the load, the pole and the lantern.
    body.ellipse(0, 0.1 * r, 1.5 * r, 0.42 * r).fill({ color: 0x000000, alpha: 0.3 });
    body.moveTo(-1.0 * r, -0.4 * r).lineTo(1.0 * r, -0.4 * r).stroke({ width: 5, color: 0x2e2418 }); // the axle
    inked(body, [-1.35 * r, -0.95 * r, 1.4 * r, -0.95 * r, 1.3 * r, -0.5 * r, -1.25 * r, -0.5 * r], WOOD, 3);
    for (const y of [-0.82, -0.68]) body.moveTo(-1.3 * r, y * r).lineTo(1.34 * r, y * r).stroke({ width: 1.5, color: WOOD_DARK, alpha: 0.7 });
    for (const x of [-1.1, -0.4, 0.3, 1.0]) body.circle(x * r, -0.57 * r, 0.03 * r).fill(0x9aa1ab);
    // The handles out front.
    inkLine(body, 1.3 * r, -0.9 * r, 2.0 * r, -0.74 * r, 6, { color: WOOD_DARK, tip: 0.7 }, 0);
    inkLine(body, 1.3 * r, -0.76 * r, 2.0 * r, -0.6 * r, 6, { color: WOOD_DARK, tip: 0.7 }, 0);
    // The load: crates, a sack, a barrel of something, a few bottles.
    crate(body, -0.75 * r, -0.95 * r, 0.6 * r, 0.5 * r, 0x9a7a4a);
    crate(body, -0.7 * r, -1.45 * r, 0.46 * r, 0.4 * r, 0x8a6a3a);
    inked(body, blob(0.05 * r, -1.25 * r, 0.42 * r, 0.3 * r, 17, 0.14, 16), 0xb8a070, 2.5); // a sack
    body.moveTo(0.3 * r, -1.46 * r).lineTo(0.42 * r, -1.62 * r).stroke({ width: 3, color: 0x6a4a30 }); // tied at the neck
    inked(body, smooth([0.6 * r, -0.95 * r, 0.55 * r, -1.55 * r, 1.15 * r, -1.55 * r, 1.1 * r, -0.95 * r], true, 1), 0x7a5a36, 2.5); // a barrel
    for (const y of [-1.42, -1.1]) body.moveTo(0.57 * r, y * r).lineTo(1.13 * r, y * r).stroke({ width: 2.5, color: 0x3a3f48 });
    for (const [x, c] of [[0.72, 0x5aa070], [0.84, 0x9b5cff], [0.96, 0xc9a23a]] as const) {
      body.roundRect((x - 0.04) * r, -1.82 * r, 0.08 * r, 0.3 * r, 0.02 * r).fill(c).stroke({ width: 1.5, color: inkOf(c) });
      body.rect((x - 0.02) * r, -1.9 * r, 0.04 * r, 0.1 * r).fill(inkOf(c));
    }
    // Wick's sign on the side.
    inked(body, [-0.5 * r, -0.92 * r, 0.5 * r, -0.92 * r, 0.5 * r, -0.56 * r, -0.5 * r, -0.56 * r], 0xd9c9a0, 2);
    const sign = new Text({ text: "WICK'S", style: { fontFamily: FONT, fontSize: 0.26 * r, fill: 0x4a2a60, letterSpacing: 1 } });
    sign.anchor.set(0.5);
    sign.position.set(0, -0.74 * r);
    // The lantern pole at the back, the lamp swinging from its hook.
    body.moveTo(-1.25 * r, -0.95 * r).lineTo(-1.3 * r, -2.3 * r).stroke({ width: 5, color: WOOD_DARK });
    body.moveTo(-1.3 * r, -2.3 * r).lineTo(-0.95 * r, -2.36 * r).stroke({ width: 4, color: WOOD_DARK });
    const lamp = this.lamp;
    lamp.circle(0, 0.2 * r, 0.42 * r).fill({ color: WICK_PURPLE, alpha: 0.16 });
    lamp.moveTo(0, 0).lineTo(0, 0.08 * r).stroke({ width: 2, color: 0x2a2018 });
    inked(lamp, [-0.13 * r, 0.08 * r, 0.13 * r, 0.08 * r, 0.1 * r, 0.42 * r, -0.1 * r, 0.42 * r], 0x2a2018, 1.8);
    lamp.roundRect(-0.07 * r, 0.13 * r, 0.14 * r, 0.24 * r, 0.03 * r).fill(WICK_PURPLE);
    lamp.circle(0, 0.25 * r, 0.05 * r).fill(0xf0e0ff);
    lamp.position.set(-0.95 * r, -2.36 * r);
    this.lantern.x = -0.95 * r;
    this.lantern.y = -2.1 * r;
    for (const x of [-0.75, 0.75]) {
      const w = new Graphics();
      const wr = 0.48 * r;
      w.circle(0, 0, wr).fill(0x5a4024).stroke({ width: 3.5, color: 0x1a1008 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        w.moveTo(Math.cos(a) * wr, Math.sin(a) * wr).lineTo(-Math.cos(a) * wr, -Math.sin(a) * wr).stroke({ width: 3, color: 0x3a2814 });
      }
      w.circle(0, 0, wr * 0.22).fill(0x9aa1ab).stroke({ width: 1.5, color: 0x3a3f48 });
      w.position.set(x * r, -0.4 * r);
      this.wheels.push(w);
    }
    this.z.addChild(body, sign, this.lamp, ...this.wheels);
    this.root.addChild(this.z);
  }

  /** `speed` along the ground (world units a second) and which way it's heading (+1 right, −1 left). */
  update(dt: number, speed: number, facing: number): void {
    this.clock += dt;
    if (facing !== 0) this.flip = facing;
    this.z.scale.x = this.flip;
    this.roll += (dt * speed) / (0.48 * this.r);
    for (const w of this.wheels) w.rotation = this.roll * this.flip;
    // The lamp swings with the going, and sways a little on its own.
    this.lamp.rotation = Math.sin(this.clock * 2.2) * 0.08 + Math.min(0.5, speed / 400) * 0.3 * Math.sin(this.roll * 2);
    this.z.y = -Math.abs(Math.sin(this.roll * 2)) * Math.min(1, speed / 150) * 0.03 * this.r;
  }
}

/** A box seen from the front and a little above, its bottom at (x, y). */
function crate(g: Graphics, x: number, y: number, w: number, h: number, color: number): void {
  const d = h * 0.3;
  inked(g, [x - w / 2, y - h, x - w / 2 + d * 0.6, y - h - d, x + w / 2 + d * 0.6, y - h - d, x + w / 2, y - h], shade(color, -0.15), 2);
  inked(g, [x - w / 2, y, x - w / 2, y - h, x + w / 2, y - h, x + w / 2, y], color, 2.5);
  g.moveTo(x - w / 2 + 3, y - 3).lineTo(x + w / 2 - 3, y - h + 3).stroke({ width: 2.5, color: shade(color, 0.3) });
  g.moveTo(x - w / 2 + 2, y - h / 2).lineTo(x + w / 2 - 2, y - h / 2).stroke({ width: 1.5, color: shade(color, 0.35), alpha: 0.6 });
}

// ─── The Royal Tax Stall ──────────────────────────────────────────────────────

/** The stall standing on its spot (the origin), about 190 tall: posts, a counter, the awning and the sign. */
export function drawStall(): Container {
  const c = new Container();
  const g = new Graphics();
  g.ellipse(0, 6, 120, 34).fill({ color: 0x000000, alpha: 0.3 });
  // The posts, the counter's front of planks, and its top.
  for (const x of [-78, 78]) inkLine(g, x, 0, x + (x < 0 ? -4 : 4), -168, 9, { color: WOOD_DARK, tip: 0.8 }, 0);
  inked(g, [-82, -8, 82, -8, 84, -74, -84, -74], WOOD, 3);
  for (const y of [-30, -52]) g.moveTo(-80, y).lineTo(80, y).stroke({ width: 1.5, color: WOOD_DARK, alpha: 0.7 });
  for (const x of [-60, -20, 20, 60]) g.circle(x, -16, 2).fill(0x9aa1ab);
  inked(g, [-92, -74, 92, -74, 86, -86, -86, -86], shade(WOOD, -0.1), 2.5);
  // On the counter: the strongbox, a stack of coins, a scroll and a quill in its pot.
  inked(g, [-62, -86, -62, -124, -14, -124, -14, -86], IRON, 2.5);
  g.rect(-62, -108, 48, 4).fill(0x2c3038);
  g.roundRect(-42, -112, 10, 12, 2).fill(GOLD).stroke({ width: 1.5, color: 0x5a4210 });
  for (let i = 0; i < 5; i++) g.ellipse(10, -90 - i * 5, 11, 4).fill(GOLD).stroke({ width: 1.5, color: 0x6a4a10 });
  g.ellipse(10, -115, 11, 4).fill(0xffe29a).stroke({ width: 1.5, color: 0x6a4a10 });
  inked(g, [34, -88, 70, -88, 74, -100, 38, -100], 0xe8d5a6, 2);
  g.moveTo(40, -94).lineTo(66, -94).stroke({ width: 1.5, color: 0x8a6a3a });
  g.roundRect(60, -104, 12, 16, 3).fill(0x2a2018);
  inkLine(g, 66, -104, 76, -134, 3, { color: 0xf2efe6, tip: 0.1 }, 0.1);
  // The awning: a striped canopy, bowed on top with a scalloped edge, in royal purple and gold.
  const topAt = (x: number) => -168 - 30 * Math.sqrt(Math.max(0, 1 - (x / 100) ** 4));
  const canopy: Pts = [];
  for (let i = 0; i <= 20; i++) canopy.push(-100 + i * 10, topAt(-100 + i * 10));
  for (let i = 10; i >= 0; i--) canopy.push(-100 + i * 20, i % 2 ? -158 : -168);
  inked(g, canopy, ROYAL, 3);
  for (let i = 0; i < 10; i += 2) {
    const x0 = -100 + i * 20;
    const x1 = x0 + 20;
    g.poly([x0, -166, x1, -166, x1, topAt(x1) + 1, x0, topAt(x0) + 1]).fill({ color: GOLD, alpha: 0.9 });
  }
  g.moveTo(-100, -168);
  for (let i = 1; i <= 20; i++) g.lineTo(-100 + i * 10, topAt(-100 + i * 10));
  g.stroke({ width: 2.5, color: inkOf(ROYAL) });
  // A hanging sign.
  for (const x of [-30, 30]) g.moveTo(x, -164).lineTo(x, -142).stroke({ width: 2, color: 0x2a2018 });
  inked(g, [-44, -144, 44, -146, 42, -116, -42, -114], 0xe8d5a6, 2.5);
  const sign = new Text({ text: 'TAXES DUE', style: { fontFamily: FONT, fontSize: 15, fill: 0x5a1a14, letterSpacing: 1 } });
  sign.anchor.set(0.5);
  sign.position.set(0, -130);
  // The crown over the top: the king's stall.
  inked(g, [-14, -200, -16, -222, -6, -212, 0, -228, 6, -212, 16, -222, 14, -200], GOLD, 2);
  c.addChild(g, sign);
  return c;
}
