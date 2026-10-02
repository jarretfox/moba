import type { PlayerTeam, Slot } from '../constants';
import { add, dirTo, dist, scale, sub, type Vec2 } from '../math';
import type { EntitySnap, MeSnap } from '../protocol';
import { Pickup } from '../sim/pickup';
import { LineProjectile } from '../sim/projectile';
import { enemiesInRadius } from '../sim/query';
import type { Stats, Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { Champion } from './champion';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Every number for this champion lives here. Arrays are per rank (rank 1 first). No resource: cooldowns only.

const BASE_STATS: Stats = {
  maxHp: 640, hpRegen: 4, maxMana: 0, manaRegen: 0,
  ad: 64, ap: 0, armor: 32, mr: 32,
  attackSpeed: 0.68, attackRange: 125, moveSpeed: 350,
};
const GROWTH: StatGrowth = { maxHp: 100, hpRegen: 0.7, maxMana: 0, manaRegen: 0, ad: 3.6, armor: 4.2, mr: 1.3, attackSpeedPct: 0.028 };
const RADIUS = 36;
const FREE = [0, 0, 0, 0];

/** Chuds and monsters he kills drop scrap; walking over it heals him and stacks armor. */
const SCAVENGER = { lifetime: 10, pickupRadius: 45, healFlat: 10, healMaxHp: 0.02, armorPerStack: 2, maxStacks: 10, stackDuration: 30 };
/** Can (extra damage) → Sludge (slow) → Boot (stun), round and round. */
const JUNK_TOSS = {
  cooldown: [6, 5.5, 5, 4.5], castTime: 0.2, range: 850, width: 70, speed: 1700,
  damage: [50, 80, 110, 140], adRatio: 0.8,
  canMult: 1.4, sludgeSlow: 0.4, sludgeFor: 2, bootStun: 0.8,
};
const BURROW = {
  cooldown: [14, 13, 12, 11], maxDuration: 4, speedBonus: 0.4, minTimeBeforeSurfacing: 0.25,
  surfaceRadius: 220, knockUp: 0.75, damage: [50, 80, 110, 140], adRatio: 0.5,
};
const SEWER_HOOK = {
  cooldown: [12, 11, 10, 9], castTime: 0.15, range: 700, width: 60, speed: 1800,
  damage: [40, 70, 100, 130], adRatio: 0.5, pullTime: 0.3, wallPullSpeed: 1600,
};
const DOWN_BELOW = {
  cooldown: [110, 95, 80], grabRange: 275, tunnel: 600, time: 1.5,
  damage: [150, 250, 350], adRatio: 0.6, knockUp: 0.5,
};

type Junk = 'can' | 'sludge' | 'boot';
const JUNK: Junk[] = ['can', 'sludge', 'boot'];
const JUNK_NAME: Record<Junk, string> = { can: 'Can', sludge: 'Sludge', boot: 'Boot' };
const JUNK_BADGE: Record<Junk, string> = { can: '🥫', sludge: '🧪', boot: '👢' };

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const WILLMORE_INFO: ChampionInfo = {
  id: 'willmore',
  name: 'Willmore',
  title: 'Gutter King of the Deep',
  resource: 'none',
  passive: {
    name: 'Scavenger',
    icon: '🔩',
    description: `Chuds and monsters he kills drop scrap for ${SCAVENGER.lifetime}s. Walking over it heals ${SCAVENGER.healFlat} + ${pct(SCAVENGER.healMaxHp)} max health and gives +${SCAVENGER.armorPerStack} armor, stacking ${SCAVENGER.maxStacks} times (stacks last ${SCAVENGER.stackDuration}s).`,
  },
  abilities: [
    {
      name: 'Junk Toss',
      icon: '🥫',
      description: `Throw the next piece of junk for ${perRank(JUNK_TOSS.damage)} (+${pct(JUNK_TOSS.adRatio)} AD) physical damage to the first enemy hit. It cycles: a Can hits ${pct(JUNK_TOSS.canMult - 1)} harder, Sludge slows ${pct(JUNK_TOSS.sludgeSlow)} for ${JUNK_TOSS.sludgeFor}s, a Boot stuns for ${JUNK_TOSS.bootStun}s. Everyone can see what's next.`,
      cost: FREE,
      cooldown: JUNK_TOSS.cooldown,
      castTime: JUNK_TOSS.castTime,
      targeting: { kind: 'direction', range: JUNK_TOSS.range, width: JUNK_TOSS.width },
    },
    {
      name: 'Burrow',
      icon: '🕳️',
      description: `Dig in for up to ${BURROW.maxDuration}s: hidden from enemies and ${pct(BURROW.speedBonus)} faster, but you can't attack. Press again (or cast anything) to surface, knocking nearby enemies into the air for ${BURROW.knockUp}s and dealing ${perRank(BURROW.damage)} (+${pct(BURROW.adRatio)} AD) physical damage.`,
      cost: FREE,
      cooldown: BURROW.cooldown,
      castTime: 0,
      targeting: { kind: 'self', radius: BURROW.surfaceRadius },
    },
    {
      name: 'Sewer Hook',
      icon: '🎣',
      description: `Throw a hook. The first enemy hit takes ${perRank(SEWER_HOOK.damage)} (+${pct(SEWER_HOOK.adRatio)} AD) physical damage and is dragged to you. If it catches a wall instead, it pulls you to the wall.`,
      cost: FREE,
      cooldown: SEWER_HOOK.cooldown,
      castTime: SEWER_HOOK.castTime,
      targeting: { kind: 'direction', range: SEWER_HOOK.range, width: SEWER_HOOK.width },
    },
    {
      name: 'Down Below',
      icon: '⛏️',
      description: `Grab the nearest enemy champion beside you and drag them underground for ${DOWN_BELOW.time}s, through walls if you like, coming up where you aimed (up to ${DOWN_BELOW.tunnel} away). They take ${perRank(DOWN_BELOW.damage)} (+${pct(DOWN_BELOW.adRatio)} AD) physical damage and are knocked up as you surface.`,
      cost: FREE,
      cooldown: DOWN_BELOW.cooldown,
      castTime: 0,
      targeting: { kind: 'point', range: DOWN_BELOW.tunnel, radius: RADIUS * 2 },
    },
  ],
};

export class Willmore extends Champion {
  readonly info = WILLMORE_INFO;
  private junk = 0;
  private scrap = { stacks: 0, until: 0 };
  private burrowedAt = -Infinity;
  /** Bumped on every burrow, so a stale "surface at the end" timer can't pop a later burrow early. */
  private burrowCount = 0;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'Willmore');
  }

  get burrowed(): boolean {
    return this.has('burrowed');
  }

  get nextJunk(): Junk {
    return JUNK[this.junk];
  }

  // ─── Passive: Scavenger ───────────────────────────────────────────────────

  onKill(world: World, victim: Unit): void {
    if (victim.kind !== 'chud' && victim.kind !== 'monster') return;
    const s = SCAVENGER;
    world.add(new Pickup(world, this.id, this.team, { ...victim.pos }, s.pickupRadius, s.lifetime, 'scrap', () => this.scavenge(world)));
  }

  private scavenge(world: World): void {
    const s = SCAVENGER;
    this.heal(world, s.healFlat + s.healMaxHp * this.stats.maxHp);
    if (world.time >= this.scrap.until) this.scrap.stacks = 0;
    this.scrap = { stacks: Math.min(s.maxStacks, this.scrap.stacks + 1), until: world.time + s.stackDuration };
  }

  protected computeStats(world: World): Stats {
    const s = super.computeStats(world);
    if (world.time < this.scrap.until) s.armor += this.scrap.stacks * SCAVENGER.armorPerStack;
    if (this.burrowed) s.moveSpeed *= 1 + BURROW.speedBonus;
    return s;
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  protected recast(world: World, slot: Slot): boolean {
    if (slot !== 1 || !this.burrowed) return false;
    if (world.time - this.burrowedAt >= BURROW.minTimeBeforeSurfacing) this.surface(world);
    return true;
  }

  protected canCastAt(world: World, slot: Slot): boolean {
    return slot !== 3 || this.downBelowVictim(world) !== undefined;
  }

  /** Down Below on a champion out of reach: walk up to whoever's nearest the cursor. */
  protected approachTarget(world: World, slot: Slot, cursor: Vec2): Unit | undefined {
    if (slot !== 3) return undefined;
    return world
      .units()
      .filter((u) => u.team !== this.team && u.isChampionLike() && u.isTargetable() && world.vision.canSee(this.team, u) && dist(u.pos, cursor) <= 200 + u.radius)
      .sort((a, b) => dist(a.pos, cursor) - dist(b.pos, cursor))[0];
  }

  /** Anything else he casts brings him up first. */
  protected onCastStart(world: World, slot: Slot): void {
    if (slot !== 1 && this.burrowed) this.surface(world);
  }

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.junkToss(world, aim);
      case 1: return this.burrow(world);
      case 2: return this.sewerHook(world, aim);
      case 3: return this.downBelow(world, aim);
    }
  }

  private junkToss(world: World, aim: Vec2): void {
    const j = JUNK_TOSS;
    const junk = this.nextJunk;
    this.junk = (this.junk + 1) % JUNK.length;
    const damage = (this.byRank(0, j.damage) + j.adRatio * this.stats.ad) * (junk === 'can' ? j.canMult : 1);
    world.add(
      new LineProjectile(world, this, {
        from: this.pos, dir: dirTo(this.pos, aim), speed: j.speed, range: j.range, width: j.width,
        vis: `junk_${junk}`, pierce: false,
        onHit: (w, target) => {
          w.damage(this, target, damage, 'physical');
          if (junk === 'sludge') target.addStatus(w, 'slow', j.sludgeFor, j.sludgeSlow);
          if (junk === 'boot') target.addStatus(w, 'stun', j.bootStun);
        },
      }),
    );
  }

  private burrow(world: World): void {
    this.addStatus(world, 'burrowed', BURROW.maxDuration);
    this.burrowedAt = world.time;
    const count = ++this.burrowCount;
    world.emit({ e: 'fx', fx: 'burrow', x: this.pos.x, y: this.pos.y, team: this.team });
    world.schedule(BURROW.maxDuration, () => {
      if (count === this.burrowCount && this.burrowed && !this.dead) this.surface(world);
    });
  }

  private surface(world: World): void {
    this.clearStatus('burrowed');
    const b = BURROW;
    const damage = this.byRank(1, b.damage) + b.adRatio * this.stats.ad;
    for (const u of enemiesInRadius(world, this.team, this.pos, b.surfaceRadius)) {
      world.damage(this, u, damage, 'physical');
      knockUp(world, u, b.knockUp);
    }
    world.emit({ e: 'fx', fx: 'surface', x: this.pos.x, y: this.pos.y, r: b.surfaceRadius, team: this.team });
  }

  private sewerHook(world: World, aim: Vec2): void {
    const h = SEWER_HOOK;
    const from = { ...this.pos };
    const dir = dirTo(from, aim);
    const wall = world.grid.clampLine(from, add(from, scale(dir, h.range)));
    const reach = dist(from, wall);
    const caughtWall = reach < h.range - 10;
    world.add(
      new LineProjectile(world, this, {
        from, dir, speed: h.speed, range: Math.max(1, reach), width: h.width, vis: 'hook', pierce: false,
        onHit: (w, target) => {
          w.damage(this, target, this.byRank(2, h.damage) + h.adRatio * this.stats.ad, 'physical');
          if (target.immovable || !target.isTargetable()) return;
          const to = add(this.pos, scale(dirTo(this.pos, target.pos), this.radius + target.radius + 10));
          target.startDash(w, w.grid.clampLine(target.pos, to), h.pullTime);
          target.addStatus(w, 'stun', h.pullTime);
          w.emit({ e: 'fx', fx: 'hookPull', x: this.pos.x, y: this.pos.y, x2: target.pos.x, y2: target.pos.y, dur: h.pullTime, team: this.team });
        },
        onMiss: (w) => {
          if (!caughtWall || this.dead) return;
          const to = add(from, scale(dir, Math.max(0, reach - this.radius)));
          const travel = dist(this.pos, to);
          if (travel < 20) return;
          this.startDash(w, to, travel / h.wallPullSpeed);
          w.emit({ e: 'fx', fx: 'hookPull', x: wall.x, y: wall.y, x2: this.pos.x, y2: this.pos.y, dur: travel / h.wallPullSpeed, team: this.team });
        },
      }),
    );
  }

  /** The enemy champion Down Below would grab: the nearest one he can see within reach. */
  downBelowVictim(world: World): Unit | undefined {
    return world
      .units()
      .filter(
        (u) =>
          u.team !== this.team &&
          u.isChampionLike() &&
          u.isTargetable() &&
          world.vision.canSee(this.team, u) &&
          dist(u.pos, this.pos) - u.radius - this.radius <= DOWN_BELOW.grabRange,
      )
      .sort((a, b) => dist(a.pos, this.pos) - dist(b.pos, this.pos))[0];
  }

  private downBelow(world: World, aim: Vec2): void {
    const victim = this.downBelowVictim(world);
    if (!victim) return;
    const d = DOWN_BELOW;
    const start = { ...this.pos };
    const exit = world.grid.nearestWalkable(aim) ?? start;
    const back = dist(start, exit) > 1 ? scale(dirTo(start, exit), this.radius + victim.radius + 10) : { x: this.radius + victim.radius + 10, y: 0 };
    const mine = world.grid.nearestWalkable(sub(exit, back)) ?? exit;
    for (const [u, to] of [[this, mine], [victim, exit]] as const) {
      u.addStatus(world, 'underground', d.time);
      u.startDash(world, to, d.time);
    }
    world.emit({ e: 'fx', fx: 'tunnel', x: start.x, y: start.y, x2: exit.x, y2: exit.y, dur: d.time, team: this.team });
    world.schedule(d.time, () => {
      // Timers run before units update, so the "underground" status hasn't worn off by itself yet.
      this.clearStatus('underground');
      victim.clearStatus('underground');
      world.emit({ e: 'fx', fx: 'surface', x: exit.x, y: exit.y, r: 160, team: this.team });
      if (victim.dead) return;
      world.damage(this, victim, this.byRank(3, d.damage) + d.adRatio * this.stats.ad, 'physical');
      knockUp(world, victim, d.knockUp);
    });
  }

  // ─── What everyone sees ───────────────────────────────────────────────────

  protected abilityNote(_world: World, slot: Slot): string | undefined {
    if (slot === 0) return JUNK_NAME[this.nextJunk];
    if (slot === 1 && this.burrowed) return 'Surface';
    return undefined;
  }

  snapshot(world: World): EntitySnap {
    return { ...super.snapshot(world), badge: JUNK_BADGE[this.nextJunk] };
  }

  meSnapshot(world: World): MeSnap {
    return { ...super.meSnapshot(world), passiveStacks: world.time < this.scrap.until ? this.scrap.stacks : 0, empowered: this.burrowed };
  }
}

/** Into the air: a stun, drawn as being airborne. */
function knockUp(world: World, u: Unit, duration: number): void {
  u.addStatus(world, 'stun', duration);
  u.addStatus(world, 'airborne', duration);
}
