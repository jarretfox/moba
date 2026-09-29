import type { PlayerTeam, Slot } from '../constants';
import { add, angleOf, dirTo, dist, fromAngle, scale, sub, type Vec2 } from '../math';
import type { EntitySnap, MeSnap } from '../protocol';
import { Unit, type Stats } from '../sim/unit';
import type { World } from '../sim/world';
import type { ChampionInfo, Targeting } from './types';

interface AbilityState {
  rank: number;
  readyAt: number;
}

/**
 * Plumbing every champion shares: the cast pipeline (checks, mana, cooldown, cast time).
 * Each champion subclass hand-codes what its abilities actually do in onCast.
 */
export abstract class Champion extends Unit {
  readonly kind = 'champion';
  abstract readonly info: ChampionInfo;
  // M0: every ability starts at rank 1. Leveling arrives with XP in M3.
  readonly abilities: AbilityState[] = [0, 1, 2, 3].map(() => ({ rank: 1, readyAt: 0 }));

  constructor(world: World, team: PlayerTeam, radius: number, base: Stats, name: string) {
    super(world.newId(), team, world.map.spawns[team], radius, base, name);
  }

  tryCast(world: World, slot: Slot, aim: Vec2): boolean {
    if (this.dead || !this.canAct(world)) return false;
    const info = this.info.abilities[slot];
    const state = this.abilities[slot];
    if (state.rank <= 0 || world.time < state.readyAt || this.mana < info.cost) return false;

    const target = this.resolveAim(info.targeting, aim);
    this.mana -= info.cost;
    state.readyAt = world.time + info.cooldown;
    this.cancelWindup();
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
    return { ...super.snapshot(world), champ: this.info.id, mp: Math.floor(this.mana), mmp: Math.round(this.stats.maxMana) };
  }

  meSnapshot(world: World): MeSnap {
    return {
      id: this.id,
      abilities: this.abilities.map((a) => ({ rank: a.rank, cd: Math.max(0, Math.round((a.readyAt - world.time) * 10) / 10) })),
      passiveStacks: 0,
      empowered: false,
      respawnIn: this.dead ? Math.max(0, this.respawnAt - world.time) : 0,
    };
  }
}
