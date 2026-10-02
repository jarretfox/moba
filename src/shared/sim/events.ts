import { pointAlong, progressAlong } from '../bots/lanes';
import { Champion } from '../champions/champion';
import { DT, TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import type { EventSite } from '../map/mapData';
import { add, angleOf, clamp, dirTo, dist, fromAngle, scale, type Vec2 } from '../math';
import type { EntitySnap, EventCue, EventKind, EventStatus } from '../protocol';
import { DEEP_POCKETS, EVENT_BUFFS, type EventBuffKind } from './eventBuffs';
import { Unit, type Stats } from './unit';
import type { World, WorldSystem } from './world';

// ─── Map events ───────────────────────────────────────────────────────────────
//
// Twice a match something turns up for both teams to fight over, rolled once at the start so no two
// matches play the same: a boss to race for (Three Chuds in a Coat), Old Wick's cart to push home, or
// the Royal Tax Stall to hold. Each is announced half a minute ahead, pays the team that takes it in gold
// and experience, and leaves them a buff for a while (eventBuffs.ts). Where they happen comes from the
// map (`MapData.eventSites`): a map without sites has no events.

// ─── Tuning ──────────────────────────────────────────────────────────────────

export const EVENTS = {
  /** When each one can start: one before the Warden wakes at 8:00, one well after. Rolled inside the window. */
  windows: [
    [4 * 60, 6 * 60],
    [10 * 60, 14 * 60],
  ] as readonly (readonly [number, number])[],
  /** Announced this long before it starts. */
  lead: 30,
  /** The result stays in the HUD this long. */
  linger: 6,
};

export const EVENT_NAMES: Record<EventKind, string> = { boss: 'Three Chuds in a Coat', escort: "Old Wick's Cart", capture: 'The Royal Tax Stall' };

/** Three Chuds in a Coat: a very tall, very suspicious merchant who ambles in from the Deep. The Oak was right. */
export const COAT = {
  /** By how many Chuds are still in the coat. */
  names: ['', 'One Chud in a Coat', 'Two Chuds in a Coat', 'Three Chuds in a Coat'],
  radius: 62,
  stats: { maxHp: 3400, hpRegen: 0, maxMana: 0, manaRegen: 0, ad: 65, ap: 0, armor: 35, mr: 35, attackSpeed: 0.8, attackRange: 170, moveSpeed: 190 } satisfies Stats,
  growthPerMinute: 0.04,
  /** Ambling along its path, and chasing whoever's picking on it. */
  chaseSpeed: 260,
  /** Only fights champions this close to its site who've hit it lately (like the Warden); left alone it heals. */
  leash: 950,
  calmAfter: 6,
  calmRegen: 0.08,
  /**
   * Topple: it marks a strip from itself toward whoever it's after, then falls flat along it. Anyone still in
   * the strip is hurt and thrown in the air. Then it lies there a moment, taking more damage, getting up.
   */
  topple: { every: 8, enragedEvery: 5, telegraph: 1.1, length: 520, width: 200, damage: (minutes: number) => 120 + 12 * minutes, airborne: 0.7, down: 2.2, exposed: 0.25 },
  /** Below these shares of health a Chud tumbles out of the coat (an add) and the coat gets shorter. */
  stages: [0.66, 0.33],
  add: { stats: { maxHp: 550, hpRegen: 0, maxMana: 0, manaRegen: 0, ad: 28, ap: 0, armor: 10, mr: 10, attackSpeed: 1.1, attackRange: 90, moveSpeed: 340 } satisfies Stats, lasts: 35, leash: 700, reward: { gold: 25, xp: 35 } },
  /** It loses its patience after this long: faster, harder, toppling more often. */
  enrageAt: 75,
  enrage: { attackSpeed: 1.5, ad: 1.3 },
  /** Nobody's finished it by then: it wanders off, and nobody gets paid. */
  leavesAt: 150,
  /** Every champion on the team that kills it, plus Deep Pockets. */
  reward: { gold: 150, xp: 150 },
};

/** Old Wick's cart: stand by it to push it toward your side; the other team standing by it holds it up. */
export const CART = {
  radius: 48,
  speed: 110,
  /** Champions this close to it count as pushing. */
  pushRadius: 320,
  timeout: 150,
  /** Every champion on the team whose end it reaches, plus Wick's Favor. */
  reward: { gold: 110, xp: 120 },
  /** If time runs out, the side it's on gets this much each (no buff). */
  partial: 50,
};

/** The Royal Tax Stall: stand in it, uncontested, to fill your team's bar; the first full bar takes the treasury. */
export const STALL = {
  radius: 320,
  /** Seconds of uncontested holding to fill the bar (however many of you stand there). */
  fillTime: 20,
  /** While one team holds it, the other's bar drains at this share of the fill rate. */
  drain: 0.5,
  timeout: 150,
  /** Every second held pays each champion standing in it a few coins on the spot. */
  holdGold: 3,
  /** Every champion on the team that fills its bar, plus Royal Favor. */
  reward: { gold: 100, xp: 120 },
};

const CORPSE_TIME = 2.5;

// ─── The schedule ─────────────────────────────────────────────────────────────

export interface EventPlan {
  kind: EventKind;
  /** Match seconds. */
  at: number;
  site: EventSite;
  /** Forced by the dev hook or a test: starts when it says, however short the notice. */
  rush?: boolean;
}

/** Rolls a match's events: one per window, different kinds while there are enough, each at a random site of its kind. */
export function rollSchedule(sites: readonly EventSite[], random: () => number): EventPlan[] {
  const kinds = (['boss', 'escort', 'capture'] as const).filter((k) => sites.some((s) => s.kind === k));
  if (!kinds.length) return [];
  const order = [...kinds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return EVENTS.windows.map(([from, to], i) => {
    const kind = order[i % order.length];
    const options = sites.filter((s) => s.kind === kind);
    const site = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
    return { kind, at: Math.round(from + random() * (to - from)), site };
  });
}

// ─── The system ───────────────────────────────────────────────────────────────

/** Any of the three, while it runs. */
export type ActiveEvent = BossEvent | EscortEvent | CaptureEvent;

const registry = new WeakMap<World, MapEvents>();

/** The event running in this world right now, if any (for the bots). */
export function activeEvent(world: World): ActiveEvent | null {
  return registry.get(world)?.current ?? null;
}

/** Announces, starts and ends the match's events, and keeps the team buffs they pay out on everyone on the team. */
export class MapEvents implements WorldSystem {
  readonly plan: EventPlan[];
  current: ActiveEvent | null = null;
  private next = 0;
  /** The notice for `plan[next]` has gone out. */
  private announced = false;
  /** The last one, for the few seconds its result stays up. */
  private finished: { event: ActiveEvent; at: number } | null = null;
  /** Each team's event buff: which, and until when. Reapplied to anyone who respawns without it. */
  private readonly buffs: Record<PlayerTeam, { kind: EventBuffKind; until: number } | null> = { 1: null, 2: null };

  constructor(world: World, random: () => number = Math.random) {
    this.plan = rollSchedule(world.map.eventSites ?? [], random);
    registry.set(world, this);
  }

  update(world: World): void {
    this.keepBuffs(world);
    if (this.finished && world.time - this.finished.at > EVENTS.linger) this.finished = null;
    if (this.current) {
      if (this.current.update(world)) {
        this.finished = { event: this.current, at: world.time };
        this.current = null;
      }
      return;
    }
    const plan = this.plan[this.next];
    if (!plan) return;
    if (!this.announced) {
      // Overdue (the one before ran long): it still gets its full warning.
      if (!plan.rush && plan.at - EVENTS.lead < world.time - 1e-9) plan.at = world.time + EVENTS.lead;
      if (world.time + 1e-9 >= plan.at - EVENTS.lead) {
        this.announced = true;
        world.emit({ e: 'evt', k: 'soon', kind: plan.kind, x: Math.round(plan.site.pos.x), y: Math.round(plan.site.pos.y), dur: Math.max(0, Math.round(plan.at - world.time)), all: true });
      }
    }
    if (world.time + 1e-9 >= plan.at) {
      this.next++;
      this.announced = false;
      this.current = start(world, plan);
      world.emit({ e: 'evt', k: 'start', kind: plan.kind, x: Math.round(plan.site.pos.x), y: Math.round(plan.site.pos.y), all: true });
    }
  }

  /** Dev hook and tests: the next event is this kind, `lead` seconds from now, at one of its sites (whatever was running is dropped). */
  force(world: World, kind: EventKind, lead = 0, random: () => number = Math.random): void {
    const sites = (world.map.eventSites ?? []).filter((s) => s.kind === kind);
    if (!sites.length) return;
    if (this.current) {
      this.current.cancel(world);
      this.current = null;
    }
    this.finished = null;
    this.announced = false;
    this.plan.splice(this.next, 0, { kind, at: world.time + lead, site: sites[Math.min(sites.length - 1, Math.floor(random() * sites.length))], rush: true });
  }

  /** The team keeps the buff for its duration, through deaths: anyone on it without the status gets it back. */
  grant(world: World, team: PlayerTeam, kind: EventBuffKind): void {
    this.buffs[team] = { kind, until: world.time + EVENT_BUFFS[kind].duration };
    this.keepBuffs(world);
  }

  private keepBuffs(world: World): void {
    for (const team of [TEAM.blue, TEAM.red] as const) {
      const b = this.buffs[team];
      if (!b) continue;
      if (b.until <= world.time) {
        this.buffs[team] = null;
        continue;
      }
      for (const u of world.units()) {
        if (!(u instanceof Champion) || u.team !== team || u.dead) continue;
        if (!u.has(b.kind)) u.gainBuff(world, b.kind, b.until - world.time);
        // Deep Pockets: a coin or two every second.
        if (b.kind === 'deepPockets' && world.tick % TICK_RATE === 0) u.gainGold(world, DEEP_POCKETS.goldPerSecond);
      }
    }
  }

  /** For everyone's HUD: what's coming, what's on, and for a moment, how it went. */
  status(world: World): EventStatus | undefined {
    if (this.current) {
      const e = this.current;
      return { kind: e.kind, name: e.name, phase: 'live', x: Math.round(e.pos.x), y: Math.round(e.pos.y), ...e.status(world) };
    }
    if (this.finished) {
      const e = this.finished.event;
      return { kind: e.kind, name: e.name, phase: 'done', left: Math.max(0, Math.ceil(EVENTS.linger - (world.time - this.finished.at))), x: Math.round(e.pos.x), y: Math.round(e.pos.y), ...(e.winner ? { team: e.winner } : {}) };
    }
    const plan = this.plan[this.next];
    if (plan && this.announced) return { kind: plan.kind, name: EVENT_NAMES[plan.kind], phase: 'soon', left: Math.max(0, Math.ceil(plan.at - world.time)), x: Math.round(plan.site.pos.x), y: Math.round(plan.site.pos.y) };
    return undefined;
  }
}

function start(world: World, plan: EventPlan): ActiveEvent {
  switch (plan.kind) {
    case 'boss':
      return new BossEvent(world, plan.site);
    case 'escort':
      return new EscortEvent(world, plan.site);
    case 'capture':
      return new CaptureEvent(world, plan.site);
  }
}

/** Gold, experience and the buff for every champion on the team, and the word to everyone. */
function payTeam(world: World, team: PlayerTeam, reward: { gold: number; xp: number }, buff: EventBuffKind | null): void {
  for (const u of world.units()) {
    if (!(u instanceof Champion) || u.team !== team) continue;
    u.gainGold(world, reward.gold);
    u.gainXp(world, reward.xp);
  }
  if (buff) registry.get(world)?.grant(world, team, buff);
}

function cue(world: World, k: EventCue, kind: EventKind, at: Vec2, extra: { x2?: number; y2?: number; r?: number; dur?: number; team?: PlayerTeam; text?: string; all?: boolean } = {}): void {
  world.emit({ e: 'evt', k, kind, x: Math.round(at.x), y: Math.round(at.y), ...extra });
}

// ─── Three Chuds in a Coat ────────────────────────────────────────────────────

/** A monster the events bring: it hands out its own reward when it dies (rewards.ts asks it). */
export abstract class EventUnit extends Unit {
  readonly kind = 'monster';
  abstract reward(world: World, source: Unit | null, helpers: Unit[]): void;

  /** The champion who gets the credit: the one who landed the blow, or the last one who hit it. */
  protected creditFor(source: Unit | null, helpers: Unit[]): Champion | undefined {
    return source instanceof Champion ? source : helpers.find((h): h is Champion => h instanceof Champion);
  }

  protected respawnDelay(): number {
    return Infinity;
  }
}

/**
 * Three Chuds in a Coat. Ambles along its stretch of the river; fights champions who hit it, in its own
 * way: it topples onto them. Every third of its health a Chud falls out and fights on its own, and the
 * coat gets shorter. Loses its patience after a while, and wanders off if nobody finishes it.
 */
export class Coat extends EventUnit {
  /** Chuds still in the coat (3, 2, 1). */
  stage = 3;
  enraged = false;
  /** Who finished it, once someone has. */
  slainBy: PlayerTeam | null = null;
  readonly bornAt: number;
  private nextToppleAt: number;
  private downUntil = -Infinity;
  private waypoint = 0;

  constructor(world: World, readonly site: EventSite) {
    const grow = 1 + COAT.growthPerMinute * (world.time / 60);
    super(world.newId(), TEAM.neutral, site.pos, COAT.radius, { ...COAT.stats, maxHp: COAT.stats.maxHp * grow, ad: COAT.stats.ad * grow }, COAT.names[3]);
    this.bornAt = world.time;
    this.nextToppleAt = world.time + COAT.topple.every;
    this.facing = Math.PI / 2;
  }

  /** Flat on its face after a topple (this tick). */
  private isDown = false;

  protected computeStats(world: World): Stats {
    const s = super.computeStats(world);
    if (this.enraged) {
      s.attackSpeed *= COAT.enrage.attackSpeed;
      s.ad *= COAT.enrage.ad;
    }
    return s;
  }

  /** Flat on its face it's easier to hit. */
  incomingDamageScale(world: World): number {
    return world.time < this.downUntil ? 1 + COAT.topple.exposed : 1;
  }

  protected think(world: World): void {
    this.isDown = world.time < this.downUntil;
    if (!this.enraged && world.time - this.bornAt >= COAT.enrageAt) {
      this.enraged = true;
      cue(world, 'enrage', 'boss', this.pos);
    }
    const foes = this.foes(world);
    if (!foes.length) {
      if (world.time - this.lastDamagedAt > COAT.calmAfter) {
        this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * COAT.calmRegen * DT);
        this.championHits.clear();
      }
      this.nextToppleAt = world.time + this.toppleEvery() / 2;
      if (!this.isDown) this.amble(world);
      return;
    }
    this.stats.moveSpeed = COAT.chaseSpeed;
    if (this.isDown) return;
    const current = this.order.kind === 'attack' ? foes.find((u) => this.order.kind === 'attack' && u.id === this.order.targetId) : undefined;
    const target = current ?? foes.sort((a, b) => dist(a.pos, this.pos) - dist(b.pos, this.pos))[0];
    this.commandAttack(target);
    if (world.time >= this.nextToppleAt) {
      this.nextToppleAt = world.time + this.toppleEvery();
      this.topple(world, target);
    }
  }

  private toppleEvery(): number {
    return this.enraged ? COAT.topple.enragedEvery : COAT.topple.every;
  }

  /** Champions near its site who've hit it lately. */
  private foes(world: World): Unit[] {
    return world.units().filter((u) => {
      if (u.kind !== 'champion' || !u.isTargetable() || dist(u.pos, this.site.pos) > COAT.leash) return false;
      const hitAt = this.championHits.get(u.id);
      return hitAt !== undefined && world.time - hitAt <= COAT.calmAfter;
    });
  }

  /** Up and down its path, slowly, minding its own business. */
  private amble(world: World): void {
    const path = this.site.path;
    if (!path?.length) {
      if (this.order.kind !== 'idle') this.commandStop();
      return;
    }
    if (this.order.kind !== 'idle') return;
    this.waypoint = (this.waypoint + 1) % path.length;
    this.commandMove(world, path[this.waypoint]);
  }

  /** The telegraph: a strip toward the target, then the whole coat comes down along it. */
  private topple(world: World, target: Unit): void {
    const t = COAT.topple;
    const dir = dist(target.pos, this.pos) > 1 ? dirTo(this.pos, target.pos) : fromAngle(this.facing);
    const from = { ...this.pos };
    const to = add(from, scale(dir, t.length));
    this.facing = angleOf(dir);
    this.cancelWindup();
    this.lockedUntil = world.time + t.telegraph;
    this.path = [];
    cue(world, 'topple', 'boss', from, { x2: Math.round(to.x), y2: Math.round(to.y), r: t.width / 2, dur: t.telegraph });
    world.schedule(t.telegraph, () => {
      if (this.dead) return;
      cue(world, 'crash', 'boss', from, { x2: Math.round(to.x), y2: Math.round(to.y), r: t.width / 2 });
      const damage = t.damage(world.time / 60);
      for (const u of world.units()) {
        if (u.kind !== 'champion' || !u.isTargetable() || !inStrip(u, from, dir, t.length, t.width)) continue;
        world.damage(this, u, damage, 'physical');
        u.addStatus(world, 'airborne', t.airborne);
        u.addStatus(world, 'stun', t.airborne);
      }
      // Face down for a moment, and easier to hit while it is.
      this.downUntil = world.time + t.down;
      this.addStatus(world, 'stun', t.down);
      this.commandStop();
    });
  }

  /** Every third of its health a Chud falls out and the name changes with it. */
  onDamaged(world: World, _source: Unit | null): void {
    if (this.hp <= 0) return;
    const share = this.hp / this.stats.maxHp;
    while (this.stage > 1 && share <= COAT.stages[3 - this.stage]) {
      this.stage--;
      this.name = COAT.names[this.stage];
      const side = this.stage === 2 ? -1 : 1;
      const at = world.grid.nearestWalkable(add(this.pos, { x: side * 130, y: 50 })) ?? { ...this.pos };
      world.add(new LooseChud(world, this.site.pos, at));
      cue(world, 'add', 'boss', at, { text: this.name });
    }
  }

  /** Nobody finished it: off it goes, back to the Deep. */
  leave(world: World): void {
    cue(world, 'over', 'boss', this.pos, { all: true, text: this.name });
    this.removed = true;
  }

  die(world: World, killer: Unit | null): void {
    super.die(world, killer);
    world.schedule(CORPSE_TIME, () => (this.removed = true));
  }

  reward(world: World, source: Unit | null, helpers: Unit[]): void {
    const killer = this.creditFor(source, helpers);
    if (!killer) return;
    const team = killer.team as PlayerTeam;
    this.slainBy = team;
    killer.score.cs++;
    payTeam(world, team, COAT.reward, 'deepPockets');
    world.emit({ e: 'kill', killer: killer.name, victim: COAT.names[3], team, what: 'event', killerChamp: killer.info.id, killerSkin: killer.skin });
    cue(world, 'won', 'boss', this.pos, { team, text: killer.name, all: true });
  }

  snapshot(world: World): EntitySnap {
    return { ...super.snapshot(world), mon: 'coat', ...(this.enraged ? { badge: '😤' } : {}) };
  }
}

/** Whether a unit's body touches a strip `length` long and `width` wide running from `from` along `dir`. */
function inStrip(u: Unit, from: Vec2, dir: Vec2, length: number, width: number): boolean {
  const dx = u.pos.x - from.x;
  const dy = u.pos.y - from.y;
  const along = dx * dir.x + dy * dir.y;
  const across = Math.abs(dx * dir.y - dy * dir.x);
  return along >= -u.radius && along <= length + u.radius && across <= width / 2 + u.radius;
}

/** A Chud that fell out of the coat: it picks on the nearest champion near the site for a while, then keels over. */
export class LooseChud extends EventUnit {
  private readonly leavesAt: number;

  constructor(world: World, readonly home: Vec2, pos: Vec2) {
    const grow = 1 + COAT.growthPerMinute * (world.time / 60);
    super(world.newId(), TEAM.neutral, pos, 28, { ...COAT.add.stats, maxHp: COAT.add.stats.maxHp * grow, ad: COAT.add.stats.ad * grow }, 'Loose Chud');
    this.leavesAt = world.time + COAT.add.lasts;
  }

  protected think(world: World): void {
    if (world.time >= this.leavesAt) return this.die(world, null);
    const target = world
      .units()
      .filter((u) => u.kind === 'champion' && u.isTargetable() && dist(u.pos, this.home) <= COAT.add.leash)
      .sort((a, b) => dist(a.pos, this.pos) - dist(b.pos, this.pos))[0];
    if (target) this.commandAttack(target);
    else if (this.order.kind === 'attack') this.commandStop();
  }

  die(world: World, killer: Unit | null): void {
    super.die(world, killer);
    world.schedule(1.5, () => (this.removed = true));
  }

  reward(world: World, source: Unit | null, helpers: Unit[]): void {
    const killer = this.creditFor(source, helpers);
    if (!killer) return;
    killer.score.cs++;
    killer.gainGold(world, COAT.add.reward.gold);
    killer.gainXp(world, COAT.add.reward.xp);
  }

  snapshot(world: World): EntitySnap {
    return { ...super.snapshot(world), mon: 'looseChud' };
  }
}

/** The boss event: the Coat arrives at its site; the first team to kill it is paid, or it wanders off. */
export class BossEvent {
  readonly kind = 'boss';
  readonly name = EVENT_NAMES.boss;
  readonly boss: Coat;
  winner: PlayerTeam | null = null;

  constructor(world: World, readonly site: EventSite) {
    this.boss = world.add(new Coat(world, site));
  }

  /** Its site, not the boss itself: everyone knows where it's meant to be, not where it's got to. */
  get pos(): Vec2 {
    return this.site.pos;
  }

  update(world: World): boolean {
    if (this.boss.dead) {
      this.winner = this.boss.slainBy;
      return true;
    }
    if (world.time - this.boss.bornAt >= COAT.leavesAt) {
      this.boss.leave(world);
      return true;
    }
    return false;
  }

  cancel(_world: World): void {
    this.boss.removed = true;
  }

  status(world: World): Pick<EventStatus, 'left' | 'progress' | 'enraged'> {
    return { left: Math.max(0, Math.ceil(COAT.leavesAt - (world.time - this.boss.bornAt))), progress: Math.round((this.boss.hp / this.boss.stats.maxHp) * 100) / 100, ...(this.boss.enraged ? { enraged: true } : {}) };
  }
}

// ─── Old Wick's cart ──────────────────────────────────────────────────────────

/**
 * The escort: the cart starts in the middle of its path. Champions standing by it push it toward their
 * own end; with both teams there it goes nowhere. The team whose end it reaches gets paid.
 */
export class EscortEvent {
  readonly kind = 'escort';
  readonly name = EVENT_NAMES.escort;
  readonly path: Vec2[];
  readonly length: number;
  /** How far along the path from blue's end. */
  progress: number;
  pos: Vec2;
  /** Who's pushing it right now, and how many of each side are by it. */
  pushing: PlayerTeam | null = null;
  pushers: Record<PlayerTeam, number> = { 1: 0, 2: 0 };
  winner: PlayerTeam | null = null;
  readonly startedAt: number;

  constructor(world: World, readonly site: EventSite) {
    this.path = site.path && site.path.length >= 2 ? site.path : [site.pos, site.pos];
    this.length = this.path.reduce((sum, p, i) => (i ? sum + dist(this.path[i - 1], p) : 0), 0);
    this.progress = this.length ? progressAlong(this.path, site.pos) : 0;
    this.pos = pointAlong(this.path, this.progress);
    this.startedAt = world.time;
  }

  /** Each team's end of the path. */
  end(team: PlayerTeam): Vec2 {
    return team === TEAM.blue ? this.path[0] : this.path[this.path.length - 1];
  }

  update(world: World): boolean {
    const near: Record<PlayerTeam, number> = { 1: 0, 2: 0 };
    for (const u of world.units()) {
      if (u.kind !== 'champion' || !u.isTargetable() || dist(u.pos, this.pos) > CART.pushRadius) continue;
      if (u.team === TEAM.blue || u.team === TEAM.red) near[u.team]++;
    }
    this.pushers = near;
    const dir = near[1] > near[2] ? -1 : near[2] > near[1] ? 1 : 0;
    this.pushing = dir < 0 ? TEAM.blue : dir > 0 ? TEAM.red : null;
    if (dir && this.length) {
      this.progress = clamp(this.progress + dir * CART.speed * DT, 0, this.length);
      this.pos = pointAlong(this.path, this.progress);
    }
    if (this.length && (this.progress <= 0 || this.progress >= this.length)) {
      this.winner = this.progress <= 0 ? TEAM.blue : TEAM.red;
      payTeam(world, this.winner, CART.reward, 'wicksFavor');
      cue(world, 'won', 'escort', this.pos, { team: this.winner, all: true });
      return true;
    }
    if (world.time - this.startedAt >= CART.timeout) {
      // Broke down for good: whichever side it's on gets a little something (dead center, nobody).
      const off = this.progress - this.length / 2;
      const side = off < -1 ? TEAM.blue : off > 1 ? TEAM.red : null;
      if (side) payTeam(world, side, { gold: CART.partial, xp: 0 }, null);
      this.winner = side;
      cue(world, 'over', 'escort', this.pos, { ...(side ? { team: side } : {}), all: true });
      return true;
    }
    return false;
  }

  cancel(): void {}

  status(world: World): Pick<EventStatus, 'left' | 'progress' | 'blue' | 'red' | 'team'> {
    return {
      left: Math.max(0, Math.ceil(CART.timeout - (world.time - this.startedAt))),
      progress: this.length ? Math.round((this.progress / this.length) * 1000) / 1000 : 0.5,
      blue: this.pushers[1],
      red: this.pushers[2],
      ...(this.pushing ? { team: this.pushing } : {}),
    };
  }
}

// ─── The Royal Tax Stall ──────────────────────────────────────────────────────

/**
 * King of the hill: a team alone in the circle fills its bar (and drains the other's); both in it and
 * nothing moves. Every second held pays the holders a little on the spot; the first full bar takes the lot.
 */
export class CaptureEvent {
  readonly kind = 'capture';
  readonly name = EVENT_NAMES.capture;
  readonly pos: Vec2;
  bars: Record<PlayerTeam, number> = { 1: 0, 2: 0 };
  holder: PlayerTeam | null = null;
  winner: PlayerTeam | null = null;
  readonly startedAt: number;

  constructor(world: World, readonly site: EventSite) {
    this.pos = { ...site.pos };
    this.startedAt = world.time;
  }

  update(world: World): boolean {
    const inside: Record<PlayerTeam, Champion[]> = { 1: [], 2: [] };
    for (const u of world.units()) {
      if (!(u instanceof Champion) || !u.isTargetable() || dist(u.pos, this.pos) > STALL.radius) continue;
      if (u.team === TEAM.blue || u.team === TEAM.red) inside[u.team].push(u);
    }
    const holder = inside[1].length && !inside[2].length ? TEAM.blue : inside[2].length && !inside[1].length ? TEAM.red : null;
    this.holder = holder;
    if (holder) {
      const other = holder === TEAM.blue ? TEAM.red : TEAM.blue;
      this.bars[holder] = Math.min(1, this.bars[holder] + DT / STALL.fillTime);
      this.bars[other] = Math.max(0, this.bars[other] - (DT * STALL.drain) / STALL.fillTime);
      if (world.tick % TICK_RATE === 0) {
        for (const c of inside[holder]) c.gainGold(world, STALL.holdGold);
        cue(world, 'collect', 'capture', this.pos, { team: holder });
      }
      if (this.bars[holder] >= 1) return this.finish(world, holder);
    }
    if (world.time - this.startedAt >= STALL.timeout) {
      // The collector packs up: the team further along takes it, if it got anywhere.
      const lead = this.bars[1] > this.bars[2] ? TEAM.blue : this.bars[2] > this.bars[1] ? TEAM.red : null;
      if (lead && this.bars[lead] >= 0.5) return this.finish(world, lead);
      cue(world, 'over', 'capture', this.pos, { all: true });
      return true;
    }
    return false;
  }

  private finish(world: World, team: PlayerTeam): boolean {
    this.winner = team;
    payTeam(world, team, STALL.reward, 'royalFavor');
    cue(world, 'won', 'capture', this.pos, { team, all: true });
    return true;
  }

  cancel(): void {}

  status(world: World): Pick<EventStatus, 'left' | 'blue' | 'red' | 'team'> {
    return {
      left: Math.max(0, Math.ceil(STALL.timeout - (world.time - this.startedAt))),
      blue: Math.round(this.bars[1] * 100) / 100,
      red: Math.round(this.bars[2] * 100) / 100,
      ...(this.holder ? { team: this.holder } : {}),
    };
  }
}
