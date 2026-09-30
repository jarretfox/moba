import { Champion } from '../champions/champion';
import { dist } from '../math';
import { Chud } from './chud';
import { ASSIST_GOLD, CHUD_REWARD, STRUCTURE_GOLD, XP_SHARE_RANGE, killBounty, killXp, xpShare } from './progression';
import { Structure } from './structure';
import type { Unit } from './unit';
import type { World } from './world';

/**
 * Hands out gold and experience when something dies. `helpers` are the champions who hurt the victim
 * recently, most recent first.
 */
export function rewardDeath(world: World, victim: Unit, source: Unit | null, helpers: Unit[]): void {
  if (victim instanceof Chud) return rewardChud(world, victim, source);
  if (victim instanceof Structure) return rewardStructure(world, victim, source);
  if (victim.isChampionLike()) rewardTakedown(world, victim, source, helpers);
}

/** Gold only for the last hit; experience for every enemy champion nearby, whoever got the kill. */
function rewardChud(world: World, chud: Chud, source: Unit | null): void {
  const reward = CHUD_REWARD[chud.chudType];
  if (source instanceof Champion && source.team !== chud.team) source.gainGold(world, reward.gold);
  const nearby = world
    .units()
    .filter((u): u is Champion => u instanceof Champion && !u.dead && u.team !== chud.team && dist(u.pos, chud.pos) <= XP_SHARE_RANGE);
  const each = reward.xp * xpShare(nearby.length);
  for (const c of nearby) c.gainXp(world, each);
}

/** The whole destroying team gets paid. */
function rewardStructure(world: World, s: Structure, source: Unit | null): void {
  const team = s.team === 1 ? 2 : 1;
  const gold = STRUCTURE_GOLD[s.role];
  for (const u of world.units()) if (u instanceof Champion && u.team === team) u.gainGold(world, gold);
  const credit = source instanceof Champion ? source.name : team === 1 ? 'Blue' : 'Red';
  world.emit({ e: 'kill', killer: credit, victim: s.name, team });
}

function rewardTakedown(world: World, victim: Unit, source: Unit | null, helpers: Unit[]): void {
  const enemies = helpers.filter((h): h is Champion => h instanceof Champion && h.team !== victim.team);
  for (const h of enemies) h.onTakedown(world, victim);
  if (!(victim instanceof Champion)) return; // training dummies count as takedowns, but pay nothing

  // A champion who hurt them in the last few seconds gets the kill even if a Shootie or Chud finished them.
  const killer = source instanceof Champion && source.team !== victim.team ? source : enemies[0];
  const assisters = enemies.filter((h) => h !== killer);
  if (killer) {
    killer.gainGold(world, killBounty(victim.streak));
    killer.streak++;
  }
  for (const a of assisters) a.gainGold(world, ASSIST_GOLD / assisters.length);
  const xpTakers = killer ? [killer, ...assisters] : assisters;
  for (const c of xpTakers) c.gainXp(world, killXp(victim.level) / xpTakers.length);
  victim.streak = 0;
  world.emit({ e: 'kill', killer: killer?.name ?? 'Executed', victim: victim.name, team: killer?.team ?? 0 });
}
