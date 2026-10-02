import { DT, TEAM } from '../constants';
import type { CampKind, CampSpot } from '../map/mapData';
import { add, dist, type Vec2 } from '../math';
import type { BuffKind, EntitySnap, MonsterKind } from '../protocol';
import { EVENT_BUFFS } from './eventBuffs';
import { Unit, type Stats } from './unit';
import type { World, WorldSystem } from './world';

// ─── Tuning: jungle camps ─────────────────────────────────────────────────────

/** Camp monsters (the Warden, the crab and the events' monsters have their own files). */
export type CampMonsterKind = Exclude<MonsterKind, 'warden' | 'crab' | 'coat' | 'looseChud'>;

interface MonsterDef {
  name: string;
  radius: number;
  stats: Stats;
  /** Paid to whoever kills it. */
  gold: number;
  xp: number;
}

function monsterStats(maxHp: number, ad: number, armor: number, mr: number, attackSpeed: number, attackRange = 100, moveSpeed = 340): Stats {
  return { maxHp, hpRegen: 0, maxMana: 0, manaRegen: 0, ad, ap: 0, armor, mr, attackSpeed, attackRange, moveSpeed };
}

export const MONSTERS: Record<CampMonsterKind, MonsterDef> = {
  ratKing: { name: 'Rat King', radius: 40, stats: monsterStats(800, 28, 12, 8, 0.8), gold: 40, xp: 60 },
  rat: { name: 'Gutter Rat', radius: 24, stats: monsterStats(320, 12, 5, 5, 1.0), gold: 16, xp: 25 },
  mossback: { name: 'Mossback', radius: 60, stats: monsterStats(1400, 40, 20, 15, 0.55, 110, 300), gold: 95, xp: 140 },
  emberToad: { name: 'Ember Toad', radius: 52, stats: monsterStats(1500, 45, 18, 18, 0.7, 120), gold: 90, xp: 150 },
  glowcap: { name: 'Glowcap', radius: 50, stats: monsterStats(1500, 40, 15, 25, 0.7, 120), gold: 90, xp: 150 },
};

interface CampDef {
  /** Monsters and where they stand relative to the camp's center. */
  members: [CampMonsterKind, Vec2][];
  /** Seconds after the camp is cleared. */
  respawn: number;
  /** The buff whoever kills the camp's big monster gets. */
  buff?: BuffKind;
}

export const CAMPS: Record<CampKind, CampDef> = {
  gutterRats: {
    members: [
      ['ratKing', { x: 0, y: 0 }],
      ['rat', { x: -80, y: 60 }],
      ['rat', { x: 80, y: 60 }],
    ],
    respawn: 100,
  },
  mossback: { members: [['mossback', { x: 0, y: 0 }]], respawn: 120 },
  emberToad: { members: [['emberToad', { x: 0, y: 0 }]], respawn: 150, buff: 'ember' },
  glowcap: { members: [['glowcap', { x: 0, y: 0 }]], respawn: 150, buff: 'glowcap' },
};

/** Camps first appear at 1:15. */
export const FIRST_CAMP_SPAWN = 75;
/** Monsters won't follow anyone further than this from their camp; past it they walk home and heal. */
export const LEASH = 750;
/** Share of max health a monster regains per second on its walk home. */
const RESET_REGEN = 0.4;
/** Monsters toughen up as the match goes on, a little slower than Chuds. */
const GROWTH_PER_MINUTE = 0.03;
const CORPSE_TIME = 1.5;

export const BUFFS: Record<BuffKind, { name: string; duration: number }> = {
  ember: { name: "Ember Toad's Heat", duration: 90 },
  glowcap: { name: "Glowcap's Glow", duration: 90 },
  ...EVENT_BUFFS, // the map events' team buffs (eventBuffs.ts)
};
/** Ember: basic attacks on anything but structures burn for bonus true damage and slow briefly. */
export const EMBER = { damage: (level: number) => 8 + 2 * level, slow: 0.2, slowFor: 1 };
/** Glowcap: ability haste, and mana back each second as a share of max mana. */
export const GLOWCAP = { haste: 20, manaRegenPct: 0.01 };

// ─── Monsters ─────────────────────────────────────────────────────────────────

/** A jungle monster. Stands at its camp until a champion hits the camp, fights back, and gives up past the leash. */
export class Monster extends Unit {
  readonly kind = 'monster';
  resetting = false;

  constructor(
    world: World,
    readonly camp: Camp,
    readonly monster: CampMonsterKind,
    pos: Vec2,
  ) {
    const def = MONSTERS[monster];
    const grow = 1 + GROWTH_PER_MINUTE * (world.time / 60);
    super(world.newId(), TEAM.neutral, pos, def.radius, { ...def.stats, maxHp: def.stats.maxHp * grow, ad: def.stats.ad * grow }, def.name);
    this.facing = Math.PI / 2;
  }

  /** Walking home to reset, it can't be hit, so it can't be kited to death at the edge of its leash. */
  isTargetable(): boolean {
    return super.isTargetable() && !this.resetting;
  }

  protected think(world: World): void {
    if (this.resetting) {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * RESET_REGEN * DT);
      if (this.order.kind === 'idle') {
        this.resetting = false;
        this.hp = this.stats.maxHp;
      }
      return;
    }
    if (dist(this.pos, this.spawnPos) > LEASH) return this.camp.reset(world);
    const target = this.camp.targetFor(world, this);
    if (target) this.commandAttack(target);
    else if (this.hp < this.stats.maxHp || dist(this.pos, this.spawnPos) > 10) this.camp.reset(world);
  }

  goHome(world: World): void {
    if (this.dead) return;
    this.resetting = true;
    this.commandMove(world, this.spawnPos);
  }

  onDamaged(world: World, source: Unit | null): void {
    if (source?.kind === 'champion') this.camp.provoke(world, source);
  }

  die(world: World, killer: Unit | null): void {
    super.die(world, killer);
    world.schedule(CORPSE_TIME, () => (this.removed = true));
  }

  protected respawnDelay(): number {
    return Infinity; // the camp brings back a fresh set
  }

  snapshot(world: World): EntitySnap {
    return { ...super.snapshot(world), mon: this.monster };
  }
}

/** One camp: its monsters fight as a group and respawn together once all are dead. */
export class Camp {
  members: Monster[] = [];
  /** When the next set appears; null while monsters are alive. */
  respawnAt: number | null = FIRST_CAMP_SPAWN;
  /** Champions who've hit the camp lately, by id → time of their last hit. */
  private readonly foes = new Map<number, number>();

  constructor(readonly spot: CampSpot) {}

  get kind(): CampKind {
    return this.spot.kind;
  }

  alive(): boolean {
    return this.members.some((m) => !m.dead);
  }

  spawn(world: World): void {
    this.foes.clear();
    this.members = CAMPS[this.kind].members.map(([kind, offset]) => world.add(new Monster(world, this, kind, add(this.spot.pos, offset))));
  }

  provoke(world: World, source: Unit): void {
    this.foes.set(source.id, world.time);
  }

  /** Keep hitting the current target while it's fair game; otherwise the champion who hit the camp most recently. */
  targetFor(world: World, m: Monster): Unit | undefined {
    const current = m.order.kind === 'attack' ? world.getUnit(m.order.targetId) : undefined;
    if (current && this.fairGame(current)) return current;
    let best: Unit | undefined;
    let bestAt = -Infinity;
    for (const [id, at] of this.foes) {
      const u = world.getUnit(id);
      if (!u || !this.fairGame(u)) {
        this.foes.delete(id);
        continue;
      }
      if (at > bestAt) {
        best = u;
        bestAt = at;
      }
    }
    return best;
  }

  /** The whole camp walks home and heals. */
  reset(world: World): void {
    this.foes.clear();
    for (const m of this.members) m.goHome(world);
  }

  private fairGame(u: Unit): boolean {
    return !u.dead && u.isTargetable() && dist(u.pos, this.spot.pos) <= LEASH;
  }
}

/** Spawns every camp at 1:15 and brings each back a while after it's cleared. */
export class Jungle implements WorldSystem {
  readonly camps: Camp[];

  constructor(world: World) {
    this.camps = world.map.camps.map((spot) => new Camp(spot));
  }

  update(world: World): void {
    for (const camp of this.camps) {
      if (camp.respawnAt === null) {
        if (!camp.alive()) camp.respawnAt = world.time + CAMPS[camp.kind].respawn;
      } else if (world.time + 1e-9 >= camp.respawnAt) {
        camp.respawnAt = null;
        camp.spawn(world);
      }
    }
  }
}
