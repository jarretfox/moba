import type { Slot } from '../constants';
import type { ChudType } from '../protocol';

// ─── Tuning: experience, levels, gold ─────────────────────────────────────────

export const MAX_LEVEL = 13;
/** Experience to go from `level` to `level + 1`. */
export const xpToNext = (level: number): number => 180 + 70 * (level - 1);

/** Levels at which the ultimate can take its 1st, 2nd and 3rd rank. */
export const ULT_LEVELS = [5, 9, 13];
export const MAX_BASIC_RANK = 4;
export const MAX_ULT_RANK = 3;

/** Whether an ability can take another rank at this champion level (League's rule: basics need level 1/3/5/7). */
export function canRankUp(slot: Slot, rank: number, level: number): boolean {
  if (slot === 3) return rank < MAX_ULT_RANK && level >= ULT_LEVELS[rank];
  return rank < MAX_BASIC_RANK && level >= 2 * rank + 1;
}

export const STARTING_GOLD = 500;
/** Passive income once the first minute is up. */
export const PASSIVE_GOLD = { perSecond: 2, from: 60 };

/** For the champion who lands the killing blow on a Chud (gold), and for nearby enemy champions (experience). */
export const CHUD_REWARD: Record<ChudType, { gold: number; xp: number }> = {
  melee: { gold: 21, xp: 60 },
  ranged: { gold: 14, xp: 30 },
  siege: { gold: 60, xp: 90 },
  brute: { gold: 60, xp: 90 },
};
/** Enemy champions this close to a dying Chud share its experience. */
export const XP_SHARE_RANGE = 1400;
/** Splitting experience with a lane partner costs less than halving it: each of n champions gets this share. */
export const xpShare = (n: number): number => (n <= 1 ? 1 : 1.3 / n);

/** Gold for killing a champion: more for ending a streak (they had it coming). */
export const killBounty = (victimStreak: number): number => Math.min(750, 300 + 75 * Math.max(0, victimStreak - 2));
/** Split among everyone who helped but didn't land the kill. */
export const ASSIST_GOLD = 150;
/** Experience for a champion kill, split among killer and assisters. */
export const killXp = (victimLevel: number): number => 100 + 30 * victimLevel;

/** Gold to every champion on the team that destroys a structure. */
export const STRUCTURE_GOLD = { outerShootie: 125, innerShootie: 150, oakner: 100, baseShootie: 150, daBase: 0 };
