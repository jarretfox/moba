import type { PlayerTeam, Slot } from '../constants';
import { dirTo, type Vec2 } from '../math';
import type { EntitySnap, MeSnap } from '../protocol';
import { HomingProjectile, LineProjectile } from '../sim/projectile';
import { enemiesInRadius } from '../sim/query';
import type { Stats, Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { Zone } from '../sim/zone';
import { Champion } from './champion';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// ─── Tuning ──────────────────────────────────────────────────────────────────
// Every number for this champion lives here. Arrays are per rank (rank 1 first).

const BASE_STATS: Stats = {
  maxHp: 580, hpRegen: 3.4, maxMana: 300, manaRegen: 7,
  ad: 56, ap: 0, armor: 24, mr: 30,
  attackSpeed: 0.68, attackRange: 550, moveSpeed: 335,
};
const GROWTH: StatGrowth = { maxHp: 88, hpRegen: 0.55, maxMana: 40, manaRegen: 0.5, ad: 3.1, armor: 3.6, mr: 1, attackSpeedPct: 0.034 };
const RADIUS = 32;
const BOLT_SPEED = 2000;

/** His attacks leave sticky resin that smolders: true damage every half second, per stack. */
export const RESIN = { maxStacks: 6, duration: 6, tickEvery: 0.5, perStackPerSecond: (level: number) => 1.5 + 0.45 * level, apRatio: 0.03 };
export const HOTBOX = {
  cost: [50, 50, 50, 50], cooldown: [16, 15, 14, 13], delay: 0.75, duration: [5, 6, 7, 8], moveSpeed: 0.1,
  attackSpeed: [0.3, 0.4, 0.5, 0.6], attackSpeedFor: 5,
};
export const STICKY_ICKY = {
  cost: [60, 60, 60, 60], cooldown: [13, 12, 11, 10], castTime: 0.2, range: 900, radius: 220, flightTime: 0.35,
  stacks: 2, slow: [0.3, 0.35, 0.4, 0.45], slowFor: 2.5, puddleTime: 3,
};
export const LIGHT_IT_UP = {
  cost: [50, 60, 70, 80], cooldown: [12, 11, 10, 9], castTime: 0.2, range: 1100,
  base: [20, 35, 50, 65], perStack: [12, 17, 22, 27], bonusAdRatio: 0.35, apRatio: 0.2,
};
export const CLOUD_NINE = {
  cost: [100, 100, 100], cooldown: [90, 80, 70], duration: 6, range: 300, ad: [25, 40, 55],
  boltSpeed: 2400, width: 70, falloff: 0.1, minMultiplier: 0.6,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const DABBER_INFO: ChampionInfo = {
  id: 'dabber',
  name: 'Dark Dabber',
  title: 'The Rat in the Haze',
  resource: 'mana',
  passive: {
    name: 'Sticky Resin',
    icon: '🍯',
    description: `His basic attacks coat enemies in resin (up to ${RESIN.maxStacks} stacks, ${RESIN.duration}s), which smolders for true damage every second for each stack.`,
  },
  abilities: [
    {
      name: 'Hotbox',
      icon: '🌫️',
      description: `After ${HOTBOX.delay}s, vanish into a cloud of smoke for ${perRank(HOTBOX.duration)}s, moving ${pct(HOTBOX.moveSpeed)} faster. Enemies only spot him up close. Attacking or casting ends it and gives ${perRank(HOTBOX.attackSpeed, pct)} attack speed for ${HOTBOX.attackSpeedFor}s.`,
      cost: HOTBOX.cost,
      cooldown: HOTBOX.cooldown,
      castTime: 0,
      targeting: { kind: 'self' },
    },
    {
      name: 'Sticky Icky',
      icon: '💧',
      description: `Lob a glob of resin. Enemies where it lands get ${STICKY_ICKY.stacks} stacks and are slowed by ${perRank(STICKY_ICKY.slow, pct)} for ${STICKY_ICKY.slowFor}s, and the puddle it leaves adds a stack every second for ${STICKY_ICKY.puddleTime}s.`,
      cost: STICKY_ICKY.cost,
      cooldown: STICKY_ICKY.cooldown,
      castTime: STICKY_ICKY.castTime,
      targeting: { kind: 'point', range: STICKY_ICKY.range, radius: STICKY_ICKY.radius },
    },
    {
      name: 'Light It Up',
      icon: '💥',
      description: `Set fire to the resin on every enemy within ${LIGHT_IT_UP.range}: each takes ${perRank(LIGHT_IT_UP.base)} physical damage plus ${perRank(LIGHT_IT_UP.perStack)} (+${pct(LIGHT_IT_UP.bonusAdRatio)} bonus AD, +${pct(LIGHT_IT_UP.apRatio)} AP) per stack. Needs someone to burn.`,
      cost: LIGHT_IT_UP.cost,
      cooldown: LIGHT_IT_UP.cooldown,
      castTime: LIGHT_IT_UP.castTime,
      targeting: { kind: 'self', radius: LIGHT_IT_UP.range },
    },
    {
      name: 'Cloud Nine',
      icon: '☁️',
      description: `For ${CLOUD_NINE.duration}s his range grows by ${CLOUD_NINE.range} and he gains ${perRank(CLOUD_NINE.ad)} attack damage. His attacks become smoke bolts that pass through every enemy in a line, each one after the first taking ${pct(CLOUD_NINE.falloff)} less (down to ${pct(CLOUD_NINE.minMultiplier)}), and all of them get resin.`,
      cost: CLOUD_NINE.cost,
      cooldown: CLOUD_NINE.cooldown,
      castTime: 0,
      targeting: { kind: 'self' },
    },
  ],
};

interface ResinState {
  stacks: number;
  until: number;
  nextTickAt: number;
}

export class Dabber extends Champion {
  readonly info = DABBER_INFO;
  /** Resin on each enemy, by unit id. Keeps smoldering after he dies. */
  private readonly resin = new Map<number, ResinState>();
  private hazedUntil = -Infinity;
  private blazedUntil = -Infinity;
  private cloudUntil = -Infinity;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'Dark Dabber');
  }

  /** Attack damage from items (Light It Up scales with it). */
  get bonusAd(): number {
    return Math.max(0, this.stats.ad - (BASE_STATS.ad + GROWTH.ad * (this.level - 1)));
  }

  hazed(world: World): boolean {
    return world.time < this.hazedUntil;
  }

  clouded(world: World): boolean {
    return world.time < this.cloudUntil;
  }

  update(world: World): void {
    this.tickResin(world);
    super.update(world);
  }

  // ─── Passive: Sticky Resin ────────────────────────────────────────────────

  resinOn(target: Unit): number {
    return this.resin.get(target.id)?.stacks ?? 0;
  }

  applyResin(world: World, target: Unit, stacks = 1): void {
    if (target.dead || !target.isTargetable()) return;
    const r = this.resin.get(target.id) ?? { stacks: 0, until: 0, nextTickAt: world.time + RESIN.tickEvery };
    r.stacks = Math.min(RESIN.maxStacks, r.stacks + stacks);
    r.until = world.time + RESIN.duration;
    this.resin.set(target.id, r);
    target.clearStatus('resin');
    target.addStatus(world, 'resin', RESIN.duration, r.stacks);
  }

  private tickResin(world: World): void {
    for (const [id, r] of this.resin) {
      const target = world.getUnit(id);
      if (!target || target.dead || world.time >= r.until) {
        this.resin.delete(id);
        continue;
      }
      if (world.time + 1e-9 < r.nextTickAt) continue;
      r.nextTickAt += RESIN.tickEvery;
      const perSecond = r.stacks * (RESIN.perStackPerSecond(this.level) + RESIN.apRatio * this.stats.ap);
      world.damage(this, target, perSecond * RESIN.tickEvery, 'true');
    }
  }

  // ─── Basic attacks ────────────────────────────────────────────────────────

  protected launchAttack(world: World, target: Unit): void {
    this.leaveHaze(world);
    const damage = this.stats.ad;
    if (!this.clouded(world)) {
      world.add(
        new HomingProjectile(world, this, target, BOLT_SPEED, 'resinBolt', (w, t) => {
          w.damage(this, t, damage, 'physical', { basic: true });
          this.applyResin(w, t);
        }),
      );
      return;
    }
    // Cloud Nine: a smoke bolt straight through everyone in the line.
    const c = CLOUD_NINE;
    world.add(
      new LineProjectile(world, this, {
        from: this.pos, dir: dirTo(this.pos, target.pos), speed: c.boltSpeed, range: this.stats.attackRange + this.radius + 150, width: c.width,
        vis: 'smokeBolt', pierce: true,
        onHit: (w, t, i) => {
          w.damage(this, t, damage * Math.max(c.minMultiplier, 1 - c.falloff * i), 'physical', { basic: true });
          this.applyResin(w, t);
        },
      }),
    );
  }

  protected computeStats(world: World): Stats {
    const s = super.computeStats(world);
    if (world.time < this.blazedUntil) s.attackSpeed *= 1 + this.byRank(0, HOTBOX.attackSpeed);
    if (this.clouded(world)) {
      s.attackRange += CLOUD_NINE.range;
      s.ad += this.byRank(3, CLOUD_NINE.ad);
    }
    return s;
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  /** Light It Up needs someone with resin on them in range. */
  protected canCastAt(world: World, slot: Slot): boolean {
    return slot !== 2 || this.burnable(world).length > 0;
  }

  private burnable(world: World): Unit[] {
    return enemiesInRadius(world, this.team, this.pos, LIGHT_IT_UP.range).filter((u) => this.resinOn(u) > 0);
  }

  protected onCastStart(world: World, slot: Slot): void {
    if (slot !== 0) this.leaveHaze(world);
  }

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.hotbox(world);
      case 1: return this.stickyIcky(world, aim);
      case 2: return this.lightItUp(world);
      case 3: return this.cloudNine(world);
    }
  }

  private hotbox(world: World): void {
    const h = HOTBOX;
    world.emit({ e: 'fx', fx: 'hotbox', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: this.radius * 3, team: this.team });
    world.schedule(h.delay, () => {
      if (this.dead) return;
      const duration = this.byRank(0, h.duration);
      this.hazedUntil = world.time + duration;
      this.addStatus(world, 'hazed', duration);
      this.addStatus(world, 'speed', duration, h.moveSpeed);
      world.emit({ e: 'fx', fx: 'hotbox', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: this.radius * 4, team: this.team });
    });
  }

  /** Stepping out of the smoke: he's seen again, and his first few shots come fast. */
  private leaveHaze(world: World): void {
    if (!this.hazed(world)) return;
    this.hazedUntil = -Infinity;
    this.clearStatus('hazed');
    this.clearStatus('speed');
    this.blazedUntil = world.time + HOTBOX.attackSpeedFor;
    this.addStatus(world, 'blazed', HOTBOX.attackSpeedFor);
  }

  private stickyIcky(world: World, aim: Vec2): void {
    const s = STICKY_ICKY;
    const at = { ...aim };
    world.emit({ e: 'fx', fx: 'stickyIcky', x: Math.round(this.pos.x), y: Math.round(this.pos.y), x2: Math.round(at.x), y2: Math.round(at.y), dur: s.flightTime, r: s.radius, team: this.team });
    world.schedule(s.flightTime, () => {
      for (const u of enemiesInRadius(world, this.team, at, s.radius)) {
        this.applyResin(world, u, s.stacks);
        u.addStatus(world, 'slow', s.slowFor, this.byRank(1, s.slow));
      }
      let nextStack = world.time + 1;
      world.add(
        new Zone(world, this.team, at, s.radius, s.puddleTime, 'resinPuddle', (w, zone) => {
          if (w.time + 1e-9 < nextStack) return;
          nextStack += 1;
          for (const u of enemiesInRadius(w, zone.team, zone.pos, zone.radius)) this.applyResin(w, u);
        }),
      );
    });
  }

  private lightItUp(world: World): void {
    const l = LIGHT_IT_UP;
    const perStack = this.byRank(2, l.perStack) + l.bonusAdRatio * this.bonusAd + l.apRatio * this.stats.ap;
    for (const u of this.burnable(world)) {
      const stacks = this.resinOn(u);
      this.resin.delete(u.id);
      u.clearStatus('resin');
      world.emit({ e: 'fx', fx: 'lightItUp', x: Math.round(u.pos.x), y: Math.round(u.pos.y), r: stacks, team: this.team });
      world.damage(this, u, this.byRank(2, l.base) + perStack * stacks, 'physical');
    }
  }

  private cloudNine(world: World): void {
    this.cloudUntil = world.time + CLOUD_NINE.duration;
    world.emit({ e: 'fx', fx: 'cloudNine', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: this.radius * 5, team: this.team });
  }

  protected respawn(): void {
    super.respawn();
    this.hazedUntil = this.blazedUntil = this.cloudUntil = -Infinity;
  }

  snapshot(world: World): EntitySnap {
    const s = super.snapshot(world);
    if (this.clouded(world)) s.st = [...(s.st ?? []), 'cloudNine'];
    return s;
  }

  meSnapshot(world: World): MeSnap {
    return { ...super.meSnapshot(world), empowered: world.time < this.blazedUntil || this.clouded(world) };
  }
}
