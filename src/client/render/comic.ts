import type { ChampionId } from '../../shared/champions/types';

// Comic-book sound effects over the big hits, each champion in their own words: The Oak CHOPs, Paris
// goes SHING, Dongmaster goes POW. Everyone else (Chuds, monsters, Shooties) gets the general ones.

export const HIT_WORDS: Record<ChampionId, readonly string[]> = {
  marksman: ['THWIP!', 'DENIED!', 'NOPE!'],
  barbarian: ['CHOP!', 'THWACK!', 'WHAM!'],
  willmore: ['CLANK!', 'YOINK!', 'CLONK!'],
  hunnag: ['SPLAT!', 'SQUELCH!', 'POOF!'],
  logan: ['RAWR!', 'SLASH!', 'SWIPE!'],
  kingrix: ['BONK!', 'KNEEL!', 'CLANG!'],
  dongmaster: ['POW!', 'BONK!', 'SMACK!'],
  dabber: ['PFFT!', 'TSSS!', 'PUFF!'],
  paris: ['SHING!', 'TOUCHÉ!', 'ZING!'],
  havarti: ['SIZZLE!', 'SHLICK!', 'FWOOSH!'],
  daltonomo: ['STAB!', 'TA-DA!', 'HONK!'],
};

const GENERAL: readonly string[] = ['WHACK!', 'CRUNCH!', 'THUD!'];

/** A word for a big hit by this champion (or anyone else). */
export function hitWord(champ: ChampionId | undefined, roll: number): string {
  const list = champ ? HIT_WORDS[champ] : GENERAL;
  return list[Math.floor(roll * list.length) % list.length];
}

/** Knocked out. */
export const KO_WORD = 'K.O.!';
