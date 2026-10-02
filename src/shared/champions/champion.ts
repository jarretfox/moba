import { DT, type PlayerTeam, type Slot } from '../constants';
import { add, angleOf, dirTo, dist, fromAngle, scale, sub, type Vec2 } from '../math';
import { ACTIVES, AEGIS_WARD, BLOODFILL, DRUM_BEAT, HAMHOCK, HAT_AP, INVENTORY_SLOTS, LANTERN_LIGHT, MOSSHEART, PRIDE, ROT_BURN, ROYAL_PAUSE, SPELLBLADE, STATIC, SUNDER, THORNS, WADERS, WOUNDS, hasteMultiplier, partsUsed, priceFor, sellPrice, sumItemStats, whyNot, type ItemId } from '../items';
import { enemiesInRadius } from '../sim/query';
import { CAST_QUEUE, type DamageType } from '../protocol';
import { Ward } from '../sim/ward';
import type { AbilitySnap, BuffKind, EntitySnap, MeSnap } from '../protocol';
import { FOUNTAIN_RADIUS } from '../sim/fountain';
import { BUFFS, EMBER, GLOWCAP } from '../sim/jungle';
import { applyEventBuffs } from '../sim/eventBuffs';
import { MAX_LEVEL, PASSIVE_GOLD, STARTING_GOLD, WANTED_STREAK, canRankUp, killBounty, xpToNext } from '../sim/progression';
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
/** Seconds a recall takes. */
export const RECALL_TIME = 4;
/** Death timers grow with level, like League's: early deaths cost little, late ones let the enemy push and finish. */
const RESPAWN = { base: 5, perLevel: 2.5 };

/** How long a champion keeps walking toward someone to cast on them before giving up. */
export const APPROACH_TIME = 4;

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
  /** The player's title, worn under their name (players only; see shared/titles.ts). */
  title?: string;
  /** Match stats for the scoreboard. */
  readonly score: Score = newScore();
  /** Up to INVENTORY_SLOTS items, in the order bought. */
  readonly items: ItemId[] = [];
  private itemStats = sumItemStats([]);
  /** Jungle buffs this champion had when it died, for whoever gets the kill. */
  lostBuffs: { kind: BuffKind; left: number }[] = [];
  /** When each item's active can next be used (match seconds). */
  private readonly itemReady: Partial<Record<ItemId, number>> = {};
  /** This visit's purchases and sales, newest last, for undoing (forgotten once you leave the shop). */
  private undoLog: ({ kind: 'buy'; item: ItemId; paid: number; parts: ItemId[] } | { kind: 'sell'; item: ItemId; got: number; slot: number })[] = [];
  private recallStartedAt: number | null = null;
  /** Item passives' bookkeeping: a Spellblade charged by the last cast (until when, and when it can next fire), */
  private spellbladeUntil = -Infinity;
  private spellbladeReadyAt = 0;
  /** basic attacks landed (Stormstring), hits in a row on each champion (Pride Longbow), */
  private attacksLanded = 0;
  private readonly prideHits = new Map<number, number>();
  /** Bloodreaver's lifesteal shield, */
  private bloodShield: { amount: number; until: number } | null = null;
  /** and who's burning from the Rotroot Staff, until when. */
  private readonly burning = new Map<Unit, number>();
  /** A cast pressed a moment too early (still cooling down, or mid-cast or mid-dash): it goes off when it can. */
  private queued: { slot: Slot; aim: Vec2; until: number } | null = null;
  /** A cast on someone out of reach: walking in to cast it once they're close enough. */
  private approach: { slot: Slot; targetId: number; until: number; repathAt: number } | null = null;

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
    if (!this.dead) this.followThroughCasts(world);
    super.update(world);
    if (this.undoLog.length && !this.inShop()) this.undoLog = [];
    if (!this.dead && world.time >= PASSIVE_GOLD.from) {
      this.gold += PASSIVE_GOLD.perSecond * DT * world.rates.gold;
      this.score.goldEarned += PASSIVE_GOLD.perSecond * DT * world.rates.gold;
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
    // Ogre's Hamhock: a big regen once you've been out of the fight a while.
    if (this.owns('hamhock') && world.time - this.lastDamagedAt >= HAMHOCK.calmAfter) s.hpRegen += s.maxHp * HAMHOCK.regen;
    // Rage has a fixed cap, so mana items don't raise it.
    if (this.info.resource === 'mana') s.maxMana += g.maxMana * n + it.maxMana;
    s.manaRegen += g.manaRegen * n;
    if (this.info.resource === 'mana') s.manaRegen += it.manaRegen;
    if (this.has('glowcap') && this.info.resource === 'mana') s.manaRegen += s.maxMana * GLOWCAP.manaRegenPct;
    s.ad += g.ad * n + it.ad;
    s.ap += it.ap;
    if (this.owns('hat')) s.ap *= 1 + HAT_AP;
    s.armor += g.armor * n + it.armor;
    s.mr += g.mr * n + it.mr;
    s.moveSpeed += it.moveSpeed;
    // Bonus attack speed from levels and items adds up, then multiplies the base (League's rule).
    s.attackSpeed *= 1 + g.attackSpeedPct * n + it.attackSpeedPct;
    applyEventBuffs((kind) => this.has(kind), s); // the map events' team buffs
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
    this.xp += amount * world.rates.xp;
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
    amount *= world.rates.gold;
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
    if (this.lifesteal > 0) this.lifestealHeal(world, dealt * this.lifesteal);
    if (this.has('ember') && target.isTargetable()) {
      world.damage(this, target, EMBER.damage(this.level), 'true', { proc: true });
      target.addStatus(world, 'slow', EMBER.slowFor, EMBER.slow);
    }
    this.itemsOnHit(world, target);
  }

  // ─── Item passives ────────────────────────────────────────────────────────

  owns(id: ItemId): boolean {
    return this.items.includes(id);
  }

  /** Attack damage from base and levels (what Spellblade multiplies), and the rest (items, buffs). */
  get baseAd(): number {
    return this.base.ad + this.growth.ad * (this.level - 1);
  }

  get bonusAd(): number {
    return Math.max(0, this.stats.ad - this.baseAd);
  }

  /** Health from items and buffs. */
  get bonusHp(): number {
    return Math.max(0, this.stats.maxHp - (this.base.maxHp + this.growth.maxHp * (this.level - 1)));
  }

  get bonusArmor(): number {
    return Math.max(0, this.stats.armor - (this.base.armor + this.growth.armor * (this.level - 1)));
  }

  protected itemTenacity(): number {
    return this.owns('waders') ? WADERS : 0;
  }

  healScale(): number {
    return super.healScale() * (this.owns('mossheart') ? 1 + MOSSHEART : 1);
  }

  shieldScale(): number {
    return this.owns('mossheart') ? 1 + MOSSHEART : 1;
  }

  /** Lifesteal; past full health, the Bloodreaver banks it as a shield. */
  private lifestealHeal(world: World, amount: number): void {
    const room = this.stats.maxHp - this.hp;
    this.heal(world, amount, true);
    const spare = amount * this.healScale() - Math.max(0, room);
    if (!this.owns('reaver') || spare <= 0 || this.dead) return;
    const cap = BLOODFILL.base + BLOODFILL.perLevel * this.level;
    if (this.bloodShield && this.bloodShield.amount > 0 && this.bloodShield.until > world.time && this.shields.includes(this.bloodShield)) {
      this.bloodShield.amount = Math.min(cap, this.bloodShield.amount + spare);
      this.bloodShield.until = world.time + BLOODFILL.duration;
    } else {
      this.bloodShield = this.addShield(world, Math.min(cap, spare), BLOODFILL.duration);
    }
  }

  /** What items add to a basic attack that landed. */
  private itemsOnHit(world: World, target: Unit): void {
    const champ = target.kind === 'champion';
    this.attacksLanded++;
    // Spellblade: the best one you own, charged by your last cast.
    if (world.time <= this.spellbladeUntil && world.time >= this.spellbladeReadyAt && target.isTargetable()) {
      this.spellbladeUntil = -Infinity;
      this.spellbladeReadyAt = world.time + SPELLBLADE.cooldown;
      if (this.owns('trident')) world.damage(this, target, this.baseAd * SPELLBLADE.trident, 'physical', { proc: true });
      else if (this.owns('witchfire')) world.damage(this, target, this.baseAd * SPELLBLADE.witchfire.ad + this.stats.ap * SPELLBLADE.witchfire.ap, 'magic', { proc: true });
      else if (this.owns('whetstone')) world.damage(this, target, this.baseAd * SPELLBLADE.whetstone, 'physical', { proc: true });
      world.emit({ e: 'fx', fx: 'spellblade', x: Math.round(target.pos.x), y: Math.round(target.pos.y), r: target.radius, team: this.team });
    }
    if (champ && this.owns('fork')) target.addStatus(world, 'wounds', WOUNDS.duration, WOUNDS.cut);
    if (champ && this.owns('link')) target.addStatus(world, 'sundered', SUNDER.duration, Math.min(SUNDER.max, target.strongest('sundered') + SUNDER.perHit));
    if (champ && this.owns('longbow')) {
      const n = (this.prideHits.get(target.id) ?? 0) + 1;
      this.prideHits.clear();
      this.prideHits.set(target.id, n % PRIDE.every);
      if (n % PRIDE.every === 0) world.damage(this, target, PRIDE.damage + PRIDE.bonusAdRatio * this.bonusAd, 'magic', { proc: true });
    }
    // Stormstring: every fifth landed attack, lightning jumps to the target and on to others near it.
    if (this.owns('stormstring') && this.attacksLanded % STATIC.every === 0 && target.isTargetable()) {
      const hit = [target, ...enemiesInRadius(world, this.team, target.pos, STATIC.range).filter((u) => u !== target && u.kind !== 'structure').slice(0, STATIC.chains)];
      let from = this.pos;
      for (const u of hit) {
        world.emit({ e: 'fx', fx: 'static', x: Math.round(from.x), y: Math.round(from.y), x2: Math.round(u.pos.x), y2: Math.round(u.pos.y), team: this.team });
        world.damage(this, u, STATIC.damage + STATIC.bonusAdRatio * this.bonusAd, 'magic', { proc: true });
        from = u.pos;
      }
    }
  }

  /** Rotroot Staff: abilities that hurt something set it burning. */
  onDealt(world: World, target: Unit, _dealt: number, _type: DamageType, basic: boolean, proc: boolean): void {
    if (basic || proc || !this.owns('staff') || target.dead || (target.kind !== 'champion' && target.kind !== 'monster')) return;
    const was = this.burning.get(target) ?? -Infinity;
    this.burning.set(target, world.time + ROT_BURN.duration);
    target.addStatus(world, 'burning', ROT_BURN.duration);
    if (was > world.time) return; // already burning: the burn just runs longer
    const tick = () =>
      world.schedule(1, () => {
        const until = this.burning.get(target) ?? -Infinity;
        if (target.dead || until < world.time - 1e-6) return void this.burning.delete(target);
        world.damage(this, target, target.stats.maxHp * ROT_BURN.perSecond, 'magic', { proc: true });
        if (until > world.time + 1e-6) tick();
        else this.burning.delete(target);
      });
    tick();
  }

  /** Thorns: the Ironbark Vest and the Royal Plate hit back at champions who hit you. */
  onBasicHitTaken(world: World, source: Unit): void {
    if (source.kind !== 'champion' || this.dead) return;
    if (this.owns('plate')) {
      world.damage(this, source, THORNS.plate + THORNS.plateArmorRatio * this.bonusArmor, 'magic', { proc: true });
      source.addStatus(world, 'wounds', THORNS.wounds, WOUNDS.cut);
    } else if (this.owns('vest')) {
      world.damage(this, source, THORNS.vest, 'magic', { proc: true });
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
    return whyNot(this.items, this.gold, this.inShop(), id);
  }

  /** Buys `id`, using up any of its parts in the inventory (they knock their price off). */
  buy(world: World, id: ItemId): boolean {
    if (this.cantBuy(id) !== null) return false;
    const paid = priceFor(this.items, id);
    const used = partsUsed(this.items, id).sort((a, b) => b - a);
    const parts = used.map((slot) => this.items.splice(slot, 1)[0]);
    this.gold -= paid;
    this.items.push(id);
    this.undoLog.push({ kind: 'buy', item: id, paid, parts });
    this.refreshItems(world);
    return true;
  }

  /** Sell the item in inventory slot `index` for part of its price. */
  sell(world: World, index: number): boolean {
    if (!this.inShop() || !Number.isInteger(index) || index < 0 || index >= this.items.length) return false;
    const [id] = this.items.splice(index, 1);
    const got = sellPrice(id);
    this.gold += got;
    this.undoLog.push({ kind: 'sell', item: id, got, slot: index });
    this.refreshItems(world);
    return true;
  }

  /** Whether there's a purchase or sale this visit to take back. */
  get canUndo(): boolean {
    return this.undoLog.length > 0 && this.inShop();
  }

  /** Takes back the last purchase (all the gold back, and its parts) or sale, while still at the shop. */
  undo(world: World): boolean {
    const last = this.undoLog.at(-1);
    if (!last || !this.inShop()) return false;
    if (last.kind === 'buy') {
      const at = this.items.lastIndexOf(last.item);
      if (at < 0) return false;
      this.items.splice(at, 1);
      this.items.push(...last.parts);
      this.gold += last.paid;
    } else {
      if (this.items.length >= INVENTORY_SLOTS || this.gold < last.got) return false;
      this.items.splice(Math.min(last.slot, this.items.length), 0, last.item);
      this.gold -= last.got;
    }
    this.undoLog.pop();
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

  /** Uses the active of the item in inventory slot `slot` (see ACTIVES), aimed at `aim` if it needs aiming. */
  useItem(world: World, slot: number, aim: Vec2): boolean {
    const id = this.items[slot];
    const active = id ? ACTIVES[id] : undefined;
    if (!id || !active || this.dead || !this.canAct(world) || world.time < (this.itemReady[id] ?? 0)) return false;
    this.itemReady[id] = world.time + active.cooldown;
    const allies = (radius: number) => world.units().filter((u) => u.kind === 'champion' && u.team === this.team && !u.dead && dist(u.pos, this.pos) <= radius);
    switch (id) {
      case 'lantern': {
        const d = dist(this.pos, aim);
        const at = d > LANTERN_LIGHT.range ? add(this.pos, scale(dirTo(this.pos, aim), LANTERN_LIGHT.range)) : { x: aim.x, y: aim.y };
        world.add(new Ward(world, this.team, at, LANTERN_LIGHT.radius, LANTERN_LIGHT.duration, 'lantern'));
        world.emit({ e: 'fx', fx: 'lanternLight', x: Math.round(at.x), y: Math.round(at.y), x2: Math.round(this.pos.x), y2: Math.round(this.pos.y), r: LANTERN_LIGHT.radius, team: this.team });
        break;
      }
      case 'aegis':
        for (const u of allies(AEGIS_WARD.radius)) u.addShield(world, AEGIS_WARD.shield + AEGIS_WARD.maxHpShare * u.stats.maxHp, AEGIS_WARD.duration);
        world.emit({ e: 'fx', fx: 'aegisWard', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: AEGIS_WARD.radius, team: this.team });
        break;
      case 'drum':
        for (const u of allies(DRUM_BEAT.radius)) u.addStatus(world, 'speed', DRUM_BEAT.duration, DRUM_BEAT.speed);
        world.emit({ e: 'fx', fx: 'drumBeat', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: DRUM_BEAT.radius, team: this.team });
        break;
      case 'hourglass':
        // Time stops: untouchable, and stuck, until it runs out.
        this.commandStop();
        this.cancelWindup();
        this.addStatus(world, 'stasis', ROYAL_PAUSE.duration);
        world.emit({ e: 'fx', fx: 'royalPause', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: this.radius, dur: ROYAL_PAUSE.duration, team: this.team });
        break;
    }
    return true;
  }

  /** Whether the item in `slot` has an active that's ready to go. */
  canUse(world: World, slot: number): boolean {
    const id = this.items[slot];
    return !!id && !!ACTIVES[id] && world.time >= (this.itemReady[id] ?? 0);
  }

  /** Seconds until the item in each slot can be used again (0 when ready, or with no active). */
  itemCooldowns(world: World): number[] {
    return this.items.map((id) => (ACTIVES[id] ? Math.max(0, Math.round(((this.itemReady[id] ?? 0) - world.time) * 10) / 10) : 0));
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

  protected respawnDelay(world: World): number {
    return (RESPAWN.base + RESPAWN.perLevel * (this.level - 1)) * world.rates.respawn;
  }

  // ─── Casting ──────────────────────────────────────────────────────────────

  /**
   * Casts an ability at `aim` if it can go. A player's press (`press`) that's a moment early is held and
   * fires as soon as it can; one aimed at an enemy out of reach walks in to cast it; one with nobody to
   * cast it on tells the player so.
   */
  tryCast(world: World, slot: Slot, aim: Vec2, press = false): boolean {
    if (this.dead) return false;
    if (this.recast(world, slot, aim)) return true;
    const info = this.info.abilities[slot];
    const state = this.abilities[slot];
    if (state.rank <= 0) return false;
    // Too early (cooling down, or busy casting or dashing): hold it if it's nearly ready.
    const wait = Math.max(state.readyAt, this.lockedUntil, this.dash?.end ?? 0) - world.time;
    if (wait > 0 || !this.canAct(world)) {
      if (press && wait > 0 && wait <= CAST_QUEUE && !this.has('stun') && !this.has('fear') && !this.has('stasis')) {
        this.queued = { slot, aim: { ...aim }, until: world.time + wait + 0.1 };
      }
      return false;
    }
    const cost = this.costOf(slot);
    if (this.mana < cost) return false;

    const target = this.resolveAim(info.targeting, aim);
    if (!this.canCastAt(world, slot, target)) {
      if (press) {
        const victim = this.approachTarget(world, slot, aim);
        if (victim) this.walkInToCast(world, slot, victim);
        else world.emit({ e: 'castFail', src: this.id, slot, why: 'target' });
      }
      return false;
    }
    this.queued = null;
    this.approach = null;
    this.mana -= cost;
    state.readyAt = world.time + this.byRank(slot, info.cooldown) * hasteMultiplier(this.haste);
    this.cancelWindup();
    this.revealedUntil = world.time + REVEAL_TIME;
    if (dist(target, this.pos) > 1) this.facing = angleOf(sub(target, this.pos));
    world.emit({ e: 'cast', src: this.id, slot, x: Math.round(target.x), y: Math.round(target.y) });
    // A cast charges a Spellblade for the next basic attack.
    if (this.owns('whetstone') || this.owns('trident') || this.owns('witchfire')) this.spellbladeUntil = world.time + SPELLBLADE.window;
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

  /** Drops a held or walking-in cast (a new order replaces it). */
  forgetCast(): void {
    this.queued = null;
    this.approach = null;
  }

  /** The held cast fires once it can; the walk-in cast fires once its target is close enough. */
  private followThroughCasts(world: World): void {
    const q = this.queued;
    if (q) {
      if (world.time > q.until) this.queued = null;
      else if (this.tryCast(world, q.slot, q.aim, false)) return;
    }
    const a = this.approach;
    if (!a) return;
    const target = world.getUnit(a.targetId);
    if (!target || !target.isTargetable() || !world.vision.canSee(this.team, target) || world.time > a.until) {
      this.approach = null;
      return;
    }
    if (this.tryCast(world, a.slot, target.pos, false)) return;
    if (world.time >= a.repathAt && this.canMove(world)) {
      this.commandMove(world, target.pos);
      a.repathAt = world.time + 0.25;
    }
  }

  private walkInToCast(world: World, slot: Slot, target: Unit): void {
    this.queued = null;
    this.approach = { slot, targetId: target.id, until: world.time + APPROACH_TIME, repathAt: 0 };
    this.commandMove(world, target.pos);
    this.approach.repathAt = world.time + 0.25;
  }

  /**
   * For abilities cast on someone: the enemy near the cursor this cast is meant for, wherever they are,
   * so a cast out of reach walks in to them. None by default.
   */
  protected approachTarget(_world: World, _slot: Slot, _cursor: Vec2): Unit | undefined {
    return undefined;
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
      ...(this.streak >= WANTED_STREAK ? { bty: killBounty(this.streak) } : {}),
      ...(this.title ? { ttl: this.title } : {}),
      mp: Math.floor(this.mana),
      mmp: Math.round(this.stats.maxMana),
    };
    if (this.recalling) s.st = [...(s.st ?? []), 'recall'];
    return s;
  }

  meSnapshot(world: World): MeSnap {
    return {
      id: this.id,
      ...(this.queued ? { queued: this.queued.slot } : this.approach ? { queued: this.approach.slot } : {}),
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
      ...(this.canUndo ? { undo: true } : {}),
      ...(this.order.kind === 'attack' ? { tgt: this.order.targetId } : {}),
      ...(this.items.some((id) => ACTIVES[id]) ? { itemCd: this.itemCooldowns(world) } : {}),
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
        range: Math.round(this.stats.attackRange),
        bad: Math.round(this.bonusAd),
        bhp: Math.round(this.bonusHp),
      },
    };
  }
}
