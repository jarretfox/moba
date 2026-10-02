import type { PlayerTeam, Slot } from '../constants';
import { add, dirTo, dist, scale, type Vec2 } from '../math';
import { HomingProjectile } from '../sim/projectile';
import { enemiesInRadius } from '../sim/query';
import { Unit, type Stats } from '../sim/unit';
import type { World } from '../sim/world';
import { Zone } from '../sim/zone';
import { Champion } from './champion';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Every number for this champion lives here. Arrays are per rank (rank 1 first).

const BASE_STATS: Stats = {
  maxHp: 560, hpRegen: 3, maxMana: 400, manaRegen: 8,
  ad: 50, ap: 0, armor: 22, mr: 30,
  attackSpeed: 0.625, attackRange: 525, moveSpeed: 330,
};
const GROWTH: StatGrowth = { maxHp: 85, hpRegen: 0.5, maxMana: 45, manaRegen: 0.6, ad: 2.8, armor: 3.6, mr: 1, attackSpeedPct: 0.02 };
const RADIUS = 34;
const SPORE_SPEED = 1500;

/** Her spells stack Rot; it eats away every half second, and the 4th stack bursts. */
export const ROT = {
  maxStacks: 4, duration: 4, tickEvery: 0.5,
  perStackPerSecond: (level: number) => 3.5 + 0.7 * level, perStackApRatio: 0.04,
  burst: (level: number) => 35 + 10 * level, burstApRatio: 0.35, burstSlow: 0.3, burstSlowFor: 1.5,
};
const SLUDGE_LOB = {
  cost: [60, 65, 70, 75], cooldown: [8, 7.5, 7, 6.5], castTime: 0.2,
  range: 850, radius: 160, flightTime: 0.5,
  damage: [60, 95, 130, 165], apRatio: 0.6, puddleTime: 2.5, puddleSlow: 0.3,
};
const MUSHROOM_TOTEM = {
  cost: [70, 70, 70, 70], cooldown: [16, 15, 14, 13], castTime: 0.25,
  // Toned down after playtests (was 20–50 +15% AP every 1.5s, up 16–22s, so always up at rank 4).
  range: 600, radius: 400, lifetime: [12, 13, 14, 15], pulseEvery: 2,
  heal: [16, 23, 30, 37], apRatio: 0.12, health: (level: number) => 120 + 20 * level, bounty: 25,
};
const MOLE_HOLE = {
  cost: [80, 75, 70, 65], cooldown: [20, 18, 16, 14],
  range: 700, radius: 55, open: 5, hopCooldown: 1,
};
const THE_DEEP_CALLS = {
  cost: [100, 100, 100], cooldown: [100, 85, 70],
  range: 900, radius: 350, delay: 0.75,
  damage: [100, 175, 250], apRatio: 0.5, root: [1.25, 1.5, 1.75],
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const HUNNAG_INFO: ChampionInfo = {
  id: 'hunnag',
  name: 'HunnaG',
  title: 'Rot of the Deep',
  resource: 'mana',
  passive: {
    name: 'Rot',
    icon: '☣️',
    description: `Her spells stack Rot on enemies (up to ${ROT.maxStacks}), dealing magic damage every ${ROT.tickEvery}s for ${ROT.duration}s. The ${ROT.maxStacks}th stack bursts for extra magic damage and slows by ${pct(ROT.burstSlow)} for ${ROT.burstSlowFor}s.`,
  },
  abilities: [
    {
      name: 'Sludge Lob',
      icon: '🧪',
      description: `Lob a glob of sludge. It lands after ${SLUDGE_LOB.flightTime}s, dealing ${perRank(SLUDGE_LOB.damage)} (+${pct(SLUDGE_LOB.apRatio)} AP) magic damage and 1 Rot, and leaves a puddle that slows by ${pct(SLUDGE_LOB.puddleSlow)} for ${SLUDGE_LOB.puddleTime}s.`,
      cost: SLUDGE_LOB.cost,
      cooldown: SLUDGE_LOB.cooldown,
      castTime: SLUDGE_LOB.castTime,
      targeting: { kind: 'point', range: SLUDGE_LOB.range, radius: SLUDGE_LOB.radius },
    },
    {
      name: 'Mushroom Totem',
      icon: '🍄',
      description: `Plant a totem for ${perRank(MUSHROOM_TOTEM.lifetime)}s that gives vision. Every ${MUSHROOM_TOTEM.pulseEvery}s it heals nearby allied champions for ${perRank(MUSHROOM_TOTEM.heal)} (+${pct(MUSHROOM_TOTEM.apRatio)} AP) and adds 1 Rot to nearby enemies. Enemies can destroy it.`,
      cost: MUSHROOM_TOTEM.cost,
      cooldown: MUSHROOM_TOTEM.cooldown,
      castTime: MUSHROOM_TOTEM.castTime,
      targeting: { kind: 'point', range: MUSHROOM_TOTEM.range, radius: MUSHROOM_TOTEM.radius },
    },
    {
      name: 'Mole Hole',
      icon: '🌀',
      description: `Dig down and pop up at the target spot. Both holes stay open for ${MOLE_HOLE.open}s, and allied champions can hop between them by walking in. Willmore can use them too, from either team, while he's burrowed.`,
      cost: MOLE_HOLE.cost,
      cooldown: MOLE_HOLE.cooldown,
      castTime: 0,
      targeting: { kind: 'point', range: MOLE_HOLE.range, radius: MOLE_HOLE.radius },
    },
    {
      name: 'The Deep Calls',
      icon: '✋',
      description: `Mark a large area. After ${THE_DEEP_CALLS.delay}s, hands burst out of the ground: every enemy inside takes ${perRank(THE_DEEP_CALLS.damage)} (+${pct(THE_DEEP_CALLS.apRatio)} AP) magic damage, is rooted for ${perRank(THE_DEEP_CALLS.root)}s, and gets full Rot (which bursts).`,
      cost: THE_DEEP_CALLS.cost,
      cooldown: THE_DEEP_CALLS.cooldown,
      castTime: 0,
      targeting: { kind: 'point', range: THE_DEEP_CALLS.range, radius: THE_DEEP_CALLS.radius },
    },
  ],
};

interface RotState {
  stacks: number;
  until: number;
  nextTickAt: number;
}

export class HunnaG extends Champion {
  readonly info = HUNNAG_INFO;
  /** Rot on each enemy, by unit id. Ticks on even after she dies, like any damage over time. */
  private readonly rot = new Map<number, RotState>();
  private totem: MushroomTotem | null = null;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'HunnaG');
  }

  update(world: World): void {
    this.tickRot(world);
    super.update(world);
  }

  protected launchAttack(world: World, target: Unit): void {
    const damage = this.stats.ad;
    world.add(new HomingProjectile(world, this, target, SPORE_SPEED, 'spore', (w, t) => w.damage(this, t, damage, 'physical', { basic: true })));
  }

  // ─── Passive: Rot ─────────────────────────────────────────────────────────

  rotStacks(target: Unit): number {
    return this.rot.get(target.id)?.stacks ?? 0;
  }

  /** Adds Rot; reaching the max bursts it. */
  applyRot(world: World, target: Unit, stacks = 1): void {
    if (target.dead || !target.isTargetable()) return;
    const r = this.rot.get(target.id) ?? { stacks: 0, until: 0, nextTickAt: world.time + ROT.tickEvery };
    r.stacks = Math.min(ROT.maxStacks, r.stacks + stacks);
    r.until = world.time + ROT.duration;
    if (r.stacks >= ROT.maxStacks) {
      this.rot.delete(target.id);
      target.clearStatus('rot');
      world.damage(this, target, ROT.burst(this.level) + ROT.burstApRatio * this.stats.ap, 'magic');
      target.addStatus(world, 'slow', ROT.burstSlowFor, ROT.burstSlow);
      world.emit({ e: 'fx', fx: 'rotBurst', x: Math.round(target.pos.x), y: Math.round(target.pos.y), r: target.radius * 2, team: this.team });
      return;
    }
    this.rot.set(target.id, r);
    target.clearStatus('rot');
    target.addStatus(world, 'rot', ROT.duration, r.stacks);
  }

  private tickRot(world: World): void {
    for (const [id, r] of this.rot) {
      const target = world.getUnit(id);
      if (!target || target.dead || world.time >= r.until) {
        this.rot.delete(id);
        continue;
      }
      if (world.time + 1e-9 < r.nextTickAt) continue;
      r.nextTickAt += ROT.tickEvery;
      const perSecond = r.stacks * (ROT.perStackPerSecond(this.level) + ROT.perStackApRatio * this.stats.ap);
      world.damage(this, target, perSecond * ROT.tickEvery, 'magic');
    }
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.sludgeLob(world, aim);
      case 1: return this.mushroomTotem(world, aim);
      case 2: return this.moleHole(world, aim);
      case 3: return this.theDeepCalls(world, aim);
    }
  }

  private sludgeLob(world: World, aim: Vec2): void {
    const s = SLUDGE_LOB;
    const at = { ...aim };
    const damage = this.byRank(0, s.damage) + s.apRatio * this.stats.ap;
    world.emit({ e: 'fx', fx: 'lob', x: Math.round(this.pos.x), y: Math.round(this.pos.y), x2: Math.round(at.x), y2: Math.round(at.y), dur: s.flightTime, team: this.team });
    world.schedule(s.flightTime, () => {
      for (const u of enemiesInRadius(world, this.team, at, s.radius)) {
        world.damage(this, u, damage, 'magic');
        this.applyRot(world, u);
      }
      world.add(
        new Zone(world, this.team, at, s.radius, s.puddleTime, 'sludge', (w, zone) => {
          for (const u of enemiesInRadius(w, zone.team, zone.pos, zone.radius)) u.addStatus(w, 'slow', 0.25, s.puddleSlow);
        }),
      );
    });
  }

  private mushroomTotem(world: World, aim: Vec2): void {
    const spot = world.grid.nearestWalkable(aim) ?? { ...this.pos };
    if (this.totem && !this.totem.dead) this.totem.die(world, null); // one at a time
    this.totem = world.add(new MushroomTotem(world, this, spot, this.byRank(1, MUSHROOM_TOTEM.lifetime)));
  }

  /** Called by her totem on each pulse. */
  totemPulse(world: World, totem: MushroomTotem): void {
    const t = MUSHROOM_TOTEM;
    const heal = this.byRank(1, t.heal) + t.apRatio * this.stats.ap;
    for (const u of world.units()) {
      if (u.team !== this.team || u.kind !== 'champion' || u.dead || dist(u.pos, totem.pos) > t.radius + u.radius) continue;
      u.heal(world, heal);
    }
    for (const u of enemiesInRadius(world, this.team, totem.pos, t.radius)) this.applyRot(world, u);
    world.emit({ e: 'fx', fx: 'pulse', x: Math.round(totem.pos.x), y: Math.round(totem.pos.y), r: t.radius, team: this.team });
  }

  private moleHole(world: World, aim: Vec2): void {
    const from = world.grid.nearestWalkable(this.pos) ?? { ...this.pos };
    const to = world.grid.nearestWalkable(aim) ?? from;
    const holes = linkedHoles(world, this.team as PlayerTeam, from, to);
    // She goes through straight away; the holes stay open for whoever follows.
    hop(world, this, holes[0], holes[1]);
  }

  private theDeepCalls(world: World, aim: Vec2): void {
    const d = THE_DEEP_CALLS;
    const at = { ...aim };
    world.emit({ e: 'fx', fx: 'deepMark', x: Math.round(at.x), y: Math.round(at.y), r: d.radius, dur: d.delay, team: this.team });
    world.schedule(d.delay, () => {
      const damage = this.byRank(3, d.damage) + d.apRatio * this.stats.ap;
      for (const u of enemiesInRadius(world, this.team, at, d.radius)) {
        world.damage(this, u, damage, 'magic');
        if (u.dead) continue;
        u.addStatus(world, 'root', this.byRank(3, d.root));
        this.applyRot(world, u, ROT.maxStacks);
      }
      world.emit({ e: 'fx', fx: 'deepHands', x: Math.round(at.x), y: Math.round(at.y), r: d.radius, team: this.team });
    });
  }
}

// ─── Mushroom Totem ───────────────────────────────────────────────────────────

/** HunnaG's totem: a little mushroom that sees, heals her allies and rots her enemies. Enemies can knock it down. */
export class MushroomTotem extends Unit {
  readonly kind = 'totem';
  readonly immovable = true;
  private nextPulseAt: number;
  private readonly expiresAt: number;

  constructor(world: World, readonly owner: HunnaG, pos: Vec2, lifetime: number) {
    const t = MUSHROOM_TOTEM;
    const hp = t.health(owner.level);
    super(world.newId(), owner.team, pos, 26, { maxHp: hp, hpRegen: 0, maxMana: 0, manaRegen: 0, ad: 0, ap: 0, armor: 0, mr: 0, attackSpeed: 0, attackRange: 0, moveSpeed: 0 }, 'Mushroom Totem');
    this.nextPulseAt = world.time + t.pulseEvery;
    this.expiresAt = world.time + lifetime;
  }

  protected think(world: World): void {
    if (world.time >= this.expiresAt) {
      this.die(world, null);
      return;
    }
    if (world.time + 1e-9 >= this.nextPulseAt) {
      this.nextPulseAt += MUSHROOM_TOTEM.pulseEvery;
      this.owner.totemPulse(world, this);
    }
  }

  die(world: World, killer: Unit | null): void {
    super.die(world, killer);
    world.schedule(0.5, () => (this.removed = true));
  }

  protected respawnDelay(): number {
    return Infinity;
  }
}

/** Gold for whoever knocks a totem down. */
export const TOTEM_BOUNTY = MUSHROOM_TOTEM.bounty;

// ─── Mole Holes ───────────────────────────────────────────────────────────────

/** Who may hop through a team's Mole Holes: its own champions, and any burrowed Willmore (Kin of the Deep). */
export function canUseHole(u: Unit, team: number): boolean {
  if (u.dead || u.kind !== 'champion') return false;
  return u.team === team || u.has('burrowed');
}

/** Two holes that send whoever walks into one out of the other. */
function linkedHoles(world: World, team: PlayerTeam, a: Vec2, b: Vec2): [Zone, Zone] {
  const m = MOLE_HOLE;
  const holes: Zone[] = [];
  /** Units that have just come out of (or were standing on) a hole: they must step off before it takes them again. */
  const resting = new Map<number, number>();
  const onTick = (w: World, zone: Zone) => {
    const other = holes[0] === zone ? holes[1] : holes[0];
    for (const u of w.units()) {
      if (!canUseHole(u, team)) continue;
      const inside = dist(u.pos, zone.pos) <= m.radius + u.radius * 0.5;
      if (!inside) {
        if ((resting.get(u.id) ?? -Infinity) <= w.time) resting.delete(u.id);
        continue;
      }
      if (resting.has(u.id)) continue;
      hop(w, u, zone, other);
      resting.set(u.id, w.time + m.hopCooldown);
    }
  };
  for (const p of [a, b]) holes.push(world.add(new Zone(world, team, p, m.radius, m.open, 'molehole', onTick)));
  return [holes[0], holes[1]];
}

/** Through the ground from one hole to the other, keeping whatever order the unit had. */
function hop(world: World, u: Unit, from: Zone, to: Zone): void {
  const offset = dist(from.pos, to.pos) > 1 ? scale(dirTo(from.pos, to.pos), MOLE_HOLE.radius + u.radius + 5) : { x: 0, y: 0 };
  u.pos = world.grid.nearestWalkable(add(to.pos, offset)) ?? { ...to.pos };
  u.path = u.order.kind === 'move' ? world.findPath(u.pos, u.order.dest) : [];
  world.emit({ e: 'fx', fx: 'hop', x: Math.round(from.pos.x), y: Math.round(from.pos.y), x2: Math.round(u.pos.x), y2: Math.round(u.pos.y), team: u.team as PlayerTeam });
}
