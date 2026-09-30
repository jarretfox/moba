import type { Champion } from '../champions/champion';
import { DT, type PlayerTeam, type Slot } from '../constants';
import { lanePath, type Lane } from '../map/mapData';
import { dist, type Vec2 } from '../math';
import type { Command } from '../protocol';
import { Chud } from '../sim/chud';
import { FOUNTAIN_RADIUS } from '../sim/fountain';
import { canRankUp } from '../sim/progression';
import { STRUCTURE_DEFS, Structure, isShootie } from '../sim/structure';
import type { Unit } from '../sim/unit';
import { mitigate, type World } from '../sim/world';
import { pointAlong, progressAlong } from './lanes';
import { PROFILES, type BotContext } from './profiles';

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

/**
 * Plays one champion through the same commands a human sends. It farms its lane from behind its own
 * wave, last-hits, won't walk under an enemy Shootie without Chuds to tank it, trades when it's ahead,
 * and goes home to heal when it's low. It only knows what its team can see. It doesn't dodge skillshots or plan ganks.
 */
export class Bot {
  private state: 'lane' | 'retreat' = 'lane';
  private nextThinkAt: number;
  private lastMove: Vec2 | null = null;
  private readonly route: Vec2[];
  private readonly home: Vec2;

  constructor(
    readonly champion: Champion,
    readonly lane: Lane,
    world: World,
  ) {
    const team = champion.team as PlayerTeam;
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
    if (this.champion.dead) {
      this.state = 'lane';
      this.lastMove = null;
      return out;
    }
    this.decide(world, out);
    return out;
  }

  /** Ultimate whenever allowed, otherwise the champion's preferred basic ability order. */
  private pickSkill(): Slot | null {
    const me = this.champion;
    if (me.skillPoints <= 0) return null;
    const order: Slot[] = [3, ...PROFILES[me.info.id].skillOrder];
    return order.find((slot) => canRankUp(slot, me.abilities[slot].rank, me.level)) ?? null;
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

    if (hp < RETREAT_HP || (nearest && hp < RETREAT_HP_UNDER_PRESSURE)) this.state = 'retreat';
    if (this.state === 'retreat') return this.retreat(world, out, hp, nearest);

    if (nearest && this.shouldFight(world, nearest, hp)) return this.fight(world, out, nearest);

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
    out.push({ k: 'attack', target: foe.id });
    this.lastMove = null;
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
    return world.units().filter((u): u is Chud => u instanceof Chud && u.team === this.champion.team && u.lane === this.lane && !u.dead);
  }

  private laneStructures(world: World): Structure[] {
    return world.units().filter((u): u is Structure => u instanceof Structure && (u.lane === this.lane || u.lane === null));
  }

  private enemyShooties(world: World): Structure[] {
    return this.laneStructures(world).filter((s) => s.team !== this.champion.team && !s.dead && isShootie(s.role));
  }
}
