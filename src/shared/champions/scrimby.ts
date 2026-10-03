import { DT, type PlayerTeam, type Slot } from '../constants';
import { add, angleOf, dirTo, dist, fromAngle, scale, type Vec2 } from '../math';
import type { StatusKind } from '../protocol';
import { HomingProjectile, LineProjectile } from '../sim/projectile';
import { enemiesInRadius } from '../sim/query';
import type { Stats, Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { Zone } from '../sim/zone';
import { Champion } from './champion';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// Scrimby: a New Yorker, somehow. Nobody knows how he got down here; he says he took the wrong train.
// Timberlands, a Yankees cap, and no patience at all. His spells come quick; his ultimate turns him into
// the express train, steered with right-clicks like a runaway subway car, and nobody gets out of the way.

// ─── Tuning ──────────────────────────────────────────────────────────────────

const BASE_STATS: Stats = {
  maxHp: 530, hpRegen: 3, maxMana: 420, manaRegen: 8,
  ad: 51, ap: 0, armor: 20, mr: 30,
  attackSpeed: 0.65, attackRange: 525, moveSpeed: 335,
};
const GROWTH: StatGrowth = { maxHp: 82, hpRegen: 0.5, maxMana: 45, manaRegen: 0.6, ad: 2.8, armor: 3.4, mr: 1, attackSpeedPct: 0.02 };
const RADIUS = 32;
const TOKEN_SPEED = 1600;

/** New York Minute: every spell he casts winds him up a little more. */
export const NEW_YORK_MINUTE = { maxStacks: 3, duration: 4, speedPerStack: 0.05, hastePerStack: 6 };
export const DIRTY_WATER_DOG = {
  cost: [50, 55, 60, 65], cooldown: [6, 5.5, 5, 4.5], castTime: 0.2,
  range: 950, width: 70, speed: 1600, damage: [70, 110, 150, 190], apRatio: 0.65, slow: 0.25, slowFor: 1.5,
};
export const MANHOLE_STEAM = {
  cost: [70, 75, 80, 85], cooldown: [12, 11, 10, 9], castTime: 0.25,
  range: 800, radius: 200, delay: 0.6, damage: [60, 95, 130, 165], apRatio: 0.5, knockUp: 0.6,
  /** The vent keeps steaming: this share of the burst every half second. */
  steamFor: 2.5, steamShare: 0.1,
};
export const JAYWALK = { cost: [60, 60, 60, 60], cooldown: [16, 14.5, 13, 11.5], range: 380, dashTime: 0.2, speed: 0.2, speedFor: 1.5 };
export const EXPRESS_TRAIN = {
  cost: [100, 100, 100], cooldown: [120, 100, 80], castTime: 0.4,
  maxTime: 3, startSpeed: 520, topSpeed: 1050, accelFor: 1.5, turnRate: 1.4,
  radius: 300, damage: [150, 250, 350], apRatio: 0.8, knockUp: 0.75, directKnockUp: 1.25,
  /** Chuds and monsters in the way are thrown aside. */
  plowDamage: 0.3, plowPush: 160,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const SCRIMBY_INFO: ChampionInfo = {
  id: 'scrimby',
  name: 'Scrimby',
  title: 'The Commuter',
  resource: 'mana',
  passive: {
    name: 'New York Minute',
    icon: '🗽',
    description: `Every spell he casts winds him up: +${pct(NEW_YORK_MINUTE.speedPerStack)} speed and +${NEW_YORK_MINUTE.hastePerStack} ability haste for ${NEW_YORK_MINUTE.duration}s, stacking ${NEW_YORK_MINUTE.maxStacks} times.`,
  },
  abilities: [
    {
      name: 'Dirty Water Dog',
      icon: '🌭',
      description: `Hurl a street hot dog. The first enemy hit takes ${perRank(DIRTY_WATER_DOG.damage)} (+${pct(DIRTY_WATER_DOG.apRatio)} AP) magic damage and is slowed by ${pct(DIRTY_WATER_DOG.slow)} for ${DIRTY_WATER_DOG.slowFor}s.`,
      cost: DIRTY_WATER_DOG.cost,
      cooldown: DIRTY_WATER_DOG.cooldown,
      castTime: DIRTY_WATER_DOG.castTime,
      targeting: { kind: 'direction', range: DIRTY_WATER_DOG.range, width: DIRTY_WATER_DOG.width },
    },
    {
      name: 'Manhole Steam',
      icon: '♨️',
      description: `Blow a manhole cover. After ${MANHOLE_STEAM.delay}s it erupts: enemies on it take ${perRank(MANHOLE_STEAM.damage)} (+${pct(MANHOLE_STEAM.apRatio)} AP) magic damage and are knocked up for ${MANHOLE_STEAM.knockUp}s. It keeps steaming for ${MANHOLE_STEAM.steamFor}s, scalding whoever stands in it.`,
      cost: MANHOLE_STEAM.cost,
      cooldown: MANHOLE_STEAM.cooldown,
      castTime: MANHOLE_STEAM.castTime,
      targeting: { kind: 'point', range: MANHOLE_STEAM.range, radius: MANHOLE_STEAM.radius },
    },
    {
      name: 'Jaywalk',
      icon: '🚶',
      description: `Dart across, wherever the light says. He dashes up to ${JAYWALK.range} and moves ${pct(JAYWALK.speed)} faster for ${JAYWALK.speedFor}s.`,
      cost: JAYWALK.cost,
      cooldown: JAYWALK.cooldown,
      castTime: 0,
      targeting: { kind: 'point', range: JAYWALK.range, radius: RADIUS },
    },
    {
      name: 'Express Train',
      icon: '🚇',
      description: `"Stand clear of the closing doors!" He becomes the express train for up to ${EXPRESS_TRAIN.maxTime}s, picking up speed; right-click to steer. Chuds in the way are thrown aside. The first enemy champion or wall he hits ends the ride: everyone around takes ${perRank(EXPRESS_TRAIN.damage)} (+${pct(EXPRESS_TRAIN.apRatio)} AP) magic damage and is knocked up for ${EXPRESS_TRAIN.knockUp}s (whoever he hit, ${EXPRESS_TRAIN.directKnockUp}s). Press again to pull the brake early.`,
      cost: EXPRESS_TRAIN.cost,
      cooldown: EXPRESS_TRAIN.cooldown,
      castTime: EXPRESS_TRAIN.castTime,
      targeting: { kind: 'direction', range: 1600, width: 120 },
    },
  ],
};

interface Charge {
  heading: number;
  speed: number;
  startedAt: number;
  until: number;
  /** Where right-clicks are steering it. */
  steer: Vec2 | null;
  plowed: Set<number>;
}

/** Statuses that can't touch the express train once it's moving. */
const UNSTOPPABLE: ReadonlySet<StatusKind> = new Set<StatusKind>(['stun', 'root', 'slow', 'fear', 'airborne']);

export class Scrimby extends Champion {
  readonly info = SCRIMBY_INFO;
  private hustle = { stacks: 0, until: 0 };
  private charge: Charge | null = null;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'Scrimby');
  }

  protected launchAttack(world: World, target: Unit): void {
    const damage = this.stats.ad;
    world.add(new HomingProjectile(world, this, target, TOKEN_SPEED, 'token', (w, t) => w.damage(this, t, damage, 'physical', { basic: true })));
  }

  // ─── Passive: New York Minute ─────────────────────────────────────────────

  private hustling(world: World): number {
    return world.time < this.hustle.until ? this.hustle.stacks : 0;
  }

  protected onCastStart(world: World): void {
    const n = NEW_YORK_MINUTE;
    this.hustle = { stacks: Math.min(n.maxStacks, this.hustling(world) + 1), until: world.time + n.duration };
  }

  protected computeStats(world: World): Stats {
    const s = super.computeStats(world);
    s.moveSpeed *= 1 + NEW_YORK_MINUTE.speedPerStack * this.hustling(world);
    return s;
  }

  private hasteWorld: World | null = null;

  get haste(): number {
    return super.haste + (this.hasteWorld ? NEW_YORK_MINUTE.hastePerStack * this.hustling(this.hasteWorld) : 0);
  }

  // ─── The express train ────────────────────────────────────────────────────

  update(world: World): void {
    this.hasteWorld = world;
    if (this.charge && !this.dead) this.ride(world);
    super.update(world);
  }

  /** Right-clicks steer the train while it runs. */
  commandMove(world: World, dest: Vec2): void {
    if (this.charge) {
      this.charge.steer = { ...dest };
      return;
    }
    super.commandMove(world, dest);
  }

  addStatus(world: World, kind: StatusKind, duration: number, amount = 0): void {
    if (this.charge && UNSTOPPABLE.has(kind)) return;
    super.addStatus(world, kind, duration, amount);
  }

  hasBody(): boolean {
    return super.hasBody() && !this.charge;
  }

  get riding(): boolean {
    return this.charge !== null;
  }

  protected canRecast(_world: World, slot: Slot): boolean {
    return slot === 3 && this.charge !== null;
  }

  protected abilityNote(world: World, slot: Slot): string | undefined {
    return slot === 3 && this.charge !== null ? 'Brake' : super.abilityNote(world, slot);
  }

  protected recast(world: World, slot: Slot): boolean {
    if (slot !== 3 || !this.charge) return false;
    this.crash(world, null);
    return true;
  }

  private ride(world: World): void {
    const c = this.charge!;
    const e = EXPRESS_TRAIN;
    const t = world.time - c.startedAt;
    c.speed = e.startSpeed + (e.topSpeed - e.startSpeed) * Math.min(1, t / e.accelFor);
    // Steer toward the last right-click, at a train's turning rate.
    if (c.steer && dist(c.steer, this.pos) > 30) {
      const want = angleOf(dirTo(this.pos, c.steer));
      let turn = want - c.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      c.heading += Math.max(-e.turnRate * DT, Math.min(e.turnRate * DT, turn));
    }
    this.facing = c.heading;
    const dir = fromAngle(c.heading);
    const next = add(this.pos, scale(dir, c.speed * DT));
    // Ran out of track, or into a wall: the end of the line.
    if (world.time >= c.until || !world.grid.isWalkable(next)) return this.crash(world, null);
    this.pos = next;
    for (const u of world.units()) {
      if (u.team === this.team || u.dead || !u.isTargetable() || dist(u.pos, this.pos) > this.radius + u.radius + 10) continue;
      if (u.kind === 'champion' || u.kind === 'dummy') return this.crash(world, u);
      if (c.plowed.has(u.id) || u.kind === 'structure') continue;
      // A Chud (or a monster) on the tracks: thrown to the side.
      c.plowed.add(u.id);
      const side = (u.pos.x - this.pos.x) * dir.y - (u.pos.y - this.pos.y) * dir.x >= 0 ? 1 : -1;
      const to = add(u.pos, scale({ x: dir.y * side, y: -dir.x * side }, e.plowPush));
      if (world.grid.isWalkable(to)) u.pos = to;
      world.damage(this, u, (this.byRank(3, e.damage) + e.apRatio * this.stats.ap) * e.plowDamage, 'magic');
    }
  }

  private crash(world: World, hit: Unit | null): void {
    const e = EXPRESS_TRAIN;
    this.charge = null;
    this.clearStatus('express');
    this.lockedUntil = world.time;
    this.commandStop();
    const damage = this.byRank(3, e.damage) + e.apRatio * this.stats.ap;
    for (const u of enemiesInRadius(world, this.team, this.pos, e.radius)) {
      world.damage(this, u, damage, 'magic');
      if (u.dead) continue;
      const up = u === hit ? e.directKnockUp : e.knockUp;
      u.addStatus(world, 'stun', up);
      u.addStatus(world, 'airborne', up);
    }
    world.emit({ e: 'fx', fx: 'expressCrash', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: e.radius, team: this.team });
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.dirtyWaterDog(world, aim);
      case 1: return this.manholeSteam(world, aim);
      case 2: return this.jaywalk(world, aim);
      case 3: return this.expressTrain(world, aim);
    }
  }

  private dirtyWaterDog(world: World, aim: Vec2): void {
    const q = DIRTY_WATER_DOG;
    const damage = this.byRank(0, q.damage) + q.apRatio * this.stats.ap;
    world.add(
      new LineProjectile(world, this, {
        from: this.pos, dir: dirTo(this.pos, aim), speed: q.speed, range: q.range, width: q.width, vis: 'hotdog', pierce: false,
        onHit: (w, target) => {
          w.damage(this, target, damage, 'magic');
          target.addStatus(w, 'slow', q.slowFor, q.slow);
          w.emit({ e: 'fx', fx: 'mustard', x: Math.round(target.pos.x), y: Math.round(target.pos.y), r: target.radius, team: this.team });
        },
      }),
    );
  }

  private manholeSteam(world: World, aim: Vec2): void {
    const w = MANHOLE_STEAM;
    const at = { ...aim };
    const damage = this.byRank(1, w.damage) + w.apRatio * this.stats.ap;
    world.emit({ e: 'fx', fx: 'manhole', x: Math.round(at.x), y: Math.round(at.y), r: w.radius, dur: w.delay, team: this.team });
    world.schedule(w.delay, () => {
      for (const u of enemiesInRadius(world, this.team, at, w.radius)) {
        world.damage(this, u, damage, 'magic');
        if (u.dead) continue;
        u.addStatus(world, 'stun', w.knockUp);
        u.addStatus(world, 'airborne', w.knockUp);
      }
      world.emit({ e: 'fx', fx: 'steamBurst', x: Math.round(at.x), y: Math.round(at.y), r: w.radius, team: this.team });
      let next = world.time + 0.5;
      world.add(
        new Zone(world, this.team, at, w.radius, w.steamFor, 'steam', (wd, zone) => {
          if (wd.time + 1e-9 < next) return;
          next += 0.5;
          for (const u of enemiesInRadius(wd, zone.team, zone.pos, zone.radius)) wd.damage(this, u, damage * w.steamShare, 'magic');
        }),
      );
    });
  }

  private jaywalk(world: World, aim: Vec2): void {
    const j = JAYWALK;
    const d = Math.min(j.range, dist(this.pos, aim));
    const to = world.grid.nearestWalkable(add(this.pos, scale(dirTo(this.pos, aim), d))) ?? this.pos;
    const from = { ...this.pos };
    this.startDash(world, to, j.dashTime);
    this.addStatus(world, 'speed', j.dashTime + j.speedFor, j.speed);
    world.emit({ e: 'fx', fx: 'jaywalk', x: Math.round(from.x), y: Math.round(from.y), x2: Math.round(to.x), y2: Math.round(to.y), team: this.team });
  }

  private expressTrain(world: World, aim: Vec2): void {
    const e = EXPRESS_TRAIN;
    const heading = angleOf(dirTo(this.pos, aim));
    this.cancelWindup();
    this.path = [];
    this.order = { kind: 'idle' };
    this.charge = { heading, speed: e.startSpeed, startedAt: world.time, until: world.time + e.maxTime, steer: null, plowed: new Set() };
    // No attacking or casting while he's the train (the brake is a recast).
    this.lockedUntil = world.time + e.maxTime;
    this.addStatus(world, 'express', e.maxTime);
    world.emit({ e: 'fx', fx: 'expressHorn', x: Math.round(this.pos.x), y: Math.round(this.pos.y), team: this.team });
  }
}
