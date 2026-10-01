import { Champion } from '../champions/champion';
import { DT, TEAM, type PlayerTeam } from '../constants';
import { dist, type Vec2 } from '../math';
import type { EntitySnap, WardenStatus } from '../protocol';
import { Unit, type Stats } from './unit';
import type { World, WorldSystem } from './world';

// ─── Tuning: the Warden ───────────────────────────────────────────────────────

export const WARDEN = {
  /** First wakes at 8:00, and comes back this long after it falls. */
  spawnAt: 8 * 60,
  respawn: 6 * 60,
  radius: 110,
  stats: { maxHp: 5000, hpRegen: 0, maxMana: 0, manaRegen: 0, ad: 90, ap: 0, armor: 60, mr: 50, attackSpeed: 0.6, attackRange: 220, moveSpeed: 0 } satisfies Stats,
  /** Tougher the later it wakes. */
  growthPerMinute: 0.03,
  /** Only fights champions inside its pit. */
  pitRadius: 650,
  /** Left alone this long, it heals quickly back to full. */
  calmAfter: 6,
  calmRegen: 0.08,
  /** The chain slam: marks a champion's spot, then smashes it. Step out of the circle in time. */
  slam: { every: 7, telegraph: 1.2, radius: 230, damage: (minutes: number) => 150 + 12 * minutes, stun: 0.75 },
  /** Every champion on the team that kills it. */
  reward: { gold: 300, xp: 300 },
};

/** Old Grudge: the Warden hits these champions harder and goes for them first whenever they're in its pit. */
export const GRUDGE = { champions: new Set<string>(['willmore', 'hunnag']), damageBonus: 0.25 };

/** Unchained: after killing the Warden, a team's Chuds spawn stronger for a while. Uprising adds a Brute to every wave. */
export const UNCHAINED = { duration: 90, hpBonus: 0.5, adBonus: 0.5 };

const CORPSE_TIME = 2;

export const holdsGrudge = (u: Unit): boolean => u instanceof Champion && GRUDGE.champions.has(u.info.id);

// ─── The Warden ───────────────────────────────────────────────────────────────

/** The iron jailer in the pit at the center of the map. Never moves; fights whoever picks a fight with it. */
export class Warden extends Unit {
  readonly kind = 'monster';
  readonly immovable = true;
  private nextSlamAt = 0;

  constructor(world: World, pos: Vec2) {
    const grow = 1 + WARDEN.growthPerMinute * (world.time / 60);
    super(world.newId(), TEAM.neutral, pos, WARDEN.radius, { ...WARDEN.stats, maxHp: WARDEN.stats.maxHp * grow, ad: WARDEN.stats.ad * grow }, 'The Warden');
    this.facing = Math.PI / 2;
  }

  protected think(world: World): void {
    const foes = this.foes(world);
    if (foes.length === 0) {
      this.commandStop();
      if (world.time - this.lastDamagedAt > WARDEN.calmAfter) {
        this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * WARDEN.calmRegen * DT);
        this.championHits.clear();
      }
      this.nextSlamAt = world.time + WARDEN.slam.every / 2; // a fresh fight gets a short breather before the first slam
      return;
    }
    const inReach = foes.filter((u) => dist(u.pos, this.pos) <= this.stats.attackRange + this.radius + u.radius);
    const current = this.order.kind === 'attack' ? inReach.find((u) => this.order.kind === 'attack' && u.id === this.order.targetId) : undefined;
    const target = inReach.find(holdsGrudge) ?? current ?? inReach.sort((a, b) => dist(a.pos, this.pos) - dist(b.pos, this.pos))[0];
    if (target) this.commandAttack(target);
    else this.commandStop();

    if (world.time >= this.nextSlamAt) {
      this.nextSlamAt = world.time + WARDEN.slam.every;
      this.slam(world, (foes.find(holdsGrudge) ?? target ?? foes[0]).pos);
    }
  }

  /** Champions in the pit who've hurt it lately, plus anyone it holds a grudge against. */
  private foes(world: World): Unit[] {
    return world.units().filter((u) => {
      if (u.kind !== 'champion' || !u.isTargetable() || dist(u.pos, this.pos) > WARDEN.pitRadius) return false;
      const hitAt = this.championHits.get(u.id);
      return holdsGrudge(u) || (hitAt !== undefined && world.time - hitAt <= WARDEN.calmAfter);
    });
  }

  private slam(world: World, at: Vec2): void {
    const p = { ...at };
    const s = WARDEN.slam;
    world.emit({ e: 'fx', fx: 'wardenMark', x: Math.round(p.x), y: Math.round(p.y), r: s.radius, dur: s.telegraph });
    world.schedule(s.telegraph, () => {
      if (this.dead) return;
      world.emit({ e: 'fx', fx: 'wardenSlam', x: Math.round(p.x), y: Math.round(p.y), r: s.radius, x2: Math.round(this.pos.x), y2: Math.round(this.pos.y) });
      const damage = s.damage(world.time / 60);
      for (const u of world.units()) {
        if (u.kind !== 'champion' || !u.isTargetable() || dist(u.pos, p) > s.radius + u.radius) continue;
        world.damage(this, u, damage * (holdsGrudge(u) ? 1 + GRUDGE.damageBonus : 1), 'physical');
        u.addStatus(world, 'stun', s.stun);
      }
    });
  }

  protected launchAttack(world: World, target: Unit): void {
    world.damage(this, target, this.stats.ad * (holdsGrudge(target) ? 1 + GRUDGE.damageBonus : 1), 'physical');
  }

  die(world: World, killer: Unit | null): void {
    super.die(world, killer);
    world.schedule(CORPSE_TIME, () => (this.removed = true));
  }

  protected respawnDelay(): number {
    return Infinity; // the lair brings it back
  }

  snapshot(world: World): EntitySnap {
    return { ...super.snapshot(world), mon: 'warden' };
  }
}

/** Wakes the Warden at 8:00 and again a while after each time it falls; tracks each team's Unchained. */
export class WardenLair implements WorldSystem {
  warden: Warden | null = null;
  nextSpawnAt = WARDEN.spawnAt;

  update(world: World): void {
    if (this.warden && !this.warden.dead) return;
    if (this.warden?.dead) {
      this.warden = null;
      this.nextSpawnAt = world.time + WARDEN.respawn;
    }
    if (world.time + 1e-9 >= this.nextSpawnAt) this.warden = world.add(new Warden(world, { x: world.map.width / 2, y: world.map.height / 2 }));
  }

  /** For everyone's HUD: when it wakes, and who's Unchained. */
  status(world: World): WardenStatus {
    const alive = !!this.warden && !this.warden.dead;
    const s: WardenStatus = { alive };
    if (!alive) s.wakesIn = Math.max(0, Math.ceil(this.nextSpawnAt - world.time));
    const buffs = ([TEAM.blue, TEAM.red] as PlayerTeam[]).flatMap((team) => {
      const u = world.unchained[team];
      return u.until > world.time ? [{ team, left: Math.ceil(u.until - world.time), uprising: u.uprising }] : [];
    });
    if (buffs.length) s.unchained = buffs;
    return s;
  }
}
