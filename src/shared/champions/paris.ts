import { DT, type PlayerTeam, type Slot } from '../constants';
import { add, dirTo, dist, scale, type Vec2 } from '../math';
import type { EntitySnap, MeSnap } from '../protocol';
import { enemiesInRadius } from '../sim/query';
import type { Stats, Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { Champion } from './champion';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Every number for this champion lives here. Arrays are per rank (rank 1 first).

const BASE_STATS: Stats = {
  maxHp: 640, hpRegen: 4, maxMana: 300, manaRegen: 6.5,
  ad: 64, ap: 0, armor: 30, mr: 32,
  attackSpeed: 0.68, attackRange: 140, moveSpeed: 350,
};
const GROWTH: StatGrowth = { maxHp: 95, hpRegen: 0.7, maxMana: 38, manaRegen: 0.5, ad: 3.4, armor: 4, mr: 1.3, attackSpeedPct: 0.03 };
const RADIUS = 34;

/** Every few hits in a row, he strikes twice. */
export const RIPOSTE = { every: 4, secondHit: 0.5, delay: 0.12 };
export const FLECHE = {
  cost: [50, 55, 60, 65], cooldown: [18, 17, 16, 15], range: 600, grab: 200, bounce: 400,
  hits: [3, 3, 4, 4], damage: [30, 60, 90, 120], adRatio: 0.9, step: 0.15, attackRefund: 1,
};
export const CAFE_BREAK = {
  cost: [50, 50, 50, 50], cooldown: [28, 26, 24, 22], duration: 3, healPerSecond: [30, 50, 70, 90], apRatio: 0.3, reduction: [0.5, 0.55, 0.6, 0.65],
};
export const TOUCHE = { cost: [40, 40, 40, 40], cooldown: [14, 13, 12, 11], duration: 5, trueDamage: [20, 30, 40, 50], bonusAdRatio: 0.3 };
export const ENCORE = {
  cost: [100, 100, 100], cooldown: [85, 75, 65], duration: 7, attackSpeed: [0.3, 0.45, 0.6], moveSpeed: [0.25, 0.35, 0.45],
  takedownExtend: 4, cooldownCut: 0.7,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const PARIS_INFO: ChampionInfo = {
  id: 'paris',
  name: 'Master Paris',
  title: 'The Blade of the Boulevard',
  resource: 'mana',
  passive: {
    name: 'Riposte',
    icon: '🤺',
    description: `Every ${RIPOSTE.every}th basic attack in a row strikes twice, the second hit for ${pct(RIPOSTE.secondHit)} damage.`,
  },
  abilities: [
    {
      name: 'Flèche',
      icon: '💫',
      description: `Lunge at an enemy and flash between up to ${perRank(FLECHE.hits)} enemies near it, striking each for ${perRank(FLECHE.damage)} (+${pct(FLECHE.adRatio)} AD) physical damage. He can't be hit while he does it. Each basic attack takes ${FLECHE.attackRefund}s off the cooldown.`,
      cost: FLECHE.cost,
      cooldown: FLECHE.cooldown,
      castTime: 0,
      targeting: { kind: 'point', range: FLECHE.range, radius: FLECHE.grab },
    },
    {
      name: 'Café Break',
      icon: '☕',
      description: `Stop for coffee for up to ${CAFE_BREAK.duration}s: heal ${perRank(CAFE_BREAK.healPerSecond)} (+${pct(CAFE_BREAK.apRatio)} AP) per second and take ${perRank(CAFE_BREAK.reduction, pct)} less damage. Any other order ends it.`,
      cost: CAFE_BREAK.cost,
      cooldown: CAFE_BREAK.cooldown,
      castTime: 0,
      targeting: { kind: 'self' },
    },
    {
      name: 'Touché',
      icon: '✨',
      description: `For ${TOUCHE.duration}s his basic attacks deal ${perRank(TOUCHE.trueDamage)} (+${pct(TOUCHE.bonusAdRatio)} bonus AD) bonus true damage.`,
      cost: TOUCHE.cost,
      cooldown: TOUCHE.cooldown,
      castTime: 0,
      targeting: { kind: 'self' },
    },
    {
      name: 'Encore',
      icon: '🌹',
      description: `For ${ENCORE.duration}s: ${perRank(ENCORE.attackSpeed, pct)} attack speed, ${perRank(ENCORE.moveSpeed, pct)} move speed, and no slow can touch him. Each champion takedown adds ${ENCORE.takedownExtend}s and cuts his other cooldowns by ${pct(ENCORE.cooldownCut)}.`,
      cost: ENCORE.cost,
      cooldown: ENCORE.cooldown,
      castTime: 0,
      targeting: { kind: 'self' },
    },
  ],
};

export class Paris extends Champion {
  readonly info = PARIS_INFO;
  /** Basic attacks in a row, toward Riposte. */
  private streakHits = 0;
  private cafeUntil = -Infinity;
  private healBank = 0;
  private toucheUntil = -Infinity;
  private encoreUntil = -Infinity;
  /** Set each tick while Encore is on. */
  private slowProof = false;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'Master Paris');
  }

  get bonusAd(): number {
    return Math.max(0, this.stats.ad - (BASE_STATS.ad + GROWTH.ad * (this.level - 1)));
  }

  onBreak(world: World): boolean {
    return world.time < this.cafeUntil;
  }

  encoreOn(world: World): boolean {
    return world.time < this.encoreUntil;
  }

  update(world: World): void {
    super.update(world);
    if (!this.onBreak(world)) return;
    if (this.dead || this.has('stun')) return this.endBreak();
    // Coffee: health trickles back, shown every half second.
    this.healBank += (this.byRank(1, CAFE_BREAK.healPerSecond) + CAFE_BREAK.apRatio * this.stats.ap) * DT;
    if (this.healBank >= 10 || world.time + DT >= this.cafeUntil) {
      this.heal(world, this.healBank);
      this.healBank = 0;
    }
  }

  incomingDamageScale(world: World): number {
    return this.onBreak(world) ? 1 - this.byRank(1, CAFE_BREAK.reduction) : 1;
  }

  // Any new order ends the coffee break.
  commandMove(world: World, dest: Vec2): void {
    this.endBreak();
    super.commandMove(world, dest);
  }

  commandAttack(target: Unit): void {
    this.endBreak();
    super.commandAttack(target);
  }

  startRecall(world: World): void {
    this.endBreak();
    super.startRecall(world);
  }

  tryCast(world: World, slot: Slot, aim: Vec2, press = false): boolean {
    if (slot !== 1) this.endBreak();
    return super.tryCast(world, slot, aim, press);
  }

  private endBreak(): void {
    if (this.cafeUntil === -Infinity) return;
    this.cafeUntil = -Infinity;
    this.healBank = 0;
    this.clearStatus('meditating');
  }

  // ─── Passive: Riposte, and Touché ─────────────────────────────────────────

  protected launchAttack(world: World, target: Unit): void {
    const hit = () => {
      world.damage(this, target, this.stats.ad, 'physical', { basic: true });
      if (world.time < this.toucheUntil && !target.dead) world.damage(this, target, this.byRank(2, TOUCHE.trueDamage) + TOUCHE.bonusAdRatio * this.bonusAd, 'true');
    };
    hit();
    this.streakHits++;
    if (this.streakHits >= RIPOSTE.every) {
      this.streakHits = 0;
      world.schedule(RIPOSTE.delay, () => {
        if (!this.dead && !target.dead && target.isTargetable()) world.damage(this, target, this.stats.ad * RIPOSTE.secondHit, 'physical', { basic: true });
      });
    }
    // Each hit sharpens the next Flèche.
    const q = this.abilities[0];
    q.readyAt = Math.max(world.time, q.readyAt - FLECHE.attackRefund);
  }

  protected computeStats(world: World): Stats {
    const s = super.computeStats(world);
    this.slowProof = this.encoreOn(world);
    if (this.slowProof) {
      s.attackSpeed *= 1 + this.byRank(3, ENCORE.attackSpeed);
      s.moveSpeed *= 1 + this.byRank(3, ENCORE.moveSpeed);
    }
    return s;
  }

  /** In his Encore, slows slide off him. */
  get moveSpeed(): number {
    return this.slowProof ? this.stats.moveSpeed * (1 + this.strongest('speed')) : super.moveSpeed;
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  /** Flèche's first target: the visible enemy nearest where he aimed. */
  /** The enemy near `aim` Flèche goes for (`anyRange`: however far away they are). */
  flecheTarget(world: World, aim: Vec2, anyRange = false): Unit | undefined {
    return world
      .units()
      .filter((u) => u.team !== this.team && u.kind !== 'structure' && u.isTargetable() && world.vision.canSee(this.team, u) && dist(u.pos, aim) <= FLECHE.grab + u.radius && (anyRange || dist(u.pos, this.pos) <= FLECHE.range + FLECHE.grab))
      .sort((a, b) => dist(a.pos, aim) - dist(b.pos, aim))[0];
  }

  protected canCastAt(world: World, slot: Slot, aim: Vec2): boolean {
    return slot !== 0 || this.flecheTarget(world, aim) !== undefined;
  }

  protected approachTarget(world: World, slot: Slot, cursor: Vec2): Unit | undefined {
    return slot === 0 ? this.flecheTarget(world, cursor, true) : undefined;
  }

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.fleche(world, aim);
      case 1: return this.cafeBreak(world);
      case 2: return this.touche(world);
      case 3: return this.encore(world);
    }
  }

  private fleche(world: World, aim: Vec2): void {
    const f = FLECHE;
    const first = this.flecheTarget(world, aim);
    if (!first) return;
    const struck = new Set<number>();
    const hits = this.byRank(0, f.hits);
    const damage = this.byRank(0, f.damage) + f.adRatio * this.stats.ad;
    this.commandStop();
    this.addStatus(world, 'untargetable', f.step * hits + 0.05);
    this.lockedUntil = world.time + f.step * hits;
    let current: Unit | undefined = first;
    let last: Unit = first;
    // When it's over he squares up to the last one he struck.
    world.schedule(f.step * hits, () => {
      if (!this.dead && !last.dead && last.isTargetable()) this.commandAttack(last);
    });
    for (let i = 0; i < hits; i++) {
      world.schedule(f.step * i, () => {
        if (this.dead || !current || current.dead || !current.isTargetable()) return;
        const target = current;
        struck.add(target.id);
        const from = { ...this.pos };
        // Flash to the far side of them, blade first.
        const landing = world.grid.nearestWalkable(add(target.pos, scale(dirTo(from, target.pos), this.radius + target.radius + 10))) ?? target.pos;
        this.pos = landing;
        this.facing = Math.atan2(target.pos.y - landing.y, target.pos.x - landing.x);
        world.damage(this, target, damage, 'physical');
        last = target;
        world.emit({ e: 'fx', fx: 'fleche', x: Math.round(from.x), y: Math.round(from.y), x2: Math.round(landing.x), y2: Math.round(landing.y), team: this.team });
        // The next one: whoever's nearest that he hasn't touched yet.
        current = enemiesInRadius(world, this.team, target.pos, f.bounce)
          .filter((u) => !struck.has(u.id) && world.vision.canSee(this.team, u))
          .sort((a, b) => dist(a.pos, target.pos) - dist(b.pos, target.pos))[0];
      });
    }
  }

  private cafeBreak(world: World): void {
    this.commandStop();
    this.cafeUntil = world.time + CAFE_BREAK.duration;
    this.healBank = 0;
    this.addStatus(world, 'meditating', CAFE_BREAK.duration);
    world.emit({ e: 'fx', fx: 'cafeBreak', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: this.radius * 2, team: this.team });
  }

  private touche(world: World): void {
    this.toucheUntil = world.time + TOUCHE.duration;
    this.addStatus(world, 'touche', TOUCHE.duration);
    world.emit({ e: 'fx', fx: 'touche', x: Math.round(this.pos.x), y: Math.round(this.pos.y), team: this.team });
  }

  private encore(world: World): void {
    this.encoreUntil = world.time + ENCORE.duration;
    this.clearStatus('slow');
    world.emit({ e: 'fx', fx: 'encore', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: this.radius * 3, team: this.team });
  }

  onTakedown(world: World, victim: Unit): void {
    if (!this.encoreOn(world) || victim.kind !== 'champion') return;
    this.encoreUntil += ENCORE.takedownExtend;
    for (const slot of [0, 1, 2] as const) {
      const a = this.abilities[slot];
      if (a.readyAt > world.time) a.readyAt = world.time + (a.readyAt - world.time) * (1 - ENCORE.cooldownCut);
    }
  }

  protected respawn(): void {
    super.respawn();
    this.streakHits = 0;
    this.cafeUntil = this.toucheUntil = this.encoreUntil = -Infinity;
  }

  snapshot(world: World): EntitySnap {
    const s = super.snapshot(world);
    if (this.encoreOn(world)) s.st = [...(s.st ?? []), 'encore'];
    return s;
  }

  meSnapshot(world: World): MeSnap {
    return { ...super.meSnapshot(world), passiveStacks: this.streakHits, empowered: this.streakHits === RIPOSTE.every - 1 };
  }
}
