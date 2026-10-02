import type { PlayerTeam, Slot, Team } from '../constants';
import { add, dirTo, dist, scale, type Vec2 } from '../math';
import type { EntitySnap, MeSnap } from '../protocol';
import type { Entity } from '../sim/entity';
import { HomingProjectile } from '../sim/projectile';
import { enemiesInRadius } from '../sim/query';
import { Unit, type Stats } from '../sim/unit';
import type { World } from '../sim/world';
import { Champion } from './champion';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Every number for this champion lives here. Arrays are per rank (rank 1 first).

const BASE_STATS: Stats = {
  maxHp: 630, hpRegen: 4, maxMana: 300, manaRegen: 6.5,
  ad: 63, ap: 0, armor: 30, mr: 32,
  attackSpeed: 0.69, attackRange: 125, moveSpeed: 345,
};
const GROWTH: StatGrowth = { maxHp: 99, hpRegen: 0.8, maxMana: 40, manaRegen: 0.5, ad: 3, armor: 4.2, mr: 1.3, attackSpeedPct: 0.03 };
const RADIUS = 34;

/** Hitting someone from behind: the punchline lands harder. */
export const PUNCHLINE = { bonus: (level: number) => 20 + 2 * level, bonusAdRatio: 0.25, behind: -0.25 };
export const NOW_YOU_SEE_ME = {
  cost: [60, 55, 50, 45], cooldown: [10, 9.5, 9, 8.5], blink: 400, stealth: [2.5, 2.75, 3, 3.25],
  empowerWindow: 3.5, bonus: [25, 35, 45, 55], bonusAdRatio: 0.5,
};
export const SURPRISE_BOX = {
  cost: [50, 55, 60, 65], cooldown: [14, 13, 12, 11], range: 425, radius: 28, armTime: 1, lifetime: 40, maxActive: 2,
  trigger: 300, fear: [0.5, 0.75, 1, 1.25], fearRadius: 300, shootFor: 5, shootEvery: 0.8, shootRange: 500,
  damage: [20, 30, 40, 50], apRatio: 0.15,
};
export const JUGGLING_KNIVES = {
  cost: [50, 55, 60, 65], cooldown: [8, 7.5, 7, 6.5], range: 625, grab: 200, speed: 1500,
  damage: [70, 95, 120, 145], bonusAdRatio: 0.75, apRatio: 0.6, lowHealth: 0.3, lowHealthBonus: 0.5, slow: 0.3, slowFor: 1.5,
  passiveSlow: [0.1, 0.15, 0.2, 0.25], passiveSlowFor: 2,
};
export const DOUBLE_ACT = {
  cost: [100, 100, 100], cooldown: [100, 90, 80], vanish: 0.25, duration: 18, damageShare: 0.5, takes: 1.5,
  explosion: [150, 225, 300], apRatio: 0.7, radius: 250, leash: 900,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const DALTONOMO_INFO: ChampionInfo = {
  id: 'daltonomo',
  name: 'Daltonomo',
  title: 'The Jester of the Deep',
  resource: 'mana',
  passive: {
    name: 'Punchline',
    icon: '🃏',
    description: `Basic attacks from behind deal ${PUNCHLINE.bonus(1)}–${PUNCHLINE.bonus(13)} (by level, +${pct(PUNCHLINE.bonusAdRatio)} bonus AD) bonus physical damage.`,
  },
  abilities: [
    {
      name: 'Now You See Me',
      icon: '🎩',
      description: `Vanish in a puff of confetti and reappear up to ${NOW_YOU_SEE_ME.blink} away, invisible for ${perRank(NOW_YOU_SEE_ME.stealth)}s. Attacking or casting reveals him. The next basic attack within ${NOW_YOU_SEE_ME.empowerWindow}s always counts as from behind and deals ${perRank(NOW_YOU_SEE_ME.bonus)} (+${pct(NOW_YOU_SEE_ME.bonusAdRatio)} bonus AD) more.`,
      cost: NOW_YOU_SEE_ME.cost,
      cooldown: NOW_YOU_SEE_ME.cooldown,
      castTime: 0,
      targeting: { kind: 'point', range: NOW_YOU_SEE_ME.blink, radius: RADIUS },
    },
    {
      name: 'Surprise Box',
      icon: '🎁',
      description: `Place a box (up to ${SURPRISE_BOX.maxActive}) that hides after ${SURPRISE_BOX.armTime}s and waits ${SURPRISE_BOX.lifetime}s. When an enemy comes near it springs open: everything within ${SURPRISE_BOX.fearRadius} runs in fear for ${perRank(SURPRISE_BOX.fear)}s, then it shoots the nearest enemy every ${SURPRISE_BOX.shootEvery}s for ${perRank(SURPRISE_BOX.damage)} (+${pct(SURPRISE_BOX.apRatio)} AP) magic damage, for ${SURPRISE_BOX.shootFor}s.`,
      cost: SURPRISE_BOX.cost,
      cooldown: SURPRISE_BOX.cooldown,
      castTime: 0,
      targeting: { kind: 'point', range: SURPRISE_BOX.range, radius: SURPRISE_BOX.trigger },
    },
    {
      name: 'Juggling Knives',
      icon: '🤹',
      description: `His basic attacks slow by ${perRank(JUGGLING_KNIVES.passiveSlow, pct)} for ${JUGGLING_KNIVES.passiveSlowFor}s. Cast: throw a knife at an enemy for ${perRank(JUGGLING_KNIVES.damage)} (+${pct(JUGGLING_KNIVES.bonusAdRatio)} bonus AD, +${pct(JUGGLING_KNIVES.apRatio)} AP) physical damage, ${pct(JUGGLING_KNIVES.lowHealthBonus)} more below ${pct(JUGGLING_KNIVES.lowHealth)} health, slowing by ${pct(JUGGLING_KNIVES.slow)}.`,
      cost: JUGGLING_KNIVES.cost,
      cooldown: JUGGLING_KNIVES.cooldown,
      castTime: 0,
      targeting: { kind: 'point', range: JUGGLING_KNIVES.range, radius: JUGGLING_KNIVES.grab },
    },
    {
      name: 'Double Act',
      icon: '🎭',
      description: `Vanish for a blink, then there are two of him. The double fights alongside him for ${DOUBLE_ACT.duration}s, dealing ${pct(DOUBLE_ACT.damageShare)} of his damage and taking ${pct(DOUBLE_ACT.takes - 1)} more. When it dies or the act ends, it explodes for ${perRank(DOUBLE_ACT.explosion)} (+${pct(DOUBLE_ACT.apRatio)} AP) magic damage around it.`,
      cost: DOUBLE_ACT.cost,
      cooldown: DOUBLE_ACT.cooldown,
      castTime: 0,
      targeting: { kind: 'self', radius: DOUBLE_ACT.radius },
    },
  ],
};

export class Daltonomo extends Champion {
  readonly info = DALTONOMO_INFO;
  private vanishedUntil = -Infinity;
  private empoweredUntil = -Infinity;
  private boxes: SurpriseBox[] = [];
  /** The Double Act's double, while there is one. */
  double: Double | null = null;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'Daltonomo');
  }

  get bonusAd(): number {
    return Math.max(0, this.stats.ad - (BASE_STATS.ad + GROWTH.ad * (this.level - 1)));
  }

  /** Whether `attacker` is standing behind `target` (on the side it's facing away from). */
  static behind(attacker: Vec2, target: Unit): boolean {
    const d = dirTo(target.pos, attacker);
    return Math.cos(target.facing) * d.x + Math.sin(target.facing) * d.y < PUNCHLINE.behind;
  }

  // ─── Basic attacks: Punchline, the empowered hit, the slow ────────────────

  protected launchAttack(world: World, target: Unit): void {
    const empowered = world.time < this.empoweredUntil;
    this.empoweredUntil = -Infinity;
    this.reveal();
    let damage = this.stats.ad;
    if (empowered || Daltonomo.behind(this.pos, target)) {
      damage += PUNCHLINE.bonus(this.level) + PUNCHLINE.bonusAdRatio * this.bonusAd;
      world.emit({ e: 'fx', fx: 'backstab', x: Math.round(target.pos.x), y: Math.round(target.pos.y), team: this.team });
    }
    if (empowered) damage += this.byRank(0, NOW_YOU_SEE_ME.bonus) + NOW_YOU_SEE_ME.bonusAdRatio * this.bonusAd;
    world.damage(this, target, damage, 'physical', { basic: true });
    if (!target.dead && this.abilities[2].rank > 0) target.addStatus(world, 'slow', JUGGLING_KNIVES.passiveSlowFor, this.byRank(2, JUGGLING_KNIVES.passiveSlow));
  }

  private reveal(): void {
    if (this.vanishedUntil === -Infinity) return;
    this.vanishedUntil = -Infinity;
    this.clearStatus('vanished');
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  /** Juggling Knives' target: the visible enemy nearest where he aimed. */
  /** The enemy near `aim` the knives go for (`anyRange`: however far away they are). */
  knifeTarget(world: World, aim: Vec2, anyRange = false): Unit | undefined {
    const j = JUGGLING_KNIVES;
    return world
      .units()
      .filter((u) => u.team !== this.team && u.kind !== 'structure' && u.isTargetable() && world.vision.canSee(this.team, u) && dist(u.pos, aim) <= j.grab + u.radius && (anyRange || dist(u.pos, this.pos) <= j.range + j.grab))
      .sort((a, b) => dist(a.pos, aim) - dist(b.pos, aim))[0];
  }

  protected canCastAt(world: World, slot: Slot, aim: Vec2): boolean {
    return slot !== 2 || this.knifeTarget(world, aim) !== undefined;
  }

  protected approachTarget(world: World, slot: Slot, cursor: Vec2): Unit | undefined {
    return slot === 2 ? this.knifeTarget(world, cursor, true) : undefined;
  }

  protected onCastStart(_world: World, slot: Slot): void {
    if (slot !== 0) this.reveal();
  }

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.nowYouSeeMe(world, aim);
      case 1: return this.surpriseBox(world, aim);
      case 2: return this.jugglingKnives(world, aim);
      case 3: return this.doubleAct(world);
    }
  }

  private nowYouSeeMe(world: World, aim: Vec2): void {
    const n = NOW_YOU_SEE_ME;
    const from = { ...this.pos };
    const to = world.grid.clampLine(from, add(from, scale(dirTo(from, aim), Math.min(n.blink, dist(from, aim)))));
    this.cancelWindup();
    this.pos = to;
    this.path = [];
    const stealth = this.byRank(0, n.stealth);
    this.vanishedUntil = world.time + stealth;
    this.addStatus(world, 'vanished', stealth);
    this.empoweredUntil = world.time + n.empowerWindow;
    world.emit({ e: 'fx', fx: 'nowYouSeeMe', x: Math.round(from.x), y: Math.round(from.y), team: this.team });
  }

  private surpriseBox(world: World, aim: Vec2): void {
    const s = SURPRISE_BOX;
    const spot = world.grid.nearestWalkable(aim) ?? { ...this.pos };
    this.boxes = this.boxes.filter((b) => !b.removed);
    const damage = this.byRank(1, s.damage) + s.apRatio * this.stats.ap;
    this.boxes.push(world.add(new SurpriseBox(world, this, spot, this.byRank(1, s.fear), damage)));
    while (this.boxes.length > s.maxActive) this.boxes.shift()!.removed = true;
  }

  private jugglingKnives(world: World, aim: Vec2): void {
    const j = JUGGLING_KNIVES;
    const target = this.knifeTarget(world, aim);
    if (!target) return;
    const base = this.byRank(2, j.damage) + j.bonusAdRatio * this.bonusAd + j.apRatio * this.stats.ap;
    world.add(
      new HomingProjectile(world, this, target, j.speed, 'knife', (w, t) => {
        const low = t.hp / t.stats.maxHp < j.lowHealth;
        w.damage(this, t, base * (low ? 1 + j.lowHealthBonus : 1), 'physical');
        if (!t.dead) t.addStatus(w, 'slow', j.slowFor, j.slow);
      }),
    );
  }

  private doubleAct(world: World): void {
    const d = DOUBLE_ACT;
    if (this.double && !this.double.dead) this.double.finale(world);
    this.addStatus(world, 'untargetable', d.vanish);
    const side = { x: -Math.sin(this.facing), y: Math.cos(this.facing) };
    const spot = world.grid.nearestWalkable(add(this.pos, scale(side, 70))) ?? { ...this.pos };
    this.double = world.add(new Double(world, this, spot));
    world.emit({ e: 'fx', fx: 'doubleAct', x: Math.round(this.pos.x), y: Math.round(this.pos.y), x2: Math.round(spot.x), y2: Math.round(spot.y), team: this.team });
  }

  /** What the double's finale deals, at Double Act's current rank. */
  explosionDamage(): number {
    return this.byRank(3, DOUBLE_ACT.explosion) + DOUBLE_ACT.apRatio * this.stats.ap;
  }

  protected respawn(): void {
    super.respawn();
    this.vanishedUntil = this.empoweredUntil = -Infinity;
  }

  meSnapshot(world: World): MeSnap {
    return { ...super.meSnapshot(world), empowered: world.time < this.empoweredUntil };
  }
}

/** The Surprise Box: hidden from the enemy until it springs, then it scares everyone off and opens fire. */
export class SurpriseBox implements Entity {
  readonly kind = 'trap';
  readonly id: number;
  team: Team;
  pos: Vec2;
  radius = SURPRISE_BOX.radius;
  removed = false;
  /** Sprung: the enemy can see it now. */
  revealed = false;
  private readonly armedAt: number;
  private readonly expiresAt: number;
  private firingUntil = Infinity;
  private nextShot = 0;

  constructor(
    world: World,
    private readonly owner: Daltonomo,
    pos: Vec2,
    private readonly fear: number,
    private readonly damage: number,
  ) {
    this.id = world.newId();
    this.team = owner.team;
    this.pos = pos;
    this.armedAt = world.time + SURPRISE_BOX.armTime;
    this.expiresAt = world.time + SURPRISE_BOX.lifetime;
  }

  update(world: World): void {
    const s = SURPRISE_BOX;
    if (world.time >= this.expiresAt || world.time >= this.firingUntil) {
      this.removed = true;
      return;
    }
    if (world.time < this.armedAt) return;
    if (!this.revealed) {
      if (!enemiesInRadius(world, this.team, this.pos, s.trigger).length) return;
      this.revealed = true;
      this.firingUntil = world.time + s.shootFor;
      this.nextShot = world.time + 0.3;
      for (const u of enemiesInRadius(world, this.team, this.pos, s.fearRadius)) u.fear(world, this.pos, this.fear);
      world.emit({ e: 'fx', fx: 'jackbox', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: s.fearRadius, team: this.team });
      return;
    }
    if (world.time + 1e-9 < this.nextShot) return;
    this.nextShot += s.shootEvery;
    // Champions first, then whatever's nearest.
    const target = enemiesInRadius(world, this.team, this.pos, s.shootRange)
      .filter((u) => world.vision.canSee(this.team, u))
      .sort((a, b) => (a.kind === 'champion' ? 0 : 1) - (b.kind === 'champion' ? 0 : 1) || dist(a.pos, this.pos) - dist(b.pos, this.pos))[0];
    if (!target) return;
    world.damage(this.owner, target, this.damage, 'magic');
    world.emit({ e: 'fx', fx: 'boxShot', x: Math.round(this.pos.x), y: Math.round(this.pos.y), x2: Math.round(target.pos.x), y2: Math.round(target.pos.y), team: this.team });
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
      vis: this.revealed ? 'jackboxOpen' : 'jackbox',
    };
  }
}

/** Double Act's double: looks exactly like him to everyone, fights beside him, and goes out with a bang. */
export class Double extends Unit {
  readonly kind = 'guard';
  private readonly expiresAt: number;
  private exploded = false;

  get creditTo(): Unit {
    return this.owner;
  }

  constructor(
    world: World,
    readonly owner: Daltonomo,
    pos: Vec2,
  ) {
    const s = owner.stats;
    super(world.newId(), owner.team, pos, owner.radius, { ...s, ad: s.ad * DOUBLE_ACT.damageShare, hpRegen: 0, manaRegen: 0 }, owner.name);
    this.hp = Math.max(1, owner.hp);
    this.facing = owner.facing;
    this.expiresAt = world.time + DOUBLE_ACT.duration;
  }

  incomingDamageScale(): number {
    return DOUBLE_ACT.takes;
  }

  protected think(world: World): void {
    if (world.time >= this.expiresAt || this.owner.dead) return this.finale(world);
    const o = this.owner;
    // Whatever he's hitting, or the nearest enemy champion close by, or back to his side.
    const order = o.order;
    const target =
      (order.kind === 'attack' ? world.getUnit(order.targetId) : undefined) ??
      enemiesInRadius(world, this.team, this.pos, 600).find((u) => u.kind === 'champion' && world.vision.canSee(this.team, u));
    if (target && target.team !== this.team && target.isTargetable() && world.vision.canSee(this.team, target) && dist(target.pos, o.pos) < DOUBLE_ACT.leash) {
      this.commandAttack(target);
      return;
    }
    if (dist(this.pos, o.pos) > 250) {
      if (this.order.kind !== 'move' || dist((this.order as { dest: Vec2 }).dest, o.pos) > 120) this.commandMove(world, { ...o.pos });
    } else if (this.order.kind === 'attack') this.commandStop();
  }

  protected launchAttack(world: World, target: Unit): void {
    world.damage(this, target, this.stats.ad, 'physical');
  }

  /** The act's over: the double bursts in a shower of confetti and knives. */
  finale(world: World): void {
    if (this.exploded) return;
    this.exploded = true;
    const d = DOUBLE_ACT;
    const damage = this.owner.explosionDamage();
    for (const u of enemiesInRadius(world, this.team, this.pos, d.radius)) world.damage(this.owner, u, damage, 'magic');
    world.emit({ e: 'fx', fx: 'cloneBoom', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: d.radius, team: this.team });
    if (!this.dead) this.die(world, null);
  }

  die(world: World, killer: Unit | null): void {
    if (!this.exploded) return this.finale(world);
    super.die(world, killer);
    world.schedule(0.3, () => (this.removed = true));
  }

  protected respawnDelay(): number {
    return Infinity;
  }

  /** To everyone watching, it's him: same champion, look, level, name, health and mana. */
  snapshot(world: World): EntitySnap {
    const o = this.owner;
    return {
      ...super.snapshot(world),
      k: 'champion',
      champ: 'daltonomo',
      ...(o.skin ? { skin: o.skin } : {}),
      lv: o.level,
      mp: Math.floor(o.mana),
      mmp: Math.round(o.stats.maxMana),
    };
  }
}
