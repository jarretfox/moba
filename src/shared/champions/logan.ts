import type { PlayerTeam, Slot } from '../constants';
import { add, dirTo, dist, scale, sub, type Vec2 } from '../math';
import type { MeSnap } from '../protocol';
import { enemiesInCone } from '../sim/query';
import type { Stats, Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { Champion } from './champion';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Every number for this champion lives here. Arrays are per rank (rank 1 first). No resource: cooldowns only.

const BASE_STATS: Stats = {
  maxHp: 680, hpRegen: 4.5, maxMana: 0, manaRegen: 0,
  ad: 62, ap: 0, armor: 36, mr: 32,
  attackSpeed: 0.65, attackRange: 125, moveSpeed: 345,
};
const GROWTH: StatGrowth = { maxHp: 105, hpRegen: 0.8, maxMana: 0, manaRegen: 0, ad: 3.4, armor: 4.6, mr: 1.4, attackSpeedPct: 0.025 };
const RADIUS = 40;
const FREE = [0, 0, 0, 0];

/** When a nearby ally drops low, he gets a shield and a burst of speed to go to them. */
export const LIONHEART = {
  range: 1000, threshold: 0.3, rixThreshold: 0.15, cooldown: 20,
  shield: (level: number) => 80 + 20 * level, shieldFor: 3, speed: 0.4, speedFor: 2,
};
const POUNCE = {
  cooldown: [10, 9, 8, 7], range: 600, grabRadius: 150, speed: 1400,
  empowerWindow: 3, stun: 0.75, bonus: [30, 50, 70, 90], adRatio: 0.4,
};
const THICK_MANE = {
  cooldown: [14, 13, 12, 11], duration: 4, shield: [60, 90, 120, 150], bonusHpRatio: 0.15, slow: 0.3, slowFor: 1,
};
const MAUL = {
  cooldown: [8, 7.5, 7, 6.5], castTime: 0.15, range: 300, angle: 90,
  damage: [50, 80, 110, 140], adRatio: 0.7, bleed: [30, 45, 60, 75], bleedFor: 3,
};
export const PRIDES_ROAR = {
  cooldown: [100, 85, 70], range: 450, angle: 100, fear: 1.25, menagerieMult: 2,
  allyRadius: 600, shield: [100, 175, 250], bonusHpRatio: 0.2, shieldFor: 3, speed: 0.3, speedFor: 3,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const DEG = Math.PI / 180;

export const LOGAN_INFO: ChampionInfo = {
  id: 'logan',
  name: 'Logan Lionheart',
  title: 'The Lion Who Left the Cage',
  resource: 'none',
  passive: {
    name: 'Lionheart',
    description: `When an allied champion within ${LIONHEART.range} drops below ${pct(LIONHEART.threshold)} health (King Rix: only below ${pct(LIONHEART.rixThreshold)}), Logan gets a shield and ${pct(LIONHEART.speed)} speed for ${LIONHEART.speedFor}s to get to them. Once every ${LIONHEART.cooldown}s.`,
  },
  abilities: [
    {
      name: 'Pounce',
      description: `Leap onto an enemy near the target spot. Your next basic attack within ${POUNCE.empowerWindow}s stuns for ${POUNCE.stun}s and deals ${perRank(POUNCE.bonus)} (+${pct(POUNCE.adRatio)} AD) bonus physical damage.`,
      cost: FREE,
      cooldown: POUNCE.cooldown,
      castTime: 0,
      targeting: { kind: 'point', range: POUNCE.range, radius: POUNCE.grabRadius },
    },
    {
      name: 'Thick Mane',
      description: `Gain a shield of ${perRank(THICK_MANE.shield)} (+${pct(THICK_MANE.bonusHpRatio)} bonus health) for ${THICK_MANE.duration}s. While it holds, your basic attacks slow by ${pct(THICK_MANE.slow)}.`,
      cost: FREE,
      cooldown: THICK_MANE.cooldown,
      castTime: 0,
      targeting: { kind: 'self' },
    },
    {
      name: 'Maul',
      description: `Swipe in front of you for ${perRank(MAUL.damage)} (+${pct(MAUL.adRatio)} AD) physical damage. Enemies hit bleed for ${perRank(MAUL.bleed)} more over ${MAUL.bleedFor}s, and bleeding enemies can't hide (it even reveals a burrowed Willmore).`,
      cost: FREE,
      cooldown: MAUL.cooldown,
      castTime: MAUL.castTime,
      targeting: { kind: 'cone', range: MAUL.range, angle: MAUL.angle },
    },
    {
      name: "Pride's Roar",
      description: `Roar: enemies in front of you flee in fear for ${PRIDES_ROAR.fear}s (King Rix's guards for twice as long). Allies near you gain a shield of ${perRank(PRIDES_ROAR.shield)} (+${pct(PRIDES_ROAR.bonusHpRatio)} of your bonus health) and ${pct(PRIDES_ROAR.speed)} speed for ${PRIDES_ROAR.speedFor}s.`,
      cost: FREE,
      cooldown: PRIDES_ROAR.cooldown,
      castTime: 0,
      targeting: { kind: 'cone', range: PRIDES_ROAR.range, angle: PRIDES_ROAR.angle },
    },
  ],
};

export class Logan extends Champion {
  readonly info = LOGAN_INFO;
  private lionheartReadyAt = 0;
  /** Each nearby ally's health share last tick, to catch the moment they drop below the line. */
  private readonly allyHealth = new Map<number, number>();
  private pounce = { until: 0, bonus: 0 };
  private mane: { amount: number; until: number } | null = null;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'Logan Lionheart');
  }

  /** Health from items: what Thick Mane and Pride's Roar scale with. */
  get bonusHealth(): number {
    return Math.max(0, this.stats.maxHp - (BASE_STATS.maxHp + GROWTH.maxHp * (this.level - 1)));
  }

  // ─── Passive: Lionheart ───────────────────────────────────────────────────

  protected think(world: World): void {
    const l = LIONHEART;
    for (const u of world.units()) {
      if (u === this || u.team !== this.team || u.kind !== 'champion' || u.dead) continue;
      const share = u.hp / u.stats.maxHp;
      const before = this.allyHealth.get(u.id) ?? 1;
      this.allyHealth.set(u.id, share);
      // Uneasy Alliance: he'll go to King Rix's aid, but only when things get really bad.
      const line = u instanceof Champion && (u.info.id as string) === 'kingrix' ? l.rixThreshold : l.threshold;
      if (before >= line && share < line && world.time >= this.lionheartReadyAt && dist(u.pos, this.pos) <= l.range) {
        this.lionheartReadyAt = world.time + l.cooldown;
        this.addShield(world, l.shield(this.level), l.shieldFor);
        this.addStatus(world, 'speed', l.speedFor, l.speed);
        world.emit({ e: 'fx', fx: 'lionheart', x: Math.round(this.pos.x), y: Math.round(this.pos.y), x2: Math.round(u.pos.x), y2: Math.round(u.pos.y), team: this.team });
      }
    }
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  /** Pounce's target: the visible enemy nearest the spot he aimed at. */
  pounceTarget(world: World, aim: Vec2): Unit | undefined {
    return world
      .units()
      .filter((u) => u.team !== this.team && u.kind !== 'structure' && u.isTargetable() && world.vision.canSee(this.team, u) && dist(u.pos, aim) <= POUNCE.grabRadius + u.radius)
      .sort((a, b) => dist(a.pos, aim) - dist(b.pos, aim))[0];
  }

  protected canCastAt(world: World, slot: Slot, aim: Vec2): boolean {
    return slot !== 0 || this.pounceTarget(world, aim) !== undefined;
  }

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.leap(world, aim);
      case 1: return this.thickMane(world);
      case 2: return this.maul(world, aim);
      case 3: return this.roar(world, aim);
    }
  }

  private leap(world: World, aim: Vec2): void {
    const target = this.pounceTarget(world, aim);
    if (!target) return;
    const p = POUNCE;
    const gap = this.radius + target.radius + 5;
    const to = world.grid.nearestWalkable(sub(target.pos, scale(dirTo(this.pos, target.pos), gap))) ?? target.pos;
    this.startDash(world, to, Math.max(0.15, dist(this.pos, to) / p.speed));
    this.pounce = { until: world.time + p.empowerWindow, bonus: this.byRank(0, p.bonus) };
    this.attackReadyAt = Math.min(this.attackReadyAt, world.time);
    this.commandAttack(target);
    world.emit({ e: 'fx', fx: 'roll', x: this.pos.x, y: this.pos.y, x2: to.x, y2: to.y });
  }

  private thickMane(world: World): void {
    const m = THICK_MANE;
    this.mane = this.addShield(world, this.byRank(1, m.shield) + m.bonusHpRatio * this.bonusHealth, m.duration);
    world.emit({ e: 'fx', fx: 'mane', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: this.radius * 1.6, team: this.team });
  }

  private get maneUp(): boolean {
    return this.mane !== null && this.mane.amount > 0 && this.shields.includes(this.mane);
  }

  private maul(world: World, aim: Vec2): void {
    const m = MAUL;
    const dir = dirTo(this.pos, aim);
    const damage = this.byRank(2, m.damage) + m.adRatio * this.stats.ad;
    const bleedTick = this.byRank(2, m.bleed) / m.bleedFor;
    for (const u of enemiesInCone(world, this.team, this.pos, dir, m.range, (m.angle / 2) * DEG)) {
      world.damage(this, u, damage, 'physical');
      if (u.dead) continue;
      u.addStatus(world, 'bleed', m.bleedFor);
      for (let s = 1; s <= m.bleedFor; s++) {
        world.schedule(s, () => {
          if (!u.dead && u.has('bleed')) world.damage(this, u, bleedTick, 'physical');
        });
      }
    }
    const tip = add(this.pos, scale(dir, m.range));
    world.emit({ e: 'fx', fx: 'cleave', x: this.pos.x, y: this.pos.y, x2: tip.x, y2: tip.y, r: m.angle, team: this.team });
  }

  private roar(world: World, aim: Vec2): void {
    const r = PRIDES_ROAR;
    const dir = dirTo(this.pos, aim);
    for (const u of enemiesInCone(world, this.team, this.pos, dir, r.range, (r.angle / 2) * DEG)) {
      // The Royal Menagerie: Rix's guards remember the lion from the palace.
      u.fear(world, this.pos, r.fear * (u.fearsLions ? r.menagerieMult : 1));
    }
    const shield = this.byRank(3, r.shield) + r.bonusHpRatio * this.bonusHealth;
    for (const u of world.units()) {
      if (u.team !== this.team || u.kind !== 'champion' || u.dead || dist(u.pos, this.pos) > r.allyRadius) continue;
      u.addShield(world, shield, r.shieldFor);
      u.addStatus(world, 'speed', r.speedFor, r.speed);
    }
    const tip = add(this.pos, scale(dir, r.range));
    world.emit({ e: 'fx', fx: 'roar', x: this.pos.x, y: this.pos.y, x2: tip.x, y2: tip.y, r: r.angle, team: this.team });
  }

  /** A Lion Kneels to No One: hit by King Rix's KNEEL!, he roars right back, scaring the king off for a moment. */
  roarBack(world: World, king: Unit): void {
    king.fear(world, this.pos, 0.6);
    world.emit({ e: 'fx', fx: 'roar', x: this.pos.x, y: this.pos.y, x2: king.pos.x, y2: king.pos.y, r: 60, team: this.team });
  }

  // ─── Basic attacks ────────────────────────────────────────────────────────

  protected launchAttack(world: World, target: Unit): void {
    const pounced = world.time < this.pounce.until;
    this.pounce.until = 0;
    const damage = this.stats.ad + (pounced ? this.pounce.bonus + POUNCE.adRatio * this.stats.ad : 0);
    world.damage(this, target, damage, 'physical', { basic: true });
    if (target.dead) return;
    if (pounced) target.addStatus(world, 'stun', POUNCE.stun);
    if (this.maneUp) target.addStatus(world, 'slow', THICK_MANE.slowFor, THICK_MANE.slow);
  }

  meSnapshot(world: World): MeSnap {
    return { ...super.meSnapshot(world), empowered: world.time < this.pounce.until || this.maneUp };
  }
}
