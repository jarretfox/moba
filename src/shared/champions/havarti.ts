import type { PlayerTeam, Slot } from '../constants';
import { add, dirTo, dist, scale, type Vec2 } from '../math';
import type { MeSnap } from '../protocol';
import { HomingProjectile, LineProjectile } from '../sim/projectile';
import { enemiesAlongLine, enemiesInRadius } from '../sim/query';
import type { Stats, Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { Champion } from './champion';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Every number for this champion lives here. Arrays are per rank (rank 1 first).

const BASE_STATS: Stats = {
  maxHp: 625, hpRegen: 3.5, maxMana: 330, manaRegen: 7,
  ad: 58, ap: 0, armor: 30, mr: 32,
  attackSpeed: 0.65, attackRange: 175, moveSpeed: 335,
};
const GROWTH: StatGrowth = { maxHp: 92, hpRegen: 0.6, maxMana: 40, manaRegen: 0.5, ad: 2.6, armor: 3.8, mr: 1.2, attackSpeedPct: 0.02 };
const RADIUS = 36;
const BOLT_SPEED = 1700;

/**
 * Aged to Perfection: she ripens as she levels. Fresh at first (her attacks are melee), Aged at the first
 * tier (they reach), Vintage at the second (they send a wave of molten cheese through whoever's behind), and
 * Legendary at the last (always fully ripe). Every attack ripens her a little more for a few seconds.
 */
export const AGED = {
  tiers: [5, 9, 13], rangedRange: 525,
  ripeness: { perStack: 0.06, max: 5, duration: 5, fullMoveSpeed: 0.08 },
  wave: { length: 350, width: 90, adRatio: 0.5, apRatio: 0.25 },
};
export const HOLY_WHEEL = {
  cost: [70, 70, 70, 70], cooldown: [10, 9.5, 9, 8.5], castTime: 0.25, range: 900, width: 80, speed: 1600,
  damage: [70, 110, 150, 190], apRatio: 0.6, bonusAdRatio: 0.5, slow: 0.25, slowFor: 2, curdle: 0.15, curdleFor: 4,
};
export const FONDUE_BLESSING = {
  cost: [70, 75, 80, 85], cooldown: [15, 14, 13, 12], range: 900, heal: [60, 90, 120, 150], apRatio: 0.3,
  speed: [0.2, 0.24, 0.28, 0.32], speedFor: 2,
};
export const RIND_BLADE = {
  cost: [40, 40, 40, 40], cooldown: [8, 7.5, 7, 6.5], onHit: [12, 18, 24, 30], onHitApRatio: 0.2,
  window: 4, extraRange: 200, missing: [0.08, 0.09, 0.1, 0.11], missingPer100Ap: 0.01, unitCap: 200,
};
export const DIVINE_FONDUE = {
  cost: [100, 100, 100], cooldown: [120, 100, 80], castTime: 0.25, range: 900, grab: 250,
  duration: [2, 2.5, 3], radius: 450, damage: [150, 250, 350], apRatio: 0.8, bonusAdRatio: 1,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const HAVARTI_INFO: ChampionInfo = {
  id: 'havarti',
  name: 'Havarti',
  title: 'The Aged One',
  resource: 'mana',
  passive: {
    name: 'Aged to Perfection',
    icon: '🧀',
    description: `Each attack ripens her: +${pct(AGED.ripeness.perStack)} attack speed for ${AGED.ripeness.duration}s (up to ${AGED.ripeness.max}; fully ripe she's also ${pct(AGED.ripeness.fullMoveSpeed)} faster). At level ${AGED.tiers[0]} her attacks reach ${AGED.rangedRange}. At ${AGED.tiers[1]} they send a wave of molten cheese through the enemies behind the target. At ${AGED.tiers[2]} she's always fully ripe.`,
  },
  abilities: [
    {
      name: 'Holy Wheel',
      icon: '🌕',
      description: `Hurl a blessed wheel of cheese. The first enemy hit takes ${perRank(HOLY_WHEEL.damage)} (+${pct(HOLY_WHEEL.apRatio)} AP, +${pct(HOLY_WHEEL.bonusAdRatio)} bonus AD) magic damage, is slowed by ${pct(HOLY_WHEEL.slow)} for ${HOLY_WHEEL.slowFor}s, and has its armor and magic resist curdled by ${pct(HOLY_WHEEL.curdle)} for ${HOLY_WHEEL.curdleFor}s.`,
      cost: HOLY_WHEEL.cost,
      cooldown: HOLY_WHEEL.cooldown,
      castTime: HOLY_WHEEL.castTime,
      targeting: { kind: 'direction', range: HOLY_WHEEL.range, width: HOLY_WHEEL.width },
    },
    {
      name: 'Fondue Blessing',
      icon: '💛',
      description: `Heal herself and the most hurt allied champion within ${FONDUE_BLESSING.range} for ${perRank(FONDUE_BLESSING.heal)} (+${pct(FONDUE_BLESSING.apRatio)} AP); both move ${perRank(FONDUE_BLESSING.speed, pct)} faster for ${FONDUE_BLESSING.speedFor}s.`,
      cost: FONDUE_BLESSING.cost,
      cooldown: FONDUE_BLESSING.cooldown,
      castTime: 0,
      targeting: { kind: 'self', radius: FONDUE_BLESSING.range },
    },
    {
      name: 'Rind Blade',
      icon: '🔪',
      description: `Her attacks deal ${perRank(RIND_BLADE.onHit)} (+${pct(RIND_BLADE.onHitApRatio)} AP) bonus magic damage. Cast: her next attack within ${RIND_BLADE.window}s reaches ${RIND_BLADE.extraRange} further and deals ${perRank(RIND_BLADE.missing, pct)} (+1% per 100 AP) of the target's missing health as magic damage (at most ${RIND_BLADE.unitCap} to non-champions).`,
      cost: RIND_BLADE.cost,
      cooldown: RIND_BLADE.cooldown,
      castTime: 0,
      targeting: { kind: 'self' },
    },
    {
      name: 'Divine Fondue',
      icon: '😇',
      description: `Bless an allied champion (or herself): nothing can hurt them for ${perRank(DIVINE_FONDUE.duration)}s. Then molten cheese erupts around them, dealing ${perRank(DIVINE_FONDUE.damage)} (+${pct(DIVINE_FONDUE.apRatio)} AP, +${pct(DIVINE_FONDUE.bonusAdRatio)} bonus AD) magic damage to enemies within ${DIVINE_FONDUE.radius}.`,
      cost: DIVINE_FONDUE.cost,
      cooldown: DIVINE_FONDUE.cooldown,
      castTime: DIVINE_FONDUE.castTime,
      targeting: { kind: 'point', range: DIVINE_FONDUE.range, radius: DIVINE_FONDUE.grab },
    },
  ],
};

export class Havarti extends Champion {
  readonly info = HAVARTI_INFO;
  private ripe = { stacks: 0, until: -Infinity };
  private rindUntil = -Infinity;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'Havarti');
  }

  get bonusAd(): number {
    return Math.max(0, this.stats.ad - (BASE_STATS.ad + GROWTH.ad * (this.level - 1)));
  }

  /** 0 Fresh, 1 Aged, 2 Vintage, 3 Legendary. */
  get tier(): number {
    return AGED.tiers.filter((t) => this.level >= t).length;
  }

  ripeness(world: World): number {
    if (this.tier >= 3) return AGED.ripeness.max;
    return world.time < this.ripe.until ? this.ripe.stacks : 0;
  }

  // ─── Passive: Aged to Perfection ──────────────────────────────────────────

  protected computeStats(world: World): Stats {
    const s = super.computeStats(world);
    if (this.tier >= 1) s.attackRange = AGED.rangedRange;
    if (world.time < this.rindUntil) s.attackRange += RIND_BLADE.extraRange;
    const ripe = this.ripeness(world);
    s.attackSpeed *= 1 + ripe * AGED.ripeness.perStack;
    if (ripe >= AGED.ripeness.max) s.moveSpeed *= 1 + AGED.ripeness.fullMoveSpeed;
    return s;
  }

  /** Reaching a new tier is a moment: wings spread, a pillar of light. */
  gainXp(world: World, amount: number): void {
    const before = this.tier;
    super.gainXp(world, amount);
    if (this.tier > before) world.emit({ e: 'fx', fx: 'ascend', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: this.tier, team: this.team });
  }

  protected launchAttack(world: World, target: Unit): void {
    const empowered = world.time < this.rindUntil;
    this.rindUntil = -Infinity;
    this.clearStatus('rindBlade');
    this.ripe = { stacks: Math.min(AGED.ripeness.max, this.ripeness(world) + 1), until: world.time + AGED.ripeness.duration };
    const from = { ...this.pos };
    const land = (w: World, t: Unit) => this.strike(w, t, from, empowered);
    if (this.tier >= 1) world.add(new HomingProjectile(world, this, target, BOLT_SPEED, 'cheeseBolt', land));
    else land(world, target);
  }

  private strike(world: World, target: Unit, from: Vec2, empowered: boolean): void {
    world.damage(this, target, this.stats.ad, 'physical', { basic: true });
    if (target.dead) return this.wave(world, target, from);
    if (this.abilities[2].rank > 0) world.damage(this, target, this.byRank(2, RIND_BLADE.onHit) + RIND_BLADE.onHitApRatio * this.stats.ap, 'magic');
    if (empowered && !target.dead) {
      const share = this.byRank(2, RIND_BLADE.missing) + (RIND_BLADE.missingPer100Ap * this.stats.ap) / 100;
      const missing = (target.stats.maxHp - target.hp) * share;
      world.damage(this, target, target.isChampionLike() ? missing : Math.min(RIND_BLADE.unitCap, missing), 'magic');
    }
    this.wave(world, target, from);
  }

  /** Vintage: a wave of molten cheese rolls on through whoever stands behind the target. */
  private wave(world: World, target: Unit, from: Vec2): void {
    if (this.tier < 2) return;
    const w = AGED.wave;
    const dir = dirTo(from, target.pos);
    const start = add(target.pos, scale(dir, target.radius));
    const damage = w.adRatio * this.stats.ad + w.apRatio * this.stats.ap;
    for (const u of enemiesAlongLine(world, this.team, start, dir, w.length, w.width)) if (u !== target) world.damage(this, u, damage, 'magic');
    const end = add(start, scale(dir, w.length));
    world.emit({ e: 'fx', fx: 'cheeseWave', x: Math.round(start.x), y: Math.round(start.y), x2: Math.round(end.x), y2: Math.round(end.y), team: this.team });
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.holyWheel(world, aim);
      case 1: return this.fondueBlessing(world);
      case 2: return this.rindBlade(world);
      case 3: return this.divineFondue(world, aim);
    }
  }

  private holyWheel(world: World, aim: Vec2): void {
    const h = HOLY_WHEEL;
    const damage = this.byRank(0, h.damage) + h.apRatio * this.stats.ap + h.bonusAdRatio * this.bonusAd;
    world.add(
      new LineProjectile(world, this, {
        from: this.pos, dir: dirTo(this.pos, aim), speed: h.speed, range: h.range, width: h.width,
        vis: 'cheeseWheel', pierce: false,
        onHit: (w, target) => {
          w.damage(this, target, damage, 'magic');
          if (target.dead) return;
          target.addStatus(w, 'slow', h.slowFor, h.slow);
          target.addStatus(w, 'curdled', h.curdleFor, h.curdle);
          w.emit({ e: 'fx', fx: 'curdle', x: Math.round(target.pos.x), y: Math.round(target.pos.y), r: target.radius, team: this.team });
        },
      }),
    );
  }

  /** The allied champion within reach who's lowest on health (by share), if any. */
  private mostHurtAlly(world: World): Unit | undefined {
    return world
      .units()
      .filter((u) => u !== this && u.team === this.team && u.kind === 'champion' && !u.dead && dist(u.pos, this.pos) <= FONDUE_BLESSING.range)
      .sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
  }

  private fondueBlessing(world: World): void {
    const f = FONDUE_BLESSING;
    const heal = this.byRank(1, f.heal) + f.apRatio * this.stats.ap;
    const ally = this.mostHurtAlly(world);
    for (const u of ally ? [this, ally] : [this]) {
      u.heal(world, heal);
      u.addStatus(world, 'speed', f.speedFor, this.byRank(1, f.speed));
    }
    const to = ally?.pos ?? this.pos;
    world.emit({ e: 'fx', fx: 'fondue', x: Math.round(this.pos.x), y: Math.round(this.pos.y), x2: Math.round(to.x), y2: Math.round(to.y), team: this.team });
  }

  private rindBlade(world: World): void {
    this.rindUntil = world.time + RIND_BLADE.window;
    this.addStatus(world, 'rindBlade', RIND_BLADE.window);
    this.attackReadyAt = Math.min(this.attackReadyAt, world.time);
    world.emit({ e: 'fx', fx: 'rindBlade', x: Math.round(this.pos.x), y: Math.round(this.pos.y), team: this.team });
  }

  /** Divine Fondue's target: the allied champion nearest where she aimed, or herself if there's nobody there. */
  fondueTarget(world: World, aim: Vec2): Unit {
    const d = DIVINE_FONDUE;
    return (
      world
        .units()
        .filter((u) => u.team === this.team && u.kind === 'champion' && !u.dead && dist(u.pos, aim) <= d.grab + u.radius && dist(u.pos, this.pos) <= d.range + d.grab)
        .sort((a, b) => dist(a.pos, aim) - dist(b.pos, aim))[0] ?? this
    );
  }

  private divineFondue(world: World, aim: Vec2): void {
    const d = DIVINE_FONDUE;
    const ally = this.fondueTarget(world, aim);
    const duration = this.byRank(3, d.duration);
    ally.addStatus(world, 'blessed', duration);
    world.emit({ e: 'fx', fx: 'divineFondue', x: Math.round(ally.pos.x), y: Math.round(ally.pos.y), dur: duration, r: ally.radius, team: this.team });
    const damage = this.byRank(3, d.damage) + d.apRatio * this.stats.ap + d.bonusAdRatio * this.bonusAd;
    world.schedule(duration, () => {
      const at = { ...ally.pos };
      for (const u of enemiesInRadius(world, this.team, at, d.radius)) world.damage(this, u, damage, 'magic');
      world.emit({ e: 'fx', fx: 'fondueEruption', x: Math.round(at.x), y: Math.round(at.y), r: d.radius, team: this.team });
    });
  }

  protected respawn(): void {
    super.respawn();
    this.ripe = { stacks: 0, until: -Infinity };
    this.rindUntil = -Infinity;
  }

  meSnapshot(world: World): MeSnap {
    return { ...super.meSnapshot(world), passiveStacks: this.ripeness(world), empowered: world.time < this.rindUntil };
  }
}
