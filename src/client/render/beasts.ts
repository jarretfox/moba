import { Container, Graphics } from 'pixi.js';
import { blade, blob, inkLine, inkOf, inked, rng, shade, shard, smooth } from './organic';
import { limb, type Figure, type RigInput } from './rig';

// Things in the jungle that don't walk on two legs, seen side-on like everyone else: rats scurrying on
// four, the Mossback plodding under its shell, the Ember Toad squatting with its tongue ready, the Glowcap
// swaying, and the Chuds' siege cart rolling on its wheels. Simpler than the rigs: a body, a head that can
// lunge out, a tail, four legs that trot, and wheels that turn. Sizes are in the unit's radius.
//
// Left alone in their camps they have lives of their own: the Mossback dozes off (z's drifting up), the
// Ember Toad snaps at a fly buzzing round its head, the rats squabble (turning on each other, nipping,
// hopping), the Rat King guarding a crumb of cheese.

export type BeastKind = 'rat' | 'ratKing' | 'mossback' | 'emberToad' | 'glowcap' | 'siege' | 'dummy';

interface Legs {
  /** Hip positions along the body, front first. */
  xs: readonly number[];
  hipY: number;
  len: number;
  w: number;
  color: number;
  swing: number;
}

interface BeastSpec {
  height: number;
  /** Turns to face left or right (a mushroom or a post doesn't). */
  turns: boolean;
  body(g: Graphics, r: number, team: number): void;
  /** Drawn around (0, 0), placed at `headAt`: pushed forward by a reach. */
  head?(g: Graphics, r: number, team: number): void;
  headAt?: [number, number];
  /** Drawn from (0, 0) back along −x, placed at `tailAt`: sways. */
  tail?(g: Graphics, r: number): void;
  tailAt?: [number, number];
  /** Drawn from (0, 0) along +x at `tongueAt`: stretches out with the move's stretch. */
  tongue?(g: Graphics, r: number): void;
  tongueAt?: [number, number];
  legs?: Legs;
  /** Wheel centers (x) at height `wheelY`, radius `wheelR`. */
  wheels?: readonly number[];
  wheelY?: number;
  wheelR?: number;
  /** Steps per second at a run. */
  pace?: number;
}

const RAT_FUR = 0x7d7268;
const RAT_KING_FUR = 0x5f544b;
const PINK = 0xd99a9a;

const rat = (fur: number, king: boolean): BeastSpec => ({
  height: 1.0,
  turns: true,
  pace: 3,
  legs: { xs: [0.4, -0.42], hipY: -0.36, len: 0.38, w: 0.16, color: shade(fur, 0.1), swing: 0.7 },
  body(g, r) {
    inked(g, blob(-0.05 * r, -0.52 * r, 0.75 * r, 0.42 * r, king ? 3 : 2, 0.12, 22), fur, 2.5);
    g.poly(blob(0.0, -0.36 * r, 0.5 * r, 0.16 * r, 5, 0.1, 14)).fill({ color: shade(fur, -0.25), alpha: 0.7 }); // the belly
    // Bristly fur along the back.
    for (let i = 0; i < 6; i++) {
      const x = (-0.6 + i * 0.2) * r;
      inkLine(g, x, -0.86 * r + Math.abs(i - 2.5) * 0.04 * r, x - 0.08 * r, -0.98 * r + Math.abs(i - 2.5) * 0.05 * r, 2, { color: inkOf(fur) }, 0);
    }
    if (king) for (const [x, y] of [[-0.3, -0.6], [0.1, -0.7]]) inkLine(g, x * r, y * r, (x + 0.15) * r, (y + 0.12) * r, 2.5, { color: 0xc06060, alpha: 0.8 }, 0); // old scars
  },
  headAt: [0.6, -0.56],
  head(g, r) {
    inked(g, smooth([-0.15 * r, -0.2 * r, 0.12 * r, -0.2 * r, 0.42 * r, 0.02 * r, 0.12 * r, 0.12 * r, -0.15 * r, 0.12 * r], true, 2), fur, 2.5);
    g.circle(0.42 * r, 0.02 * r, 0.05 * r).fill(PINK);
    g.ellipse(-0.04 * r, -0.26 * r, 0.12 * r, 0.16 * r).fill(PINK).stroke({ width: 2, color: inkOf(fur) }); // ear
    g.circle(0.14 * r, -0.07 * r, 0.05 * r).fill(0xff3b30);
    for (const dy of [-0.03, 0.04]) g.moveTo(0.36 * r, dy * r).lineTo(0.6 * r, dy * 2 * r - 0.02 * r).stroke({ width: 1.2, color: 0xe8e0cc, alpha: 0.8 });
    if (king) inked(g, [-0.12 * r, -0.2 * r, -0.14 * r, -0.42 * r, -0.04 * r, -0.32 * r, 0.04 * r, -0.46 * r, 0.1 * r, -0.32 * r, 0.16 * r, -0.42 * r, 0.14 * r, -0.2 * r], 0xffd166, 1.8); // a stolen crown
  },
  tailAt: [-0.72, -0.5],
  tail(g, r) {
    g.moveTo(0, 0).bezierCurveTo(-0.4 * r, -0.1 * r, -0.5 * r, 0.4 * r, -0.95 * r, 0.25 * r).stroke({ width: king ? 5 : 3.5, color: inkOf(PINK), cap: 'round' });
    g.moveTo(0, 0).bezierCurveTo(-0.4 * r, -0.1 * r, -0.5 * r, 0.4 * r, -0.95 * r, 0.25 * r).stroke({ width: king ? 3 : 2, color: PINK, cap: 'round' });
  },
});

const SPECS: Record<BeastKind, BeastSpec> = {
  rat: rat(RAT_FUR, false),
  ratKing: rat(RAT_KING_FUR, true),

  /** A great old tortoise with a garden growing on its shell. */
  mossback: {
    height: 1.25,
    turns: true,
    pace: 1.2,
    legs: { xs: [0.5, -0.55], hipY: -0.32, len: 0.3, w: 0.3, color: 0x6e7a4e, swing: 0.35 },
    body(g, r) {
      // The rim of the shell, then the dome, plated, with moss and grass on top.
      inked(g, smooth([-1.0 * r, -0.26 * r, 0.8 * r, -0.26 * r, 0.86 * r, -0.4 * r, -1.02 * r, -0.4 * r], true, 1), 0xb8a878, 2.5);
      const dome = smooth([-0.98 * r, -0.36 * r, -0.86 * r, -0.86 * r, -0.4 * r, -1.2 * r, 0.2 * r, -1.18 * r, 0.66 * r, -0.86 * r, 0.82 * r, -0.36 * r], true, 2);
      inked(g, dome, 0x3d5a2e, 3);
      for (const [x, y, s] of [[-0.55, -0.62, 0.22], [-0.05, -0.7, 0.24], [0.42, -0.6, 0.2], [-0.3, -0.98, 0.18], [0.2, -0.98, 0.17]]) {
        const plate = smooth(shard(x * r, y * r, s * r, rng(Math.round(x * 100 + y * 10)), 6, 0.7), true, 1);
        g.poly(plate).fill(0x557a3b).stroke({ width: 2, color: 0x2a3f20 });
      }
      for (let i = 0; i < 9; i++) blade(g, (-0.7 + i * 0.16) * r, (-1.08 - Math.sin((i / 8) * Math.PI) * 0.1) * r, 0.18 * r, (i % 3 - 1) * 0.06 * r, 0.06 * r, [0x6fa04a, 0x8ab85a, 0x4f7a34][i % 3]);
      g.circle(-0.1 * r, -1.22 * r, 0.05 * r).fill(0xe8d36a); // a flower
    },
    headAt: [0.86, -0.42],
    head(g, r) {
      inked(g, smooth([-0.18 * r, -0.12 * r, 0.16 * r, -0.2 * r, 0.36 * r, -0.06 * r, 0.32 * r, 0.1 * r, -0.18 * r, 0.12 * r], true, 2), 0x7c8a5a, 2.5);
      g.circle(0.12 * r, -0.08 * r, 0.04 * r).fill(0x1a1414);
      g.moveTo(0.1 * r, -0.13 * r).lineTo(0.18 * r, -0.12 * r).stroke({ width: 2, color: inkOf(0x7c8a5a) }); // a sleepy lid
      g.moveTo(0.2 * r, 0.04 * r).lineTo(0.36 * r, 0.02 * r).stroke({ width: 2, color: inkOf(0x7c8a5a) });
    },
  },

  /** A squat fire toad, dotted with live embers, eyes on top, tongue at the ready. */
  emberToad: {
    height: 1.15,
    turns: true,
    pace: 1.5,
    legs: { xs: [0.5], hipY: -0.32, len: 0.32, w: 0.16, color: 0xa83a14, swing: 0.4 },
    body(g, r) {
      // Folded back legs, then the body.
      inked(g, blob(-0.5 * r, -0.26 * r, 0.36 * r, 0.24 * r, 12, 0.12, 14), 0xa83a14, 2.5);
      inked(g, blob(0.0, -0.5 * r, 0.82 * r, 0.48 * r, 13, 0.08, 26), 0xc2491d, 3);
      g.poly(blob(0.1 * r, -0.28 * r, 0.6 * r, 0.16 * r, 3, 0.1, 14)).fill({ color: 0xe8a060, alpha: 0.7 }); // pale throat
      for (const [x, y, s] of [[-0.45, -0.66, 0.1], [-0.1, -0.84, 0.08], [-0.6, -0.42, 0.07], [0.2, -0.7, 0.07], [-0.25, -0.46, 0.06]]) {
        g.circle(x * r, y * r, s * 1.8 * r).fill({ color: 0xffb347, alpha: 0.25 });
        g.circle(x * r, y * r, s * r).fill(0xffb347);
      }
      // The eye on its bump, and the wide mouth.
      inked(g, blob(0.42 * r, -0.86 * r, 0.2 * r, 0.16 * r, 7, 0.08, 14), 0xc2491d, 2);
      g.ellipse(0.46 * r, -0.88 * r, 0.11 * r, 0.09 * r).fill(0xfff1c1).stroke({ width: 1.5, color: 0x1a0d05 });
      g.rect(0.44 * r, -0.95 * r, 0.04 * r, 0.14 * r).fill(0x1a0d05);
      g.moveTo(0.3 * r, -0.46 * r).quadraticCurveTo(0.6 * r, -0.4 * r, 0.82 * r, -0.52 * r).stroke({ width: 2.5, color: 0x5a1a08 });
    },
    tongueAt: [0.78, -0.48],
    tongue(g, r) {
      g.moveTo(0, 0).lineTo(0.5 * r, 0).stroke({ width: 7, color: 0xb04060, cap: 'round' });
      g.moveTo(0, 0).lineTo(0.5 * r, 0).stroke({ width: 4.5, color: 0xe86a8a, cap: 'round' });
      g.circle(0.5 * r, 0, 0.08 * r).fill(0xff8fa8).stroke({ width: 1.5, color: 0xb04060 });
    },
  },

  /** A giant glowing mushroom, swaying, eyes peering out from its stem. */
  glowcap: {
    height: 1.8,
    turns: false,
    body(g, r) {
      g.ellipse(0, -1.0 * r, 1.25 * r, 0.75 * r).fill({ color: 0x6fd6ff, alpha: 0.12 });
      const stem = smooth([-0.26 * r, 0.02 * r, -0.2 * r, -0.5 * r, -0.16 * r, -0.86 * r, 0.18 * r, -0.86 * r, 0.24 * r, -0.5 * r, 0.3 * r, 0.02 * r], true, 2);
      inked(g, stem, 0xcfdde6, 2.5);
      for (const x of [-0.08, 0.1]) {
        g.circle(x * r, -0.5 * r, 0.06 * r).fill({ color: 0x9fe6ff, alpha: 0.4 });
        g.circle(x * r, -0.5 * r, 0.03 * r).fill(0x9fe6ff);
      }
      const cap = smooth([-1.05 * r, -0.78 * r, -0.86 * r, -1.28 * r, -0.2 * r, -1.62 * r, 0.5 * r, -1.5 * r, 1.02 * r, -1.1 * r, 1.05 * r, -0.78 * r, 0.0, -0.9 * r], true, 2);
      inked(g, cap, 0x2f7fb8, 3);
      g.moveTo(-0.9 * r, -0.82 * r).quadraticCurveTo(0, -0.98 * r, 0.9 * r, -0.82 * r).stroke({ width: 3, color: 0x1a4a6a }); // gills
      for (const [x, y, s] of [[-0.5, -1.2, 0.12], [0.1, -1.4, 0.1], [0.55, -1.15, 0.09], [-0.15, -1.08, 0.07], [0.82, -0.95, 0.06], [-0.82, -0.98, 0.06]]) g.ellipse(x * r, y * r, s * r, s * 0.8 * r).fill(0xdff7ff);
    },
  },

  /** The Chuds' siege cart: planks on two wheels, a throwing arm with a boulder in its cup, the team's banner. */
  siege: {
    height: 1.75,
    turns: true,
    wheels: [-0.48, 0.42],
    wheelY: -0.3,
    wheelR: 0.3,
    body(g, r, team) {
      g.moveTo(-0.8 * r, -0.62 * r).lineTo(-0.8 * r, -1.66 * r).stroke({ width: 4, color: 0x4a3420 });
      inked(g, [-0.78 * r, -1.62 * r, -0.3 * r, -1.5 * r, -0.36 * r, -1.36 * r, -0.78 * r, -1.28 * r], team, 2);
      const bed = [-0.86 * r, -0.72 * r, 0.76 * r, -0.72 * r, 0.7 * r, -0.36 * r, -0.8 * r, -0.36 * r];
      inked(g, bed, 0x6b4a2b, 3);
      for (const y of [-0.6, -0.48]) g.moveTo(-0.82 * r, y * r).lineTo(0.72 * r, y * r).stroke({ width: 1.5, color: 0x3a2814 });
      for (const x of [-0.5, 0.0, 0.45]) g.circle(x * r, -0.66 * r, 0.025 * r).fill(0x9aa1ab);
      g.moveTo(-0.1 * r, -0.72 * r).lineTo(0.05 * r, -0.98 * r).lineTo(0.2 * r, -0.72 * r).stroke({ width: 4, color: 0x4a3420 }); // the arm's frame
    },
    // The throwing arm, pivoting on its frame.
    headAt: [0.05, -0.98],
    head(g, r) {
      limb(g, -0.7 * r, 0.1 * r, 0.08 * r, 0x7a5a36);
      inked(g, blob(-0.72 * r, -0.08 * r, 0.16 * r, 0.12 * r, 4, 0.1, 12), 0x5a4024, 2);
      inked(g, blob(-0.72 * r, -0.2 * r, 0.16 * r, 0.15 * r, 6, 0.2, 14), 0x8d8d8d, 2);
    },
  },

  /** A practice dummy: a straw sack on a post, a target painted on it. */
  dummy: {
    height: 1.9,
    turns: false,
    body(g, r, team) {
      g.moveTo(0, 0).lineTo(0, -1.0 * r).stroke({ width: 7, color: 0x4a3420 });
      inkLine(g, -0.55 * r, -1.2 * r, 0.55 * r, -1.2 * r, 7, { color: 0x6b4a2b, tip: 0.6 }, 0); // the arms
      const sack = smooth([-0.36 * r, -0.7 * r, -0.4 * r, -1.4 * r, 0.0, -1.5 * r, 0.4 * r, -1.4 * r, 0.36 * r, -0.7 * r], true, 2);
      inked(g, sack, 0xc8a86a, 3);
      for (const k of [0.3, 0.18, 0.08]) g.circle(0, -1.08 * r, k * r).fill(k === 0.18 ? 0xf2efe6 : team);
      inked(g, blob(0, -1.66 * r, 0.22 * r, 0.2 * r, 9, 0.12, 14), 0xc8a86a, 2.5); // the head
      for (let i = 0; i < 4; i++) blade(g, (-0.3 + i * 0.2) * r, -0.68 * r, 0.12 * r, (i - 1.5) * 0.06 * r, 0.06 * r, 0xe0c27a); // straw poking out
    },
  },
};

export class Beast implements Figure {
  readonly root = new Container();
  readonly height: number;
  private readonly z = new Container();
  private readonly farLegs: Graphics[] = [];
  private readonly nearLegs: Graphics[] = [];
  private readonly wheels: Graphics[] = [];
  private readonly head: Graphics | null = null;
  private readonly tail: Graphics | null = null;
  private readonly tongue: Graphics | null = null;
  private readonly body = new Graphics();
  private phase = Math.random() * Math.PI * 2;
  private stride = 0;
  private roll = 0;
  private clock = Math.random() * 10;
  private flip = 1;
  /** Seconds with nothing going on (not moving, not fighting); after a while they get on with their lives. */
  private calm = 0;
  /** How far gone the Mossback's doze is (0–1), and its drifting z's. */
  private doze = 0;
  private readonly zs: { g: Graphics; age: number }[] = [];
  private nextZ = 0;
  /** The toad's fly (and when it'll be back after being eaten), the rats' squabbles: the current act. */
  private fly: Graphics | null = null;
  private flyGone = 0;
  private act: { t: number; dur: number; hop: number } | null = null;
  private nextAct = 1 + Math.random() * 2;
  private crumb: Graphics | null = null;

  constructor(private readonly kind: BeastKind, private readonly r: number, team = 0x8a9099) {
    const spec = SPECS[kind];
    this.height = spec.height * r;
    if (spec.legs) {
      for (const x of spec.legs.xs) {
        for (const near of [false, true]) {
          const leg = new Graphics();
          limb(leg, spec.legs.len * r, spec.legs.w * r, spec.legs.w * 0.8 * r, near ? spec.legs.color : shade(spec.legs.color, 0.25));
          leg.position.set(x * r + (near ? 0.04 : -0.04) * r, spec.legs.hipY * r);
          (near ? this.nearLegs : this.farLegs).push(leg);
        }
      }
    }
    if (spec.tail) {
      this.tail = new Graphics();
      spec.tail(this.tail, r);
      this.tail.position.set(spec.tailAt![0] * r, spec.tailAt![1] * r);
    }
    spec.body(this.body, r, team);
    if (spec.head) {
      this.head = new Graphics();
      spec.head(this.head, r, team);
    }
    if (spec.tongue) {
      this.tongue = new Graphics();
      spec.tongue(this.tongue, r);
      this.tongue.position.set(spec.tongueAt![0] * r, spec.tongueAt![1] * r);
    }
    for (const x of spec.wheels ?? []) {
      const w = new Graphics();
      const wr = (spec.wheelR ?? 0.3) * r;
      w.circle(0, 0, wr).fill(0x5a4024).stroke({ width: 3, color: 0x1a1008 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI;
        w.moveTo(Math.cos(a) * wr, Math.sin(a) * wr).lineTo(-Math.cos(a) * wr, -Math.sin(a) * wr).stroke({ width: 2.5, color: 0x3a2814 });
      }
      w.circle(0, 0, wr * 0.22).fill(0x9aa1ab);
      w.position.set(x * r, (spec.wheelY ?? -0.3) * r);
      this.wheels.push(w);
    }
    this.z.addChild(...this.farLegs, ...(this.tail ? [this.tail] : []), this.body, ...(this.head ? [this.head] : []), ...(this.tongue ? [this.tongue] : []), ...this.nearLegs, ...this.wheels);
    if (kind === 'emberToad') {
      // A fly: a dark speck with two glassy wings.
      this.fly = new Graphics()
        .ellipse(-0.03 * r, -0.05 * r, 0.06 * r, 0.035 * r)
        .fill({ color: 0xdff2ff, alpha: 0.7 })
        .ellipse(0.03 * r, -0.05 * r, 0.06 * r, 0.035 * r)
        .fill({ color: 0xdff2ff, alpha: 0.7 })
        .circle(0, 0, 0.04 * r)
        .fill(0x1a1414);
      this.fly.alpha = 0;
      this.z.addChild(this.fly);
    }
    if (kind === 'ratKing') {
      // A crumb of cheese he's not sharing.
      this.crumb = inked(new Graphics(), [0.75 * r, -0.02 * r, 1.05 * r, -0.02 * r, 0.9 * r, -0.2 * r], 0xf2c14e, 2);
      this.crumb.circle(0.88 * r, -0.07 * r, 0.025 * r).fill(0xc8952a);
      this.crumb.alpha = 0;
      this.z.addChildAt(this.crumb, 0);
    }
    this.root.addChild(this.z);
  }

  update(input: RigInput): void {
    const spec = SPECS[this.kind];
    const { r } = this;
    const { dt } = input;
    this.clock += dt;
    const busy = input.speed > 20 || input.reach !== 0 || input.turn !== 0 || input.stretch !== 0 || !!input.recoil || !!input.dead || input.air > 0 || !!input.tumble;
    this.calm = busy ? 0 : this.calm + dt;
    const life = this.idleLife(dt, this.calm > 2.5);
    input = { ...input, reach: input.reach + life.reach, stretch: input.stretch + life.stretch, air: Math.max(input.air, life.hop), facing: life.facing ?? input.facing };
    const moving = input.speed > 20;
    this.stride = moving ? Math.min(1, this.stride + dt * 6) : Math.max(0, this.stride - dt * 5);
    if (moving) this.phase += dt * Math.min(spec.pace ?? 2, input.speed / (2 * r)) * Math.PI * 2;
    const st = this.stride;
    if (spec.turns && input.facing !== 0) this.flip = input.facing;
    const twistW = Math.cos(input.twist);
    // Mushrooms and dummies don't turn, but they do sway and wobble.
    const sway = spec.turns ? 0 : Math.sin(this.clock * 1.3) * 0.04 + input.twist * 0.3;
    // Dying, they keel over (or, a mushroom or a dummy, slump); knocked up, they flip.
    const fall = input.dead ? Math.min(1, input.dead / 0.5) : 0;
    this.z.scale.set((spec.turns ? this.flip * twistW : 1) * (1 + input.grow), (1 + input.grow * 1.2) * (spec.turns ? 1 : 1 - fall * 0.55));
    this.z.rotation = spec.turns ? this.flip * (-fall * 1.4 - (input.tumble ?? 0) * Math.PI * 2) : 0;
    this.z.skew.x = sway;
    this.z.position.set((spec.turns ? this.flip : 1) * input.lunge * 0.8 * r, -input.air * 0.7 * r);
    const bob = Math.abs(Math.sin(this.phase)) * 0.05 * r * st;
    this.body.y = -bob + Math.sin(this.clock * 2.2) * 0.01 * r * (1 - st);
    if (spec.legs) {
      const swing = spec.legs.swing * st;
      // Diagonal pairs move together: near front with far back, and the other two.
      this.nearLegs.forEach((leg, i) => (leg.rotation = Math.PI / 2 + swing * Math.sin(this.phase + i * Math.PI)));
      this.farLegs.forEach((leg, i) => (leg.rotation = Math.PI / 2 + swing * Math.sin(this.phase + (i + 1) * Math.PI)));
    }
    if (this.head && spec.headAt) {
      // Nodding with the step, or drooping in a doze.
      const nod = Math.sin(this.phase * 2) * 0.02 * r * st + this.doze * (0.08 + Math.sin(this.clock * 1.2) * 0.015) * r;
      if (this.kind === 'siege') {
        // The arm rocks back on a draw and flings forward on a throw.
        this.head.position.set(spec.headAt[0] * r, spec.headAt[1] * r);
        this.head.rotation = -input.reach * 2.2 - 0.25;
      } else {
        this.head.position.set(spec.headAt[0] * r + Math.max(0, input.reach) * 0.4 * r, spec.headAt[1] * r - bob + nod);
        this.head.rotation = input.turn * 0.15 + this.doze * 0.35;
      }
    }
    if (this.tail) this.tail.rotation = Math.sin(this.clock * 3.2) * 0.25 + Math.sin(this.phase) * 0.2 * st;
    if (this.tongue) this.tongue.scale.x = 0.2 * (1 + input.stretch);
    // Wheels turn with the ground going by.
    this.roll += (dt * input.speed) / ((spec.wheelR ?? 0.3) * r);
    for (const w of this.wheels) w.rotation = this.roll;
  }

  /** What they get up to left alone (`idle`): dozing, fly-catching, squabbling. Eases off when anything happens. */
  private idleLife(dt: number, idle: boolean): IdleLife {
    const { r } = this;
    const life: IdleLife = { reach: 0, stretch: 0, hop: 0 };
    // The Mossback nods off, and the z's drift up from its head.
    if (this.kind === 'mossback') {
      this.doze += ((idle ? 1 : 0) - this.doze) * Math.min(1, dt * (idle ? 0.8 : 6));
      this.nextZ -= dt;
      if (this.doze > 0.8 && this.nextZ <= 0) {
        this.nextZ = 1.3;
        const s = 0.16 + Math.random() * 0.06;
        const z = new Graphics().moveTo(-s * r, -s * r).lineTo(s * r, -s * r).lineTo(-s * r, s * r).lineTo(s * r, s * r);
        z.stroke({ width: 5, color: 0x1a1414, cap: 'round', join: 'round' }).stroke({ width: 2.5, color: 0xf2efe6, cap: 'round', join: 'round' });
        this.root.addChild(z);
        this.zs.push({ g: z, age: 0 });
      }
      for (const z of this.zs) {
        z.age += dt;
        // From the head, up and away behind it, swaying, growing, fading.
        z.g.position.set(this.flip * (1.0 - z.age * 0.15) * r + Math.sin(z.age * 3) * 0.12 * r, (-0.7 - z.age * 0.45) * r);
        z.g.scale.set(0.6 + z.age * 0.25);
        z.g.alpha = Math.min(1, z.age * 3) * Math.max(0, 1 - z.age / 2.4) * this.doze;
      }
      for (const z of this.zs.filter((z) => z.age > 2.4 || this.doze < 0.05)) z.g.destroy();
      this.zs.splice(0, this.zs.length, ...this.zs.filter((z) => !z.g.destroyed));
      return life;
    }
    // The Ember Toad: a fly buzzes round in front of it; every so often the tongue lashes out and the
    // fly's gone (another turns up a little later).
    if (this.fly) {
      this.flyGone = Math.max(0, this.flyGone - dt);
      const show = idle && this.flyGone <= 0;
      this.fly.alpha += ((show ? 1 : 0) - this.fly.alpha) * Math.min(1, dt * 4);
      const a = this.clock * 3.1;
      this.fly.position.set((1.25 + Math.cos(a) * 0.22) * r, (-0.62 + Math.sin(a * 1.7) * 0.18) * r);
      this.fly.scale.y = Math.sin(this.clock * 60) > 0 ? 1 : 0.6; // wings a-blur
      this.tickAct(dt, show && this.fly.alpha > 0.9, 2.5, 4.5, 0.3);
      if (this.act) {
        const k = Math.sin((this.act.t / this.act.dur) * Math.PI);
        life.stretch = k * 6;
        // Snapped up at full stretch.
        if (this.act.t / this.act.dur > 0.5 && this.flyGone <= 0) {
          this.flyGone = 2.5 + Math.random() * 3;
          this.fly.alpha = 0;
        }
      }
      return life;
    }
    // Rats: rounding on each other, a nip, a hop; the Rat King minds his crumb.
    if (this.kind === 'rat' || this.kind === 'ratKing') {
      if (this.crumb) this.crumb.alpha += ((idle ? 1 : 0) - this.crumb.alpha) * Math.min(1, dt * 3);
      const before = this.act;
      this.tickAct(dt, idle, 1.2, 2.8, 0.35);
      if (this.act && this.act !== before) {
        // A new squabble: turn round (or not), and nip (and maybe hop).
        if (Math.random() < 0.6) this.flip = -this.flip;
        this.act.hop = Math.random() < 0.5 ? 0.35 : 0;
      }
      if (this.act) {
        const k = Math.sin((this.act.t / this.act.dur) * Math.PI);
        life.reach = k * 0.6;
        life.hop = k * this.act.hop;
      }
      if (idle) life.facing = this.flip;
      return life;
    }
    return life;
  }

  /** Runs the current idle act, and starts the next one every `min`–`max` seconds while `ok`. */
  private tickAct(dt: number, ok: boolean, min: number, max: number, dur: number): void {
    if (this.act) {
      this.act.t += dt;
      if (this.act.t >= this.act.dur) this.act = null;
      return;
    }
    if (!ok) return;
    this.nextAct -= dt;
    if (this.nextAct > 0) return;
    this.nextAct = min + Math.random() * (max - min);
    this.act = { t: 0, dur, hop: 0 };
  }
}

export interface IdleLife {
  reach: number;
  stretch: number;
  hop: number;
  /** Facing a new way (a rat rounding on another), or left as it was. */
  facing?: number;
}

/** How tall each creature stands, in units of its radius. */
export function beastHeight(kind: BeastKind): number {
  return SPECS[kind].height;
}
