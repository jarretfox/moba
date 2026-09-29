import type { PlayerTeam, Slot, Team } from '../constants';
import { add, dirTo, dist, scale, type Vec2 } from '../math';
import type { EntitySnap, MeSnap } from '../protocol';
import type { Entity } from '../sim/entity';
import { HomingProjectile, LineProjectile } from '../sim/projectile';
import type { Stats, Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { Champion } from './champion';
import type { ChampionInfo } from './types';

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Every number for this champion lives here. Per-rank scaling arrives with leveling (M3).

const BASE_STATS: Stats = {
  maxHp: 620, hpRegen: 3.5, maxMana: 340, manaRegen: 7,
  ad: 62, ap: 0, armor: 26, mr: 30,
  attackSpeed: 0.68, attackRange: 550, moveSpeed: 330,
};
const RADIUS = 35;
const ARROW_SPEED = 2200;

const STEADY_RHYTHM = { attackSpeedPerStack: 0.08, maxStacks: 5, duration: 3 };
const PIERCING_BOLT = {
  cost: 50, cooldown: 7, castTime: 0.25,
  range: 1100, width: 60, speed: 2000,
  damage: 60, adRatio: 1.0, falloffPerHit: 0.15, minMultiplier: 0.55,
};
const SNARE_TRAP = {
  cost: 60, cooldown: 12, castTime: 0.2,
  range: 600, radius: 55, armTime: 0.75, lifetime: 60, rootDuration: 1.25, maxActive: 2,
};
const ROLL = {
  cost: 40, cooldown: 8,
  distance: 325, dashTime: 0.2, empowerWindow: 3, bonusDamage: 25, adRatio: 0.4,
};
const LONGSHOT = {
  cost: 100, cooldown: 90, castTime: 1.0,
  range: 6000, width: 160, speed: 2600,
  damage: 250, adRatio: 0.8, missingHpBonus: 0.5,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const MARKSMAN_INFO: ChampionInfo = {
  id: 'marksman',
  name: 'Marksman',
  title: 'The Steady Hand',
  passive: {
    name: 'Steady Rhythm',
    description: `Each basic attack on the same target grants ${pct(STEADY_RHYTHM.attackSpeedPerStack)} attack speed (max ${STEADY_RHYTHM.maxStacks} stacks, ${STEADY_RHYTHM.duration}s). Switching targets starts the rhythm over.`,
  },
  abilities: [
    {
      name: 'Piercing Bolt',
      description: `Fire a bolt through every enemy in a line for ${PIERCING_BOLT.damage} (+${pct(PIERCING_BOLT.adRatio)} AD) physical damage. Each enemy after the first takes ${pct(PIERCING_BOLT.falloffPerHit)} less, down to ${pct(PIERCING_BOLT.minMultiplier)}.`,
      cost: PIERCING_BOLT.cost,
      cooldown: PIERCING_BOLT.cooldown,
      castTime: PIERCING_BOLT.castTime,
      targeting: { kind: 'direction', range: PIERCING_BOLT.range, width: PIERCING_BOLT.width },
    },
    {
      name: 'Snare Trap',
      description: `Place a trap that arms after ${SNARE_TRAP.armTime}s. The first enemy champion to step on it is rooted for ${SNARE_TRAP.rootDuration}s. Up to ${SNARE_TRAP.maxActive} traps at once.`,
      cost: SNARE_TRAP.cost,
      cooldown: SNARE_TRAP.cooldown,
      castTime: SNARE_TRAP.castTime,
      targeting: { kind: 'point', range: SNARE_TRAP.range, radius: SNARE_TRAP.radius },
    },
    {
      name: 'Roll',
      description: `Roll a short distance. Your next basic attack within ${ROLL.empowerWindow}s is ready instantly and deals ${ROLL.bonusDamage} (+${pct(ROLL.adRatio)} AD) bonus physical damage.`,
      cost: ROLL.cost,
      cooldown: ROLL.cooldown,
      castTime: 0,
      targeting: { kind: 'direction', range: ROLL.distance, width: RADIUS * 2 },
    },
    {
      name: 'Longshot',
      description: `Aim for ${LONGSHOT.castTime}s, then fire a huge shot across the map. The first enemy champion hit takes ${LONGSHOT.damage} (+${pct(LONGSHOT.adRatio)} AD) physical damage, up to ${pct(LONGSHOT.missingHpBonus)} more the more health they're missing.`,
      cost: LONGSHOT.cost,
      cooldown: LONGSHOT.cooldown,
      castTime: LONGSHOT.castTime,
      targeting: { kind: 'direction', range: LONGSHOT.range, width: LONGSHOT.width },
    },
  ],
};

/** Champions — plus training dummies, which stand in for them. */
const isChampionLike = (u: Unit) => u.kind === 'champion' || u.kind === 'dummy';

export class Marksman extends Champion {
  readonly info = MARKSMAN_INFO;
  private rhythm = { targetId: -1, stacks: 0, expiresAt: 0 };
  private empoweredUntil = 0;
  private traps: SnareTrap[] = [];

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, 'Marksman');
  }

  // ─── Passive: Steady Rhythm ───────────────────────────────────────────────

  protected computeStats(world: World): Stats {
    const s = super.computeStats(world);
    if (world.time >= this.rhythm.expiresAt) this.rhythm.stacks = 0;
    s.attackSpeed *= 1 + this.rhythm.stacks * STEADY_RHYTHM.attackSpeedPerStack;
    return s;
  }

  protected launchAttack(world: World, target: Unit): void {
    const empowered = world.time < this.empoweredUntil;
    this.empoweredUntil = 0;

    if (target.id !== this.rhythm.targetId) this.rhythm = { targetId: target.id, stacks: 0, expiresAt: 0 };
    this.rhythm.stacks = Math.min(STEADY_RHYTHM.maxStacks, this.rhythm.stacks + 1);
    this.rhythm.expiresAt = world.time + STEADY_RHYTHM.duration;

    const damage = this.stats.ad + (empowered ? ROLL.bonusDamage + ROLL.adRatio * this.stats.ad : 0);
    world.add(
      new HomingProjectile(world, this, target, ARROW_SPEED, empowered ? 'arrowHeavy' : 'arrow', (w, t) => {
        w.damage(this, t, damage, 'physical');
      }),
    );
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  protected onCastStart(world: World, slot: Slot, aim: Vec2): void {
    if (slot === 3) {
      // Longshot telegraphs its line to everyone during the aim.
      const end = add(this.pos, scale(dirTo(this.pos, aim), LONGSHOT.range));
      world.emit({ e: 'fx', fx: 'aimLine', x: this.pos.x, y: this.pos.y, x2: end.x, y2: end.y, dur: LONGSHOT.castTime, team: this.team });
    }
  }

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.piercingBolt(world, aim);
      case 1: return this.snareTrap(world, aim);
      case 2: return this.roll(world, aim);
      case 3: return this.longshot(world, aim);
    }
  }

  private piercingBolt(world: World, aim: Vec2): void {
    const b = PIERCING_BOLT;
    const damage = b.damage + b.adRatio * this.stats.ad;
    world.add(
      new LineProjectile(world, this, {
        from: this.pos, dir: dirTo(this.pos, aim), speed: b.speed, range: b.range, width: b.width,
        vis: 'bolt', pierce: true,
        onHit: (w, target, i) => {
          w.damage(this, target, damage * Math.max(b.minMultiplier, 1 - b.falloffPerHit * i), 'physical');
        },
      }),
    );
  }

  private snareTrap(world: World, aim: Vec2): void {
    const spot = world.grid.nearestWalkable(aim) ?? { ...this.pos };
    this.traps = this.traps.filter((t) => !t.removed);
    this.traps.push(world.add(new SnareTrap(world, this.team, spot)));
    while (this.traps.length > SNARE_TRAP.maxActive) this.traps.shift()!.removed = true;
  }

  private roll(world: World, aim: Vec2): void {
    const from = { ...this.pos };
    const to = world.grid.clampLine(from, add(from, scale(dirTo(from, aim), ROLL.distance)));
    this.startDash(world, to, ROLL.dashTime);
    this.empoweredUntil = world.time + ROLL.empowerWindow;
    this.attackReadyAt = Math.min(this.attackReadyAt, world.time);
    world.emit({ e: 'fx', fx: 'roll', x: from.x, y: from.y, x2: to.x, y2: to.y });
  }

  private longshot(world: World, aim: Vec2): void {
    const l = LONGSHOT;
    const damage = l.damage + l.adRatio * this.stats.ad;
    world.add(
      new LineProjectile(world, this, {
        from: this.pos, dir: dirTo(this.pos, aim), speed: l.speed, range: l.range, width: l.width,
        vis: 'longshot', pierce: false, canHit: isChampionLike,
        onHit: (w, target) => {
          const missing = 1 - target.hp / target.stats.maxHp;
          w.damage(this, target, damage * (1 + l.missingHpBonus * missing), 'physical');
        },
      }),
    );
  }

  meSnapshot(world: World): MeSnap {
    return {
      ...super.meSnapshot(world),
      passiveStacks: world.time < this.rhythm.expiresAt ? this.rhythm.stacks : 0,
      empowered: world.time < this.empoweredUntil,
    };
  }
}

/** Snare Trap on the ground. Enemies will only see it once fog of war exists (M2); for now everyone can. */
class SnareTrap implements Entity {
  readonly kind = 'trap';
  readonly id: number;
  pos: Vec2;
  radius = SNARE_TRAP.radius;
  removed = false;
  private readonly armedAt: number;
  private readonly expiresAt: number;

  constructor(world: World, public team: Team, pos: Vec2) {
    this.id = world.newId();
    this.pos = pos;
    this.armedAt = world.time + SNARE_TRAP.armTime;
    this.expiresAt = world.time + SNARE_TRAP.lifetime;
  }

  update(world: World): void {
    if (world.time >= this.expiresAt) {
      this.removed = true;
      return;
    }
    if (world.time < this.armedAt) return;
    const victim = world
      .units()
      .find((u) => u.team !== this.team && u.isTargetable() && isChampionLike(u) && dist(u.pos, this.pos) <= this.radius + u.radius);
    if (!victim) return;
    victim.addStatus(world, 'root', SNARE_TRAP.rootDuration);
    world.emit({ e: 'fx', fx: 'trapSnap', x: this.pos.x, y: this.pos.y, team: this.team });
    this.removed = true;
  }

  snapshot(world: World): EntitySnap {
    return {
      id: this.id,
      k: 'trap',
      tm: this.team,
      x: Math.round(this.pos.x),
      y: Math.round(this.pos.y),
      f: 0,
      r: this.radius,
      armed: world.time >= this.armedAt,
    };
  }
}
