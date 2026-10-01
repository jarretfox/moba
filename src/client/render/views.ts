import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { FigureLight } from './lighting';
import { mix } from './organic';
import { titleName } from '../../shared/titles';
import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { EntitySnap, StatusKind } from '../../shared/protocol';
import type { ItemId } from '../../shared/items';
import { STRUCTURE_DEFS } from '../../shared/sim/structure';
import type { Slot } from '../../shared/constants';
import type { ChampionId } from '../../shared/champions/types';
import { ATTACK, FIDGETS, UNIT_ATTACK, castAnim, sample, type Anim } from './animation';
import { drawChampionBase, palette } from './champions';
import { Beast } from './beasts';
import { dressChud } from './chudLife';
import { BUILDS, UNIT_BUILDS, unitPalette } from './builds';
import { Rig, type Expression, type Figure, type Posture } from './rig';
import { flightHeight } from './stature';
import type { Wind } from './wind';
import { blade } from './organic';
import { BUILDING, buildingHeight, drawCrystal, drawFlag, drawFort, drawFortRuin, drawOak, drawOakStump, drawTower, drawTowerRuin, flagSpots } from './structures';
import { RECALLS, type RecallRoutine, type Say } from './recalls';
import { arc } from './draw';

export type Relation = 'self' | 'ally' | 'enemy' | 'neutral';

/** Colors are relative to the viewer, like League: you're green, allies blue, enemies red. */
export const PALETTE = {
  ally: 0x3d8bfd,
  enemy: 0xe5484d,
  selfHp: 0x4ade80,
  mana: 0x5aa9ff,
  rage: 0xff6b3d,
  dummy: 0xb58b52,
  /** Jungle monsters: nobody's side. */
  neutral: 0xe8a33d,
  outline: 0x0b0f14,
  invulnerable: 0x8a93a0,
  stone: 0x59606c,
  stoneDark: 0x3a3f48,
  bark: 0x6b4a2b,
  leaf: 0x3f7a35,
  leafDark: 0x2c5a26,
};

/** Red-blind friendly: enemies in orange-yellow instead of red (for everything drawn from now on). */
export function setColorblind(on: boolean): void {
  PALETTE.enemy = on ? 0xffa81e : 0xe5484d;
}

/** A lighter tint of the enemy color, for flashes and sparks. */
export function enemyLight(): number {
  return PALETTE.enemy === 0xe5484d ? 0xff7a7a : 0xffc46b;
}

/** What a view might need to know beyond its own entity. */
export interface ViewContext {
  /** The viewer's champion, if alive. */
  me: EntitySnap | undefined;
  inBrush(x: number, y: number): boolean;
  /** In the river (figures wade, their legs under the water). */
  inWater?(x: number, y: number): boolean;
  /** The wind, for grass round the legs and banners. */
  wind?: Wind;
  /** The light falling on a spot (for a glow on that side, a tint, and a shadow cast away from it). */
  light?(x: number, y: number): FigureLight;
  /** How far into the night it is (0–1): shadows lengthen. */
  night?: number;
  /** How far into dusk (0–1): the lanterns are lit, and so are the Shooties' windows. */
  dusk?: number;
}

/** A soft round glow, shared by every figure's back light. */
let glowTexture: Texture | null = null;
function softGlow(): Texture {
  if (glowTexture) return glowTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const grad = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, size, size);
  glowTexture = Texture.from(canvas);
  return glowTexture;
}

export interface EntityView {
  readonly container: Container;
  update(s: EntitySnap, dt: number, ctx: ViewContext): void;
  onAttack?(): void;
  /** Took a hit: a quick flash, and a stagger away from `from` if it was a big one. */
  onHit?(from?: { x: number; y: number }, heavy?: boolean): void;
  /** Cast an ability: the champion strikes a pose for it. */
  onCast?(slot: Slot): void;
  /** Hit-stop: held in place for a split second, shuddering by `shudder` pixels. Purely visual. */
  freeze?(seconds: number, shudder: number): void;
  /** The tall part of the view, drawn on a raised layer (structures). */
  readonly top?: Container;
}

/** Busy standing still (channeling, held in place, out of sight): no fidgeting then. */
const STILL_STATUSES: ReadonlySet<StatusKind> = new Set<StatusKind>(['recall', 'stun', 'root', 'fear', 'airborne', 'burrowed', 'underground']);

/** Seconds a unit takes to slump and fade when it dies. */
const DEATH_TIME = 0.55;
/** Upright figures take longer: they crumple, lie there a moment, then fade. */
const FIGURE_DEATH_TIME = 1.7;
/** Seconds of each lap the Warden walks, pacing its pit (then it stops and looks about). */
const PACE_WALK = 2.4;
/** Seconds a Chud's cheer lasts. */
const CHEER_TIME = 1.5;

export class UnitView implements EntityView {
  readonly container = new Container();
  private readonly body = new Graphics();
  /** Flat things that turn to face where they're going (seen from above). */
  private readonly facing = new Container();
  private readonly figure = new Graphics();
  private readonly champ: ChampionId | null = null;
  /** What this unit does when it attacks. */
  private readonly attackAnim: Anim | null = null;
  /** Seconds into a recall, and the props its routine draws behind and in front of the figure. */
  private recallT = 0;
  private readonly recallUnder = new Graphics();
  private readonly recallOver = new Container();
  private readonly recallOverG = new Graphics();
  private readonly recallTexts: Text[] = [];
  private pal: Record<string, number> = {};
  /** Standing still (no walking, no moves): after a while a champion fidgets. */
  private idle = 0;
  private nextFidget = 4 + Math.random() * 4;
  private fidgets = Math.floor(Math.random() * 2);
  /** The move playing right now (attack or cast), t from 0 to 1. */
  private anim: { a: Anim; t: number } | null = null;
  /** Knocked back by a big hit; settles back to 0. */
  private readonly knock = { x: 0, y: 0 };
  /** Squashed by a hit or a landing, springing back. */
  private squash = 0;
  /** Hit-stop: seconds left frozen, how hard to shudder, and where it's being held. */
  private frozen = 0;
  private shudder = 0;
  private heldAt: { x: number; y: number } | null = null;
  private readonly statusRing = new Graphics();
  private readonly bars = new Graphics();
  private readonly label: Text;
  /** Champion level, in a box left of the health bar. */
  private readonly levelText: Text | null = null;
  /** An icon everyone can see over the head (Willmore's next junk). Made the first time one shows up. */
  private badge: Text | null = null;
  /** The player's title, small and gold over their name. */
  private titleText: Text | null = null;
  /** A WANTED poster over a champion on a spree, with the gold on their head. */
  private poster: Container | null = null;
  private posterGold: Text | null = null;
  private barKey = '';
  private statusKey = '';
  private pulse = 0;
  private air = 0;
  private stride = 0;
  /** Seconds since death, for the fall-and-fade. */
  private dying = 0;
  private clock = Math.random() * 10;
  private flash = 0;
  /** The weapon's flash as a basic attack lands (1 at impact, dying away), and whether this attack's has gone. */
  private glint = 0;
  private hitFired = false;
  private last: { x: number; y: number } | null = null;
  /** The radius the body was drawn at; Berserk grows the real one. */
  private readonly baseR: number;
  /** Anything that walks stands up: a jointed figure (or a creature) facing left or right. */
  private readonly rig: Figure | null = null;
  private side = 1;
  /** Faces: seconds left wincing from a hit, and grinning (a kill, an ultimate, a laugh). */
  private hurtT = 0;
  private grinT = 0;
  /** The Warden, left alone: pacing its pit (how far from its spot, which way, how long into this lap). */
  private readonly warden: boolean = false;
  private wardenCalm = 0;
  private paceX = 0;
  private paceDir = 1;
  private paceT = 0;
  /** A Chud: cheering (seconds left) when a Shootie falls. */
  private readonly chud: boolean = false;
  private cheerT = 0;
  /** A hit to flinch from on the next frame (+ knocked back, − forward), and how long they've been airborne. */
  private recoil = 0;
  private airT = 0;
  private lastCast = -9;
  /** How far above the unit's spot the top of it is (bars and names go over that). */
  private readonly headroom: number;
  /** Standing in the river: the water round their shins, and rings spreading out. */
  private readonly wade = new Container();
  private readonly ripple = new Graphics();
  /** In the brush: tall grass in front of their legs, swaying. */
  private readonly grass = new Graphics();
  /** A long soft shadow cast away from the light, longer as night falls. */
  private readonly cast = new Graphics();
  /** Light catching the figure from the side the light is on (champions). */
  private backlight: Sprite | null = null;
  private readonly resourceColor: number;

  constructor(s: EntitySnap, private readonly relation: Relation) {
    const r = s.r;
    this.baseR = r;
    this.resourceColor = s.champ && CHAMPION_INFO[s.champ].resource === 'rage' ? PALETTE.rage : PALETTE.mana;
    const color = s.k === 'dummy' ? PALETTE.dummy : relation === 'enemy' ? PALETTE.enemy : PALETTE.ally;

    // Everything that stands up casts a soft shadow round its feet.
    const shadow = () => this.body.ellipse(0, r * 0.08, r * 0.95, r * 0.4).fill({ color: 0x000000, alpha: 0.32 });
    if (s.k === 'chud') {
      // A Chud in a hood of its team's color (or the siege cart, flying the team's banner).
      const type = s.chud ?? 'melee';
      shadow();
      this.rig = type === 'siege' ? new Beast('siege', r, color) : new Rig(UNIT_BUILDS[`chud:${type}`], r, unitPalette(color), `chud:${type}:${color}:${r}`);
      // Each one in whatever it found to wear, with a face of its own.
      if (this.rig instanceof Rig) dressChud(this.rig.part.headProp, r, s.id, type === 'brute');
      this.chud = true;
      this.attackAnim = UNIT_ATTACK[`chud:${type}`] ?? null;
    } else if (s.k === 'monster') {
      const kind = s.mon ?? 'rat';
      shadow();
      this.rig = kind === 'warden' ? new Rig(UNIT_BUILDS['monster:warden'], r, unitPalette(color)) : new Beast(kind, r);
      this.warden = kind === 'warden';
      this.attackAnim = UNIT_ATTACK[`monster:${kind}`] ?? null;
    } else if (s.k === 'guard') {
      // King Rix's royal guards: the team's tabard and shield, a spear.
      shadow();
      this.rig = new Rig(UNIT_BUILDS.guard, r, unitPalette(color), `guard:${color}:${r}`);
      this.attackAnim = UNIT_ATTACK.guard;
    } else if (s.k === 'totem') {
      this.body.circle(4, 6, r).fill({ color: 0x000000, alpha: 0.35 });
      // A squat glowing mushroom with a team-colored ring around its stalk.
      this.body.circle(0, 0, r).fill({ color: 0x6fd6ff, alpha: 0.12 });
      this.body.ellipse(0, -r * 0.2, r * 0.95, r * 0.75).fill(0x7a3fb0).stroke({ width: 2, color: PALETTE.outline });
      for (const [x, y, rr] of [[-0.4, -0.35, 0.16], [0.35, -0.4, 0.13], [0.05, -0.05, 0.12]]) this.body.circle(x * r, y * r, rr * r).fill(0xe8d7ff);
      this.body.circle(0, r * 0.45, r * 0.35).fill(color).stroke({ width: 2, color: PALETTE.outline });
    } else if (s.k === 'dummy') {
      shadow();
      this.rig = new Beast('dummy', r, PALETTE.enemy);
    } else if (s.k === 'champion' && s.champ) {
      drawChampionBase(this.body, r, color, relation === 'self');
      this.champ = s.champ;
      this.pal = palette(s.champ, s.skin ?? 0);
      this.rig = new Rig(BUILDS[s.champ], r, this.pal);
      this.side = Math.cos(s.f) < 0 ? -1 : 1;
      this.attackAnim = ATTACK[s.champ];
    } else {
      this.body.circle(0, 0, r).fill(color).stroke({ width: 3, color: relation === 'self' ? 0xffffff : PALETTE.outline });
      this.body.circle(0, 0, r * 0.55).fill({ color: 0xffffff, alpha: 0.12 });
      this.figure.poly([r - 6, -10, r + 12, 0, r - 6, 10]).fill(0xffffff).stroke({ width: 2, color: PALETTE.outline });
    }
    this.facing.addChild(this.figure);

    this.label = new Text({
      text: s.name ?? '',
      style: { fontFamily: 'Nunito, system-ui, sans-serif', fontSize: 13, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } },
    });
    this.label.anchor.set(0.5, 1);
    this.headroom = this.rig ? this.rig.height + 6 : r;
    this.label.position.set(0, -this.headroom - 24);

    this.recallOver.addChild(this.recallOverG);
    if (this.rig) {
      // The water's surface round the legs (with a pale rim), and a ring spreading out from them.
      const water = new Graphics()
        .ellipse(0, -r * 0.02, r * 0.8, r * 0.24)
        .fill({ color: 0x2a6a80, alpha: 0.88 })
        .ellipse(0, -r * 0.02, r * 0.8, r * 0.24)
        .stroke({ width: 2.5, color: 0xbfe9f4, alpha: 0.7 });
      water.moveTo(-r * 0.35, -r * 0.08).lineTo(-r * 0.1, -r * 0.1).stroke({ width: 2, color: 0xffffff, alpha: 0.45 });
      this.ripple.ellipse(0, 0, r * 0.8, r * 0.24).stroke({ width: 2, color: 0xbfe9f4, alpha: 0.8 });
      this.wade.addChild(this.ripple, water);
      this.wade.visible = false;
      // Blades of grass across the front of the legs, darker at the back.
      for (let i = 0; i < 14; i++) {
        const x = (-0.7 + (i / 13) * 1.4) * r + (Math.random() - 0.5) * 6;
        const h = (0.45 + Math.random() * 0.4) * r;
        blade(this.grass, x, r * 0.12, h, (Math.random() - 0.5) * r * 0.3, 0.13 * r, [0x2f6e28, 0x3a7a31, 0x4c8f40][i % 3]);
      }
      this.grass.visible = false;
    }
    if (this.rig) {
      this.cast.ellipse(0, 0, r, r * 0.38).fill({ color: 0x000000, alpha: 0.26 });
      if (s.k === 'champion') {
        this.backlight = new Sprite(softGlow());
        this.backlight.anchor.set(0.5);
        this.backlight.blendMode = 'add';
      }
    }
    this.container.addChild(this.cast, this.statusRing, this.recallUnder, this.body, this.facing, ...(this.backlight ? [this.backlight] : []), ...(this.rig ? [this.rig.root, this.wade, this.grass] : []), this.recallOver, this.bars, this.label);
    if (s.k === 'champion') {
      this.levelText = new Text({ text: '', style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 12, fill: 0xffe29a } });
      this.levelText.anchor.set(0.5);
      this.container.addChild(this.levelText);
    }
  }

  update(s: EntitySnap, dt: number, ctx: ViewContext): void {
    // Hit-stop: held where it was for a split second (shuddering if it took the hit)...
    if (this.frozen > 0 && !s.dead) {
      this.frozen -= dt;
      this.heldAt ??= { x: this.container.x, y: this.container.y };
      const j = this.shudder;
      this.container.position.set(this.heldAt.x + (Math.random() - 0.5) * 2 * j, this.heldAt.y + (Math.random() - 0.5) * 2 * j);
      return;
    }
    // ...then eased from there to where it really is now (keeping any knockback on top).
    if (this.heldAt) {
      this.knock.x += this.heldAt.x - s.x;
      this.knock.y += this.heldAt.y - s.y;
      this.heldAt = null;
    }
    this.dying = s.dead ? this.dying + dt : 0;
    const fall = Math.min(1, this.dying / (this.rig ? FIGURE_DEATH_TIME : DEATH_TIME));
    // Upright figures crumple (in the figure) and lie there a moment before fading; the rest slump and fade.
    const fade = this.rig ? Math.max(0, Math.min(1, (this.dying - (FIGURE_DEATH_TIME - 0.6)) / 0.6)) : fall;
    this.container.visible = !s.dead || fall < 1;
    this.container.alpha = (ctx.inBrush(s.x, s.y) ? 0.55 : 1) * (1 - fade);
    this.container.rotation = this.rig ? 0 : fall * 0.6;
    // Nearer the bottom of the screen draws in front.
    this.container.zIndex = s.y;
    this.bars.visible = this.label.visible = !s.dead;
    // A big hit knocks the figure back a step; it recovers quickly.
    const settle = Math.exp(-dt * 10);
    this.knock.x *= settle;
    this.knock.y *= settle;
    this.container.position.set(s.x + this.knock.x, s.y + this.knock.y);

    // The current move: how far through it, and where each part is.
    let turn = 0;
    let reach = 0;
    let twist = 0;
    let lungeBy = 0;
    let grow = 0;
    let stretch = 0;
    let swinging = false;
    if (this.anim) {
      this.anim.t += dt / this.anim.a.dur;
      if (this.anim.t >= 1 || s.dead) this.anim = null;
      else {
        const { a, t } = this.anim;
        swinging = a === this.attackAnim;
        // The moment the blow lands, the weapon flashes.
        if (swinging && !this.hitFired && t >= (a.hit ?? 0.5)) {
          this.hitFired = true;
          this.glint = 1;
        }
        turn = sample(a.turn, t);
        reach = sample(a.reach, t);
        twist = sample(a.twist, t);
        lungeBy = sample(a.lunge, t);
        grow = sample(a.grow, t);
        stretch = sample(a.stretch, t);
      }
    }

    // Recalling: the champion's own routine (push-ups, a throne, a nap...).
    let posture: Posture | undefined;
    let recallFace: Expression | undefined;
    if (this.champ && s.st?.includes('recall') && !s.dead) {
      this.recallT += dt;
      const routine = RECALLS[this.champ];
      const pose = routine.pose(this.recallT);
      // Eased in over the first moment, so whatever the routine starts with doesn't snap.
      const ease = Math.min(1, this.recallT / 0.3);
      turn += (pose.turn ?? 0) * ease;
      reach += (pose.reach ?? 0) * ease;
      twist += (pose.twist ?? 0) * ease;
      lungeBy += (pose.lunge ?? 0) * ease;
      grow += (pose.grow ?? 0) * ease;
      posture = { sit: pose.sit, lie: pose.lie, bow: pose.bow, look: pose.look, armF: pose.armF, armB: pose.armB, weight: ease };
      recallFace = pose.face;
      this.drawRecall(routine);
    } else if (this.recallT > 0) {
      this.recallT = 0;
      this.recallUnder.clear();
      this.recallOverG.clear();
      for (const t of this.recallTexts) t.visible = false;
      if (this.rig instanceof Rig) {
        this.rig.part.handProp.clear();
        this.rig.part.headProp.clear();
        if (!s.dead) this.rig.part.weapon.visible = true;
      }
    }

    // How fast it's going drives the walk (in the figure), and stills the breathing here.
    const moved = this.last && dt > 0 ? Math.hypot(s.x - this.last.x, s.y - this.last.y) / dt : 0;
    const vx = this.last && dt > 0 ? (s.x - this.last.x) / dt : 0;
    this.last = { x: s.x, y: s.y };
    const walking = moved > 40 && !s.dead;
    this.stride = walking ? Math.min(1, this.stride + dt * 6) : Math.max(0, this.stride - dt * 6);
    this.clock += dt;
    const breathe = 1 + Math.sin(this.clock * 2.4) * 0.015 * (1 - this.stride);
    if (this.champ) {
      const held = s.st?.some((k) => STILL_STATUSES.has(k));
      this.idle = walking || this.anim || s.dead || held ? 0 : this.idle + dt;
      if (this.idle > this.nextFidget) {
        const list = FIDGETS[this.champ];
        this.anim = { a: list[this.fidgets++ % list.length], t: 0 };
        this.idle = 0;
        this.nextFidget = 5 + Math.random() * 5;
      }
    }
    // Chuds: hopping with their arms up in a cheer, or flapping their arms about in a panic when they're
    // nearly done for.
    let hop = 0;
    if (this.chud && this.rig instanceof Rig && !s.dead) {
      this.cheerT = Math.max(0, this.cheerT - dt);
      const into = CHEER_TIME - this.cheerT;
      if (this.cheerT > 0 && !this.anim) {
        posture ??= { armF: [-1.4, 0.2], armB: [-1.6, 0.1], weight: Math.min(1, this.cheerT / 0.25, into / 0.15) };
        hop = Math.max(0, Math.sin(into * 9)) * 0.5;
      } else if ((s.hp ?? 1) < (s.mhp ?? 1) * 0.3 && walking) {
        const flap = Math.sin(this.clock * 14);
        posture ??= { armF: [-1.5 + flap * 0.6, 0.5], armB: [-1.5 - flap * 0.6, 0.5] };
      }
    }
    // The Warden, undisturbed for a while, paces its pit: a few steps one way, a stop to look about, round
    // and back. Anything happening and it's straight back on its spot.
    let paceSpeed = 0;
    let paceLook = 0;
    if (this.warden && this.rig) {
      const calm = !s.dead && !walking && !this.anim && (s.hp ?? 0) >= (s.mhp ?? 1);
      this.wardenCalm = calm ? this.wardenCalm + dt : 0;
      if (this.wardenCalm > 3) {
        this.paceT += dt;
        if (this.paceT < PACE_WALK) {
          paceSpeed = 0.7 * s.r;
          this.paceX += this.paceDir * paceSpeed * dt;
        } else {
          paceLook = Math.sin((this.paceT - PACE_WALK) * 2.2) * 0.3;
          if (this.paceT > PACE_WALK + 1.6) {
            this.paceT = 0;
            // Round and back toward the spot (never wandering far from it).
            this.paceDir = this.paceX > 0 ? -1 : 1;
          }
        }
      } else {
        this.paceX *= Math.exp(-dt * 5);
        this.paceT = 0;
      }
      this.rig.root.x = this.body.x = this.paceX;
    }
    if (this.rig) {
      // Facing left or right, with a little give so walking straight up or down doesn't flicker.
      const c = Math.cos(s.f);
      if (c > 0.25) this.side = 1;
      else if (c < -0.25) this.side = -1;
      this.hurtT = Math.max(0, this.hurtT - dt);
      this.grinT = Math.max(0, this.grinT - dt);
      // Knocked into the air (not a leap of their own): a backflip.
      const airborne = !!s.st?.includes('airborne');
      this.airT = airborne ? this.airT + dt : 0;
      const knocked = airborne && (!!s.st?.includes('stun') || this.clock - this.lastCast > 0.6);
      const k = Math.min(1, this.airT / 0.6);
      this.glint = Math.max(0, this.glint - dt * 5);
      this.rig.update({
        dt,
        speed: s.dead ? 0 : Math.max(moved, paceSpeed),
        facing: paceSpeed > 0 || paceLook !== 0 ? this.paceDir : this.side,
        turn,
        reach,
        twist,
        lunge: lungeBy,
        grow,
        stretch,
        swing: swinging ? 1 : 0,
        glint: this.glint,
        air: Math.max(this.air, hop),
        vx: s.dead ? 0 : vx,
        recoil: this.recoil,
        dizzy: s.st?.includes('stun') && !airborne ? 1 : 0,
        tumble: knocked ? k * k * (3 - 2 * k) : 0,
        dead: s.dead ? this.dying : 0,
        // They glance where they're heading: up the screen, or down it.
        look: Math.sin(s.f) * 0.3 + paceLook,
        expression: recallFace !== undefined ? recallFace : this.hurtT > 0 ? 'hurt' : this.grinT > 0 ? 'grin' : null,
        posture,
      });
      this.recoil = 0;
    }
    this.facing.rotation = s.f + twist;

    this.pulse = Math.max(0, this.pulse - dt * 6);
    this.flash = Math.max(0, this.flash - dt * 8);
    // Leaping units swell toward the camera and settle back as they land.
    const airborne = s.st?.includes('airborne') ?? false;
    this.air = airborne ? Math.min(1, this.air + dt * 8) : Math.max(0, this.air - dt * 8);
    const size = (s.r / this.baseR) * (1 + this.pulse * 0.08) * (1 + this.air * 0.3) * (1 + grow) * breathe * (1 - fall * 0.35);
    this.squash = Math.max(0, this.squash - dt * 7);
    const wide = size * (1 + 0.16 * this.squash);
    const tall = size * (1 - 0.14 * this.squash);
    this.body.scale.set(wide, tall);
    this.facing.scale.set(wide, tall);
    if (this.rig) {
      // The rig does its own growing and leaping; this is just hits and Berserk.
      const k = (s.r / this.baseR) * (1 + this.pulse * 0.05);
      this.rig.root.scale.set(k * (1 + 0.12 * this.squash), k * (1 - 0.14 * this.squash));
      this.rig.root.tint = this.flash > 0 ? 0xff9a9a : 0xffffff;
      this.body.scale.set((s.r / this.baseR) * (1 - this.air * 0.25));
    }
    // A swing lunges the figure forward a little (units with their own moves follow those instead).
    const lunge = this.attackAnim ? lungeBy * s.r : this.pulse * 7;
    this.facing.position.set(Math.cos(s.f) * lunge, Math.sin(s.f) * lunge);
    this.facing.tint = this.flash > 0 ? 0xff9a9a : 0xffffff;
    // Under the ground you only show as a mound of dirt (to whoever can see you at all).
    const under = s.st?.includes('burrowed') || s.st?.includes('underground');
    // In the Dark Dabber's smoke, his own side sees him faintly.
    this.body.alpha = this.facing.alpha = under ? 0.22 : s.st?.includes('hazed') || s.st?.includes('vanished') ? 0.4 : s.st?.includes('untargetable') ? 0.55 : 1;
    if (this.rig) this.rig.root.alpha = under ? 0.12 : this.body.alpha;
    if (this.rig) {
      this.surroundings(s, ctx, moved);
      this.lightUp(s, ctx);
    }
    if (s.badge !== undefined || this.badge) this.setBadge(s.badge ?? '', s.r);
    if (s.ttl && !this.titleText) {
      this.titleText = new Text({ text: titleName(s.ttl) ?? '', style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 11, fill: 0xe8c46a, stroke: { color: 0x000000, width: 3 }, letterSpacing: 0.5 } });
      this.titleText.anchor.set(0.5, 1);
      this.titleText.position.set(0, -this.headroom - 40);
      this.container.addChild(this.titleText);
    }
    if (this.titleText) this.titleText.visible = this.label.visible;
    if (s.bty || this.poster) this.wanted(s);

    const barKey = `${s.hp}|${s.mhp}|${s.sh}|${s.mp}|${s.mmp}|${s.lv}`;
    if (barKey !== this.barKey) {
      this.barKey = barKey;
      this.drawBars(s);
    }
    const statusKey = (s.st ?? []).join();
    if (statusKey !== this.statusKey) {
      this.statusKey = statusKey;
      this.drawStatus(s);
    }
  }

  /** The light on the figure: tinted by it, glowing on the side it's on, its shadow thrown the other way. */
  private lightUp(s: EntitySnap, ctx: ViewContext): void {
    const rig = this.rig!;
    const night = ctx.night ?? 0;
    const light = ctx.light?.(s.x, s.y) ?? { dx: -0.6, dy: -0.8, color: 0xffffff, k: 0 };
    const k = light.k;
    // The shadow falls away from the light, and stretches as the light gets lower (the moon at night,
    // or a lantern close by).
    const stretch = 0.25 + k * 1.2 + night * 0.6;
    this.cast.visible = !s.dead && !this.air;
    this.cast.rotation = Math.atan2(-light.dy, -light.dx);
    this.cast.scale.set(stretch, 1);
    this.cast.position.set(this.paceX - light.dx * s.r * stretch * 0.8, -light.dy * s.r * stretch * 0.5);
    this.cast.alpha = 0.6 + 0.4 * Math.min(1, k + night);
    if (this.flash <= 0) rig.root.tint = mix(0xffffff, light.color, Math.min(0.35, k * 0.3));
    if (this.backlight) {
      const h = rig.height;
      this.backlight.visible = !s.dead && k > 0.05;
      this.backlight.position.set(light.dx * s.r * 0.55, -h * 0.5 + light.dy * h * 0.15);
      this.backlight.width = s.r * 2.2;
      this.backlight.height = h * 1.15;
      this.backlight.tint = light.color;
      this.backlight.alpha = Math.min(0.45, k * 0.5);
    }
  }

  /** Wading in the river, or pushing through tall grass. */
  private surroundings(s: EntitySnap, ctx: ViewContext, speed: number): void {
    const rig = this.rig!;
    const grounded = !s.dead && !this.air;
    const wet = grounded && !!ctx.inWater?.(s.x, s.y);
    this.wade.visible = wet;
    // They sink in a little (their team ring still shows round them).
    rig.root.y = wet ? s.r * 0.16 : 0;
    if (wet) {
      const k = (this.clock * (speed > 40 ? 1.6 : 0.7)) % 1;
      this.ripple.scale.set(1 + k * 0.8);
      this.ripple.alpha = 1 - k;
    }
    const hidden = grounded && ctx.inBrush(s.x, s.y);
    this.grass.visible = hidden;
    if (hidden) this.grass.skew.x = (ctx.wind?.at(s.x, s.y) ?? 0) * 0.12 + (speed > 40 ? Math.sin(this.clock * 14) * 0.12 : 0);
  }

  private drawRecall(routine: RecallRoutine): void {
    const t = this.recallT;
    const r = this.baseR;
    // Props are drawn facing right; mirror them when the champion faces left (words stay readable).
    this.recallUnder.scale.x = this.recallOver.scale.x = this.side;
    this.recallUnder.clear();
    routine.under?.(this.recallUnder, t, r, this.pal);
    if (this.rig instanceof Rig) {
      this.rig.part.handProp.clear();
      this.rig.part.headProp.clear();
      routine.held?.(this.rig.part.handProp, t, r, this.pal);
      if (routine.stow) this.rig.part.weapon.visible = false;
      routine.worn?.(this.rig.part.headProp, t, r, this.pal);
    }
    this.recallOverG.clear();
    let used = 0;
    const say: Say = (text, x, y, size, color, alpha = 1) => {
      let label = this.recallTexts[used];
      if (!label) {
        label = new Text({ text: '', style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 16, fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
        label.anchor.set(0.5);
        this.recallTexts.push(label);
        this.recallOver.addChild(label);
      }
      if (label.text !== text) label.text = text;
      if (label.style.fontSize !== size) label.style.fontSize = size;
      if (label.style.fill !== color) label.style.fill = color;
      label.alpha = alpha;
      label.scale.x = this.side;
      label.position.set(x, y);
      label.visible = true;
      used++;
    };
    routine.over?.(this.recallOverG, t, r, this.pal, say);
    for (let i = used; i < this.recallTexts.length; i++) this.recallTexts[i].visible = false;
  }

  onAttack(): void {
    this.pulse = 1;
    this.hitFired = false;
    if (this.attackAnim) this.anim = { a: this.attackAnim, t: 0 };
  }

  /** Play a move (the Warden winding up a slam). */
  play(a: Anim): void {
    this.anim = { a, t: 0 };
  }

  onCast(slot: Slot): void {
    if (this.champ) this.anim = { a: castAnim(this.champ, slot), t: 0 };
    this.lastCast = this.clock;
    if (slot === 3) this.smile(1.2);
  }

  /** What they've bought, shown on the figure. */
  wear(items: readonly ItemId[]): void {
    if (this.rig instanceof Rig) this.rig.setGear(items);
  }

  /** A Chud's cheer: arms up, hopping. */
  cheer(): void {
    if (this.chud) this.cheerT = CHEER_TIME;
  }

  /** A grin: a kill, a laugh, a cheer. */
  smile(seconds = 1.4): void {
    this.grinT = seconds;
    this.hurtT = 0;
  }

  onHit(from?: { x: number; y: number }, heavy?: boolean): void {
    this.flash = 1;
    this.squash = Math.max(this.squash, heavy ? 1 : 0.4);
    if (this.grinT <= 0) this.hurtT = heavy ? 0.6 : 0.3;
    if (!from) return;
    // A flinch: back from a hit in front, forward from one behind.
    const inFront = Math.sign(from.x - this.container.x) === this.side;
    this.recoil += (inFront ? 1 : -1) * (heavy ? 1 : 0.35);
    // Every hit nudges; a big one shoves.
    const dx = this.container.x - from.x;
    const dy = this.container.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    const push = heavy ? 22 : 4;
    this.knock.x = (dx / d) * push;
    this.knock.y = (dy / d) * push;
  }

  freeze(seconds: number, shudder: number): void {
    this.frozen = Math.max(this.frozen, seconds);
    this.shudder = shudder;
  }

  /** Coming back down from a knock-up or a leap: a squash as they hit the ground. */
  land(): void {
    this.squash = 1.3;
  }

  /** The WANTED poster: pinned up over a champion on a killing spree, swaying, the bounty in gold. */
  private wanted(s: EntitySnap): void {
    if (!this.poster) {
      const poster = new Container();
      const paper = new Graphics()
        .poly([-34, -44, 34, -46, 36, 2, -35, 4])
        .fill(0xe8d5a6)
        .stroke({ width: 2.5, color: 0x5a3a1a, join: 'round' });
      paper.moveTo(-28, -27).lineTo(28, -28).stroke({ width: 1.5, color: 0x8a6a3a, alpha: 0.7 });
      paper.circle(0, -45, 3).fill(0x8a2a2a); // the nail
      const title = new Text({ text: 'WANTED', style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 14, fill: 0x5a1a14, letterSpacing: 1 } });
      title.anchor.set(0.5);
      title.position.set(0, -36);
      const gold = new Text({ text: '', style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 15, fill: 0xb8860b, stroke: { color: 0x3a2008, width: 3 } } });
      gold.anchor.set(0.5);
      gold.position.set(0, -14);
      poster.addChild(paper, title, gold);
      this.container.addChild(poster);
      this.poster = poster;
      this.posterGold = gold;
    }
    this.poster.visible = !!s.bty && !s.dead;
    if (!s.bty) return;
    const text = `${s.bty}g`;
    if (this.posterGold!.text !== text) this.posterGold!.text = text;
    this.poster.position.set(0, -this.headroom - (this.titleText ? 58 : 46));
    this.poster.rotation = 0.08 + Math.sin(this.clock * 1.6) * 0.05;
  }

  private setBadge(text: string, r: number): void {
    if (!this.badge) {
      this.badge = new Text({ text, style: { fontFamily: 'Segoe UI Emoji, Apple Color Emoji, system-ui, sans-serif', fontSize: 20 } });
      this.badge.anchor.set(0.5, 1);
      this.container.addChild(this.badge);
    }
    if (this.badge.text !== text) this.badge.text = text;
    this.badge.position.set(0, -(this.rig ? this.headroom : r) - 44);
  }

  private drawBars(s: EntitySnap): void {
    const g = this.bars.clear();
    const w = s.k === 'champion' ? 84 : s.k === 'chud' ? 44 : 70;
    const h = s.k === 'chud' ? 5 : 9;
    const x = -w / 2;
    const y = -(this.rig ? this.headroom * (s.r / this.baseR) : s.r) - (s.k === 'chud' ? 12 : 20);
    const showMana = this.relation !== 'enemy' && (s.mmp ?? 0) > 0;
    const hpColor = this.relation === 'self' ? PALETTE.selfHp : this.relation === 'ally' ? PALETTE.ally : this.relation === 'neutral' ? PALETTE.neutral : PALETTE.enemy;
    const mhp = s.mhp ?? 1;

    g.rect(x - 2, y - 2, w + 4, h + 4 + (showMana ? 6 : 0)).fill({ color: 0x000000, alpha: 0.75 });
    // A shield gets a white stretch after the health; if both don't fit, the bar rescales to hold them.
    const hp = Math.max(0, s.hp ?? 0);
    const full = Math.max(mhp, hp + (s.sh ?? 0));
    g.rect(x, y, (w * hp) / full, h).fill(hpColor);
    if (s.sh) g.rect(x + (w * hp) / full, y, (w * s.sh) / full, h).fill(0xf2f4f7);
    // A notch every 100 health so big and small health pools read differently at a glance.
    for (let v = 100; s.k !== 'chud' && v < mhp; v += 100) {
      g.rect(x + (w * v) / mhp, y, 1, v % 1000 === 0 ? h : h * 0.5).fill({ color: 0x000000, alpha: 0.55 });
    }
    if (showMana) g.rect(x, y + h + 2, (w * (s.mp ?? 0)) / (s.mmp ?? 1), 4).fill(this.resourceColor);
    if (this.levelText) {
      const size = h + 4 + (showMana ? 6 : 0);
      g.rect(x - 2 - size, y - 2, size, size).fill({ color: 0x000000, alpha: 0.85 }).stroke({ width: 1, color: 0xffe29a, alpha: 0.5 });
      this.levelText.text = String(s.lv ?? 1);
      this.levelText.position.set(x - 2 - size / 2, y - 2 + size / 2);
    }
  }

  private drawStatus(s: EntitySnap): void {
    const g = this.statusRing.clear();
    const st = s.st ?? [];
    const r = s.r;
    if (st.includes('root')) g.circle(0, 0, r + 9).stroke({ width: 6, color: 0x8b5a2b, alpha: 0.95 });
    if (st.includes('stun')) g.circle(0, 0, r + 14).stroke({ width: 4, color: 0xffd166 });
    if (st.includes('slow')) g.circle(0, 0, r + 5).stroke({ width: 3, color: 0x9bd4ff, alpha: 0.8 });
    if (st.includes('weaken')) g.circle(0, 0, r + 18).stroke({ width: 2, color: 0xb57bff, alpha: 0.7 });
    if (st.includes('berserk')) g.circle(0, 0, r + 8).fill({ color: 0xff3b30, alpha: 0.18 }).stroke({ width: 5, color: 0xff3b30, alpha: 0.75 });
    if (st.includes('ember')) g.circle(0, 0, r + 12).stroke({ width: 3, color: 0xff7a2f, alpha: 0.85 });
    if (st.includes('glowcap')) g.circle(0, 0, r + 15).stroke({ width: 3, color: 0x6fd6ff, alpha: 0.85 });
    if (st.includes('unchained')) g.circle(0, 0, r + 6).stroke({ width: 3, color: 0x7fe3ff, alpha: 0.9 });
    if (st.includes('burrowed') || st.includes('underground')) {
      g.ellipse(0, 4, r * 1.25, r * 0.95).fill({ color: 0x5a4127, alpha: 0.9 }).stroke({ width: 3, color: 0x3a2a18 });
      for (const [x, y, rr] of [[-0.6, -0.2, 0.16], [0.35, 0.3, 0.2], [0.1, -0.45, 0.12], [-0.25, 0.45, 0.1], [0.65, -0.15, 0.13]]) {
        g.circle(x * r, y * r + 4, rr * r).fill(0x7a5a38);
      }
    }
    if (st.includes('rot')) {
      g.circle(0, 0, r + 7).stroke({ width: 3, color: 0x8fd14f, alpha: 0.8 });
      for (let i = 0; i < 5; i++) g.circle(Math.cos(i * 1.3) * (r + 7), Math.sin(i * 1.3) * (r + 7), 3).fill(0xb8f07a);
    }
    if (st.includes('fear')) g.circle(0, 0, r + 10).stroke({ width: 4, color: 0x9b59d0, alpha: 0.9 });
    if (st.includes('speed')) g.circle(0, 0, r + 3).stroke({ width: 2, color: 0xfff3b0, alpha: 0.7 });
    if (st.includes('decreed')) {
      g.circle(0, 0, r + 16).stroke({ width: 3, color: 0xffd166, alpha: 0.95 });
      g.poly([-12, -r - 26, -12, -r - 36, -6, -r - 30, 0, -r - 38, 6, -r - 30, 12, -r - 36, 12, -r - 26]).fill(0xffd166).stroke({ width: 1.5, color: 0x6b5a22 });
    }
    if (st.includes('royal')) g.circle(0, 0, r + 4).stroke({ width: 2, color: 0xffd166, alpha: 0.7 });
    if (st.includes('bleed')) g.circle(0, 0, r + 4).stroke({ width: 3, color: 0xc0182b, alpha: 0.85 });
    if (st.includes('blessed')) g.circle(0, 0, r * 2.2).fill({ color: 0xffd166, alpha: 0.12 }).stroke({ width: 4, color: 0xfff1b8, alpha: 0.85 });
    if (st.includes('curdled')) g.circle(0, 0, r + 6).stroke({ width: 3, color: 0xf3dc8a, alpha: 0.85 });
    if (st.includes('rindBlade')) g.circle(0, 0, r + 3).stroke({ width: 2, color: 0xffd166, alpha: 0.9 });
    if (st.includes('meditating')) g.circle(0, 0, r + 8).fill({ color: 0xc8a07a, alpha: 0.12 }).stroke({ width: 3, color: 0xc8a07a, alpha: 0.8 });
    if (st.includes('encore')) g.circle(0, 0, r + 7).stroke({ width: 4, color: 0xff6b8a, alpha: 0.8 });
    if (st.includes('touche')) g.circle(0, 0, r + 3).stroke({ width: 2, color: 0xdfe6ff, alpha: 0.9 });
    if (st.includes('resin')) {
      g.circle(0, 0, r + 5).stroke({ width: 3, color: 0xd98a1e, alpha: 0.85 });
      for (let i = 0; i < 6; i++) g.circle(Math.cos(i * 1.05) * (r + 5), Math.sin(i * 1.05) * (r + 5) + 3, 3).fill(0xd98a1e);
    }
    if (st.includes('cloudNine')) g.circle(0, 0, r + 9).stroke({ width: 4, color: 0xb8f07a, alpha: 0.7 });
    if (st.includes('blazed')) g.circle(0, 0, r + 3).stroke({ width: 2, color: 0xff7a2f, alpha: 0.8 });
    if (st.includes('mewing')) g.circle(0, 0, r + 6).stroke({ width: 3, color: 0xffffff, alpha: 0.8 });
    if (st.includes('ascended')) g.circle(0, 0, r + 8).fill({ color: 0xffd166, alpha: 0.15 }).stroke({ width: 5, color: 0xffd166, alpha: 0.8 });
    if (st.includes('recall')) g.circle(0, 0, r + 22).fill({ color: 0x7cc4ff, alpha: 0.12 }).stroke({ width: 4, color: 0x7cc4ff, alpha: 0.8 });
  }
}

export class ProjectileView implements EntityView {
  readonly container = new Container();
  /** The projectile itself, up in the air at chest height; its shadow stays on the ground. */
  private readonly body = new Graphics();
  private readonly lift: number;

  constructor(s: EntitySnap, relation: Relation) {
    const g = this.body;
    this.lift = flightHeight(s.vis);
    if (this.lift > 0) this.container.addChild(new Graphics().ellipse(0, 0, Math.min(16, s.r * 0.8 + 6), Math.min(7, s.r * 0.3 + 3)).fill({ color: 0x000000, alpha: 0.28 }));
    this.container.addChild(g);
    g.y = -this.lift;
    drawTail(g, s.vis ?? 'arrow', relation);
    switch (s.vis) {
      case 'shootie': {
        const color = relation === 'enemy' ? PALETTE.enemy : PALETTE.ally;
        g.circle(0, 0, 22).fill({ color, alpha: 0.3 });
        g.circle(0, 0, 13).fill(color);
        g.circle(0, 0, 6).fill(0xffffff);
        break;
      }
      case 'pebble':
        g.circle(0, 0, 6).fill(0xa3a3a3).stroke({ width: 1.5, color: 0x333333 });
        break;
      case 'boulder':
        g.circle(0, 0, 14).fill(0x7d7d7d).stroke({ width: 2, color: 0x333333 });
        g.circle(-4, -4, 4).fill({ color: 0xffffff, alpha: 0.2 });
        break;
      case 'arrowHeavy':
        g.rect(-30, -6, 44, 12).fill({ color: 0xffc94d, alpha: 0.35 });
        g.rect(-24, -2.5, 34, 5).fill(0xffe7a3);
        g.poly([10, -7, 22, 0, 10, 7]).fill(0xffe7a3);
        break;
      case 'bolt':
        g.rect(-52, -9, 72, 18).fill({ color: 0x7fe3ff, alpha: 0.28 });
        g.rect(-44, -4, 60, 8).fill(0xe8fbff);
        break;
      case 'scepter':
        g.circle(0, 0, 8).fill({ color: 0xffd166, alpha: 0.35 });
        g.circle(0, 0, 4.5).fill(0xfff1c1);
        break;
      case 'levy':
        g.rect(-34, -8, 40, 16).fill({ color: 0xffd166, alpha: 0.25 });
        g.circle(0, 0, 10).fill(0xffd166).stroke({ width: 2, color: 0x8a6a1e });
        g.circle(0, 0, 4).stroke({ width: 1.5, color: 0x8a6a1e });
        break;
      case 'spore':
        g.circle(0, 0, 9).fill({ color: 0x8fd14f, alpha: 0.35 });
        g.circle(0, 0, 5).fill(0xc9f59a);
        g.circle(-8, 0, 3).fill({ color: 0x8fd14f, alpha: 0.6 });
        break;
      case 'junk_can':
        g.roundRect(-10, -7, 20, 14, 3).fill(0xb8bec6).stroke({ width: 2, color: 0x4a4f58 });
        g.rect(-3, -7, 7, 14).fill(0xd9483b);
        break;
      case 'junk_sludge':
        g.circle(0, 0, 11).fill({ color: 0x6fae2e, alpha: 0.9 }).stroke({ width: 2, color: 0x3d6a14 });
        g.circle(-12, 3, 5).fill({ color: 0x6fae2e, alpha: 0.7 });
        g.circle(-20, -2, 3).fill({ color: 0x6fae2e, alpha: 0.5 });
        break;
      case 'junk_boot':
        g.poly([-10, -10, 2, -10, 2, 2, 12, 4, 12, 10, -10, 10]).fill(0x6b4a2b).stroke({ width: 2, color: 0x2e1f10 });
        break;
      case 'hook':
        for (let i = 1; i <= 6; i++) g.ellipse(-i * 11, 0, 5, 3).stroke({ width: 2, color: 0x8a9099 }); // the chain behind it
        g.moveTo(0, 0).arc(6, 0, 10, Math.PI, Math.PI * 2.4).stroke({ width: 4, color: 0x5d636d });
        g.poly([14, 8, 20, 2, 10, 4]).fill(0x5d636d);
        break;
      case 'knife':
        g.rect(-10, -2.5, 6, 5).fill(0x5a3a1a);
        g.poly([-4, -3.5, 12, 0, -4, 3.5]).fill(0xd8dde6).stroke({ width: 1, color: 0x333333 });
        break;
      case 'cheeseWheel':
        // A whole wheel of cheese, rind and holes and all.
        g.circle(0, 0, 14).fill(0xd9a52b).stroke({ width: 2, color: 0x6a4a10 });
        g.circle(0, 0, 11).fill(0xf3dc8a);
        for (const [hx, hy, hr] of [[-4, -4, 2.5], [4, 3, 2], [-2, 5, 1.5], [5, -5, 1.5]]) g.circle(hx, hy, hr).fill(0xd8b860);
        break;
      case 'cheeseBolt':
        g.poly([8, 0, -6, -6, -6, 6]).fill(0xffe29a).stroke({ width: 1.5, color: 0x8a6a1e });
        g.circle(-1, 0, 1.5).fill(0xd8b860);
        break;
      case 'resinBolt':
        g.circle(0, 0, 8).fill(0xd98a1e).stroke({ width: 1.5, color: 0x6a3a0a });
        g.circle(-3, -3, 2.5).fill({ color: 0xffe2a0, alpha: 0.85 });
        g.circle(-11, 2, 3).fill({ color: 0xd98a1e, alpha: 0.6 });
        break;
      case 'smokeBolt':
        g.ellipse(-14, 0, 34, 12).fill({ color: 0xd8f0c0, alpha: 0.35 });
        g.ellipse(-4, 0, 18, 7).fill({ color: 0xeaffd8, alpha: 0.8 });
        g.circle(6, 0, 6).fill(0xb8f07a);
        break;
      case 'longshot':
        g.ellipse(-20, 0, 110, s.r).fill({ color: 0xff8a3d, alpha: 0.3 });
        g.ellipse(0, 0, 70, s.r * 0.45).fill({ color: 0xffb070, alpha: 0.8 });
        g.ellipse(10, 0, 40, s.r * 0.2).fill(0xfff1dc);
        break;
      default: // 'arrow'
        g.rect(-20, -1.5, 26, 3).fill(0xf3e2b3);
        g.poly([6, -5, 14, 0, 6, 5]).fill(0xf3e2b3);
    }
  }

  update(s: EntitySnap): void {
    this.container.position.set(s.x, s.y);
    this.body.rotation = s.f;
  }
}

const TAIL_COLORS: Record<string, number> = {
  arrow: 0xf3e2b3,
  arrowHeavy: 0xffd166,
  bolt: 0x7fe3ff,
  longshot: 0xff8a3d,
  spore: 0x8fd14f,
  scepter: 0xffd166,
  levy: 0xffd166,
  junk_sludge: 0x8fd14f,
  resinBolt: 0xffb347,
  knife: 0xd8dde6,
  cheeseWheel: 0xffd166,
  cheeseBolt: 0xffe29a,
  smokeBolt: 0xb8f07a,
};

/** A soft streak behind a projectile (it points along +x, so the tail runs back along -x). */
function drawTail(g: Graphics, vis: string, relation: Relation): void {
  const color = vis === 'shootie' ? (relation === 'enemy' ? PALETTE.enemy : PALETTE.ally) : TAIL_COLORS[vis];
  if (color === undefined) return;
  const len = vis === 'longshot' ? 220 : vis === 'shootie' ? 90 : 60;
  const w = vis === 'longshot' ? 40 : vis === 'shootie' ? 16 : 8;
  for (let i = 0; i < 4; i++) {
    const f = (i + 1) / 4;
    g.poly([0, -w * f * 0.5, -len * f, 0, 0, w * f * 0.5]).fill({ color, alpha: 0.12 });
  }
}

/** A patch of ground with an effect: HunnaG's sludge puddle or a Mole Hole. */
export class ZoneView implements EntityView {
  readonly container = new Graphics();
  private age = 0;

  constructor(private readonly s: EntitySnap) {
    this.draw(0);
  }

  private draw(t: number): void {
    const g = this.container.clear();
    const r = this.s.r;
    if (this.s.vis === 'resinPuddle') {
      // A sticky amber puddle, glossy, a curl of smoke rising off it.
      g.circle(0, 0, r).fill({ color: 0x8a5a14, alpha: 0.45 }).stroke({ width: 3, color: 0xd98a1e, alpha: 0.7 });
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + t * 0.4;
        g.ellipse(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.45, 14, 8).fill({ color: 0xffb347, alpha: 0.35 + 0.15 * Math.sin(t * 2 + i) });
      }
      g.circle(-r * 0.25, -r * 0.25, 8).fill({ color: 0xffe2a0, alpha: 0.5 });
      return;
    }
    if (this.s.vis === 'molehole') {
      g.circle(0, 0, r * 1.25).fill({ color: 0x6b4f2e, alpha: 0.9 });
      g.circle(0, 0, r * 0.85).fill(0x120c06);
      g.circle(0, 0, r * (0.5 + 0.1 * Math.sin(t * 6))).stroke({ width: 2, color: 0x8fd14f, alpha: 0.6 });
      return;
    }
    // sludge
    g.circle(0, 0, r).fill({ color: 0x5e8f23, alpha: 0.35 }).stroke({ width: 3, color: 0x8fd14f, alpha: 0.6 });
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + t * 0.6;
      g.circle(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, 6 + 3 * Math.sin(t * 3 + i)).fill({ color: 0x8fd14f, alpha: 0.5 });
    }
  }

  update(s: EntitySnap, dt: number): void {
    this.age += dt;
    this.container.position.set(s.x, s.y);
    this.draw(this.age);
  }
}

/**
 * Sight left on the map, seen only by its own team: the Glowworm Lantern's light (a glowworm lantern
 * hanging in the air over a lit patch) or the Sewer Crab's shell (a little shell on a stick, with an eye).
 * Both fade away as their time runs out.
 */
export class WardView implements EntityView {
  readonly container = new Graphics();
  private age = 0;

  constructor(private readonly s: EntitySnap) {}

  update(s: EntitySnap, dt: number): void {
    this.age += dt;
    const t = this.age;
    const left = s.regrow ?? 1;
    const fade = Math.min(1, t * 3, left / 0.8);
    const g = this.container.clear();
    this.container.position.set(s.x, s.y);
    this.container.alpha = fade;
    if (this.s.vis === 'lantern') {
      // The edge of the light, faintly, and the lantern hanging over the middle of it.
      g.circle(0, 0, s.r).stroke({ width: 2, color: 0xd8f7a0, alpha: 0.25 });
      g.ellipse(0, 0, 60, 22).fill({ color: 0xd8f7a0, alpha: 0.18 });
      const y = -90 + Math.sin(t * 2) * 8;
      g.moveTo(0, y - 26).lineTo(0, y - 12).stroke({ width: 2, color: 0x2a2018 });
      g.roundRect(-11, y - 12, 22, 26, 5).fill(0x2a2018);
      g.roundRect(-7, y - 8, 14, 18, 3).fill(0xd8f7a0);
      g.circle(0, y, 26).fill({ color: 0xd8f7a0, alpha: 0.18 + 0.06 * Math.sin(t * 7) });
      return;
    }
    // The Sewer Crab's shell, planted on a stick, its eye open and looking about.
    g.ellipse(0, 4, 26, 9).fill({ color: 0x000000, alpha: 0.3 });
    g.moveTo(0, 0).lineTo(0, -44).stroke({ width: 4, color: 0x5a4024 });
    g.ellipse(0, -52, 22, 16).fill(0xd9733a).stroke({ width: 2.5, color: 0x6a2a10 });
    const look = Math.sin(t * 1.3) * 5;
    g.circle(look, -54, 7).fill(0xfff6e0).stroke({ width: 1.5, color: 0x1a1414 });
    g.circle(look + 1.5, -54, 3.5).fill(0x1a1414);
    g.circle(0, -52, 34).fill({ color: 0xffb06a, alpha: 0.1 + 0.05 * Math.sin(t * 3) });
  }
}

/** Something to pick up: Willmore's scrap. */
export class PickupView implements EntityView {
  readonly container = new Graphics();
  private age = 0;

  constructor(s: EntitySnap) {
    const g = this.container;
    // A little pile: a bolt, a bent plate and a cog.
    g.circle(0, 0, s.r * 0.7).fill({ color: 0x000000, alpha: 0.25 });
    g.roundRect(-14, -4, 18, 8, 2).fill(0x9aa1ab).stroke({ width: 1.5, color: 0x3a3f48 });
    g.poly([-2, 4, 12, 0, 16, 10, 2, 12]).fill(0x7c838d).stroke({ width: 1.5, color: 0x3a3f48 });
    g.circle(6, -8, 6).fill(0xb8a46a).stroke({ width: 1.5, color: 0x5a4a22 });
    g.circle(6, -8, 2).fill(0x5a4a22);
  }

  update(s: EntitySnap, dt: number): void {
    this.age += dt;
    this.container.position.set(s.x, s.y - 3 * Math.sin(this.age * 4));
  }
}

export class TrapView implements EntityView {
  readonly container = new Graphics();
  private vis: string | undefined;

  constructor(s: EntitySnap, private readonly relation: Relation) {
    this.draw(s);
  }

  /** A snare's spiked jaws, or Daltonomo's Surprise Box (closed, or sprung with its jester on a spring). */
  private draw(s: EntitySnap): void {
    this.vis = s.vis;
    this.container.clear();
    if (s.vis === 'jackbox' || s.vis === 'jackboxOpen') return drawJackbox(this.container, s.r, s.vis === 'jackboxOpen');
    const color = this.relation === 'enemy' ? PALETTE.enemy : 0xd9c27a;
    const pts: number[] = [];
    const spikes = 10;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? s.r : s.r * 0.55;
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    this.container.poly(pts).fill({ color, alpha: 0.35 }).stroke({ width: 3, color });
    this.container.circle(0, 0, s.r * 0.25).fill(color);
  }

  update(s: EntitySnap): void {
    if (s.vis !== this.vis) this.draw(s);
    this.container.position.set(s.x, s.y);
    this.container.alpha = s.armed ? 1 : 0.4;
  }
}

function drawJackbox(g: Graphics, r: number, open: boolean): void {
  const s = r * 1.3;
  g.roundRect(-s, -s, s * 2, s * 2, 5).fill(0x7a3fb0).stroke({ width: 2.5, color: PALETTE.outline });
  for (const t of [-0.5, 0.5]) g.moveTo(-s, t * s).lineTo(s, t * s).stroke({ width: 4, color: 0xffd166 });
  g.moveTo(s, 0).lineTo(s + 10, 0).stroke({ width: 3, color: 0xb8bec6 }); // the crank
  g.circle(s + 12, 4, 4).fill(0xb8bec6);
  if (!open) return;
  // Sprung: the lid flipped back, and a grinning jester's head bobbing on its spring.
  g.roundRect(-s - 6, -s * 2 - 4, s * 2 + 12, s * 0.9, 4).fill(0x5a2a80).stroke({ width: 2, color: PALETTE.outline });
  g.moveTo(0, 0);
  for (let i = 1; i <= 6; i++) g.lineTo((i % 2 ? 1 : -1) * 7, -i * 6);
  g.stroke({ width: 2.5, color: 0xc9d1dc });
  g.circle(0, -42, 13).fill(0xf6f0e8).stroke({ width: 2, color: PALETTE.outline });
  arc(g, 0, -40, 8, 0.4, Math.PI - 0.4).stroke({ width: 2, color: 0xc0182b });
  for (const side of [-1, 1]) g.circle(side * 12, -54, 4).fill(0xffd166).stroke({ width: 1.5, color: PALETTE.outline });
}

/** Shooties, Oakners and Da Base. The body is redrawn only when it changes state (standing, shielded, fallen). */
export class StructureView implements EntityView {
  /** On the ground: the shadow, the pool of light, the range. */
  readonly container = new Container();
  /** The building itself, standing up: the game sorts it in with the units, nearest in front. */
  readonly top = new Container();
  /** The crystal floating over a Shootie or Da Base, bobbing. */
  private readonly crystal = new Graphics();
  private crystalY = 0;
  /** See-through while your champion is behind it, so a tower never hides you. */
  private fade = 1;
  /** Banners flying from the poles, flapping in the wind. */
  private flags: Graphics[] = [];
  private readonly range = new Graphics();
  private readonly body = new Graphics();
  private readonly light = new Graphics();
  private readonly upper = new Graphics();
  private readonly bars = new Graphics();
  private readonly note: Text;
  private bodyKey = '';
  private barKey = '';
  private rangeShown = false;
  /** An Oakner growing back: 0 to 1 over a second and a half. */
  private grow = 1;
  private wasDead: boolean | null = null;
  private clock = 0;
  /** A red glow under Da Base that beats when it's in danger. */
  private readonly danger = new Graphics();
  /** Candlelight in a Shootie's arrow slit and round its door, as dusk falls. */
  private readonly windows = new Graphics();

  constructor(s: EntitySnap, private readonly relation: Relation) {
    this.note = new Text({
      text: '',
      style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 17, fill: 0xffffff, stroke: { color: 0x000000, width: 4 }, letterSpacing: 1 },
    });
    this.note.anchor.set(0.5, 0);
    this.note.position.set(0, s.r * 0.6 + 10);
    this.light.blendMode = 'add';
    this.danger.blendMode = 'add';
    if (s.role === 'daBase') {
      this.danger.circle(0, 0, s.r * 2.2).fill({ color: 0xff3b30, alpha: 0.12 }).circle(0, 0, s.r * 1.5).fill({ color: 0xff3b30, alpha: 0.18 });
      this.danger.alpha = 0;
    }
    this.container.addChild(this.light, this.danger, this.range, this.body);
    this.windows.blendMode = 'add';
    this.windows.alpha = 0;
    this.top.addChild(this.upper, this.windows, this.crystal, this.bars, this.note);
    this.container.position.set(s.x, s.y);
    this.top.position.set(s.x, s.y);
  }

  update(s: EntitySnap, dt: number, ctx: ViewContext): void {
    this.clock += dt;
    this.top.zIndex = s.y;
    this.crystal.y = this.crystalY + Math.sin(this.clock * 2.1) * s.r * 0.05;
    const me = ctx.me;
    const tall = buildingHeight(s.role ?? 'outerShootie') * s.r;
    const behind = !!me && !s.dead && me.y < s.y && me.y > s.y - tall - me.r && Math.abs(me.x - s.x) < s.r * 1.1 + me.r;
    this.fade += ((behind ? 0.4 : 1) - this.fade) * Math.min(1, dt * 10);
    this.upper.alpha = this.crystal.alpha = this.fade;
    // Someone inside lights a candle as the evening draws in; it gutters now and then.
    const candle = Math.min(1, (ctx.dusk ?? 0) * 1.6) * (0.85 + 0.15 * Math.sin(this.clock * 7.3 + s.x));
    this.windows.alpha = s.dead ? 0 : candle * this.fade;
    this.flags.forEach((f, i) => {
      const w = ctx.wind;
      f.alpha = this.fade;
      f.skew.y = (w ? w.flutter(s.x, i * 1.7) * 0.14 + w.at(s.x, s.y) * 0.1 : Math.sin(this.clock * 6 + i) * 0.08);
      f.scale.x = 1 - Math.abs(f.skew.y) * 0.3;
    });
    // A felled Oakner springing back up when it regrows.
    if (this.wasDead && !s.dead) this.grow = 0;
    this.wasDead = !!s.dead;
    let beat = 0;
    if (this.grow < 1) {
      this.grow = Math.min(1, this.grow + dt / 1.4);
      const g = this.grow;
      this.top.scale.set(Math.max(0.05, g >= 1 ? 1 : 1 - Math.pow(2, -9 * g) * Math.cos(g * 12)));
    } else if (s.role === 'daBase' && !s.dead && (s.hp ?? 1) / (s.mhp ?? 1) < 0.5) {
      // Da Base in danger: its crystal beats like a heart, faster the lower it gets.
      beat = heartbeat(this.clock, (s.hp ?? 0) / (s.mhp ?? 1));
      this.top.scale.set(1 + 0.035 * beat);
    } else this.top.scale.set(1);
    this.danger.alpha = beat * 0.9;
    const bodyKey = `${s.dead ? 'fallen' : 'up'}|${s.inv ? 'shielded' : ''}`;
    if (bodyKey !== this.bodyKey) {
      this.bodyKey = bodyKey;
      this.drawBody(s);
    }
    const barKey = s.dead ? 'fallen' : `${s.hp}|${s.mhp}|${s.inv ? 1 : 0}`;
    if (barKey !== this.barKey) {
      this.barKey = barKey;
      this.drawBars(s);
    }
    const note = s.regrow ? `Regrows in ${clock(s.regrow)}` : s.role === 'daBase' && !s.dead ? (s.badge ? `${s.badge} DA BASE ${s.badge}` : 'DA BASE') : '';
    if (this.note.text !== note) this.note.text = note;
    this.updateRange(s, ctx.me);
  }

  /** Enemy Shooties show their reach when you get close, like League's tower range. */
  private updateRange(s: EntitySnap, me: EntitySnap | undefined): void {
    const attackRange = s.role ? STRUCTURE_DEFS[s.role].stats.attackRange : 0;
    const reach = attackRange + s.r + (me?.r ?? 0);
    const show = !s.dead && this.relation === 'enemy' && attackRange > 0 && !!me && Math.hypot(me.x - s.x, me.y - s.y) < reach + 400;
    if (show === this.rangeShown) return;
    this.rangeShown = show;
    this.range.clear();
    if (show) this.range.circle(0, 0, reach).fill({ color: PALETTE.enemy, alpha: 0.06 }).stroke({ width: 3, color: PALETTE.enemy, alpha: 0.55 });
  }

  private drawBody(s: EntitySnap): void {
    const g = this.body.clear();
    const up = this.upper.clear();
    const light = this.light.clear();
    this.crystal.clear();
    const r = s.r;
    const team = this.relation === 'enemy' ? PALETTE.enemy : PALETTE.ally;
    g.ellipse(r * 0.12, r * 0.16, r * (s.dead ? 0.85 : 1.05), r * (s.dead ? 0.36 : 0.45)).fill({ color: 0x000000, alpha: 0.32 });
    if (s.dead) {
      for (const f of this.flags) f.destroy();
      this.flags = [];
      if (s.role === 'oakner') drawOakStump(up, r);
      else if (s.role === 'daBase') drawFortRuin(up, r);
      else drawTowerRuin(up, r);
      return;
    }
    // A pool of the team's light on the ground, and the building standing over it.
    for (let i = 1; i <= 5; i++) light.ellipse(0, 0, r * (0.6 + i * 0.45), r * (0.6 + i * 0.45) * 0.6).fill({ color: team, alpha: 0.035 });
    const role = s.role ?? 'outerShootie';
    if (role === 'oakner') drawOak(up, r, team);
    else if (role === 'daBase') drawFort(up, r, team);
    else drawTower(up, r);
    this.windows.clear();
    if (role !== 'oakner' && role !== 'daBase') {
      // The arrow slit (see drawTower), and the gaps round the door.
      this.windows.ellipse(0.12 * r, -1.35 * r, 0.24 * r, 0.38 * r).fill({ color: 0xffa040, alpha: 0.22 });
      this.windows.roundRect(0.085 * r, -1.53 * r, 0.07 * r, 0.36 * r, 0.03 * r).fill({ color: 0xffc46a, alpha: 0.9 });
      this.windows.moveTo(-0.17 * r, 0.27 * r).lineTo(0.17 * r, 0.27 * r).stroke({ width: 2.5, color: 0xffb050, alpha: 0.7 });
      this.windows.moveTo(-0.17 * r, 0.26 * r).lineTo(-0.17 * r, -0.42 * r).stroke({ width: 1.5, color: 0xffb050, alpha: 0.45 });
    }
    for (const f of this.flags) f.destroy();
    this.flags = flagSpots(role, r).map((spot) => {
      const f = new Graphics();
      drawFlag(f, spot.len, team);
      f.position.set(spot.x, spot.y);
      this.top.addChildAt(f, this.top.getChildIndex(this.upper) + 1);
      return f;
    });
    if (role !== 'oakner') {
      const spec = role === 'daBase' ? BUILDING.daBase : BUILDING.shootie;
      drawCrystal(this.crystal, (role === 'daBase' ? 0.8 : 0.7) * r, team);
      this.crystalY = -spec.crystal * r;
    }
    // A shielded building sits under a pale dome.
    const h = buildingHeight(role) * r;
    if (s.inv) up.ellipse(0, -h * 0.45, r * 1.15, h * 0.62).fill({ color: 0xdfe6ee, alpha: 0.06 }).stroke({ width: 4, color: 0xdfe6ee, alpha: 0.35 });
  }

  private drawBars(s: EntitySnap): void {
    const g = this.bars.clear();
    if (s.dead) return;
    const w = s.role === 'daBase' ? 180 : 120;
    const h = 10;
    const x = -w / 2;
    const y = -buildingHeight(s.role ?? 'outerShootie') * s.r - 22;
    const mhp = s.mhp ?? 1;
    const color = s.inv ? PALETTE.invulnerable : this.relation === 'enemy' ? PALETTE.enemy : PALETTE.ally;
    g.rect(x - 2, y - 2, w + 4, h + 4).fill({ color: 0x000000, alpha: 0.75 });
    g.rect(x, y, (w * Math.max(0, s.hp ?? 0)) / mhp, h).fill(color);
    for (let v = 500; v < mhp; v += 500) g.rect(x + (w * v) / mhp, y, 1, h * 0.5).fill({ color: 0x000000, alpha: 0.55 });
  }
}

/** A double thump (lub-dub), 0 to 1, repeating faster as `health` (0–1) drops. */
export function heartbeat(time: number, health: number): number {
  const period = 0.55 + Math.max(0, health) * 1.3;
  const t = (time % period) / period;
  const thump = (at: number) => Math.exp(-(((t - at) / 0.05) ** 2));
  return Math.min(1, thump(0.05) + 0.7 * thump(0.22));
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

