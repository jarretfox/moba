import type { PlayerTeam } from '../constants';
import type { Lane } from '../map/mapData';
import { dist, segmentDistance, type Vec2 } from '../math';
import type { ChudType, EntitySnap } from '../protocol';
import { HomingProjectile } from './projectile';
import { Unit, type Stats } from './unit';
import type { World } from './world';

// ─── Tuning ──────────────────────────────────────────────────────────────────

function chudStats(maxHp: number, ad: number, attackSpeed: number, attackRange: number, armor = 0): Stats {
  return { maxHp, hpRegen: 0, maxMana: 0, manaRegen: 0, ad, ap: 0, armor, mr: 0, attackSpeed, attackRange, moveSpeed: 325 };
}

export const CHUD_DEFS: Record<ChudType, { name: string; radius: number; stats: Stats; shot?: { speed: number; vis: string } }> = {
  melee: { name: 'Chud', radius: 28, stats: chudStats(450, 13, 1.25, 90) },
  ranged: { name: 'Slinger Chud', radius: 24, stats: chudStats(290, 22, 0.67, 500), shot: { speed: 1200, vis: 'pebble' } },
  siege: { name: 'Siege Chud', radius: 38, stats: chudStats(850, 40, 0.8, 300, 20), shot: { speed: 1000, vis: 'boulder' } },
};

/** How far a Chud looks for a fight, edge to edge. */
const ACQUIRE_RANGE = 500;
/** A Chud gives up on a target that gets this much further away than it would have picked one up. */
const LEASH = 250;
/** Close enough to a lane waypoint to head for the next one. */
const WAYPOINT_REACHED = 150;
/** Seconds a dead Chud lingers, so the client can still place its death effects, before it's removed. */
const CORPSE_TIME = 1;
/** Lower tiers are preferred: other Chuds first, then structures, then champions. */
const TARGET_TIER: Record<Unit['kind'], number> = { chud: 0, dummy: 0, structure: 1, champion: 2 };

/**
 * Lane minions. They march their lane's waypoints and fight whatever they meet, preferring other
 * Chuds, then structures, then champions — unless an enemy champion hurts one of their champions nearby.
 */
export class Chud extends Unit {
  readonly kind = 'chud';
  /** Index into route; worked out on the first march so a Chud placed mid-lane doesn't walk back to its base. */
  private nextWaypoint = -1;

  constructor(
    world: World,
    team: PlayerTeam,
    readonly chudType: ChudType,
    readonly lane: Lane,
    private readonly route: Vec2[],
  ) {
    const def = CHUD_DEFS[chudType];
    super(world.newId(), team, route[0], def.radius, def.stats, def.name);
  }

  protected think(world: World): void {
    const target = this.chooseTarget(world);
    if (target) this.commandAttack(target);
    else this.march(world);
  }

  private chooseTarget(world: World): Unit | undefined {
    // Defend our champions.
    const calls = world.recentHelpCalls();
    for (let i = calls.length - 1; i >= 0; i--) {
      const { attacker, victim } = calls[i];
      if (victim.team === this.team && this.near(victim, ACQUIRE_RANGE) && this.canFight(attacker, ACQUIRE_RANGE)) return attacker;
    }

    // Otherwise the best tier wins, nearest first — but within a tier we finish the fight we're in.
    const currentId = this.order.kind === 'attack' ? this.order.targetId : -1;
    let best: Unit | undefined;
    let bestScore = Infinity;
    for (const u of world.units()) {
      const isCurrent = u.id === currentId;
      if (!this.canFight(u, isCurrent ? ACQUIRE_RANGE + LEASH : ACQUIRE_RANGE)) continue;
      const score = TARGET_TIER[u.kind] * 1e6 + dist(u.pos, this.pos) - (isCurrent ? 1e5 : 0);
      if (score < bestScore) {
        best = u;
        bestScore = score;
      }
    }
    return best;
  }

  private canFight(u: Unit, range: number): boolean {
    return u.team !== this.team && u.isTargetable() && this.near(u, range);
  }

  private near(u: Unit, range: number): boolean {
    return dist(u.pos, this.pos) - u.radius - this.radius <= range;
  }

  /** Head for the next lane waypoint, advancing past any we've already reached. */
  private march(world: World): void {
    const last = this.route.length - 1;
    if (this.nextWaypoint < 0) this.nextWaypoint = this.closestSegmentEnd();
    while (this.nextWaypoint < last && dist(this.pos, this.route[this.nextWaypoint]) < WAYPOINT_REACHED) this.nextWaypoint++;
    const wp = this.route[this.nextWaypoint];
    if (this.nextWaypoint === last && dist(this.pos, wp) < WAYPOINT_REACHED) {
      if (this.order.kind !== 'idle') this.commandStop();
      return; // end of the lane: wait here for something to fight
    }
    if (this.order.kind === 'move' && this.order.dest === wp) return;
    this.commandMove(world, wp);
  }

  /** The far end of whichever route segment we're standing closest to. */
  private closestSegmentEnd(): number {
    let best = 1;
    let bestD = Infinity;
    for (let i = 0; i < this.route.length - 1; i++) {
      const d = segmentDistance(this.pos, this.route[i], this.route[i + 1]).d;
      if (d < bestD) {
        bestD = d;
        best = i + 1;
      }
    }
    return best;
  }

  protected launchAttack(world: World, target: Unit): void {
    const shot = CHUD_DEFS[this.chudType].shot;
    if (!shot) return super.launchAttack(world, target);
    const damage = this.stats.ad;
    world.add(new HomingProjectile(world, this, target, shot.speed, shot.vis, (w, t) => void w.damage(this, t, damage, 'physical')));
  }

  die(world: World, killer: Unit | null): void {
    super.die(world, killer);
    world.schedule(CORPSE_TIME, () => (this.removed = true));
  }

  protected respawnDelay(): number {
    return Infinity;
  }

  snapshot(world: World): EntitySnap {
    return { ...super.snapshot(world), name: undefined, chud: this.chudType };
  }
}
