import type { Champion } from '../champions/champion';
import { clamp, type Vec2 } from '../math';
import type { Command } from '../protocol';
import type { World } from './world';

/**
 * Carries out one player (or bot) command on a champion. From M2 on, commands arrive from other
 * people's browsers, so nothing in them is trusted: coordinates are checked, targets validated.
 */
export function applyCommand(world: World, unit: Champion, cmd: Command): void {
  if (unit.dead) return;
  if (cmd.k !== 'recall') unit.cancelRecall(); // any other order breaks a recall
  switch (cmd.k) {
    case 'move': {
      const p = toPoint(world, cmd.x, cmd.y);
      if (p) unit.commandMove(world, p);
      return;
    }
    case 'attack': {
      const target = world.getUnit(cmd.target);
      if (target && target.team !== unit.team && target.isTargetable() && world.vision.canSee(unit.team, target)) unit.commandAttack(target);
      return;
    }
    case 'stop':
      unit.commandStop();
      return;
    case 'cast': {
      const p = toPoint(world, cmd.x, cmd.y);
      if (p && (cmd.slot === 0 || cmd.slot === 1 || cmd.slot === 2 || cmd.slot === 3)) unit.tryCast(world, cmd.slot, p);
      return;
    }
    case 'recall':
      unit.startRecall(world);
      return;
  }
}

function toPoint(world: World, x: unknown, y: unknown): Vec2 | null {
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp(x, 0, world.map.width), y: clamp(y, 0, world.map.height) };
}
