import { DT, type Team } from '../constants';
import type { MapData } from '../map/mapData';
import { NavGrid } from '../map/navGrid';
import { Pathfinder } from '../map/pathfind';
import type { Vec2 } from '../math';
import type { DamageType, EntitySnap, GameEvent } from '../protocol';
import { resolveUnitCollisions } from './collision';
import type { Entity } from './entity';
import { Unit } from './unit';

/** Armor and MR cut damage by resist / (100 + resist); negative resist amplifies it instead. */
export function mitigate(amount: number, resist: number): number {
  return resist >= 0 ? (amount * 100) / (100 + resist) : amount * (2 - 100 / (100 - resist));
}

/** The whole game state, advanced one fixed tick at a time. Knows nothing about networking or rendering. */
export class World {
  tick = 0;
  time = 0;
  readonly grid: NavGrid;
  private readonly pathfinder: Pathfinder;
  private readonly entities = new Map<number, Entity>();
  private events: GameEvent[] = [];
  private timers: { at: number; fn: () => void }[] = [];
  private nextId = 1;

  constructor(readonly map: MapData) {
    this.grid = new NavGrid(map);
    this.pathfinder = new Pathfinder(this.grid);
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
  damage(source: Unit | null, target: Unit, amount: number, type: DamageType): number {
    if (!target.isTargetable() || amount <= 0) return 0;
    const resist = type === 'physical' ? target.stats.armor : type === 'magic' ? target.stats.mr : 0;
    const dealt = type === 'true' ? amount : mitigate(amount, resist);
    target.hp -= dealt;
    target.lastDamagedAt = this.time;
    this.emit({ e: 'dmg', target: target.id, amount: Math.round(dealt), type });
    if (target.hp <= 0) target.die(this, source);
    return dealt;
  }

  step(): void {
    this.tick++;
    this.time = this.tick * DT;

    if (this.timers.length) {
      const now = this.time + 1e-9;
      const due = this.timers.filter((t) => t.at <= now);
      if (due.length) {
        this.timers = this.timers.filter((t) => t.at > now);
        for (const t of due) t.fn();
      }
    }

    for (const e of this.entities.values()) e.update(this);
    resolveUnitCollisions(this);
    for (const [id, e] of this.entities) if (e.removed) this.entities.delete(id);
  }

  /** What one team is allowed to see. Fog of war filters here in M2; for now it's everything. */
  visibleTo(_team: Team): EntitySnap[] {
    const out: EntitySnap[] = [];
    for (const e of this.entities.values()) out.push(e.snapshot(this));
    return out;
  }
}
