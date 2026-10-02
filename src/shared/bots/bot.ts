import type { Champion } from '../champions/champion';
import { DT, TEAM, type PlayerTeam, type Slot } from '../constants';
import { lanePath, type Lane } from '../map/mapData';
import { dist, type Vec2 } from '../math';
import type { Command } from '../protocol';
import { Chud } from '../sim/chud';
import { applyCommand } from '../sim/commands';
import { FOUNTAIN_RADIUS } from '../sim/fountain';
import { canRankUp } from '../sim/progression';
import { STRUCTURE_DEFS, Structure, isShootie } from '../sim/structure';
import type { Unit } from '../sim/unit';
import { mitigate, type World } from '../sim/world';
import { pointAlong, progressAlong } from './lanes';
import { PROFILES, type BotContext } from './profiles';
import { nextPurchase } from './shopping';
import { Crab } from '../sim/crab';

// ─── Tuning: a "decent new player" ────────────────────────────────────────────

/** Seconds between decisions — roughly a human's reaction time. */
const THINK_INTERVAL = 0.2;
/** Head home below this share of health... */
const RETREAT_HP = 0.25;
/** ...or below this one with an enemy champion nearby. */
const RETREAT_HP_UNDER_PRESSURE = 0.35;
/** Back to lane once healed this far. */
const HEALED = 0.9;
/** Enemy champions closer than this are "around". */
const THREAT_RANGE = 900;
/** Only start fights with champions this close. */
const ENGAGE_RANGE = 700;
/** Stand this far behind the front of our own wave: ranged champions hang back, melee ones stay in reach. */
const BEHIND_WAVE = { ranged: 250, melee: 80 };
/** Step this far out of position to take a last hit. */
const LAST_HIT_STRETCH = 300;
/** Keep this much extra distance from an enemy Shootie's reach. */
const TOWER_MARGIN = 80;
/** Allied Chuds that must be tanking an enemy Shootie before we walk under it. */
const MIN_TOWER_COVER = 2;
/** Trading near this many enemy Chuds costs too much health (they switch to you). */
const CHUD_AGGRO_LIMIT = 4;
/** Don't reissue a move unless the destination has shifted this far. */
const MOVE_RESEND = 60;
/** From here on a team's bots stop holding their own lanes and push one lane together, to close the game out. */
export const GROUP_UP_AT = 18 * 60;
/** Head home to shop once there's this much gold to spend (and it buys the next item). */
const SHOPPING_TRIP = 900;

/**
 * Runs a tick of bot decisions. Every bot decides from the same world state before any orders go in,
 * since casts land the moment they're applied. Otherwise bots deciding later in the tick would see the
 * earlier ones' casts and react to them first. Which team's orders go in first alternates each tick.
 */
export function runBots(world: World, bots: readonly Bot[]): void {
  const orders = bots.map((bot) => ({ bot, cmds: bot.think(world) }));
  const leader = world.tick % 2 === 0 ? TEAM.blue : TEAM.red;
  orders.sort((a, b) => Number(b.bot.champion.team === leader) - Number(a.bot.champion.team === leader));
  for (const { bot, cmds } of orders) for (const cmd of cmds) applyCommand(world, bot.champion, cmd);
}

/**
 * Plays one champion through the same commands a human sends. It farms its lane from behind its own
 * wave, last-hits, won't walk under an enemy Shootie without Chuds to tank it, trades when it's ahead,
 * and goes home to heal when it's low. It only knows what its team can see. It doesn't dodge skillshots or plan ganks.
 */
export class Bot {
  private state: 'lane' | 'retreat' = 'lane';
  private nextThinkAt: number;
  private lastMove: Vec2 | null = null;
  /** The lane being played right now: the assigned one, or the team's push lane late in the game. */
  private current: Lane;
  private route: Vec2[];
  private readonly home: Vec2;

  constructor(
    readonly champion: Champion,
    readonly lane: Lane,
    world: World,
  ) {
    const team = champion.team as PlayerTeam;
    this.current = lane;
    this.route = lanePath(world.map, team, lane);
    this.home = world.map.spawns[team];
    // Stagger bots so they don't all think on the same tick.
    this.nextThinkAt = (champion.id % Math.round(THINK_INTERVAL / DT)) * DT;
  }

  think(world: World): Command[] {
    if (world.time < this.nextThinkAt) return [];
    this.nextThinkAt = world.time + THINK_INTERVAL;
    const out: Command[] = [];
    const levelUp = this.pickSkill();
    if (levelUp !== null) out.push({ k: 'levelUp', slot: levelUp });
    this.shop(out);
    this.followTeam(world);
    if (this.champion.dead) {
      this.state = 'lane';
      this.lastMove = null;
      return out;
    }
    this.decide(world, out);
    return out;
  }

  private followTeam(world: World): void {
    const team = this.champion.team as PlayerTeam;
    const lane = world.time >= GROUP_UP_AT ? pushLane(world, team) : this.lane;
    if (lane === this.current) return;
    this.current = lane;
    this.route = lanePath(world.map, team, lane);
    this.lastMove = null;
  }

  /** Ultimate whenever allowed, otherwise the champion's preferred basic ability order. */
  private pickSkill(): Slot | null {
    const me = this.champion;
    if (me.skillPoints <= 0) return null;
    const order: Slot[] = [3, ...PROFILES[me.info.id].skillOrder];
    return order.find((slot) => canRankUp(slot, me.abilities[slot].rank, me.level)) ?? null;
  }

  /** Buys the next item on the build whenever the shop is open to us and we can afford it. */
  private shop(out: Command[]): void {
    const me = this.champion;
    if (!me.inShop()) return;
    const plan = nextPurchase(PROFILES[me.info.id].build, me.items);
    if (!plan || me.gold < plan.net) return;
    for (const slot of plan.sell) out.push({ k: 'sell', slot });
    out.push({ k: 'buy', item: plan.item });
  }

  /** A full purse that buys the next item: time to go home and spend it. */
  private wantsToShop(): boolean {
    const me = this.champion;
    const plan = nextPurchase(PROFILES[me.info.id].build, me.items);
    return plan !== null && me.gold >= SHOPPING_TRIP && me.gold >= plan.net;
  }

  private decide(world: World, out: Command[]): void {
    const me = this.champion;
    const hp = me.hp / me.stats.maxHp;
    const foes = world
      .units()
      .filter((u) => u.kind === 'champion' && u.team !== me.team && u.isTargetable() && dist(u.pos, me.pos) < THREAT_RANGE && world.vision.canSee(me.team, u))
      .sort((a, b) => dist(a.pos, me.pos) - dist(b.pos, me.pos));
    const nearest = foes[0];

    // Never stand in a Shootie's fire.
    if (this.shootieShootingMe(world)) return this.moveTo(out, this.stepBack(400));

    if (hp < RETREAT_HP || (nearest && hp < RETREAT_HP_UNDER_PRESSURE) || (!nearest && this.wantsToShop())) this.state = 'retreat';
    if (this.state === 'retreat') return this.retreat(world, out, hp, nearest);

    if (nearest && this.shouldFight(world, nearest, hp)) return this.fight(world, out, nearest);

    // A Sewer Crab close by with nobody around to contest it: take it.
    const crab = !nearest && hp > 0.5 ? world.units().find((u) => u instanceof Crab && !u.dead && dist(u.pos, me.pos) < 900) : undefined;
    if (crab) return this.attack(out, crab);

    // Being hit by a champion we don't want to fight: give ground.
    const hitBy = foes.find((f) => (me.championHits.get(f.id) ?? -Infinity) > world.time - 1);
    if (hitBy) return this.moveTo(out, this.stepBack(350));

    this.farm(world, out);
  }

  // ─── Going home ───────────────────────────────────────────────────────────

  private retreat(world: World, out: Command[], hp: number, nearest: Unit | undefined): void {
    const me = this.champion;
    if (dist(me.pos, this.home) < FOUNTAIN_RADIUS * 0.8) {
      const manaOk = me.info.resource !== 'mana' || me.mana >= me.stats.maxMana * HEALED;
      if (hp >= HEALED && manaOk) this.state = 'lane';
      return;
    }
    const chased = nearest !== undefined && dist(nearest.pos, me.pos) < 1200;
    const hurtLately = world.time - me.lastDamagedAt < 1.5;
    if (!chased && !hurtLately) {
      if (!me.recalling) {
        out.push({ k: 'recall' });
        this.lastMove = null;
      }
      return;
    }
    if (nearest) {
      const escape = PROFILES[me.info.id].escape(this.ctx(world), nearest);
      if (escape) out.push(escape);
      this.useItems(world, out, nearest, hp, true);
    }
    this.moveTo(out, this.home);
  }

  // ─── Fighting champions ───────────────────────────────────────────────────

  private shouldFight(world: World, foe: Unit, hp: number): boolean {
    const me = this.champion;
    if (dist(me.pos, foe.pos) > ENGAGE_RANGE) return false;
    if (this.unsafe(world, foe.pos)) return false; // no tower dives
    const theirHp = foe.hp / foe.stats.maxHp;
    const enemyChudsNear = this.enemyChuds(world).filter((c) => dist(c.pos, me.pos) < 500).length;
    if (enemyChudsNear >= CHUD_AGGRO_LIMIT && hp < 0.7 && theirHp > 0.3) return false;
    return theirHp < 0.35 || hp >= theirHp - 0.05;
  }

  private fight(world: World, out: Command[], foe: Unit): void {
    const spell = PROFILES[this.champion.info.id].fight(this.ctx(world), foe);
    if (spell) out.push(spell);
    this.useItems(world, out, foe, this.champion.hp / this.champion.stats.maxHp, false);
    out.push({ k: 'attack', target: foe.id });
    this.lastMove = null;
  }

  /** Item actives: the Aegis's ward when a fight turns against us, the Drum to run someone down or to get away. (The Lantern is left to people.) */
  private useItems(world: World, out: Command[], foe: Unit, hp: number, fleeing: boolean): void {
    const me = this.champion;
    me.items.forEach((id, slot) => {
      if (!me.canUse(world, slot)) return;
      const use = (): void => void out.push({ k: 'use', slot, x: Math.round(foe.pos.x), y: Math.round(foe.pos.y) });
      if (id === 'aegis' && hp < 0.45 && dist(foe.pos, me.pos) < 700) use();
      else if (id === 'drum' && (fleeing || dist(foe.pos, me.pos) > me.stats.attackRange + 150)) use();
    });
  }

  // ─── Laning ───────────────────────────────────────────────────────────────

  private farm(world: World, out: Command[]): void {
    const me = this.champion;
    const chuds = this.enemyChuds(world).filter((c) => dist(c.pos, me.pos) < 900 && !this.unsafe(world, c.pos));
    const inReach = chuds.filter((c) => dist(c.pos, me.pos) <= me.stats.attackRange + me.radius + c.radius + 150);

    // Last hits first: whatever our next hit would kill, even if we have to step in for it.
    const lastHit = chuds
      .filter((c) => c.hp <= mitigate(me.stats.ad, c.stats.armor) && dist(c.pos, me.pos) <= me.stats.attackRange + me.radius + c.radius + LAST_HIT_STRETCH)
      .sort((a, b) => a.hp - b.hp)[0];
    if (lastHit) return this.attack(out, lastHit);

    const spell = PROFILES[me.info.id].farm?.(this.ctx(world), chuds);
    if (spell) out.push(spell);

    // Hit a structure whenever our Chuds are soaking its shots and no enemy champion is around to punish it.
    const noFoes = !world.units().some((u) => u.kind === 'champion' && u.team !== me.team && u.isTargetable() && dist(u.pos, me.pos) < 1000 && world.vision.canSee(me.team, u));
    const structure = world
      .units()
      .find(
        (u): u is Structure =>
          u instanceof Structure &&
          u.team !== me.team &&
          u.isTargetable() &&
          dist(u.pos, me.pos) <= me.stats.attackRange + me.radius + u.radius + 200 &&
          !this.unsafe(world, u.pos),
      );
    if (structure && noFoes) return this.attack(out, structure);

    // Our wave is fighting theirs: help it along.
    const wave = this.allyChuds(world).filter((c) => dist(c.pos, me.pos) < 800);
    if (wave.length && inReach.length) return this.attack(out, inReach.sort((a, b) => a.hp - b.hp)[0]);

    this.moveTo(out, this.laneAnchor(world));
  }

  /** Where to stand: a little behind the front of our wave, or at our own tower while there's no wave, never under an uncovered enemy Shootie. */
  private laneAnchor(world: World): Vec2 {
    const me = this.champion;
    const wave = this.allyChuds(world);
    let progress: number;
    if (wave.length) {
      const behind = me.stats.attackRange < 200 ? BEHIND_WAVE.melee : BEHIND_WAVE.ranged;
      progress = Math.max(...wave.map((c) => progressAlong(this.route, c.pos))) - behind;
    } else {
      const ours = this.laneStructures(world).filter((s) => s.team === me.team && !s.dead && isShootie(s.role));
      progress = ours.length ? Math.max(...ours.map((s) => progressAlong(this.route, s.pos))) - 150 : 0;
    }
    for (const s of this.enemyShooties(world)) {
      if (this.covered(world, s)) continue;
      progress = Math.min(progress, progressAlong(this.route, s.pos) - this.shootieReach(s));
    }
    return pointAlong(this.route, Math.max(0, progress));
  }

  // ─── Shootie safety ───────────────────────────────────────────────────────

  private shootieReach(s: Structure): number {
    return STRUCTURE_DEFS[s.role].stats.attackRange + s.radius + this.champion.radius + TOWER_MARGIN;
  }

  /** Allied Chuds are soaking this Shootie's shots, so we can stand under it for now. */
  private covered(world: World, s: Structure): boolean {
    const me = this.champion;
    if (s.order.kind === 'attack' && s.order.targetId === me.id) return false;
    const reach = this.shootieReach(s);
    return this.allyChuds(world).filter((c) => dist(c.pos, s.pos) <= reach).length >= MIN_TOWER_COVER;
  }

  private unsafe(world: World, p: Vec2): boolean {
    // Their fountain's platform (and whoever's standing on it) belongs to its crystal.
    const theirs = world.map.spawns[this.champion.team === TEAM.blue ? TEAM.red : TEAM.blue];
    if (dist(theirs, p) <= FOUNTAIN_RADIUS + 150) return true;
    return this.enemyShooties(world).some((s) => dist(s.pos, p) <= this.shootieReach(s) && !this.covered(world, s));
  }

  private shootieShootingMe(world: World): boolean {
    return this.enemyShooties(world).some((s) => s.order.kind === 'attack' && s.order.targetId === this.champion.id);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private stepBack(amount: number): Vec2 {
    return pointAlong(this.route, progressAlong(this.route, this.champion.pos) - amount);
  }

  private attack(out: Command[], target: Unit): void {
    out.push({ k: 'attack', target: target.id });
    this.lastMove = null;
  }

  private moveTo(out: Command[], p: Vec2): void {
    const me = this.champion;
    if (dist(me.pos, p) < 30) return;
    if (this.lastMove && dist(this.lastMove, p) < MOVE_RESEND && me.order.kind === 'move') return;
    out.push({ k: 'move', x: Math.round(p.x), y: Math.round(p.y) });
    this.lastMove = p;
  }

  private ctx(world: World): BotContext {
    return { world, me: this.champion, home: this.home };
  }

  private enemyChuds(world: World): Chud[] {
    return world.units().filter((u): u is Chud => u instanceof Chud && u.team !== this.champion.team && u.isTargetable() && world.vision.canSee(this.champion.team, u));
  }

  private allyChuds(world: World): Chud[] {
    return world.units().filter((u): u is Chud => u instanceof Chud && u.team === this.champion.team && u.lane === this.current && !u.dead);
  }

  private laneStructures(world: World): Structure[] {
    return world.units().filter((u): u is Structure => u instanceof Structure && (u.lane === this.current || u.lane === null));
  }

  private enemyShooties(world: World): Structure[] {
    return this.laneStructures(world).filter((s) => s.team !== this.champion.team && !s.dead && isShootie(s.role));
  }
}

/** Each team's current push lane, per match, so all its bots agree and don't flip back and forth. */
const pushLanes = new WeakMap<World, Partial<Record<PlayerTeam, Lane>>>();

/**
 * Where a team's bots push together late in the game: the lane where the enemy has the least left
 * standing (each structure counts 1, plus its share of health left). They only switch lanes once the
 * other one is better by a whole structure.
 */
export function pushLane(world: World, team: PlayerTeam): Lane {
  const left = (lane: Lane) =>
    world
      .units()
      .filter((u): u is Structure => u instanceof Structure && u.team !== team && u.lane === lane && !u.dead)
      .reduce((sum, s) => sum + 1 + s.hp / s.stats.maxHp, 0);
  let memo = pushLanes.get(world);
  if (!memo) pushLanes.set(world, (memo = {}));
  const best: Lane = left('top') < left('bot') ? 'top' : 'bot';
  const current = memo[team];
  if (!current || left(best) <= left(current) - 1) memo[team] = best;
  return memo[team]!;
}
