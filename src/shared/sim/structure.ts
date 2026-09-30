import type { Team } from '../constants';
import type { Lane, StructureRole, StructureSpot } from '../map/mapData';
import type { NavGrid } from '../map/navGrid';
import { dist } from '../math';
import type { ChudType, DamageType, EntitySnap } from '../protocol';
import { Chud } from './chud';
import { HomingProjectile } from './projectile';
import { Unit, type Stats } from './unit';
import type { World } from './world';

// ─── Tuning ──────────────────────────────────────────────────────────────────

const NO_ATTACK = { ad: 0, attackSpeed: 0, attackRange: 0 };
const SHOOTIE_ATTACK = { ad: 150, attackSpeed: 0.8, attackRange: 650 };
/** Each consecutive shot at the same champion hits this much harder, so tanking a Shootie gets worse fast. */
const SHOOTIE_WARMUP = { perShot: 0.4, maxStacks: 3 };
/**
 * Against Chuds a Shootie deals a fixed share of their max health (true damage), so a melee Chud takes
 * three shots and a ranged one two, whatever the game time. Last-hitting under a Shootie means timing
 * your hit around its shots.
 */
const SHOOTIE_VS_CHUD: Record<ChudType, number> = { melee: 0.45, ranged: 0.7, siege: 0.14, brute: 0.07 };
const SHOOTIE_SHOT_SPEED = 1400;

function structureStats(maxHp: number, armor: number, attack = NO_ATTACK): Stats {
  return { maxHp, hpRegen: 0, maxMana: 0, manaRegen: 0, ap: 0, armor, mr: armor, moveSpeed: 0, ...attack };
}

export const STRUCTURE_DEFS: Record<StructureRole, { name: string; radius: number; stats: Stats; regrow: number }> = {
  outerShootie: { name: 'Outer Shootie', radius: 70, stats: structureStats(2500, 40, SHOOTIE_ATTACK), regrow: Infinity },
  innerShootie: { name: 'Inner Shootie', radius: 70, stats: structureStats(3000, 40, SHOOTIE_ATTACK), regrow: Infinity },
  baseShootie: { name: 'Base Shootie', radius: 70, stats: structureStats(3000, 40, SHOOTIE_ATTACK), regrow: Infinity },
  oakner: { name: 'Oakner', radius: 85, stats: structureStats(2200, 20), regrow: 240 },
  daBase: { name: 'Da Base', radius: 140, stats: structureStats(4000, 20), regrow: Infinity },
};

export const isShootie = (role: StructureRole): boolean =>
  role === 'outerShootie' || role === 'innerShootie' || role === 'baseShootie';

/**
 * Shooties, Oakners and Da Base. They never move, block pathing while standing, and can't be
 * damaged until the structures in front of them have fallen.
 */
export class Structure extends Unit {
  readonly kind = 'structure';
  readonly immovable = true;
  readonly role: StructureRole;
  readonly lane: Lane | null;
  /** Wired up by spawnStructures: true once the structures guarding this one are down. */
  vulnerableWhen: () => boolean = () => true;
  private invulnerable = false;
  private warmup = { targetId: -1, stacks: 0 };
  private readonly grid: NavGrid;

  constructor(world: World, spot: StructureSpot) {
    const def = STRUCTURE_DEFS[spot.role];
    super(world.newId(), spot.team, spot.pos, def.radius, def.stats, def.name);
    this.role = spot.role;
    this.lane = spot.lane;
    this.grid = world.grid;
    this.grid.addObstacle(this.pos, this.radius);
  }

  isTargetable(): boolean {
    return super.isTargetable() && !this.invulnerable;
  }

  refreshVulnerability(): void {
    this.invulnerable = !this.vulnerableWhen();
  }

  protected think(world: World): void {
    this.refreshVulnerability();
    if (isShootie(this.role)) this.pickTarget(world);
  }

  // ─── Shootie targeting ────────────────────────────────────────────────────

  private pickTarget(world: World): void {
    const current = this.order.kind === 'attack' ? world.getUnit(this.order.targetId) : undefined;
    const target = this.answerCallForHelp(world) ?? (current && this.canShoot(current) ? current : this.nearestTarget(world));
    if (target) this.commandAttack(target);
    else this.commandStop();
  }

  /** An enemy champion hurting one of our champions in range takes over, whatever we were shooting. */
  private answerCallForHelp(world: World): Unit | undefined {
    const calls = world.recentHelpCalls();
    for (let i = calls.length - 1; i >= 0; i--) {
      const { attacker, victim } = calls[i];
      if (victim.team === this.team && !victim.dead && this.inReach(victim) && this.canShoot(attacker)) return attacker;
    }
    return undefined;
  }

  /** Chuds (and the dummies standing in for them) before champions; nearest first within each. */
  private nearestTarget(world: World): Unit | undefined {
    let best: Unit | undefined;
    let bestScore = Infinity;
    for (const u of world.units()) {
      if (!this.canShoot(u)) continue;
      const score = dist(u.pos, this.pos) + (u.kind === 'champion' ? 1e6 : 0);
      if (score < bestScore) {
        best = u;
        bestScore = score;
      }
    }
    return best;
  }

  private canShoot(u: Unit): boolean {
    return u.team !== this.team && u.kind !== 'structure' && u.isTargetable() && this.inReach(u);
  }

  private inReach(u: Unit): boolean {
    return dist(u.pos, this.pos) <= this.stats.attackRange + this.radius + u.radius;
  }

  protected launchAttack(world: World, target: Unit): void {
    let damage = this.stats.ad;
    let type: DamageType = 'physical';
    if (target instanceof Chud) {
      damage = target.stats.maxHp * SHOOTIE_VS_CHUD[target.chudType];
      type = 'true';
    }
    if (target.kind === 'champion') {
      if (this.warmup.targetId !== target.id) this.warmup = { targetId: target.id, stacks: 0 };
      damage *= 1 + this.warmup.stacks * SHOOTIE_WARMUP.perShot;
      this.warmup.stacks = Math.min(SHOOTIE_WARMUP.maxStacks, this.warmup.stacks + 1);
    } else {
      this.warmup = { targetId: -1, stacks: 0 };
    }
    world.add(
      new HomingProjectile(world, this, target, SHOOTIE_SHOT_SPEED, 'shootie', (w, t) => {
        w.damage(this, t, damage, type);
      }),
    );
  }

  // ─── Falling and regrowing ────────────────────────────────────────────────

  die(world: World, killer: Unit | null): void {
    super.die(world, killer);
    this.grid.removeObstacle(this.pos, this.radius);
    this.warmup = { targetId: -1, stacks: 0 };
    if (this.role === 'daBase') world.declareWinner(this.team === 1 ? 2 : 1);
  }

  protected respawnDelay(): number {
    return STRUCTURE_DEFS[this.role].regrow;
  }

  protected respawn(): void {
    super.respawn();
    this.grid.addObstacle(this.pos, this.radius);
  }

  snapshot(world: World): EntitySnap {
    return {
      ...super.snapshot(world),
      role: this.role,
      inv: (!this.dead && this.invulnerable) || undefined,
      regrow: this.dead && Number.isFinite(this.respawnAt) ? Math.ceil(this.respawnAt - world.time) : undefined,
    };
  }
}

/** Builds every structure on the map and wires up which ones must fall before which. */
export function spawnStructures(world: World): Structure[] {
  const all = world.map.structures.map((spot) => world.add(new Structure(world, spot)));
  const find = (team: Team, role: StructureRole, lane: Lane | null) =>
    all.find((s) => s.team === team && s.role === role && s.lane === lane);
  const down = (s: Structure | undefined) => !s || s.dead;

  for (const s of all) {
    switch (s.role) {
      case 'innerShootie': {
        const outer = find(s.team, 'outerShootie', s.lane);
        s.vulnerableWhen = () => down(outer);
        break;
      }
      case 'oakner': {
        const inner = find(s.team, 'innerShootie', s.lane);
        s.vulnerableWhen = () => down(inner);
        break;
      }
      case 'baseShootie': {
        // Opens up while either Oakner is down, and closes again if they both regrow.
        const oakners = all.filter((o) => o.team === s.team && o.role === 'oakner');
        s.vulnerableWhen = () => oakners.some(down);
        break;
      }
      case 'daBase': {
        const guard = find(s.team, 'baseShootie', null);
        s.vulnerableWhen = () => down(guard);
        break;
      }
    }
    s.refreshVulnerability();
  }
  return all;
}
