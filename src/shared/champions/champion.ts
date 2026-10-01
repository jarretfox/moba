import { DT, type PlayerTeam, type Slot } from '../constants';
import { add, angleOf, dirTo, dist, fromAngle, scale, sub, type Vec2 } from '../math';
import { INVENTORY_SLOTS, ITEMS, conflicts, hasteMultiplier, sellPrice, sumItemStats, type ItemId } from '../items';
import type { AbilitySnap, BuffKind, EntitySnap, MeSnap } from '../protocol';
import { FOUNTAIN_RADIUS } from '../sim/fountain';
import { BUFFS, EMBER, GLOWCAP } from '../sim/jungle';
import { MAX_LEVEL, PASSIVE_GOLD, STARTING_GOLD, canRankUp, xpToNext } from '../sim/progression';
import { newScore, type Score } from '../sim/score';
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
  /** Which look this champion wears (cosmetic; 0 is the classic one). */
  skin = 0;
  /** Match stats for the scoreboard. */
  readonly score: Score = newScore();
  /** Up to INVENTORY_SLOTS items, in the order bought. */
  readonly items: ItemId[] = [];
  private itemStats = sumItemStats([]);
  /** Jungle buffs this champion had when it died, for whoever gets the kill. */
  lostBuffs: { kind: BuffKind; left: number }[] = [];
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
    if (!this.dead && world.time >= PASSIVE_GOLD.from) {
      this.gold += PASSIVE_GOLD.perSecond * DT;
      this.score.goldEarned += PASSIVE_GOLD.perSecond * DT;
    }
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

  /** Base stats plus what each level beyond the first adds, plus items. Subclasses layer their buffs on top. */
  protected computeStats(world: World): Stats {
    const s = super.computeStats(world);
    const n = this.level - 1;
    const g = this.growth;
    const it = this.itemStats;
    s.maxHp += g.maxHp * n + it.maxHp;
    s.hpRegen += g.hpRegen * n + it.hpRegen;
    // Rage has a fixed cap, so mana items don't raise it.
    if (this.info.resource === 'mana') s.maxMana += g.maxMana * n + it.maxMana;
    s.manaRegen += g.manaRegen * n;
    if (this.has('glowcap') && this.info.resource === 'mana') s.manaRegen += s.maxMana * GLOWCAP.manaRegenPct;
    s.ad += g.ad * n + it.ad;
    s.ap += it.ap;
    s.armor += g.armor * n + it.armor;
    s.mr += g.mr * n + it.mr;
    s.moveSpeed += it.moveSpeed;
    // Bonus attack speed from levels and items adds up, then multiplies the base (League's rule).
    s.attackSpeed *= 1 + g.attackSpeedPct * n + it.attackSpeedPct;
    return s;
  }

  get haste(): number {
    return this.itemStats.haste + (this.has('glowcap') ? GLOWCAP.haste : 0);
  }

  get lifesteal(): number {
    return this.itemStats.lifesteal;
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
    this.score.goldEarned += amount;
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

  onBasicHit(world: World, target: Unit, dealt: number): void {
    if (target.kind === 'structure') return;
    if (this.lifesteal > 0) this.heal(world, dealt * this.lifesteal, true);
    if (this.has('ember') && target.isTargetable()) {
      world.damage(this, target, EMBER.damage(this.level), 'true');
      target.addStatus(world, 'slow', EMBER.slowFor, EMBER.slow);
    }
  }

  // ─── Jungle buffs ─────────────────────────────────────────────────────────

  buffsLeft(world: World): { kind: BuffKind; left: number }[] {
    return (Object.keys(BUFFS) as BuffKind[]).flatMap((kind) => {
      const until = Math.max(-Infinity, ...this.statuses.filter((s) => s.kind === kind).map((s) => s.until));
      return until > world.time ? [{ kind, left: until - world.time }] : [];
    });
  }

  gainBuff(world: World, kind: BuffKind, duration = BUFFS[kind].duration): void {
    this.addStatus(world, kind, duration);
  }

  die(world: World, killer: Unit | null): void {
    this.lostBuffs = this.buffsLeft(world);
    super.die(world, killer);
  }

  // ─── Items ────────────────────────────────────────────────────────────────

  /** The shop only serves you in your own fountain, or while you're dead. */
  inShop(): boolean {
    return this.dead || dist(this.pos, this.spawnPos) <= FOUNTAIN_RADIUS;
  }

  /** Why `id` can't be bought right now, or null if it can. */
  cantBuy(id: ItemId): string | null {
    if (!this.inShop()) return 'Shop at your fountain';
    if (this.items.some((owned) => conflicts(owned, id))) return ITEMS[id].tier === 'boots' ? 'Already have boots' : 'Already owned';
    if (this.items.length >= INVENTORY_SLOTS) return 'Inventory full';
    if (this.gold < ITEMS[id].cost) return 'Not enough gold';
    return null;
  }

  buy(world: World, id: ItemId): boolean {
    if (this.cantBuy(id) !== null) return false;
    this.gold -= ITEMS[id].cost;
    this.items.push(id);
    this.refreshItems(world);
    return true;
  }

  /** Sell the item in inventory slot `index` for part of its price. */
  sell(world: World, index: number): boolean {
    if (!this.inShop() || !Number.isInteger(index) || index < 0 || index >= this.items.length) return false;
    const [id] = this.items.splice(index, 1);
    this.gold += sellPrice(id);
    this.refreshItems(world);
    return true;
  }

  private refreshItems(world: World): void {
    const before = this.stats;
    this.itemStats = sumItemStats(this.items);
    const after = this.computeStats(world);
    // Like levelling up, new health and mana come already filled; selling just caps them.
    if (!this.dead) {
      this.hp = Math.min(after.maxHp, this.hp + Math.max(0, after.maxHp - before.maxHp));
      if (this.info.resource === 'mana') this.mana = Math.min(after.maxMana, this.mana + Math.max(0, after.maxMana - before.maxMana));
    }
    this.stats = after;
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
    if (this.dead) return false;
    if (this.recast(world, slot, aim)) return true;
    if (!this.canAct(world)) return false;
    const info = this.info.abilities[slot];
    const state = this.abilities[slot];
    if (state.rank <= 0 || world.time < state.readyAt) return false;
    const cost = this.costOf(slot);
    if (this.mana < cost) return false;

    const target = this.resolveAim(info.targeting, aim);
    if (!this.canCastAt(world, slot, target)) return false;
    this.mana -= cost;
    state.readyAt = world.time + this.byRank(slot, info.cooldown) * hasteMultiplier(this.haste);
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

  /** An ally on the same team just last-hit a Chud (King Rix's Royal Tax listens for this). */
  onAllyLastHit(_world: World, _victim: Unit): void {}

  /** Two Crowns: this champion just killed their rival. */
  takeTrophy(_world: World): void {}

  /** A second press of an ability that's still active (e.g. surfacing from Burrow). True if it was handled. */
  protected recast(_world: World, _slot: Slot, _aim: Vec2): boolean {
    return false;
  }

  /** Whether the ability has something to work on at this spot (e.g. Down Below needs a victim). */
  protected canCastAt(_world: World, _slot: Slot, _aim: Vec2): boolean {
    return true;
  }

  /** A word shown on the ability's slot right now. */
  protected abilityNote(_world: World, _slot: Slot): string | undefined {
    return undefined;
  }

  /** Fires the moment a cast begins — telegraphs, wind-up effects. */
  protected onCastStart(_world: World, _slot: Slot, _aim: Vec2): void {}

  /** Fires when the cast time finishes: the ability's actual effect. */
  protected abstract onCast(world: World, slot: Slot, aim: Vec2): void;

  snapshot(world: World): EntitySnap {
    const s: EntitySnap = {
      ...super.snapshot(world),
      champ: this.info.id,
      ...(this.skin ? { skin: this.skin } : {}),
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
      abilities: this.abilities.map((a, i) => {
        const snap: AbilitySnap = { rank: a.rank, cd: Math.max(0, Math.round((a.readyAt - world.time) * 10) / 10) };
        const note = this.abilityNote(world, i as Slot);
        if (note) snap.note = note;
        return snap;
      }),
      passiveStacks: 0,
      empowered: false,
      respawnIn: this.dead ? Math.max(0, this.respawnAt - world.time) : 0,
      level: this.level,
      xp: Math.floor(this.xp),
      xpNext: this.level >= MAX_LEVEL ? 0 : xpToNext(this.level),
      points: this.skillPoints,
      gold: Math.floor(this.gold),
      items: [...this.items],
      inShop: this.inShop(),
      buffs: this.buffsLeft(world).map((b) => ({ kind: b.kind, left: Math.ceil(b.left) })),
      stats: {
        ad: Math.round(this.stats.ad),
        ap: Math.round(this.stats.ap),
        armor: Math.round(this.stats.armor),
        mr: Math.round(this.stats.mr),
        as: Math.round(this.stats.attackSpeed * 100) / 100,
        ms: Math.round(this.moveSpeed),
        haste: this.haste,
        ls: Math.round(this.lifesteal * 100),
      },
    };
  }
}
