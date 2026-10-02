import type { PlayerTeam, Slot } from '../constants';
import { add, dirTo, dist, scale, type Vec2 } from '../math';
import type { EntitySnap, MeSnap } from '../protocol';
import { enemiesAlongLine, enemiesInCone, enemiesInRadius } from '../sim/query';
import type { Stats, Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { Champion } from './champion';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Every number for this champion lives here. Arrays are per rank (rank 1 first).

const BASE_STATS: Stats = {
  maxHp: 690, hpRegen: 4.2, maxMana: 0, manaRegen: 0,
  ad: 66, ap: 0, armor: 35, mr: 32,
  attackSpeed: 0.66, attackRange: 125, moveSpeed: 345,
};
const GROWTH: StatGrowth = { maxHp: 105, hpRegen: 0.8, maxMana: 0, manaRegen: 0, ad: 3.6, armor: 4.5, mr: 1.4, attackSpeedPct: 0.025 };
const RADIUS = 40;
const DEG = Math.PI / 180;

/** Enemy champions near him feel inadequate and hit softer. */
export const MOG = { radius: 400, weaken: 0.08, ascendedWeaken: 0.16 };
/** Every champion he Chin Checks makes him permanently a little bigger. */
export const GAINS = { perStack: 6, maxStacks: 30 };
export const CHIN_CHECK = {
  cooldown: [9, 8.5, 8, 7.5], range: 420, width: 90, dashSpeed: 1600,
  damage: [70, 105, 140, 175], adRatio: 0.8, knockback: 250, knockTime: 0.25,
};
export const MEWING = {
  cooldown: [14, 13, 12, 11], duration: 3, shield: [70, 100, 130, 160], maxHpRatio: 0.08, tenacity: 0.2, healShare: 0.25,
};
export const SIGMA_STARE = {
  cooldown: [12, 11.5, 11, 10.5], castTime: 0.25, range: 450, angle: 70,
  damage: [55, 85, 115, 145], adRatio: 0.4, fear: [0.75, 0.9, 1.05, 1.2],
};
export const ASCENSION = {
  cooldown: [100, 85, 70], duration: [8, 9, 10], size: 1.3, bonusHp: [200, 350, 500], attackSpeed: 0.25,
  splashRadius: 180, splashShare: 0.5, shockRadius: 300, damage: [100, 175, 250], adRatio: 0.6, knockup: 0.6,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const none = [0, 0, 0, 0];

export const DONGMASTER_INFO: ChampionInfo = {
  id: 'dongmaster',
  name: 'Dongmaster',
  title: 'The Jawline Eternal',
  resource: 'none',
  passive: {
    name: 'Mog',
    icon: '😎',
    description: `Enemy champions within ${MOG.radius} of him deal ${pct(MOG.weaken)} less damage (${pct(MOG.ascendedWeaken)} while Ascended). Every champion he Chin Checks grants a stack of Gains: +${GAINS.perStack} max health for good (up to ${GAINS.maxStacks}).`,
  },
  abilities: [
    {
      name: 'Chin Check',
      icon: '👊',
      description: `Charge forward. The first enemy in the way takes ${perRank(CHIN_CHECK.damage)} (+${pct(CHIN_CHECK.adRatio)} AD) physical damage and is knocked back ${CHIN_CHECK.knockback}. A champion hit grants Gains.`,
      cost: none,
      cooldown: CHIN_CHECK.cooldown,
      castTime: 0,
      targeting: { kind: 'direction', range: CHIN_CHECK.range, width: CHIN_CHECK.width },
    },
    {
      name: 'Mewing',
      icon: '😤',
      description: `Hold perfect posture for ${MEWING.duration}s: a ${perRank(MEWING.shield)} (+${pct(MEWING.maxHpRatio)} max health) shield and ${pct(MEWING.tenacity)} tenacity. When it ends, he heals for ${pct(MEWING.healShare)} of the shield that's left.`,
      cost: none,
      cooldown: MEWING.cooldown,
      castTime: 0,
      targeting: { kind: 'self' },
    },
    {
      name: 'Sigma Stare',
      icon: '👁️',
      description: `A stare nobody can hold. Enemies in front of him take ${perRank(SIGMA_STARE.damage)} (+${pct(SIGMA_STARE.adRatio)} AD) physical damage and run away in fear for ${perRank(SIGMA_STARE.fear)}s.`,
      cost: none,
      cooldown: SIGMA_STARE.cooldown,
      castTime: SIGMA_STARE.castTime,
      targeting: { kind: 'cone', range: SIGMA_STARE.range, angle: SIGMA_STARE.angle },
    },
    {
      name: 'Ascension',
      icon: '🗿',
      description: `Reach his final form for ${perRank(ASCENSION.duration)}s. A shockwave knocks up nearby enemies for ${ASCENSION.knockup}s and deals ${perRank(ASCENSION.damage)} (+${pct(ASCENSION.adRatio)} AD) physical damage. He grows ${pct(ASCENSION.size - 1)} bigger, gains ${perRank(ASCENSION.bonusHp)} max health and ${pct(ASCENSION.attackSpeed)} attack speed, and his attacks splash ${pct(ASCENSION.splashShare)} damage around the target.`,
      cost: [0, 0, 0],
      cooldown: ASCENSION.cooldown,
      castTime: 0,
      targeting: { kind: 'self', radius: ASCENSION.shockRadius },
    },
  ],
};

export class Dongmaster extends Champion {
  readonly info = DONGMASTER_INFO;
  /** Stacks of Gains: permanent max health from Chin Checking champions. */
  gains = 0;
  private ascended = { until: -Infinity, bonus: 0 };
  private mewingUntil = -Infinity;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'Dongmaster');
  }

  ascendedNow(world: World): boolean {
    return world.time < this.ascended.until;
  }

  // ─── Passive: Mog ─────────────────────────────────────────────────────────

  protected think(world: World): void {
    const ascended = this.ascendedNow(world);
    this.radius = ascended ? RADIUS * ASCENSION.size : RADIUS;
    for (const u of enemiesInRadius(world, this.team, this.pos, MOG.radius)) {
      if (u.kind === 'champion') u.addStatus(world, 'weaken', 0.25, ascended ? MOG.ascendedWeaken : MOG.weaken);
    }
  }

  protected computeStats(world: World): Stats {
    const s = super.computeStats(world);
    s.maxHp += this.gains * GAINS.perStack;
    if (this.ascendedNow(world)) {
      s.maxHp += this.ascended.bonus;
      s.attackSpeed *= 1 + ASCENSION.attackSpeed;
    }
    return s;
  }

  protected tenacity(world: World): number {
    return world.time < this.mewingUntil ? MEWING.tenacity : 0;
  }

  protected launchAttack(world: World, target: Unit): void {
    world.damage(this, target, this.stats.ad, 'physical', { basic: true });
    if (!this.ascendedNow(world)) return;
    for (const u of enemiesInRadius(world, this.team, target.pos, ASCENSION.splashRadius)) {
      if (u !== target) world.damage(this, u, this.stats.ad * ASCENSION.splashShare, 'physical');
    }
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.chinCheck(world, aim);
      case 1: return this.mewing(world);
      case 2: return this.sigmaStare(world, aim);
      case 3: return this.ascend(world);
    }
  }

  private chinCheck(world: World, aim: Vec2): void {
    const c = CHIN_CHECK;
    const dir = dirTo(this.pos, aim);
    const victim = enemiesAlongLine(world, this.team, this.pos, dir, c.range, c.width)[0];
    const from = { ...this.pos };
    const stop = victim ? Math.max(0, dist(this.pos, victim.pos) - this.radius - victim.radius) : c.range;
    const to = world.grid.clampLine(from, add(from, scale(dir, stop)));
    const time = Math.max(0.08, dist(from, to) / c.dashSpeed);
    this.startDash(world, to, time);
    world.emit({ e: 'fx', fx: 'chinCheck', x: Math.round(from.x), y: Math.round(from.y), x2: Math.round(to.x), y2: Math.round(to.y), team: this.team });
    if (!victim) return;
    world.schedule(time, () => {
      if (this.dead || victim.dead || !victim.isTargetable()) return;
      world.damage(this, victim, this.byRank(0, c.damage) + c.adRatio * this.stats.ad, 'physical');
      if (victim.kind === 'champion') this.gains = Math.min(GAINS.maxStacks, this.gains + 1);
      if (victim.dead || victim.immovable) return;
      const push = world.grid.clampLine(victim.pos, add(victim.pos, scale(dirTo(this.pos, victim.pos), c.knockback)));
      victim.startDash(world, push, c.knockTime);
      victim.addStatus(world, 'airborne', c.knockTime);
    });
  }

  private mewing(world: World): void {
    const m = MEWING;
    const shield = this.addShield(world, this.byRank(1, m.shield) + m.maxHpRatio * this.stats.maxHp, m.duration);
    this.mewingUntil = world.time + m.duration;
    this.addStatus(world, 'mewing', m.duration);
    world.schedule(m.duration, () => {
      if (!this.dead && shield.amount > 0) this.heal(world, shield.amount * m.healShare);
    });
    world.emit({ e: 'fx', fx: 'mewing', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: this.radius * 1.5, team: this.team });
  }

  private sigmaStare(world: World, aim: Vec2): void {
    const s = SIGMA_STARE;
    const dir = dirTo(this.pos, aim);
    const damage = this.byRank(2, s.damage) + s.adRatio * this.stats.ad;
    for (const u of enemiesInCone(world, this.team, this.pos, dir, s.range, (s.angle / 2) * DEG)) {
      world.damage(this, u, damage, 'physical');
      if (!u.dead) u.fear(world, this.pos, this.byRank(2, s.fear));
    }
    const tip = add(this.pos, scale(dir, s.range));
    world.emit({ e: 'fx', fx: 'sigmaStare', x: Math.round(this.pos.x), y: Math.round(this.pos.y), x2: Math.round(tip.x), y2: Math.round(tip.y), r: s.angle, team: this.team });
  }

  private ascend(world: World): void {
    const a = ASCENSION;
    const bonus = this.byRank(3, a.bonusHp);
    this.ascended = { until: world.time + this.byRank(3, a.duration), bonus };
    this.stats = this.computeStats(world);
    this.heal(world, bonus);
    const damage = this.byRank(3, a.damage) + a.adRatio * this.stats.ad;
    for (const u of enemiesInRadius(world, this.team, this.pos, a.shockRadius)) {
      world.damage(this, u, damage, 'physical');
      if (u.dead) continue;
      u.addStatus(world, 'stun', a.knockup);
      u.addStatus(world, 'airborne', a.knockup);
    }
    world.emit({ e: 'fx', fx: 'ascension', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: a.shockRadius, team: this.team });
  }

  protected respawn(): void {
    super.respawn();
    this.ascended = { until: -Infinity, bonus: 0 };
    this.radius = RADIUS;
  }

  snapshot(world: World): EntitySnap {
    const s = super.snapshot(world);
    if (this.ascendedNow(world)) s.st = [...(s.st ?? []), 'ascended'];
    return s;
  }

  meSnapshot(world: World): MeSnap {
    return { ...super.meSnapshot(world), passiveStacks: this.gains, empowered: this.ascendedNow(world) };
  }
}
