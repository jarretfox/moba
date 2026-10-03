import type { Champion } from '../champions/champion';
import { add, dirTo, dist, scale, type Vec2 } from '../math';
import type { CastFail } from '../protocol';
import { BARRIER, CLARITY, CLEANSE, EXHAUST, FLASH, GHOST, HEAL, IGNITE, MARK, SMITE, SUMMONERS, SUMMONER_PICK, TELEPORT, byLevel, type SummonerId } from '../summoners';
import { LineProjectile } from './projectile';
import type { Unit } from './unit';
import type { World } from './world';
import { Zone } from './zone';

// What each summoner spell does (the spells themselves, their numbers and which map takes which are in
// shared/summoners.ts). A champion keeps its two spells, their cooldowns, and the state of a Teleport
// channel or a Mark in flight; `castSummoner` is the D/F press.

/** The statuses Cleanse takes off: the disables (not knock-ups or time stopping), Exhaust and Ignite. */
const CLEANSED = ['stun', 'root', 'slow', 'fear', 'weaken', 'ignited'] as const;

/** Presses D or F (`slot` 0 or 1) aimed at `aim`. True if something happened. */
export function castSummoner(world: World, c: Champion, slot: number, aim: Vec2): boolean {
  const id = c.summoners[slot];
  if (!id || c.dead) return false;
  // Second presses: Mark's dash, and calling off a Teleport (whatever the cooldown says).
  if (id === 'mark' && c.marked?.slot === slot) return dashToMark(world, c);
  if (id === 'teleport' && c.teleporting) {
    cutTeleport(world, c);
    return true;
  }
  if (world.time < c.summonerReady[slot]) return fail(world, c, slot, 'cooldown');
  if (!canCast(c, id)) return false;
  if (!CAST[id](world, c, aim, slot)) return fail(world, c, slot, 'target');
  c.summonerReady[slot] = world.time + SUMMONERS[id].cooldown;
  c.cancelRecall();
  if (id !== 'teleport') cutTeleport(world, c);
  return true;
}

/** Whether a champion in this state can cast `id` at all: Cleanse works through disables, Flash and Ghost through roots. */
function canCast(c: Champion, id: SummonerId): boolean {
  if (c.has('stasis') || c.has('airborne') || c.dashing || c.has('express')) return false;
  if (id === 'cleanse') return true;
  return !c.has('stun') && !c.has('fear');
}

function fail(world: World, c: Champion, slot: number, why: CastFail): false {
  world.emit({ e: 'castFail', src: c.id, slot: 0, sum: slot, why });
  return false;
}

/** The enemy champion nearest the cursor that's in reach (and seen), if one is close enough to the cursor. */
function enemyChampionAt(world: World, c: Champion, aim: Vec2, range: number): Unit | undefined {
  return nearestTo(
    aim,
    world.units().filter((u) => u.kind === 'champion' && u.team !== c.team && u.isTargetable() && world.vision.canSee(c.team, u) && dist(u.pos, c.pos) <= range + c.radius + u.radius && dist(u.pos, aim) <= SUMMONER_PICK + u.radius),
  );
}

function nearestTo<T extends { pos: Vec2 }>(p: Vec2, list: T[]): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const u of list) {
    const d = dist(u.pos, p);
    if (d < bestD) {
      best = u;
      bestD = d;
    }
  }
  return best;
}

const at = (p: Vec2) => ({ x: Math.round(p.x), y: Math.round(p.y) });

type Cast = (world: World, c: Champion, aim: Vec2, slot: number) => boolean;

const CAST: Record<SummonerId, Cast> = {
  flash(world, c, aim) {
    const to = dist(c.pos, aim) > FLASH.range ? add(c.pos, scale(dirTo(c.pos, aim), FLASH.range)) : { ...aim };
    const dest = world.grid.nearestWalkable(to) ?? { ...c.pos };
    const from = { ...c.pos };
    c.blinkTo(world, dest);
    world.emit({ e: 'fx', fx: 'flash', ...at(from), x2: Math.round(dest.x), y2: Math.round(dest.y), team: c.team });
    return true;
  },

  ghost(world, c) {
    c.addStatus(world, 'speed', GHOST.duration, byLevel(GHOST.speed[0], GHOST.speed[1], c.level));
    c.addStatus(world, 'ghost', GHOST.duration);
    world.emit({ e: 'fx', fx: 'ghost', ...at(c.pos), r: c.radius, team: c.team });
    return true;
  },

  heal(world, c) {
    const amount = byLevel(HEAL.amount[0], HEAL.amount[1], c.level);
    const ally = world
      .units()
      .filter((u) => u !== c && u.kind === 'champion' && u.team === c.team && !u.dead && u.hp < u.stats.maxHp && dist(u.pos, c.pos) <= HEAL.radius + u.radius)
      .sort((a, b) => a.hp / a.stats.maxHp - b.hp / b.stats.maxHp)[0];
    for (const u of ally ? [c, ally] : [c]) {
      u.heal(world, amount);
      u.addStatus(world, 'speed', HEAL.speedFor, HEAL.speed);
    }
    world.emit({ e: 'fx', fx: 'summonerHeal', ...at(c.pos), ...(ally ? { x2: Math.round(ally.pos.x), y2: Math.round(ally.pos.y) } : {}), r: c.radius, team: c.team });
    return true;
  },

  barrier(world, c) {
    c.addShield(world, byLevel(BARRIER.shield[0], BARRIER.shield[1], c.level), BARRIER.duration);
    world.emit({ e: 'fx', fx: 'barrier', ...at(c.pos), r: c.radius, dur: BARRIER.duration, team: c.team });
    return true;
  },

  exhaust(world, c, aim) {
    const t = enemyChampionAt(world, c, aim, EXHAUST.range);
    if (!t) return false;
    t.addStatus(world, 'slow', EXHAUST.duration, EXHAUST.slow);
    t.addStatus(world, 'weaken', EXHAUST.duration, EXHAUST.weaken);
    world.emit({ e: 'fx', fx: 'exhaust', ...at(c.pos), x2: Math.round(t.pos.x), y2: Math.round(t.pos.y), r: t.radius, team: c.team });
    return true;
  },

  ignite(world, c, aim) {
    const t = enemyChampionAt(world, c, aim, IGNITE.range);
    if (!t) return false;
    const total = byLevel(IGNITE.damage[0], IGNITE.damage[1], c.level);
    t.addStatus(world, 'ignited', IGNITE.duration);
    t.addStatus(world, 'wounds', IGNITE.duration, IGNITE.wounds);
    // A tick a second; Cleanse puts it out.
    for (let s = 1; s <= IGNITE.duration; s++) {
      world.schedule(s, () => {
        if (!t.dead && t.has('ignited')) world.damage(c, t, total / IGNITE.duration, 'true', { proc: true });
      });
    }
    world.emit({ e: 'fx', fx: 'ignite', ...at(c.pos), x2: Math.round(t.pos.x), y2: Math.round(t.pos.y), r: t.radius, team: c.team });
    return true;
  },

  cleanse(world, c) {
    for (const k of CLEANSED) c.clearStatus(k);
    c.addStatus(world, 'cleansed', CLEANSE.duration);
    world.emit({ e: 'fx', fx: 'cleanse', ...at(c.pos), r: c.radius, team: c.team });
    return true;
  },

  teleport(world, c, aim, slot) {
    // Anywhere on the map: the allied Shootie, Oakner or Chud nearest the cursor.
    const post = nearestTo(
      aim,
      world.units().filter((u) => u.team === c.team && !u.dead && dist(u.pos, aim) <= TELEPORT.pick && (u.kind === 'chud' || (u.kind === 'structure' && isPost(u)))),
    );
    if (!post) return false;
    c.commandStop();
    c.cancelRecall();
    c.addStatus(world, 'teleport', TELEPORT.channel);
    // Where they'll come out, for everyone who can see it: it follows a Chud as it walks.
    const mark = world.add(
      new Zone(world, c.team, arrival(world, c, post), c.radius + 30, TELEPORT.channel + 0.2, 'teleport', (w, zone) => {
        if (!post.dead) zone.pos = arrival(w, c, post);
      }),
    );
    c.teleporting = { slot, targetId: post.id, at: world.time + TELEPORT.channel, mark };
    world.emit({ e: 'fx', fx: 'teleportStart', ...at(c.pos), x2: Math.round(post.pos.x), y2: Math.round(post.pos.y), r: c.radius, dur: TELEPORT.channel, team: c.team });
    return true;
  },

  smite(world, c, aim) {
    const t = nearestTo(
      aim,
      world
        .units()
        .filter(
          (u) =>
            (u.kind === 'monster' || u.kind === 'chud') &&
            u.team !== c.team &&
            u.isTargetable() &&
            world.vision.canSee(c.team, u) &&
            dist(u.pos, aim) <= SUMMONER_PICK + u.radius &&
            dist(u.pos, c.pos) <= SMITE.range + c.radius + u.radius,
        ),
    );
    if (!t) return false;
    world.damage(c, t, byLevel(SMITE.damage[0], SMITE.damage[1], c.level), 'true', { proc: true });
    world.emit({ e: 'fx', fx: 'smite', ...at(t.pos), x2: Math.round(c.pos.x), y2: Math.round(c.pos.y), r: t.radius, team: c.team });
    return true;
  },

  clarity(world, c) {
    for (const u of world.units()) {
      if (u.kind !== 'champion' || u.team !== c.team || u.dead || u.stats.maxMana <= 0) continue;
      if (u !== c && dist(u.pos, c.pos) > CLARITY.radius + u.radius) continue;
      u.mana = Math.min(u.stats.maxMana, u.mana + u.stats.maxMana * (u === c ? CLARITY.self : CLARITY.allies));
    }
    world.emit({ e: 'fx', fx: 'clarity', ...at(c.pos), r: CLARITY.radius, team: c.team });
    return true;
  },

  mark(world, c, aim, slot) {
    const dir = dirTo(c.pos, aim);
    world.add(
      new LineProjectile(world, c, {
        from: { ...c.pos },
        dir,
        speed: MARK.speed,
        range: MARK.range,
        width: MARK.width,
        vis: 'snowball',
        pierce: false,
        onHit: (w, t) => {
          w.damage(c, t, byLevel(MARK.damage[0], MARK.damage[1], c.level), 'true', { proc: true });
          w.emit({ e: 'fx', fx: 'markHit', ...at(t.pos), r: t.radius, team: c.team });
          if (t.dead || c.dead) return;
          t.addStatus(w, 'marked', MARK.markFor);
          c.marked = { slot, targetId: t.id, until: w.time + MARK.markFor };
        },
      }),
    );
    return true;
  },
};

/** Where a Teleport to `post` comes out: just in front of it (beside a structure, which you can't stand in). */
function arrival(world: World, c: Champion, post: Unit): Vec2 {
  return world.grid.nearestWalkable(add(post.pos, { x: 0, y: post.radius + c.radius + 10 })) ?? { ...post.pos };
}

/** A structure Teleport can land beside: a Shootie or an Oakner (not Da Base). */
function isPost(u: Unit): boolean {
  return (u as Unit & { role?: string }).role !== 'daBase';
}

/** Mark's second press: dash to whoever's marked (if they're still there to dash to). */
function dashToMark(world: World, c: Champion): boolean {
  const m = c.marked!;
  c.marked = null;
  const t = world.getUnit(m.targetId);
  if (!t || t.dead || world.time > m.until || !t.isTargetable() || !world.vision.canSee(c.team, t) || !canCast(c, 'mark')) return false;
  t.clearStatus('marked');
  const gap = t.radius + c.radius;
  const d = dist(c.pos, t.pos);
  const dest = d > gap ? add(t.pos, scale(dirTo(t.pos, c.pos), gap)) : { ...c.pos };
  c.cancelRecall();
  c.startDash(world, world.grid.nearestWalkable(dest) ?? dest, Math.max(0.1, d / MARK.dashSpeed));
  c.commandAttack(t);
  world.emit({ e: 'fx', fx: 'markDash', ...at(c.pos), x2: Math.round(t.pos.x), y2: Math.round(t.pos.y), team: c.team });
  return true;
}

/** Teleport's channel, every tick: lands at the end, unless something's stopped it. */
export function tickTeleport(world: World, c: Champion): void {
  const tp = c.teleporting;
  if (!tp) return;
  if (c.dead || c.has('stun') || c.has('fear') || c.has('airborne') || c.has('stasis')) return cutTeleport(world, c);
  if (world.time < tp.at) return;
  const post = world.getUnit(tp.targetId);
  if (!post || post.dead) return cutTeleport(world, c);
  c.teleporting = null;
  tp.mark.removed = true;
  c.clearStatus('teleport');
  const from = { ...c.pos };
  const dest = arrival(world, c, post);
  c.blinkTo(world, dest);
  c.commandStop();
  world.emit({ e: 'fx', fx: 'teleportArrive', ...at(dest), x2: Math.round(from.x), y2: Math.round(from.y), r: c.radius, team: c.team });
}

/** A Teleport cut short (moved, acted, stunned, or its post fell): no trip, and back in a few seconds. */
export function cutTeleport(world: World, c: Champion): void {
  const tp = c.teleporting;
  if (!tp) return;
  c.teleporting = null;
  tp.mark.removed = true;
  c.clearStatus('teleport');
  c.summonerReady[tp.slot] = world.time + TELEPORT.cutShort;
}
