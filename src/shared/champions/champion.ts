import { DT, type PlayerTeam, type Slot } from '../constants';
import { add, angleOf, dirTo, dist, fromAngle, scale, sub, type Vec2 } from '../math';
import type { EntitySnap, MeSnap } from '../protocol';
import { MAX_LEVEL, PASSIVE_GOLD, STARTING_GOLD, canRankUp, xpToNext } from '../sim/progression';
import { REVEAL_TIME, Unit, type Stats } from '../sim/unit';
import type { World } from '../sim/world';
import type { ChampionInfo, StatGrowth, Targeting } from './types';

interface AbilityState {
  /** 0 until the ability is learned. */
  rank: number;
  readyAt: number;
}

/** Seconds of standing still to teleport home. Taking damage, a stun, or any other order breaks it. */
const RECALL_TIME = 4;
/** Death timers grow with level, like League's: early deaths cost little, late ones let the enemy push and finish. */
const RESPAWN = { base: 5, perLevel: 2.5 };

/**
 * Plumbing every champion shares: levels and gold, the cast pipeline (checks, cost, cooldown, cast
 * time), and Recall. Each champion subclass hand-codes what its abilities actually do in onCast.
 */
export abstract class Champion extends Unit {
  readonly kind = 'champion';
  abstract readonly info: ChampionInfo;
  readonly abilities: AbilityState[] = [0, 1, 2, 3].map(() => ({ rank: 0, readyAt: 0 }));
  level = 1;
  /** Experience toward the next level. */
  xp = 0;
  skillPoints = 1;
  gold = STARTING_GOLD;
  /** Kills without dying; raises the bounty on your head. */
  streak = 0;
  private recallStartedAt: number | null = null;

  constructor(
    world: World,
    team: PlayerTeam,
    radius: number,
    base: Stats,
    private readonly growth: StatGrowth,
    name: string,
  ) {
    super(world.newId(), team, world.map.spawns[team], radius, base, name);
  }

  update(world: World): void {
    super.update(world);
    if (!this.dead && world.time >= PASSIVE_GOLD.from) this.gold += PASSIVE_GOLD.perSecond * DT;
    if (this.recallStartedAt === null) return;
    if (this.dead || this.has('stun') || this.lastDamagedAt >= this.recallStartedAt) {
      this.recallStartedAt = null;
    } else if (world.time - this.recallStartedAt >= RECALL_TIME) {
      this.recallStartedAt = null;
      const from = { ...this.pos };
      this.pos = { ...this.spawnPos };
      this.commandStop();
      world.emit({ e: 'fx', fx: 'recall', x: from.x, y: from.y, x2: this.pos.x, y2: this.pos.y, team: this.team });
    }
  }

  // ─── Levels and gold ──────────────────────────────────────────────────────

  /** Base stats plus what each level beyond the first adds. Subclasses layer their buffs on top. */
  protected computeStats(world: World): Stats {
    const s = super.computeStats(world);
    const n = this.level - 1;
    const g = this.growth;
    s.maxHp += g.maxHp * n;
    s.hpRegen += g.hpRegen * n;
    s.maxMana += g.maxMana * n;
    s.manaRegen += g.manaRegen * n;
    s.ad += g.ad * n;
    s.armor += g.armor * n;
    s.mr += g.mr * n;
    s.attackSpeed *= 1 + g.attackSpeedPct * n;
    return s;
  }

  gainXp(world: World, amount: number): void {
    if (this.level >= MAX_LEVEL) return;
    this.xp += amount;
    while (this.level < MAX_LEVEL && this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      const before = this.computeStats(world);
      this.level++;
      this.skillPoints++;
      const after = this.computeStats(world);
      // Levelling up grants the new maximums' extra health and mana straight away.
      this.hp += after.maxHp - before.maxHp;
      if (this.info.resource === 'mana') this.mana += after.maxMana - before.maxMana;
      this.stats = after;
      world.emit({ e: 'level', id: this.id, level: this.level });
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
  }

  gainGold(world: World, amount: number): void {
    if (amount <= 0) return;
    this.gold += amount;
    world.emit({ e: 'gold', id: this.id, amount: Math.round(amount) });
  }

  /** Spend a skill point on an ability, if the rules allow. */
  rankUp(slot: Slot): boolean {
    const a = this.abilities[slot];
    if (this.skillPoints <= 0 || !canRankUp(slot, a.rank, this.level)) return false;
    a.rank++;
    this.skillPoints--;
    return true;
  }

  /** Resource cost of an ability at its current rank. */
  costOf(slot: Slot): number {
    return this.byRank(slot, this.info.abilities[slot].cost);
  }

  /** The current rank's value from a per-rank table (rank 1 if not learned yet, for tooltips and safety). */
  protected byRank<T>(slot: Slot, values: readonly T[]): T {
    return values[Math.min(values.length - 1, Math.max(0, this.abilities[slot].rank - 1))];
  }

  // ─── Recall ───────────────────────────────────────────────────────────────

  get recalling(): boolean {
    return this.recallStartedAt !== null;
  }

  startRecall(world: World): void {
    if (this.dead || this.recalling || !this.canAct(world)) return;
    this.commandStop();
    this.recallStartedAt = world.time;
  }

  cancelRecall(): void {
    this.recallStartedAt = null;
  }

  protected respawnDelay(): number {
    return RESPAWN.base + RESPAWN.perLevel * (this.level - 1);
  }

  // ─── Casting ──────────────────────────────────────────────────────────────

  tryCast(world: World, slot: Slot, aim: Vec2): boolean {
    if (this.dead || !this.canAct(world)) return false;
    const info = this.info.abilities[slot];
    const state = this.abilities[slot];
    if (state.rank <= 0 || world.time < state.readyAt) return false;
    const cost = this.costOf(slot);
    if (this.mana < cost) return false;

    const target = this.resolveAim(info.targeting, aim);
    this.mana -= cost;
    state.readyAt = world.time + this.byRank(slot, info.cooldown);
    this.cancelWindup();
    this.revealedUntil = world.time + REVEAL_TIME;
    if (dist(target, this.pos) > 1) this.facing = angleOf(sub(target, this.pos));
    world.emit({ e: 'cast', src: this.id, slot, x: Math.round(target.x), y: Math.round(target.y) });
    this.onCastStart(world, slot, target);

    if (info.castTime > 0) {
      this.lockedUntil = world.time + info.castTime;
      world.schedule(info.castTime, () => {
        if (!this.dead && !this.has('stun')) this.onCast(world, slot, target);
      });
    } else {
      this.onCast(world, slot, target);
    }
    return true;
  }

  /** Turns the raw cursor position into the point the ability uses. */
  private resolveAim(t: Targeting, aim: Vec2): Vec2 {
    if (t.kind === 'self') return { ...this.pos };
    const d = dist(this.pos, aim);
    if (d < 1) return add(this.pos, fromAngle(this.facing)); // cursor on top of us: use facing
    if (t.kind === 'point' && d > t.range) return add(this.pos, scale(dirTo(this.pos, aim), t.range));
    return { x: aim.x, y: aim.y };
  }

  /** Fires the moment a cast begins — telegraphs, wind-up effects. */
  protected onCastStart(_world: World, _slot: Slot, _aim: Vec2): void {}

  /** Fires when the cast time finishes: the ability's actual effect. */
  protected abstract onCast(world: World, slot: Slot, aim: Vec2): void;

  snapshot(world: World): EntitySnap {
    const s: EntitySnap = {
      ...super.snapshot(world),
      champ: this.info.id,
      lv: this.level,
      mp: Math.floor(this.mana),
      mmp: Math.round(this.stats.maxMana),
    };
    if (this.recalling) s.st = [...(s.st ?? []), 'recall'];
    return s;
  }

  meSnapshot(world: World): MeSnap {
    return {
      id: this.id,
      abilities: this.abilities.map((a) => ({ rank: a.rank, cd: Math.max(0, Math.round((a.readyAt - world.time) * 10) / 10) })),
      passiveStacks: 0,
      empowered: false,
      respawnIn: this.dead ? Math.max(0, this.respawnAt - world.time) : 0,
      level: this.level,
      xp: Math.floor(this.xp),
      xpNext: this.level >= MAX_LEVEL ? 0 : xpToNext(this.level),
      points: this.skillPoints,
      gold: Math.floor(this.gold),
    };
  }
}
