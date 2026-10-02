import { canRankUp } from '../sim/progression';
import type { Champion } from '../champions/champion';
import type { ChampionId } from '../champions/types';
import type { Slot } from '../constants';
import type { ItemId } from '../items';
import { add, dirTo, dist, lerpVec, scale, type Vec2 } from '../math';
import type { Command } from '../protocol';
import { enemiesAlongLine, enemiesInCone, enemiesInRadius } from '../sim/query';
import { LEVY } from '../champions/kingrix';
import { atRank } from '../champions/types';
import { mitigate } from '../sim/world';
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

// ─── Clearing waves with abilities ────────────────────────────────────────────
// Every bot whose kit can hit a group of Chuds uses it on the wave now and then (only the Oak and HunnaG did,
// which made them win far more than the rest).

/** Spells cost mana: keep half the bar for fights. Champions without mana only wait on the cooldown. */
const spare = (ctx: BotContext) => ctx.me.stats.maxMana <= 0 || ctx.me.mana >= ctx.me.stats.maxMana * 0.5;

/** The middle of the Chuds within `range`, if there are at least `min` of them. */
function waveCenter(ctx: BotContext, chuds: Unit[], range: number, min: number): Vec2 | null {
  const near = chuds.filter((c) => dist(c.pos, ctx.me.pos) < range);
  if (near.length < min) return null;
  return near.reduce((sum, c) => ({ x: sum.x + c.pos.x / near.length, y: sum.y + c.pos.y / near.length }), { x: 0, y: 0 });
}

/** A cone (Maul, Sigma Stare) swung at the wave when it would catch `min` or more. */
function coneFarm(ctx: BotContext, chuds: Unit[], slot: Slot, range: number, angleDeg: number, min = 3): Command | null {
  if (!ready(ctx, slot) || !spare(ctx)) return null;
  const center = waveCenter(ctx, chuds, range + 20, min);
  if (!center) return null;
  const caught = enemiesInCone(ctx.world, ctx.me.team, ctx.me.pos, dirTo(ctx.me.pos, center), range, (angleDeg / 2) * (Math.PI / 180));
  return caught.filter((u) => u.kind === 'chud').length >= min ? cast(slot, center) : null;
}

/** A shot that goes through everything in a line (Objection!), fired down the wave when it would hit `min`. */
function lineFarm(ctx: BotContext, chuds: Unit[], slot: Slot, range: number, width: number, min = 3): Command | null {
  if (!ready(ctx, slot) || !spare(ctx)) return null;
  const center = waveCenter(ctx, chuds, range, min);
  if (!center) return null;
  const caught = enemiesAlongLine(ctx.world, ctx.me.team, ctx.me.pos, dirTo(ctx.me.pos, center), range, width);
  return caught.filter((u) => u.kind === 'chud').length >= min ? cast(slot, center) : null;
}

/** An area thrown at a spot (Sticky Icky), into the thick of the wave. */
function areaFarm(ctx: BotContext, chuds: Unit[], slot: Slot, range: number, radius: number, min = 3): Command | null {
  if (!ready(ctx, slot) || !spare(ctx)) return null;
  const center = waveCenter(ctx, chuds, range, min);
  if (!center) return null;
  return enemiesInRadius(ctx.world, ctx.me.team, center, radius).filter((u) => u.kind === 'chud').length >= min ? cast(slot, center) : null;
}

/** A single-target shot (Junk Toss) at the weakest Chud in reach, to push the wave on. */
function pokeFarm(ctx: BotContext, chuds: Unit[], slot: Slot, range: number, below = 0.45): Command | null {
  if (!ready(ctx, slot) || !spare(ctx)) return null;
  const target = chuds.filter((c) => dist(c.pos, ctx.me.pos) < range && hpPct(c) < below).sort((a, b) => a.hp - b.hp)[0];
  return target ? cast(slot, target.pos) : null;
}

const marksman: BotProfile = {
  skillOrder: [0, 2, 1],
  build: ['shiv', 'treads', 'kris', 'stormstring', 'striders', 'longbow', 'reaver', 'fork'],
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
  farm(ctx, chuds) {
    return lineFarm(ctx, chuds, 0, 1000, 70);
  },
};

const barbarian: BotProfile = {
  skillOrder: [0, 2, 1],
  build: ['shiv', 'treads', 'mallet', 'link', 'ironshod', 'trident', 'plate', 'hamhock'],
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
  build: ['shiv', 'treads', 'fang', 'link', 'ironshod', 'reaver', 'plate', 'oath'],
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
  farm(ctx, chuds) {
    return pokeFarm(ctx, chuds, 0, 750);
  },
};

const hunnag: BotProfile = {
  skillOrder: [0, 1, 2],
  build: ['sagestone', 'treads', 'tome', 'staff', 'clogs', 'lantern', 'hat', 'hourglass'],
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
  build: ['leather', 'treads', 'vest', 'plate', 'ironshod', 'oath', 'mossheart', 'hamhock'],
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
  farm(ctx, chuds) {
    return coneFarm(ctx, chuds, 2, 300, 90);
  },
};

const kingrix: BotProfile = {
  skillOrder: [0, 2, 1],
  build: ['sagestone', 'treads', 'charm', 'lantern', 'clogs', 'staff', 'oath', 'hourglass'],
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
  farm(ctx, chuds) {
    const { me } = ctx;
    // Levy is made for last hits: a kill pays extra gold and gives the mana back.
    if (ready(ctx, 0)) {
      const damage = atRank(LEVY.damage, me.abilities[0].rank) + LEVY.apRatio * me.stats.ap;
      const kill = chuds.find((c) => dist(c.pos, me.pos) < LEVY.range - 50 && c.hp <= mitigate(damage, c.stats.mr) && c.hp > mitigate(me.stats.ad, c.stats.armor));
      if (kill) return cast(0, kill.pos);
    }
    // The guards push a big wave along.
    if (ready(ctx, 1) && spare(ctx) && waveCenter(ctx, chuds, 600, 4)) return cast(1, me.pos);
    return null;
  },
};

const dongmaster: BotProfile = {
  skillOrder: [0, 2, 1],
  build: ['loaf', 'treads', 'ham', 'link', 'waders', 'mossheart', 'plate', 'hamhock'],
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
  farm(ctx, chuds) {
    return coneFarm(ctx, chuds, 2, 450, 70);
  },
};

const dabber: BotProfile = {
  skillOrder: [2, 0, 1],
  build: ['quickstring', 'treads', 'kris', 'stormstring', 'striders', 'fork', 'longbow', 'reaver'],
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
  farm(ctx, chuds) {
    // Resin on the wave, then set it alight once enough of them are sticky.
    const sticky = chuds.filter((c) => c.has('resin') && dist(c.pos, ctx.me.pos) < 1000);
    if (sticky.length >= 3 && ready(ctx, 2) && spare(ctx)) return cast(2, ctx.me.pos);
    return areaFarm(ctx, chuds, 1, 850, 220);
  },
};

const paris: BotProfile = {
  skillOrder: [0, 2, 1],
  build: ['shiv', 'treads', 'mallet', 'fork', 'striders', 'trident', 'reaver', 'link'],
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
  build: ['sagestone', 'treads', 'whetstone', 'witchfire', 'striders', 'staff', 'hat', 'mossheart'],
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
  build: ['shiv', 'treads', 'mallet', 'trident', 'ironshod', 'reaver', 'fork', 'link'],
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

/** The ability to put the next skill point in: the ultimate whenever it's allowed, then the champion's preferred order. */
export function nextSkill(champ: ChampionId, ranks: readonly number[], level: number): Slot | null {
  const order: Slot[] = [3, ...PROFILES[champ].skillOrder, 0, 1, 2];
  return order.find((slot) => canRankUp(slot, ranks[slot] ?? 0, level)) ?? null;
}

export const PROFILES: Record<ChampionId, BotProfile> = { marksman, barbarian, willmore, hunnag, logan, kingrix, dongmaster, dabber, paris, havarti, daltonomo };
