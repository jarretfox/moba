import { Champion } from '../champions/champion';
import { DT, type PlayerTeam } from '../constants';
import { dist } from '../math';
import type { Unit } from './unit';
import type { World, WorldSystem } from './world';

/** How close to your spawn point counts as standing in the fountain. */
export const FOUNTAIN_RADIUS = 500;
/** Share of max health (and mana) restored per second in the fountain. */
const FOUNTAIN_REGEN = 0.12;

/**
 * The fountain's guardian crystal, against spawn camping. Any enemy champion on the platform is zapped
 * every half second for a big share of their health in true damage, and so is anyone who hits a champion
 * on the platform from outside it, within `guard` of the spawn, for a few seconds after.
 */
export const FOUNTAIN_ZAP = {
  every: 0.5,
  maxHpShare: 0.18,
  flat: 80,
  /** How far from the spawn it reaches someone who hit a champion on the platform. */
  guard: 1000,
  /** How long it keeps after them. */
  grudge: 3,
};

/**
 * Champions standing in their own fountain heal up fast (rage isn't refilled; it's earned in fights).
 * Enemies standing in it, or shooting into it, get zapped.
 */
export class Fountain implements WorldSystem {
  private readonly nextZap: Record<PlayerTeam, number> = { 1: 0, 2: 0 };
  /** Enemies who hit someone on a team's platform: their unit id, and until when the crystal is after them. */
  private readonly grudges: Record<PlayerTeam, Map<number, number>> = { 1: new Map(), 2: new Map() };

  update(world: World): void {
    for (const u of world.units()) {
      if (!(u instanceof Champion) || u.dead) continue;
      if (dist(u.pos, world.map.spawns[u.team as PlayerTeam]) > FOUNTAIN_RADIUS) continue;
      u.hp = Math.min(u.stats.maxHp, u.hp + u.stats.maxHp * FOUNTAIN_REGEN * DT);
      if (u.info.resource === 'mana') u.mana = Math.min(u.stats.maxMana, u.mana + u.stats.maxMana * FOUNTAIN_REGEN * DT);
    }
    for (const team of [1, 2] as const) this.guard(world, team);
  }

  private guard(world: World, team: PlayerTeam): void {
    const spawn = world.map.spawns[team];
    const grudges = this.grudges[team];
    // Whoever just hit one of ours on the platform from close by is on the list for a while.
    for (const call of world.recentHelpCalls()) {
      if (call.victim.team !== team || call.attacker.team === team) continue;
      if (dist(call.victim.pos, spawn) > FOUNTAIN_RADIUS || dist(call.attacker.pos, spawn) > FOUNTAIN_ZAP.guard) continue;
      grudges.set(call.attacker.id, world.time + FOUNTAIN_ZAP.grudge);
    }
    for (const [id, until] of grudges) if (until < world.time) grudges.delete(id);
    if (world.time < this.nextZap[team]) return;
    const targets: Unit[] = [];
    for (const u of world.units()) {
      if (!(u instanceof Champion) || u.dead || u.team === team || !u.isTargetable()) continue;
      const d = dist(u.pos, spawn);
      if (d <= FOUNTAIN_RADIUS + u.radius || (grudges.has(u.id) && d <= FOUNTAIN_ZAP.guard)) targets.push(u);
    }
    if (!targets.length) return;
    this.nextZap[team] = world.time + FOUNTAIN_ZAP.every;
    // Da Base keeps the crystal: its kills are Da Base's.
    const keeper = world.units().find((s) => s.kind === 'structure' && s.team === team && (s as Unit & { role?: string }).role === 'daBase') ?? null;
    for (const u of targets) {
      world.emit({ e: 'zap', x: Math.round(spawn.x), y: Math.round(spawn.y), x2: Math.round(u.pos.x), y2: Math.round(u.pos.y), team });
      world.damage(keeper, u, u.stats.maxHp * FOUNTAIN_ZAP.maxHpShare + FOUNTAIN_ZAP.flat, 'true');
    }
  }
}
