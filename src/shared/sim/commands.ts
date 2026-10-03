import type { Champion } from '../champions/champion';
import { clamp, type Vec2 } from '../math';
import { isItemId } from '../items';
import type { PlayerTeam } from '../constants';
import { EMOTE_KINDS, PING_KINDS, type Command } from '../protocol';
import type { World } from './world';

/**
 * Carries out one player (`player`) or bot command on a champion. From M2 on, commands arrive from other
 * people's browsers, so nothing in them is trusted: coordinates are checked, targets validated.
 */
export function applyCommand(world: World, unit: Champion, cmd: Command, player = false): void {
  // Spending skill points is allowed while dead or recalling, and doesn't interrupt anything.
  if (cmd.k === 'levelUp') {
    if (cmd.slot === 0 || cmd.slot === 1 || cmd.slot === 2 || cmd.slot === 3) unit.rankUp(cmd.slot);
    return;
  }
  // So is shopping (the champion checks it's in the fountain or dead).
  if (cmd.k === 'buy') {
    if (isItemId(cmd.item)) unit.buy(world, cmd.item);
    return;
  }
  if (cmd.k === 'sell') {
    if (typeof cmd.slot === 'number') unit.sell(world, cmd.slot);
    return;
  }
  if (cmd.k === 'undo') {
    unit.undo(world);
    return;
  }
  // Pings work dead or alive and don't interrupt anything, but only a few at a time.
  // Emotes don't interrupt anything either; the dead have nothing to emote with.
  if (cmd.k === 'emote') {
    if (!unit.dead && EMOTE_KINDS.includes(cmd.kind) && allow(emoteTimes, EMOTE_LIMIT, EMOTE_WINDOW, world, unit)) {
      world.emit({ e: 'emote', id: unit.id, kind: cmd.kind, n: world.tick });
    }
    return;
  }
  if (cmd.k === 'ping') {
    const p = toPoint(world, cmd.x, cmd.y);
    if (p && PING_KINDS.includes(cmd.kind) && allow(pingTimes, PING_LIMIT, PING_WINDOW, world, unit)) {
      world.emit({ e: 'ping', kind: cmd.kind, x: Math.round(p.x), y: Math.round(p.y), from: unit.id, name: unit.name, team: unit.team as PlayerTeam });
    }
    return;
  }
  if (unit.dead) return;
  // A summoner spell sorts that out itself (a press that does nothing interrupts nothing).
  if (cmd.k === 'spell') {
    const p = toPoint(world, cmd.x, cmd.y);
    if (p && (cmd.slot === 0 || cmd.slot === 1)) unit.castSummoner(world, cmd.slot, p);
    return;
  }
  if (cmd.k !== 'recall') unit.cancelRecall(); // any other order breaks a recall
  unit.cutTeleport(world); // and a Teleport channel
  switch (cmd.k) {
    case 'move': {
      const p = toPoint(world, cmd.x, cmd.y);
      if (!p) return;
      unit.forgetCast();
      unit.commandMove(world, p);
      return;
    }
    case 'attackMove': {
      const p = toPoint(world, cmd.x, cmd.y);
      if (!p) return;
      unit.forgetCast();
      unit.commandAttackMove(world, p);
      return;
    }
    case 'attack': {
      const target = world.getUnit(cmd.target);
      if (target && target.team !== unit.team && target.isTargetable() && world.vision.canSee(unit.team, target)) {
        unit.forgetCast();
        unit.commandAttack(target);
      }
      return;
    }
    case 'stop':
      unit.forgetCast();
      unit.commandStop();
      return;
    case 'cast': {
      const p = toPoint(world, cmd.x, cmd.y);
      if (p && (cmd.slot === 0 || cmd.slot === 1 || cmd.slot === 2 || cmd.slot === 3)) {
        unit.forgetCast();
        // A player's press is held if it's a moment early, and walks in if its target is out of reach.
        unit.tryCast(world, cmd.slot, p, player);
      }
      return;
    }
    case 'recall':
      if (!world.map.aram) unit.startRecall(world); // no Recall in ARAM
      return;
    case 'use': {
      const p = toPoint(world, cmd.x, cmd.y);
      if (p && Number.isInteger(cmd.slot)) unit.useItem(world, cmd.slot, p);
      return;
    }
  }
}

/** At most this many pings per champion in any PING_WINDOW seconds, so nobody can spam their team. */
export const PING_LIMIT = 4;
export const PING_WINDOW = 4;
/** And emotes: a few, then a breather. */
export const EMOTE_LIMIT = 3;
export const EMOTE_WINDOW = 6;
const pingTimes = new WeakMap<Champion, number[]>();
const emoteTimes = new WeakMap<Champion, number[]>();

/** Whether a champion may do another one of these yet (at most `limit` in any `window` seconds). */
function allow(log: WeakMap<Champion, number[]>, limit: number, window: number, world: World, unit: Champion): boolean {
  const recent = (log.get(unit) ?? []).filter((t) => world.time - t < window);
  if (recent.length >= limit) {
    log.set(unit, recent);
    return false;
  }
  recent.push(world.time);
  log.set(unit, recent);
  return true;
}

function toPoint(world: World, x: unknown, y: unknown): Vec2 | null {
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp(x, 0, world.map.width), y: clamp(y, 0, world.map.height) };
}
