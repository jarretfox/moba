import type { Champion } from '../champions/champion';
import type { ChampionId } from '../champions/types';
import type { Slot } from '../constants';
import { add, dirTo, dist, lerpVec, scale, type Vec2 } from '../math';
import type { Command } from '../protocol';
import { enemiesInCone } from '../sim/query';
import type { Unit } from '../sim/unit';
import type { World } from '../sim/world';

export interface BotContext {
  world: World;
  me: Champion;
  home: Vec2;
}

/** How one champion's bot uses its kit. Each hook returns at most one cast per think. */
export interface BotProfile {
  /** Which basic abilities to max first; the ultimate is always taken as soon as it's allowed. */
  skillOrder: Slot[];
  /** In a fight with `foe`. */
  fight(ctx: BotContext, foe: Unit): Command | null;
  /** Running from `threat`. */
  escape(ctx: BotContext, threat: Unit): Command | null;
  /** Farming a lane with these enemy Chuds around. */
  farm?(ctx: BotContext, chuds: Unit[]): Command | null;
}

export function ready(ctx: BotContext, slot: Slot): boolean {
  const { me, world } = ctx;
  const a = me.abilities[slot];
  return a.rank > 0 && a.readyAt <= world.time && me.mana >= me.costOf(slot) && me.canAct(world);
}

const cast = (slot: Slot, at: Vec2): Command => ({ k: 'cast', slot, x: Math.round(at.x), y: Math.round(at.y) });
const hpPct = (u: Unit) => u.hp / u.stats.maxHp;
const isMelee = (u: Unit) => u.stats.attackRange < 200;

/** Where `u` will be in `seconds` if it keeps walking. Decent players lead their shots a little, not perfectly. */
function lead(u: Unit, seconds: number): Vec2 {
  return u.moveDir ? add(u.pos, scale(u.moveDir, u.moveSpeed * seconds)) : { ...u.pos };
}

const marksman: BotProfile = {
  skillOrder: [0, 2, 1],
  fight(ctx, foe) {
    const { me } = ctx;
    const d = dist(me.pos, foe.pos);
    if (ready(ctx, 3) && hpPct(foe) < 0.35 && d < 2500) return cast(3, lead(foe, 0.3));
    if (ready(ctx, 2) && isMelee(foe) && d < 300) return cast(2, add(me.pos, scale(dirTo(foe.pos, me.pos), 300))); // roll away
    if (ready(ctx, 1) && isMelee(foe) && d < 450) return cast(1, lerpVec(me.pos, foe.pos, 0.5)); // trap the approach
    if (ready(ctx, 0) && d < 1050) return cast(0, lead(foe, 0.15));
    return null;
  },
  escape(ctx, threat) {
    const { me } = ctx;
    if (ready(ctx, 2)) return cast(2, add(me.pos, scale(dirTo(threat.pos, me.pos), 300)));
    if (ready(ctx, 1) && dist(me.pos, threat.pos) < 500) return cast(1, me.pos);
    return null;
  },
};

const barbarian: BotProfile = {
  skillOrder: [0, 2, 1],
  fight(ctx, foe) {
    const { me } = ctx;
    const d = dist(me.pos, foe.pos);
    if (ready(ctx, 3) && d < 400 && (hpPct(me) < 0.6 || hpPct(foe) < 0.5)) return cast(3, me.pos);
    if (ready(ctx, 2) && d > 250 && d < 600) return cast(2, foe.pos);
    if (ready(ctx, 1) && d < 330) return cast(1, me.pos);
    if (ready(ctx, 0) && d < 290 + foe.radius) return cast(0, foe.pos);
    return null;
  },
  escape(ctx) {
    const { me, home } = ctx;
    return ready(ctx, 2) ? cast(2, add(me.pos, scale(dirTo(me.pos, home), 600))) : null;
  },
  farm(ctx, chuds) {
    if (!ready(ctx, 0)) return null;
    const { me, world } = ctx;
    const near = chuds.filter((c) => dist(c.pos, me.pos) < 320);
    if (near.length < 3) return null;
    const centroid = near.reduce((s, c) => ({ x: s.x + c.pos.x / near.length, y: s.y + c.pos.y / near.length }), { x: 0, y: 0 });
    const inSwing = enemiesInCone(world, me.team, me.pos, dirTo(me.pos, centroid), 300, (55 * Math.PI) / 180);
    return inSwing.length >= 3 ? cast(0, centroid) : null;
  },
};

export const PROFILES: Record<ChampionId, BotProfile> = { marksman, barbarian };
