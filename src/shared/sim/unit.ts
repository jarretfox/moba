import { DT, type Team } from '../constants';
import { add, angleOf, clamp, dirTo, dist, lerpVec, scale, sub, type Vec2 } from '../math';
import type { EntitySnap, StatusKind } from '../protocol';
import type { Entity } from './entity';
import type { World } from './world';

export interface Stats {
  maxHp: number;
  /** Per second. */
  hpRegen: number;
  maxMana: number;
  /** Per second. */
  manaRegen: number;
  ad: number;
  ap: number;
  armor: number;
  mr: number;
  /** Attacks per second. */
  attackSpeed: number;
  /** Edge-to-edge reach. */
  attackRange: number;
  moveSpeed: number;
}

export type Order =
  | { kind: 'idle' }
  | { kind: 'move'; dest: Vec2 }
  | { kind: 'attack'; targetId: number };

interface Status {
  kind: StatusKind;
  until: number;
  /** Slow strength (0..1); unused by other kinds. */
  amount: number;
}

/** Share of each attack's timer spent winding up before the hit lands or the shot leaves. Moving during it cancels the attack. */
const WINDUP_FRACTION = 0.2;
/** Seconds an attack or cast gives away your position, even from brush. */
export const REVEAL_TIME = 1;
/** How often a unit chasing an attack target recomputes its path. */
const REPATH_INTERVAL = 0.25;
/** A walker that gains less than this on its destination per tick is being blocked. */
const STUCK_PROGRESS = 1;
/** Blocked this long close to its destination (e.g. someone is standing on it), a unit gives up and stops. */
const STUCK_GIVE_UP = 0.3;
/** "Close" for giving up: within this much of the destination beyond the unit's own width. */
const STUCK_NEAR = 120;

/** Anything with health that moves, attacks, and gets crowd-controlled: champions, dummies, later chuds and jungle mobs. */
export abstract class Unit implements Entity {
  abstract readonly kind: 'champion' | 'dummy' | 'chud' | 'structure' | 'monster';
  removed = false;
  pos: Vec2;
  facing = 0;
  stats: Stats;
  hp: number;
  mana: number;
  dead = false;
  respawnAt = Infinity;
  order: Order = { kind: 'idle' };
  path: Vec2[] = [];
  lastDamagedAt = -Infinity;
  /** Attacking or casting reveals you (even in brush) until this time. */
  revealedUntil = -Infinity;
  /** Can't be shoved by other units (training dummies now; structures later). */
  readonly immovable: boolean = false;
  /** Direction walked this tick, or null if the unit stood still. Collision uses it to decide who gives way. */
  moveDir: Vec2 | null = null;
  protected statuses: Status[] = [];
  protected attackReadyAt = 0;
  protected windup: { targetId: number; fireAt: number; prevReadyAt: number } | null = null;
  /** While casting, the unit can't move or attack until this time. */
  protected lockedUntil = 0;
  protected dash: { from: Vec2; to: Vec2; start: number; end: number } | null = null;
  protected readonly spawnPos: Vec2;
  private nextRepathAt = 0;
  private stuck = { goal: null as Vec2 | null, dist: Infinity, time: 0 };

  constructor(
    readonly id: number,
    public team: Team,
    pos: Vec2,
    public radius: number,
    protected readonly base: Stats,
    public name: string,
  ) {
    this.pos = { ...pos };
    this.spawnPos = { ...pos };
    this.stats = { ...base };
    this.hp = base.maxHp;
    this.mana = base.maxMana;
  }

  update(world: World): void {
    if (this.dead) {
      if (world.time >= this.respawnAt) this.respawn();
      return;
    }
    this.statuses = this.statuses.filter((s) => s.until > world.time);
    this.stats = this.computeStats(world);
    this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.hpRegen * DT);
    this.mana = Math.min(this.stats.maxMana, this.mana + this.stats.manaRegen * DT);
    this.think(world);
    this.updateAttack(world);
    this.updateMovement(world);
  }

  /** This tick's stats: base values plus whatever buffs a subclass layers on. */
  protected computeStats(_world: World): Stats {
    return { ...this.base };
  }

  /** AI hook for units that drive themselves (dummies now; chuds, mobs and bots later). */
  protected think(_world: World): void {}

  // ─── State ────────────────────────────────────────────────────────────────

  has(kind: StatusKind): boolean {
    return this.statuses.some((s) => s.kind === kind);
  }

  isTargetable(): boolean {
    return !this.dead;
  }

  /** Takes part in unit collision. Dashing units pass through everyone. */
  hasBody(): boolean {
    return !this.dead && !this.dash;
  }

  canMove(world: World): boolean {
    return !this.has('root') && !this.has('stun') && world.time >= this.lockedUntil && !this.windup;
  }

  /** Can start an attack or a cast. */
  canAct(world: World): boolean {
    return !this.has('stun') && world.time >= this.lockedUntil && !this.dash;
  }

  /** Champions and training dummies (which stand in for champions in practice). */
  isChampionLike(): boolean {
    return this.kind === 'champion' || this.kind === 'dummy';
  }

  /** Strongest active amount of a status (slows and weakens don't stack; the biggest one wins). */
  strongest(kind: StatusKind): number {
    let best = 0;
    for (const s of this.statuses) if (s.kind === kind) best = Math.max(best, s.amount);
    return best;
  }

  get moveSpeed(): number {
    return this.stats.moveSpeed * (1 - this.strongest('slow'));
  }

  /** Share (0..1) knocked off the length of incoming stuns, roots and slows. */
  protected tenacity(_world: World): number {
    return 0;
  }

  addStatus(world: World, kind: StatusKind, duration: number, amount = 0): void {
    if (this.dead) return;
    if (kind === 'stun' || kind === 'root' || kind === 'slow') duration *= 1 - this.tenacity(world);
    this.statuses.push({ kind, until: world.time + duration, amount });
    if (kind === 'stun') this.cancelWindup();
  }

  /** `quiet` skips the floating number, for small constant trickles like lifesteal. */
  heal(world: World, amount: number, quiet = false): void {
    if (this.dead || amount <= 0) return;
    const healed = Math.min(amount, this.stats.maxHp - this.hp);
    if (healed <= 0) return;
    this.hp += healed;
    if (!quiet) world.emit({ e: 'heal', target: this.id, amount: Math.round(healed) });
  }

  /** Everything a unit's basic attack does on top of its damage (lifesteal, on-hit buffs). Runs after the hit resolves. */
  onBasicHit(_world: World, _target: Unit, _dealt: number): void {}

  // ─── Combat hooks ─────────────────────────────────────────────────────────

  /** Champions who hurt this unit recently, by id → last hit time. World.damage uses it to hand out takedowns. */
  readonly championHits = new Map<number, number>();

  /** Called after this unit takes damage (and survives or not). */
  onDamaged(_world: World, _source: Unit | null, _amount: number): void {}

  /** Called on every champion who got a kill or assist on a champion (or training dummy). */
  onTakedown(_world: World, _victim: Unit): void {}

  // ─── Orders (from player commands or AI) ───────────────────────────────────

  commandMove(world: World, dest: Vec2): void {
    this.cancelWindup();
    this.order = { kind: 'move', dest };
    this.path = this.dash ? [] : world.findPath(this.pos, dest);
  }

  commandAttack(target: Unit): void {
    if (this.order.kind === 'attack' && this.order.targetId === target.id) return;
    this.cancelWindup();
    this.order = { kind: 'attack', targetId: target.id };
    this.path = [];
    this.nextRepathAt = 0;
  }

  commandStop(): void {
    this.cancelWindup();
    this.order = { kind: 'idle' };
    this.path = [];
  }

  startDash(world: World, to: Vec2, duration: number): void {
    this.cancelWindup();
    this.dash = { from: { ...this.pos }, to, start: world.time, end: world.time + duration };
    this.path = [];
    if (dist(to, this.pos) > 1) this.facing = angleOf(sub(to, this.pos));
  }

  // ─── Basic attacks ────────────────────────────────────────────────────────

  private updateAttack(world: World): void {
    if (this.order.kind !== 'attack') return;
    const target = world.getUnit(this.order.targetId);
    // A target that slips into fog or brush is lost, like in League.
    if (!target || !target.isTargetable() || !world.vision.canSee(this.team, target)) {
      this.cancelWindup();
      this.order = { kind: 'idle' };
      this.path = [];
      return;
    }

    if (this.windup) {
      if (!this.canAct(world)) {
        this.cancelWindup();
        return;
      }
      this.facing = angleOf(sub(target.pos, this.pos));
      if (world.time >= this.windup.fireAt) {
        this.windup = null;
        this.revealedUntil = world.time + REVEAL_TIME;
        this.launchAttack(world, target);
      }
      return;
    }

    const reach = this.stats.attackRange + this.radius + target.radius;
    if (dist(this.pos, target.pos) > reach) {
      this.chase(world, target.pos);
      return;
    }
    this.path = [];
    if (world.time >= this.attackReadyAt && this.canAct(world)) {
      const attackTime = 1 / this.stats.attackSpeed;
      this.windup = { targetId: target.id, fireAt: world.time + attackTime * WINDUP_FRACTION, prevReadyAt: this.attackReadyAt };
      this.attackReadyAt = world.time + attackTime;
      this.facing = angleOf(sub(target.pos, this.pos));
      world.emit({ e: 'attack', src: this.id, target: target.id });
    }
  }

  /** Runs when the windup completes. Default is an instant melee hit; ranged units override it to fire a projectile. */
  protected launchAttack(world: World, target: Unit): void {
    world.damage(this, target, this.stats.ad, 'physical');
  }

  protected cancelWindup(): void {
    if (!this.windup) return;
    this.attackReadyAt = this.windup.prevReadyAt;
    this.windup = null;
  }

  private chase(world: World, targetPos: Vec2): void {
    if (world.time < this.nextRepathAt && this.path.length > 0) return;
    this.path = world.findPath(this.pos, targetPos);
    this.nextRepathAt = world.time + REPATH_INTERVAL;
  }

  // ─── Movement ─────────────────────────────────────────────────────────────

  private updateMovement(world: World): void {
    this.moveDir = null;
    if (this.dash) {
      const d = this.dash;
      const t = clamp((world.time - d.start) / (d.end - d.start), 0, 1);
      this.pos = lerpVec(d.from, d.to, t);
      if (t >= 1) {
        this.dash = null;
        if (this.order.kind === 'move') this.path = world.findPath(this.pos, this.order.dest);
      }
      return;
    }
    if (!this.canMove(world)) return;
    if (this.path.length > 0) this.giveUpIfBlocked();

    let budget = this.moveSpeed * DT;
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0];
      const d = dist(this.pos, next);
      if (d > 1e-6) {
        this.facing = angleOf(sub(next, this.pos));
        this.moveDir ??= dirTo(this.pos, next);
      }
      if (d <= budget) {
        this.pos = { x: next.x, y: next.y };
        this.path.shift();
        budget -= d;
      } else {
        this.pos = add(this.pos, scale(dirTo(this.pos, next), budget));
        budget = 0;
      }
    }
    if (this.path.length === 0 && this.order.kind === 'move') this.order = { kind: 'idle' };
  }

  /**
   * Collision can leave a walker pressing forever against someone standing on its destination.
   * If it has stopped gaining ground while already close, treat it as arrived.
   */
  private giveUpIfBlocked(): void {
    const goal = this.path[this.path.length - 1];
    const d = dist(this.pos, goal);
    const s = this.stuck;
    if (!s.goal || s.goal.x !== goal.x || s.goal.y !== goal.y) {
      s.goal = goal;
      s.time = 0;
    } else if (d > s.dist - STUCK_PROGRESS) {
      s.time += DT;
    } else {
      s.time = 0;
    }
    s.dist = d;
    if (s.time >= STUCK_GIVE_UP && d < this.radius * 2 + STUCK_NEAR) {
      this.path = [];
      s.time = 0;
    }
  }

  // ─── Death ────────────────────────────────────────────────────────────────

  die(world: World, _killer: Unit | null): void {
    this.dead = true;
    this.hp = 0;
    this.order = { kind: 'idle' };
    this.path = [];
    this.windup = null;
    this.dash = null;
    this.statuses = [];
    this.championHits.clear();
    this.respawnAt = world.time + this.respawnDelay(world);
    world.emit({ e: 'death', id: this.id });
  }

  protected respawnDelay(_world: World): number {
    return 6;
  }

  protected respawn(): void {
    this.dead = false;
    this.respawnAt = Infinity;
    this.pos = { ...this.spawnPos };
    this.hp = this.stats.maxHp;
    this.mana = this.stats.maxMana;
    this.lockedUntil = 0;
    this.attackReadyAt = 0;
  }

  snapshot(_world: World): EntitySnap {
    return {
      id: this.id,
      k: this.kind,
      tm: this.team,
      x: Math.round(this.pos.x),
      y: Math.round(this.pos.y),
      f: Math.round(this.facing * 100) / 100,
      r: Math.round(this.radius),
      hp: Math.ceil(this.hp),
      mhp: Math.round(this.stats.maxHp),
      name: this.name,
      st: this.statuses.length ? [...new Set(this.statuses.map((s) => s.kind))] : undefined,
      dead: this.dead || undefined,
    };
  }
}
