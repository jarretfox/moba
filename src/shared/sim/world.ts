import { DT, type PlayerTeam, type Team } from '../constants';
import type { MapData } from '../map/mapData';
import { NavGrid } from '../map/navGrid';
import { Pathfinder } from '../map/pathfind';
import type { Vec2 } from '../math';
import type { DamageType, EntitySnap, GameEvent } from '../protocol';
import { resolveUnitCollisions } from './collision';
import { rewardDeath } from './rewards';
import { recordDamage } from './score';
import { Vision } from './vision';
import type { Entity } from './entity';
import { Unit } from './unit';

/** Armor and MR cut damage by resist / (100 + resist); negative resist amplifies it instead. */
export function mitigate(amount: number, resist: number): number {
  return resist >= 0 ? (amount * 100) / (100 + resist) : amount * (2 - 100 / (100 - resist));
}

/** An enemy champion just hurt this champion. Shooties (and later Chuds) nearby answer by switching to the attacker. */
export interface HelpCall {
  attacker: Unit;
  victim: Unit;
  time: number;
}

/** How long a call for help stays fresh. */
const HELP_CALL_WINDOW = 0.5;
/** A champion who hurt someone within this many seconds of their death gets a takedown (kill or assist). */
const TAKEDOWN_WINDOW = 10;

export interface WorldSystem {
  update(world: World): void;
}

/** The whole game state, advanced one fixed tick at a time. Knows nothing about networking or rendering. */
export class World {
  tick = 0;
  time = 0;
  /** Set once a Da Base falls. The host stops the match there. */
  winner: PlayerTeam | null = null;
  /** How fast gold and experience come, and how long death lasts (a fast game raises and shortens them). */
  rates = { gold: 1, xp: 1, respawn: 1 };
  readonly grid: NavGrid;
  readonly vision: Vision;
  /** Each team's Unchained from killing the Warden: until when, and whether it's an Uprising. */
  readonly unchained: Record<PlayerTeam, { until: number; uprising: boolean }> = {
    1: { until: -Infinity, uprising: false },
    2: { until: -Infinity, uprising: false },
  };
  private readonly pathfinder: Pathfinder;
  private readonly entities = new Map<number, Entity>();
  private events: GameEvent[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private helpCalls: HelpCall[] = [];
  private readonly systems: WorldSystem[] = [];
  private nextId = 1;

  constructor(readonly map: MapData) {
    this.grid = new NavGrid(map);
    this.pathfinder = new Pathfinder(this.grid);
    this.vision = new Vision(this);
  }

  declareWinner(team: PlayerTeam): void {
    this.winner ??= team;
  }

  /** Match-level logic that runs every tick before the entities do (e.g. the Chud wave clock). */
  addSystem<T extends WorldSystem>(system: T): T {
    this.systems.push(system);
    return system;
  }

  newId(): number {
    return this.nextId++;
  }

  add<T extends Entity>(e: T): T {
    this.entities.set(e.id, e);
    return e;
  }

  getUnit(id: number): Unit | undefined {
    const e = this.entities.get(id);
    return e instanceof Unit ? e : undefined;
  }

  /** Every entity: units, projectiles, traps, pickups and the rest. */
  all(): Entity[] {
    return [...this.entities.values()];
  }

  units(): Unit[] {
    const out: Unit[] = [];
    for (const e of this.entities.values()) if (e instanceof Unit) out.push(e);
    return out;
  }

  /** Run fn after delay seconds of game time. */
  schedule(delay: number, fn: () => void): void {
    this.timers.push({ at: this.time + delay, fn });
  }

  emit(ev: GameEvent): void {
    this.events.push(ev);
  }

  drainEvents(): GameEvent[] {
    const ev = this.events;
    this.events = [];
    return ev;
  }

  findPath(from: Vec2, to: Vec2): Vec2[] {
    return this.pathfinder.find(from, to);
  }

  /** Apply mitigated damage. Returns the amount actually dealt. */
  damage(source: Unit | null, target: Unit, amount: number, type: DamageType, opts: { basic?: boolean } = {}): number {
    if (!target.isTargetable() || amount <= 0) return 0;
    if (target.has('blessed')) return 0; // Havarti's Divine Fondue: nothing gets through
    if (source) amount *= 1 - source.strongest('weaken');
    amount *= 1 + target.strongest('decreed'); // Royal Decree
    amount *= target.incomingDamageScale(this);
    // Holy Wheel curdles armor and magic resist alike.
    const resist = (type === 'physical' ? target.stats.armor : type === 'magic' ? target.stats.mr : 0) * (1 - target.strongest('curdled'));
    const dealt = target.absorb(type === 'true' ? amount : mitigate(amount, resist));
    target.hp -= dealt;
    target.lastDamagedAt = this.time;
    recordDamage(source, target, dealt);
    this.emit({ e: 'dmg', src: source?.id, target: target.id, amount: Math.round(dealt), type });
    if (source?.kind === 'champion') {
      target.championHits.set(source.id, this.time);
      if (target.kind === 'champion' && source.team !== target.team) this.helpCalls.push({ attacker: source, victim: target, time: this.time });
    }
    target.onDamaged(this, source, dealt);
    if (target.hp <= 0) {
      const helpers = [...target.championHits]
        .filter(([, t]) => this.time - t <= TAKEDOWN_WINDOW)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => this.getUnit(id))
        .filter((u): u is Unit => u !== undefined);
      target.die(this, source);
      rewardDeath(this, target, source, helpers);
      source?.onKill(this, target);
    }
    if (opts.basic && source) source.onBasicHit(this, target, dealt);
    return dealt;
  }

  /** Champion-on-champion hits from the last moment, newest last. */
  recentHelpCalls(): readonly HelpCall[] {
    return this.helpCalls;
  }

  step(): void {
    this.tick++;
    this.time = this.tick * DT;
    this.helpCalls = this.helpCalls.filter((c) => this.time - c.time <= HELP_CALL_WINDOW);

    if (this.timers.length) {
      const now = this.time + 1e-9;
      const due = this.timers.filter((t) => t.at <= now);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > now);
        for (const t of due) t.fn();
      }
    }

    for (const s of this.systems) s.update(this);
    this.vision.update();
    for (const e of this.entities.values()) e.update(this);
    resolveUnitCollisions(this);
    for (const [id, e] of this.entities) if (e.removed) this.entities.delete(id);
  }

  /** What one team is allowed to know about: its own side, plus whatever its fog of war reveals. */
  visibleTo(team: Team): EntitySnap[] {
    const out: EntitySnap[] = [];
    for (const e of this.entities.values()) if (this.vision.canSee(team, e)) out.push(e.snapshot(this));
    return out;
  }
}
