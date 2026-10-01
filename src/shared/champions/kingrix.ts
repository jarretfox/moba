import type { PlayerTeam, Slot } from '../constants';
import { add, dirTo, dist, scale, type Vec2 } from '../math';
import type { EntitySnap } from '../protocol';
import { CHUD_AURA_RANGE } from '../sim/chud';
import { HomingProjectile, LineProjectile } from '../sim/projectile';
import { enemiesInCone } from '../sim/query';
import { Structure } from '../sim/structure';
import { Unit, type Stats } from '../sim/unit';
import type { World } from '../sim/world';
import { Champion } from './champion';
import { Logan } from './logan';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Every number for this champion lives here. Arrays are per rank (rank 1 first).

const BASE_STATS: Stats = {
  maxHp: 600, hpRegen: 3.5, maxMana: 380, manaRegen: 7.5,
  ad: 54, ap: 0, armor: 26, mr: 30,
  attackSpeed: 0.64, attackRange: 400, moveSpeed: 335,
};
const GROWTH: StatGrowth = { maxHp: 92, hpRegen: 0.6, maxMana: 42, manaRegen: 0.55, ad: 3, armor: 3.8, mr: 1.1, attackSpeedPct: 0.022 };
const RADIUS = 36;
const BOLT_SPEED = 1700;

/** Allied Chuds near him hit harder, and allies' last hits near him pay him a cut. */
export const ROYAL_TAX = { auraRange: CHUD_AURA_RANGE, chudDamage: 0.2, taxRange: 1000, gold: 4 };
const LEVY = {
  cost: [50, 55, 60, 65], cooldown: [6, 5.5, 5, 4.5], castTime: 0.2,
  range: 900, width: 70, speed: 1800,
  damage: [70, 105, 140, 175], apRatio: 0.6, killGold: [10, 15, 20, 25], killMana: 20,
};
const CALL_THE_GUARD = {
  cost: [70, 75, 80, 85], cooldown: [18, 17, 16, 15], castTime: 0.25,
  count: 2, lifetime: 8, leash: 260,
  health: (level: number) => 300 + 40 * level, damage: [20, 30, 40, 50], apRatio: 0.15, bounty: 15,
};
export const KNEEL = {
  cost: [60, 60, 60, 60], cooldown: [14, 13, 12, 11], castTime: 0.25,
  range: 350, angle: 70, stun: [1, 1.1, 1.2, 1.3], damage: [40, 65, 90, 115], apRatio: 0.4,
  /** A Lion Kneels to No One. */
  loganShare: 0.5,
};
export const ROYAL_DECREE = {
  cost: [100, 100, 100], cooldown: [80, 70, 60], grab: 300,
  duration: 6, damageTaken: 0.15, teamGold: [100, 150, 200],
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const DEG = Math.PI / 180;

export const KING_RIX_INFO: ChampionInfo = {
  id: 'kingrix',
  name: 'King Rix',
  title: 'The Crown That Kept the Cage',
  resource: 'mana',
  passive: {
    name: 'Royal Tax',
    description: `Allied Chuds within ${ROYAL_TAX.auraRange} of him deal ${pct(ROYAL_TAX.chudDamage)} more damage. When an ally near him last-hits a Chud, he takes ${ROYAL_TAX.gold} gold.`,
  },
  abilities: [
    {
      name: 'Levy',
      description: `A scepter bolt: ${perRank(LEVY.damage)} (+${pct(LEVY.apRatio)} AP) magic damage to the first enemy hit. If it kills, he collects ${perRank(LEVY.killGold)} extra gold and gets the mana back.`,
      cost: LEVY.cost,
      cooldown: LEVY.cooldown,
      castTime: LEVY.castTime,
      targeting: { kind: 'direction', range: LEVY.range, width: LEVY.width },
    },
    {
      name: 'Call the Guard',
      description: `Summon ${CALL_THE_GUARD.count} royal guards for ${CALL_THE_GUARD.lifetime}s. They follow him and attack whatever he attacks, for ${perRank(CALL_THE_GUARD.damage)} (+${pct(CALL_THE_GUARD.apRatio)} AP) a hit. They're terrified of Logan.`,
      cost: CALL_THE_GUARD.cost,
      cooldown: CALL_THE_GUARD.cooldown,
      castTime: CALL_THE_GUARD.castTime,
      targeting: { kind: 'self' },
    },
    {
      name: 'KNEEL!',
      description: `Enemies in a short cone in front of him kneel: ${perRank(KNEEL.damage)} (+${pct(KNEEL.apRatio)} AP) magic damage and a ${perRank(KNEEL.stun)}s stun. Logan only kneels half as long, and roars back.`,
      cost: KNEEL.cost,
      cooldown: KNEEL.cooldown,
      castTime: KNEEL.castTime,
      targeting: { kind: 'cone', range: KNEEL.range, angle: KNEEL.angle },
    },
    {
      name: 'Royal Decree',
      description: `Anywhere on the map: mark the visible enemy champion nearest the target spot. For ${ROYAL_DECREE.duration}s they're revealed to everyone and take ${pct(ROYAL_DECREE.damageTaken)} more damage. If they die while marked, everyone on his team gets ${perRank(ROYAL_DECREE.teamGold)} gold.`,
      cost: ROYAL_DECREE.cost,
      cooldown: ROYAL_DECREE.cooldown,
      castTime: 0,
      targeting: { kind: 'point', range: 20000, radius: ROYAL_DECREE.grab },
    },
  ],
};

export class KingRix extends Champion {
  readonly info = KING_RIX_INFO;
  readonly chudAura = ROYAL_TAX.chudDamage;
  /** Whoever carries his Decree right now, and until when. */
  private decree: { id: number; until: number; gold: number } | null = null;
  /** Two Crowns: he's hung a lion banner over his Da Base. */
  private bannerHung = false;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'King Rix');
  }

  update(world: World): void {
    this.checkDecree(world);
    super.update(world);
  }

  protected launchAttack(world: World, target: Unit): void {
    const damage = this.stats.ad;
    world.add(new HomingProjectile(world, this, target, BOLT_SPEED, 'scepter', (w, t) => w.damage(this, t, damage, 'physical', { basic: true })));
  }

  // ─── Passive: Royal Tax ───────────────────────────────────────────────────

  onAllyLastHit(world: World, victim: Unit): void {
    if (dist(victim.pos, this.pos) <= ROYAL_TAX.taxRange) this.gainGold(world, ROYAL_TAX.gold);
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  /** Royal Decree's target: the visible enemy champion nearest the spot. */
  decreeTarget(world: World, aim: Vec2): Unit | undefined {
    return world
      .units()
      .filter((u) => u.team !== this.team && u.isChampionLike() && u.isTargetable() && world.vision.canSee(this.team, u) && dist(u.pos, aim) <= ROYAL_DECREE.grab + u.radius)
      .sort((a, b) => dist(a.pos, aim) - dist(b.pos, aim))[0];
  }

  protected canCastAt(world: World, slot: Slot, aim: Vec2): boolean {
    return slot !== 3 || this.decreeTarget(world, aim) !== undefined;
  }

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.levy(world, aim);
      case 1: return this.callTheGuard(world);
      case 2: return this.kneel(world, aim);
      case 3: return this.royalDecree(world, aim);
    }
  }

  private levy(world: World, aim: Vec2): void {
    const l = LEVY;
    const damage = this.byRank(0, l.damage) + l.apRatio * this.stats.ap;
    world.add(
      new LineProjectile(world, this, {
        from: this.pos, dir: dirTo(this.pos, aim), speed: l.speed, range: l.range, width: l.width, vis: 'levy', pierce: false,
        onHit: (w, target) => {
          w.damage(this, target, damage, 'magic');
          if (!target.dead) return;
          this.gainGold(w, this.byRank(0, l.killGold));
          this.mana = Math.min(this.stats.maxMana, this.mana + this.costOf(0) + l.killMana);
        },
      }),
    );
  }

  private callTheGuard(world: World): void {
    const c = CALL_THE_GUARD;
    const damage = this.byRank(1, c.damage) + c.apRatio * this.stats.ap;
    for (let i = 0; i < c.count; i++) {
      const side = i === 0 ? -1 : 1;
      const spot = world.grid.nearestWalkable(add(this.pos, scale({ x: Math.cos(this.facing + side * 1.8), y: Math.sin(this.facing + side * 1.8) }, 70))) ?? { ...this.pos };
      world.add(new RoyalGuard(world, this, spot, damage, c.lifetime));
    }
    world.emit({ e: 'fx', fx: 'summon', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: 110, team: this.team });
  }

  private kneel(world: World, aim: Vec2): void {
    const k = KNEEL;
    const dir = dirTo(this.pos, aim);
    const damage = this.byRank(2, k.damage) + k.apRatio * this.stats.ap;
    for (const u of enemiesInCone(world, this.team, this.pos, dir, k.range, (k.angle / 2) * DEG)) {
      world.damage(this, u, damage, 'magic');
      if (u.dead) continue;
      const lion = u instanceof Logan;
      u.addStatus(world, 'stun', this.byRank(2, k.stun) * (lion ? k.loganShare : 1));
      if (lion) u.roarBack(world, this);
    }
    const tip = add(this.pos, scale(dir, k.range));
    world.emit({ e: 'fx', fx: 'kneel', x: this.pos.x, y: this.pos.y, x2: tip.x, y2: tip.y, r: k.angle, team: this.team });
  }

  private royalDecree(world: World, aim: Vec2): void {
    const target = this.decreeTarget(world, aim);
    if (!target) return;
    const d = ROYAL_DECREE;
    target.addStatus(world, 'decreed', d.duration, d.damageTaken);
    this.decree = { id: target.id, until: world.time + d.duration, gold: this.byRank(3, d.teamGold) };
    world.emit({ e: 'fx', fx: 'decree', x: Math.round(target.pos.x), y: Math.round(target.pos.y), r: target.radius * 2.5, team: this.team });
  }

  /** The Decree pays out if its target dies while marked, whoever lands the blow. */
  private checkDecree(world: World): void {
    const d = this.decree;
    if (!d) return;
    if (world.time > d.until) {
      this.decree = null;
      return;
    }
    const target = world.getUnit(d.id);
    if (!target || !target.dead) return;
    this.decree = null;
    for (const u of world.units()) if (u instanceof Champion && u.team === this.team) u.gainGold(world, d.gold);
  }

  // ─── Two Crowns ───────────────────────────────────────────────────────────

  /** He's killed the lion: a lion banner goes up over his Da Base. */
  takeTrophy(world: World): void {
    if (this.bannerHung) return;
    this.bannerHung = true;
    const base = world.units().find((u): u is Structure => u instanceof Structure && u.role === 'daBase' && u.team === this.team);
    if (base) base.banner = '🦁';
  }
}

// ─── Royal guards ─────────────────────────────────────────────────────────────

/** One of King Rix's guards: sticks by him, hits what he hits, and goes home when its time is up. */
export class RoyalGuard extends Unit {
  readonly kind = 'guard';
  /** The Royal Menagerie: they remember the lion. */
  readonly fearsLions = true;
  private readonly expiresAt: number;

  constructor(
    world: World,
    readonly king: KingRix,
    pos: Vec2,
    private readonly hitDamage: number,
    lifetime: number,
  ) {
    const c = CALL_THE_GUARD;
    super(world.newId(), king.team, pos, 26, { maxHp: c.health(king.level), hpRegen: 0, maxMana: 0, manaRegen: 0, ad: hitDamage, ap: 0, armor: 20, mr: 20, attackSpeed: 0.8, attackRange: 110, moveSpeed: 370 }, 'Royal Guard');
    this.facing = king.facing;
    this.expiresAt = world.time + lifetime;
  }

  protected think(world: World): void {
    if (world.time >= this.expiresAt || this.king.dead) {
      this.die(world, null);
      return;
    }
    const k = this.king;
    const order = k.order;
    const target = order.kind === 'attack' ? world.getUnit(order.targetId) : undefined;
    if (target && target.team !== this.team && target.isTargetable() && world.vision.canSee(this.team, target)) {
      this.commandAttack(target);
      return;
    }
    if (dist(this.pos, k.pos) > CALL_THE_GUARD.leash) {
      if (this.order.kind !== 'move' || dist((this.order as { dest: Vec2 }).dest, k.pos) > 120) this.commandMove(world, { ...k.pos });
    } else if (this.order.kind === 'attack') {
      this.commandStop();
    }
  }

  protected launchAttack(world: World, target: Unit): void {
    world.damage(this, target, this.hitDamage, 'physical');
  }

  die(world: World, killer: Unit | null): void {
    super.die(world, killer);
    world.schedule(0.5, () => (this.removed = true));
  }

  protected respawnDelay(): number {
    return Infinity;
  }

  /** No name tag: two guards' labels would bury the king's. */
  snapshot(world: World): EntitySnap {
    return { ...super.snapshot(world), name: undefined };
  }
}

/** Gold for whoever cuts a guard down. */
export const GUARD_BOUNTY = CALL_THE_GUARD.bounty;
