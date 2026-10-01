import type { Champion } from '../champions/champion';
import type { ChampionId } from '../champions/types';
import type { Slot } from '../constants';
import type { ItemId } from '../items';
import { add, dirTo, dist, lerpVec, scale, type Vec2 } from '../math';
import type { Command } from '../protocol';
import { enemiesInCone, enemiesInRadius } from '../sim/query';
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
  /** Items in the order to buy them. Cheap early ones get sold to make room for the later ones. */
  build: ItemId[];
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
  build: ['shiv', 'treads', 'fang', 'striders', 'longbow', 'reaver', 'link'],
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
  build: ['shiv', 'treads', 'leather', 'drum', 'link', 'plate', 'reaver'],
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

const willmore: BotProfile = {
  skillOrder: [0, 2, 1],
  build: ['shiv', 'treads', 'fang', 'drum', 'link', 'reaver', 'plate'],
  fight(ctx, foe) {
    const { me, home } = ctx;
    const d = dist(me.pos, foe.pos);
    const burrowed = me.has('burrowed');
    // Burrowed: close in unseen, then pop up underneath them.
    if (burrowed) return d < 160 ? cast(1, me.pos) : null;
    // Drag them home: toward our own base, where our Shooties are.
    if (ready(ctx, 3) && d < 300 && hpPct(foe) < 0.6) return cast(3, add(me.pos, scale(dirTo(me.pos, home), 600)));
    if (ready(ctx, 2) && d > 280 && d < 650) return cast(2, lead(foe, 0.25));
    if (ready(ctx, 0) && d < 800) return cast(0, lead(foe, 0.3));
    if (ready(ctx, 1) && d > 350 && d < 700) return cast(1, me.pos);
    return null;
  },
  escape(ctx) {
    const { me } = ctx;
    return ready(ctx, 1) && !me.has('burrowed') ? cast(1, me.pos) : null;
  },
};

const hunnag: BotProfile = {
  skillOrder: [0, 1, 2],
  build: ['sagestone', 'treads', 'lantern', 'staff', 'aegis', 'drum'],
  fight(ctx, foe) {
    const { me, world } = ctx;
    const d = dist(me.pos, foe.pos);
    if (ready(ctx, 3) && d < 900) {
      const caught = enemiesInRadius(world, me.team, foe.pos, 350).filter((u) => u.kind === 'champion').length;
      if (caught >= 2 || hpPct(foe) < 0.5) return cast(3, lead(foe, 0.5));
    }
    if (ready(ctx, 0) && d < 850) return cast(0, lead(foe, 0.5));
    if (ready(ctx, 1) && d < 700) return cast(1, lerpVec(me.pos, foe.pos, 0.3));
    return null;
  },
  escape(ctx) {
    const { me, home } = ctx;
    return ready(ctx, 2) ? cast(2, add(me.pos, scale(dirTo(me.pos, home), 700))) : null;
  },
  farm(ctx, chuds) {
    if (!ready(ctx, 0) || ctx.me.mana < ctx.me.stats.maxMana * 0.6) return null;
    const { me, world } = ctx;
    const near = chuds.filter((c) => dist(c.pos, me.pos) < 800);
    if (near.length < 3) return null;
    const centroid = near.reduce((s, c) => ({ x: s.x + c.pos.x / near.length, y: s.y + c.pos.y / near.length }), { x: 0, y: 0 });
    return enemiesInRadius(world, me.team, centroid, 160).length >= 3 ? cast(0, centroid) : null;
  },
};

const logan: BotProfile = {
  skillOrder: [0, 2, 1],
  build: ['shiv', 'treads', 'leather', 'drum', 'plate', 'link', 'aegis'],
  fight(ctx, foe) {
    const { me, world } = ctx;
    const d = dist(me.pos, foe.pos);
    const crowd = enemiesInCone(world, me.team, me.pos, dirTo(me.pos, foe.pos), 450, (50 * Math.PI) / 180).filter((u) => u.kind === 'champion').length;
    if (ready(ctx, 3) && d < 400 && (crowd >= 2 || hpPct(me) < 0.4)) return cast(3, foe.pos);
    if (ready(ctx, 0) && d > 200 && d < 600) return cast(0, foe.pos);
    if (ready(ctx, 2) && d < 300) return cast(2, foe.pos);
    if (ready(ctx, 1) && d < 400 && hpPct(me) < 0.75) return cast(1, me.pos);
    return null;
  },
  escape(ctx, threat) {
    const { me } = ctx;
    if (ready(ctx, 3) && dist(me.pos, threat.pos) < 400) return cast(3, threat.pos);
    return ready(ctx, 1) ? cast(1, me.pos) : null;
  },
};

const kingrix: BotProfile = {
  skillOrder: [0, 2, 1],
  build: ['sagestone', 'treads', 'lantern', 'staff', 'aegis', 'drum'],
  fight(ctx, foe) {
    const { me } = ctx;
    const d = dist(me.pos, foe.pos);
    if (ready(ctx, 3) && foe.kind === 'champion' && hpPct(foe) < 0.7) return cast(3, foe.pos);
    if (ready(ctx, 2) && d < 330) return cast(2, foe.pos);
    if (ready(ctx, 1) && d < 600) return cast(1, me.pos);
    if (ready(ctx, 0) && d < 900) return cast(0, lead(foe, 0.3));
    return null;
  },
  escape(ctx, threat) {
    const { me } = ctx;
    if (ready(ctx, 2) && dist(me.pos, threat.pos) < 330) return cast(2, threat.pos);
    return ready(ctx, 1) ? cast(1, me.pos) : null;
  },
};

const dongmaster: BotProfile = {
  skillOrder: [0, 2, 1],
  build: ['leather', 'treads', 'drum', 'plate', 'link', 'aegis'],
  fight(ctx, foe) {
    const { me, world } = ctx;
    const d = dist(me.pos, foe.pos);
    const crowd = enemiesInRadius(world, me.team, me.pos, 320).filter((u) => u.kind === 'champion').length;
    if (ready(ctx, 3) && d < 300 && (crowd >= 2 || hpPct(me) < 0.55 || hpPct(foe) < 0.5)) return cast(3, me.pos);
    if (ready(ctx, 0) && d > 180 && d < 420) return cast(0, foe.pos);
    if (ready(ctx, 2) && d < 400) return cast(2, foe.pos);
    if (ready(ctx, 1) && d < 500 && hpPct(me) < 0.8) return cast(1, me.pos);
    return null;
  },
  escape(ctx, threat) {
    const { me, home } = ctx;
    if (ready(ctx, 2) && dist(me.pos, threat.pos) < 400) return cast(2, threat.pos);
    if (ready(ctx, 1)) return cast(1, me.pos);
    return ready(ctx, 0) ? cast(0, add(me.pos, scale(dirTo(me.pos, home), 420))) : null;
  },
};

const dabber: BotProfile = {
  skillOrder: [2, 0, 1],
  build: ['shiv', 'treads', 'fang', 'striders', 'longbow', 'reaver', 'link'],
  fight(ctx, foe) {
    const { me, world } = ctx;
    const d = dist(me.pos, foe.pos);
    const stacks = foe.strongest('resin');
    const crowd = enemiesInRadius(world, me.team, foe.pos, 400).filter((u) => u.kind === 'champion').length;
    if (ready(ctx, 3) && d < 850 && (hpPct(foe) < 0.6 || crowd >= 2)) return cast(3, me.pos);
    if (ready(ctx, 2) && d < 1050 && (stacks >= 5 || (stacks >= 3 && hpPct(foe) < 0.3))) return cast(2, me.pos);
    if (ready(ctx, 1) && d < 850) return cast(1, lead(foe, 0.35));
    return null;
  },
  escape(ctx) {
    return ready(ctx, 0) && !ctx.me.has('hazed') ? cast(0, ctx.me.pos) : null;
  },
};

const paris: BotProfile = {
  skillOrder: [0, 2, 1],
  build: ['shiv', 'treads', 'fang', 'reaver', 'striders', 'link'],
  fight(ctx, foe) {
    const { me, world } = ctx;
    const d = dist(me.pos, foe.pos);
    const crowd = enemiesInRadius(world, me.team, me.pos, 500).filter((u) => u.kind === 'champion').length;
    if (ready(ctx, 3) && d < 500 && foe.kind === 'champion' && (hpPct(foe) < 0.7 || crowd >= 2)) return cast(3, me.pos);
    if (ready(ctx, 0) && d < 600 && (d > 200 || hpPct(foe) < 0.4)) return cast(0, foe.pos);
    if (ready(ctx, 2) && d < 250) return cast(2, me.pos);
    return null;
  },
  escape(ctx) {
    return ready(ctx, 3) ? cast(3, ctx.me.pos) : null;
  },
};

const havarti: BotProfile = {
  skillOrder: [2, 0, 1],
  build: ['sagestone', 'treads', 'shiv', 'staff', 'fang', 'link'],
  fight(ctx, foe) {
    const { me, world } = ctx;
    const d = dist(me.pos, foe.pos);
    // Divine Fondue: save whoever on her team is about to fall (herself included).
    if (ready(ctx, 3)) {
      const saving = world
        .units()
        .find((u) => u.team === me.team && u.kind === 'champion' && !u.dead && dist(u.pos, me.pos) < 900 && hpPct(u) < 0.3 && enemiesInRadius(world, me.team, u.pos, 600).some((e) => e.kind === 'champion'));
      if (saving) return cast(3, saving.pos);
    }
    const hurtAlly = world.units().some((u) => u.team === me.team && u.kind === 'champion' && !u.dead && u !== me && dist(u.pos, me.pos) < 900 && hpPct(u) < 0.5);
    if (ready(ctx, 1) && (hpPct(me) < 0.6 || hurtAlly)) return cast(1, me.pos);
    if (ready(ctx, 0) && d < 880) return cast(0, lead(foe, 0.3));
    if (ready(ctx, 2) && d < me.stats.attackRange + 250) return cast(2, me.pos);
    return null;
  },
  escape(ctx) {
    const { me } = ctx;
    if (ready(ctx, 3) && hpPct(me) < 0.25) return cast(3, me.pos);
    return ready(ctx, 1) ? cast(1, me.pos) : null;
  },
};

const daltonomo: BotProfile = {
  skillOrder: [2, 1, 0],
  build: ['shiv', 'treads', 'fang', 'reaver', 'striders', 'link'],
  fight(ctx, foe) {
    const { me } = ctx;
    const d = dist(me.pos, foe.pos);
    if (ready(ctx, 3) && d < 500 && foe.kind === 'champion') return cast(3, me.pos);
    // Blink in behind them.
    if (ready(ctx, 0) && d > 200 && d < 650) return cast(0, add(foe.pos, scale({ x: Math.cos(foe.facing), y: Math.sin(foe.facing) }, -120)));
    if (ready(ctx, 2) && d < 625) return cast(2, foe.pos);
    if (ready(ctx, 1) && d < 350) return cast(1, lerpVec(me.pos, foe.pos, 0.5));
    return null;
  },
  escape(ctx, threat) {
    const { me, home } = ctx;
    if (ready(ctx, 1) && dist(me.pos, threat.pos) < 400) return cast(1, me.pos);
    return ready(ctx, 0) ? cast(0, add(me.pos, scale(dirTo(me.pos, home), 400))) : null;
  },
};

export const PROFILES: Record<ChampionId, BotProfile> = { marksman, barbarian, willmore, hunnag, logan, kingrix, dongmaster, dabber, paris, havarti, daltonomo };
