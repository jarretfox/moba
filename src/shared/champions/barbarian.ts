import { DT, type PlayerTeam, type Slot } from '../constants';
import { add, dirTo, scale, type Vec2 } from '../math';
import type { EntitySnap, MeSnap } from '../protocol';
import { enemiesInCone, enemiesInRadius } from '../sim/query';
import type { Stats, Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { Champion } from './champion';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Every number for this champion lives here. Arrays are per rank (rank 1 first).

const BASE_STATS: Stats = {
  maxHp: 700, hpRegen: 4, maxMana: 100, manaRegen: 0, // "mana" is Rage for him
  ad: 66, ap: 0, armor: 34, mr: 32,
  attackSpeed: 0.7, attackRange: 125, moveSpeed: 345,
};
const GROWTH: StatGrowth = { maxHp: 105, hpRegen: 0.8, maxMana: 0, manaRegen: 0, ad: 3.8, armor: 4.4, mr: 1.4, attackSpeedPct: 0.025 };
const RADIUS = 38;
const FREE = [0, 0, 0, 0];

const RAGE = { max: 100, perAttack: 8, perAbilityHit: 5, perHitTaken: 2, decayAfter: 6, decayPerSecond: 10 };
const CLEAVE = {
  cooldown: [5, 4.5, 4, 3.5], castTime: 0.15, range: 300, angle: 110,
  damage: [40, 70, 100, 130], adRatio: 1.0, healPerEnemy: 10, healPerChampion: [30, 40, 50, 60],
  brutal: { range: 380, damageMult: 1.5, healMult: 2 },
};
const WAR_CRY = {
  cooldown: [12, 11, 10, 9], radius: 350, slow: [0.3, 0.35, 0.4, 0.45], slowDuration: 2, weaken: 0.2, weakenDuration: 4,
  brutal: { slow: 0.6, slowDuration: 3, weaken: 0.35 },
};
const LEAP = {
  cooldown: [10, 9, 8, 7], range: 600, radius: 180, airTime: 0.45,
  damage: [50, 85, 120, 155], adRatio: 0.6, slow: 0.4, slowDuration: 1.5,
  brutal: { radius: 240, stun: 0.75 },
};
const BERSERK = {
  cooldown: [80, 70, 60], duration: [6, 7, 8], maxDuration: 12, takedownExtend: 2,
  tenacity: 0.4, attackSpeed: [0.3, 0.45, 0.6], size: 1.2, rageOnCast: 50,
  cleaveRadius: 200, cleaveShare: 0.5,
  brutal: { extraDuration: 3 },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const DEG = Math.PI / 180;

export const BARBARIAN_INFO: ChampionInfo = {
  id: 'barbarian',
  name: 'Barbarian',
  title: 'The Unchained Fury',
  resource: 'rage',
  passive: {
    name: 'Blood Rage',
    description: `Hitting and getting hit builds Rage, which burns off after ${RAGE.decayAfter}s out of combat. At ${RAGE.max} Rage his next ability is Brutal: stronger, and it spends all his Rage.`,
  },
  abilities: [
    {
      name: 'Cleave',
      description: `Swing through everything in front of you for ${perRank(CLEAVE.damage)} (+${pct(CLEAVE.adRatio)} AD) physical damage, healing ${CLEAVE.healPerEnemy} per enemy hit and ${perRank(CLEAVE.healPerChampion)} per champion. Brutal: longer reach, ${pct(CLEAVE.brutal.damageMult - 1)} more damage, double healing.`,
      cost: FREE,
      cooldown: CLEAVE.cooldown,
      castTime: CLEAVE.castTime,
      targeting: { kind: 'cone', range: CLEAVE.range, angle: CLEAVE.angle },
    },
    {
      name: 'War Cry',
      description: `Nearby enemies are slowed by ${perRank(WAR_CRY.slow, pct)} for ${WAR_CRY.slowDuration}s and deal ${pct(WAR_CRY.weaken)} less damage for ${WAR_CRY.weakenDuration}s. Brutal: ${pct(WAR_CRY.brutal.slow)} slow for ${WAR_CRY.brutal.slowDuration}s, ${pct(WAR_CRY.brutal.weaken)} less damage.`,
      cost: FREE,
      cooldown: WAR_CRY.cooldown,
      castTime: 0,
      targeting: { kind: 'self', radius: WAR_CRY.radius },
    },
    {
      name: 'Leap',
      description: `Leap to a spot (even over walls), dealing ${perRank(LEAP.damage)} (+${pct(LEAP.adRatio)} AD) physical damage where you land and slowing by ${pct(LEAP.slow)}. Brutal: a wider landing that stuns for ${LEAP.brutal.stun}s instead.`,
      cost: FREE,
      cooldown: LEAP.cooldown,
      castTime: 0,
      targeting: { kind: 'point', range: LEAP.range, radius: LEAP.radius },
    },
    {
      name: 'Berserk',
      description: `For ${perRank(BERSERK.duration)}s: grow bigger, gain ${perRank(BERSERK.attackSpeed, pct)} attack speed and ${pct(BERSERK.tenacity)} shorter crowd control, and your attacks splash ${pct(BERSERK.cleaveShare)} damage around your target. Gain ${BERSERK.rageOnCast} Rage. Takedowns add ${BERSERK.takedownExtend}s. Brutal: lasts ${BERSERK.brutal.extraDuration}s longer.`,
      cost: FREE,
      cooldown: BERSERK.cooldown,
      castTime: 0,
      targeting: { kind: 'self' },
    },
  ],
};

export class Barbarian extends Champion {
  readonly info = BARBARIAN_INFO;
  private lastCombatAt = -Infinity;
  private berserk = { from: -Infinity, until: -Infinity };
  /** Whether the cast in progress is Brutal. Only one cast can be winding up at a time. */
  private brutalCast = false;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'Barbarian');
    this.mana = 0; // Rage starts empty
  }

  // ─── Passive: Blood Rage ──────────────────────────────────────────────────

  private gainRage(world: World, amount: number): void {
    this.mana = Math.min(RAGE.max, this.mana + amount);
    this.lastCombatAt = world.time;
  }

  onDamaged(world: World, source: Unit | null): void {
    if (source) this.gainRage(world, RAGE.perHitTaken);
  }

  protected think(world: World): void {
    if (world.time - this.lastCombatAt > RAGE.decayAfter) this.mana = Math.max(0, this.mana - RAGE.decayPerSecond * DT);
    this.radius = this.berserking(world) ? RADIUS * BERSERK.size : RADIUS;
  }

  protected launchAttack(world: World, target: Unit): void {
    world.damage(this, target, this.stats.ad, 'physical', { basic: true });
    this.gainRage(world, RAGE.perAttack);
    if (!this.berserking(world)) return;
    for (const u of enemiesInRadius(world, this.team, target.pos, BERSERK.cleaveRadius)) {
      if (u !== target) world.damage(this, u, this.stats.ad * BERSERK.cleaveShare, 'physical');
    }
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  /** Brutal is decided the moment you press the key, so Rage burning off during a wind-up can't cost you it. */
  protected onCastStart(): void {
    this.brutalCast = this.mana >= RAGE.max;
    if (this.brutalCast) this.mana = 0;
  }

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    const brutal = this.brutalCast;
    switch (slot) {
      case 0: return this.cleave(world, aim, brutal);
      case 1: return this.warCry(world, brutal);
      case 2: return this.leap(world, aim, brutal);
      case 3: return this.goBerserk(world, brutal);
    }
  }

  private cleave(world: World, aim: Vec2, brutal: boolean): void {
    const c = CLEAVE;
    const range = brutal ? c.brutal.range : c.range;
    const dir = dirTo(this.pos, aim);
    const hits = enemiesInCone(world, this.team, this.pos, dir, range, (c.angle / 2) * DEG);
    const damage = (this.byRank(0, c.damage) + c.adRatio * this.stats.ad) * (brutal ? c.brutal.damageMult : 1);
    let heal = 0;
    for (const u of hits) {
      world.damage(this, u, damage, 'physical');
      heal += u.isChampionLike() ? this.byRank(0, c.healPerChampion) : c.healPerEnemy;
    }
    this.heal(world, heal * (brutal ? c.brutal.healMult : 1));
    if (hits.length) this.gainRage(world, RAGE.perAbilityHit * hits.length);
    const tip = add(this.pos, scale(dir, range));
    world.emit({ e: 'fx', fx: 'cleave', x: this.pos.x, y: this.pos.y, x2: tip.x, y2: tip.y, r: c.angle, team: this.team });
  }

  private warCry(world: World, brutal: boolean): void {
    const w = WAR_CRY;
    const hits = enemiesInRadius(world, this.team, this.pos, w.radius);
    for (const u of hits) {
      u.addStatus(world, 'slow', brutal ? w.brutal.slowDuration : w.slowDuration, brutal ? w.brutal.slow : this.byRank(1, w.slow));
      u.addStatus(world, 'weaken', w.weakenDuration, brutal ? w.brutal.weaken : w.weaken);
    }
    if (hits.length) this.gainRage(world, RAGE.perAbilityHit * hits.length);
    world.emit({ e: 'fx', fx: 'warCry', x: this.pos.x, y: this.pos.y, r: w.radius, team: this.team });
  }

  private leap(world: World, aim: Vec2, brutal: boolean): void {
    const landing = world.grid.nearestWalkable(aim) ?? { ...this.pos };
    this.startDash(world, landing, LEAP.airTime);
    this.addStatus(world, 'airborne', LEAP.airTime);
    world.schedule(LEAP.airTime, () => this.land(world, landing, brutal));
  }

  private land(world: World, at: Vec2, brutal: boolean): void {
    if (this.dead) return;
    const radius = brutal ? LEAP.brutal.radius : LEAP.radius;
    const hits = enemiesInRadius(world, this.team, at, radius);
    for (const u of hits) {
      world.damage(this, u, this.byRank(2, LEAP.damage) + LEAP.adRatio * this.stats.ad, 'physical');
      if (brutal) u.addStatus(world, 'stun', LEAP.brutal.stun);
      else u.addStatus(world, 'slow', LEAP.slowDuration, LEAP.slow);
    }
    if (hits.length) this.gainRage(world, RAGE.perAbilityHit * hits.length);
    world.emit({ e: 'fx', fx: 'slam', x: at.x, y: at.y, r: radius, team: this.team });
  }

  // ─── Ultimate: Berserk ────────────────────────────────────────────────────

  private goBerserk(world: World, brutal: boolean): void {
    const duration = this.byRank(3, BERSERK.duration) + (brutal ? BERSERK.brutal.extraDuration : 0);
    this.berserk = { from: world.time, until: world.time + duration };
    this.gainRage(world, BERSERK.rageOnCast);
    world.emit({ e: 'fx', fx: 'berserk', x: this.pos.x, y: this.pos.y, r: RADIUS * BERSERK.size, team: this.team });
  }

  private berserking(world: World): boolean {
    return world.time < this.berserk.until;
  }

  onTakedown(world: World): void {
    if (!this.berserking(world)) return;
    this.berserk.until = Math.min(this.berserk.until + BERSERK.takedownExtend, this.berserk.from + BERSERK.maxDuration);
  }

  protected computeStats(world: World): Stats {
    const s = super.computeStats(world);
    if (this.berserking(world)) s.attackSpeed *= 1 + this.byRank(3, BERSERK.attackSpeed);
    return s;
  }

  protected tenacity(world: World): number {
    return this.berserking(world) ? BERSERK.tenacity : 0;
  }

  protected respawn(): void {
    super.respawn();
    this.mana = 0;
    this.berserk = { from: -Infinity, until: -Infinity };
  }

  snapshot(world: World): EntitySnap {
    const s = super.snapshot(world);
    if (this.berserking(world)) s.st = [...(s.st ?? []), 'berserk'];
    return s;
  }

  meSnapshot(world: World): MeSnap {
    return { ...super.meSnapshot(world), empowered: this.mana >= RAGE.max };
  }
}
