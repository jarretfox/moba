import type { PlayerTeam } from '../constants';
import { Champion } from '../champions/champion';
import { dist } from '../math';
import { MushroomTotem, TOTEM_BOUNTY } from '../champions/hunnag';
import { GUARD_BOUNTY, RoyalGuard } from '../champions/kingrix';
import { Chud } from './chud';
import { CAMPS, MONSTERS, Monster } from './jungle';
import { UNCHAINED, WARDEN, Warden, holdsGrudge } from './warden';
import { ASSIST_GOLD, CHUD_REWARD, STRUCTURE_GOLD, WANTED_STREAK, XP_SHARE_RANGE, killBounty, killXp, xpShare } from './progression';
import { Structure } from './structure';
import type { Unit } from './unit';
import type { World } from './world';

/**
 * Hands out gold and experience when something dies. `helpers` are the champions who hurt the victim
 * recently, most recent first.
 */
export function rewardDeath(world: World, victim: Unit, source: Unit | null, helpers: Unit[]): void {
  if (victim instanceof Chud) return rewardChud(world, victim, source);
  if (victim instanceof Monster) return rewardMonster(world, victim, source, helpers);
  if (victim instanceof Warden) return rewardWarden(world, source, helpers);
  if (victim instanceof RoyalGuard) {
    if (source instanceof Champion && source.team !== victim.team) source.gainGold(world, GUARD_BOUNTY);
    return;
  }
  if (victim instanceof MushroomTotem) {
    if (source instanceof Champion && source.team !== victim.team) source.gainGold(world, TOTEM_BOUNTY);
    return;
  }
  if (victim instanceof Structure) return rewardStructure(world, victim, source);
  if (victim.isChampionLike()) rewardTakedown(world, victim, source, helpers);
}

/** Gold only for the last hit; experience for every enemy champion nearby, whoever got the kill. */
function rewardChud(world: World, chud: Chud, source: Unit | null): void {
  const reward = CHUD_REWARD[chud.chudType];
  if (source instanceof Champion && source.team !== chud.team) {
    source.gainGold(world, reward.gold);
    source.score.cs++;
    for (const u of world.units()) if (u instanceof Champion && u !== source && u.team === source.team && !u.dead) u.onAllyLastHit(world, chud);
  }
  const nearby = world
    .units()
    .filter((u): u is Champion => u instanceof Champion && !u.dead && u.team !== chud.team && dist(u.pos, chud.pos) <= XP_SHARE_RANGE);
  const each = reward.xp * xpShare(nearby.length);
  for (const c of nearby) c.gainXp(world, each);
}

/** Jungle gold and experience go to whoever gets the kill, and so does a camp's buff. */
function rewardMonster(world: World, m: Monster, source: Unit | null, helpers: Unit[]): void {
  const killer = source instanceof Champion ? source : helpers.find((h): h is Champion => h instanceof Champion);
  if (!killer) return;
  const def = MONSTERS[m.monster];
  killer.score.cs++;
  killer.gainGold(world, def.gold);
  killer.gainXp(world, def.xp);
  const buff = CAMPS[m.camp.kind].buff;
  if (buff && m.camp.members[0] === m) killer.gainBuff(world, buff);
}

/**
 * The whole team that kills the Warden gets paid, and its Chuds come out Unchained for a while. If Willmore
 * or HunnaG lands the blow, it's an Uprising: every wave brings a Brute too.
 */
function rewardWarden(world: World, source: Unit | null, helpers: Unit[]): void {
  const killer = source instanceof Champion ? source : helpers.find((h): h is Champion => h instanceof Champion);
  if (!killer) return;
  const team = killer.team as PlayerTeam;
  for (const u of world.units()) {
    if (!(u instanceof Champion) || u.team !== team) continue;
    u.gainGold(world, WARDEN.reward.gold);
    u.gainXp(world, WARDEN.reward.xp);
  }
  const uprising = holdsGrudge(killer);
  world.unchained[team] = { until: world.time + UNCHAINED.duration, uprising };
  world.emit({ e: 'kill', killer: killer.name, victim: uprising ? 'The Warden (Uprising!)' : 'The Warden', team, what: 'warden', killerChamp: killer.info.id, killerSkin: killer.skin });
}

function isRivalry(a: Champion, b: Champion): boolean {
  const ids = new Set([a.info.id, b.info.id]);
  return a.team !== b.team && ids.has('logan') && ids.has('kingrix');
}

/** The whole destroying team gets paid. */
function rewardStructure(world: World, s: Structure, source: Unit | null): void {
  const team = s.team === 1 ? 2 : 1;
  const gold = STRUCTURE_GOLD[s.role];
  for (const u of world.units()) if (u instanceof Champion && u.team === team) u.gainGold(world, gold);
  const credit = source instanceof Champion ? source.name : team === 1 ? 'Blue' : 'Red';
  const by = source instanceof Champion ? { killerChamp: source.info.id, killerSkin: source.skin } : {};
  world.emit({ e: 'kill', killer: credit, victim: s.name, team, what: s.role, ...by });
}

function rewardTakedown(world: World, victim: Unit, source: Unit | null, helpers: Unit[]): void {
  const enemies = helpers.filter((h): h is Champion => h instanceof Champion && h.team !== victim.team);
  for (const h of enemies) h.onTakedown(world, victim);
  if (!(victim instanceof Champion)) return; // training dummies count as takedowns, but pay nothing

  const endedStreak = victim.streak;
  // A champion who hurt them in the last few seconds gets the kill even if a Shootie or Chud finished them.
  const killer = source instanceof Champion && source.team !== victim.team ? source : enemies[0];
  const assisters = enemies.filter((h) => h !== killer);
  // Two Crowns: Logan and King Rix on opposite sides pay double for each other, and the winner keeps a trophy.
  const rivals = killer !== undefined && isRivalry(killer, victim);
  const bounty = killBounty(victim.streak) * (rivals ? 2 : 1);
  if (killer) {
    killer.gainGold(world, bounty);
    if (rivals) killer.takeTrophy(world);
    killer.streak++;
  }
  for (const a of assisters) {
    a.gainGold(world, ASSIST_GOLD / assisters.length);
    a.score.assists++;
  }
  victim.score.deaths++;
  if (killer) killer.score.kills++;
  // Jungle buffs change hands with the kill.
  if (killer) for (const b of victim.lostBuffs) killer.gainBuff(world, b.kind, b.left);
  const xpTakers = killer ? [killer, ...assisters] : assisters;
  for (const c of xpTakers) c.gainXp(world, killXp(victim.level) / xpTakers.length);
  victim.streak = 0;
  // No champion to credit: name whatever did it (a Shootie, the Warden), or call it an execution.
  // The killer has something to say about it.
  if (killer) world.emit({ e: 'emote', id: killer.id, kind: 'kill', n: killer.score.kills, vs: victim.info.id });
  const credit = killer ?? source;
  const team = [...world.units()].filter((u) => u instanceof Champion && u.team === victim.team);
  world.emit({
    e: 'kill',
    killer: credit?.name ?? 'Executed',
    victim: victim.name,
    team: credit?.team ?? 0,
    what: 'champion',
    streak: killer?.streak,
    shutdown: endedStreak >= WANTED_STREAK,
    ...(killer && endedStreak >= WANTED_STREAK ? { bounty } : {}),
    ace: team.length > 1 && team.every((u) => u.dead),
    ...(killer ? { killerChamp: killer.info.id, killerSkin: killer.skin } : {}),
    victimChamp: victim.info.id,
    victimSkin: victim.skin,
  });
}
