import type { ChampionId } from '../shared/champions/types';

// Champion voices, made from scratch like the rest of the sound: a buzzing "throat" shaped into vowels,
// plus breath and growl. Each champion has a voice (how deep, how big, how rough) and says a few kinds of
// things: laughs, taunts, cheers, gibberish lines (think a cartoon mumble), a shout on their ultimate, a
// bark after a kill, a grunt when hit hard, and a groan as they fall.

export type VoiceMoment = 'taunt' | 'laugh' | 'cheer' | 'line' | 'kill' | 'ult' | 'hurt' | 'death' | 'grumble';

/** One sound in an utterance: when (seconds from the start), pitch gliding f0 to f1, and which vowel. */
export interface Syllable {
  at: number;
  f0: number;
  f1: number;
  dur: number;
  vol: number;
  /** Formant frequencies (the vowel's shape), already scaled to the speaker's size. */
  formants: readonly number[];
  /** A puff of air before it ("h"), 0–1. */
  breath: number;
  /** Rough noise under it (a growl), 0–1. */
  growl: number;
}

type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';
/** Rough first and second formants of each vowel for an average adult voice. */
const VOWELS: Record<Vowel, [number, number]> = { a: [730, 1090], e: [530, 1840], i: [300, 2250], o: [570, 840], u: [320, 870] };

interface VoiceSpec {
  /** Speaking pitch, Hz. */
  pitch: number;
  /** Bigger bodies have lower formants: 1 is average, under 1 is bigger. */
  size: number;
  growl: number;
  breath: number;
  /** Syllables per second when talking. */
  pace: number;
  /** Their laugh's vowel and their favorite vowels for gibberish. */
  laugh: Vowel;
  talk: readonly Vowel[];
  /** An extra high formant: a nasal, reedy edge (Willmore's sewer whine). */
  nasal?: number;
}

const VOICES: Record<ChampionId, VoiceSpec> = {
  marksman: { pitch: 215, size: 1.08, growl: 0, breath: 0.25, pace: 7, laugh: 'e', talk: ['e', 'a', 'i', 'o'] },
  barbarian: { pitch: 92, size: 0.8, growl: 0.6, breath: 0.15, pace: 5, laugh: 'a', talk: ['a', 'o', 'u'] },
  willmore: { pitch: 175, size: 1.05, growl: 0.1, breath: 0.2, pace: 9, laugh: 'e', talk: ['e', 'i', 'a'], nasal: 2600 },
  hunnag: { pitch: 290, size: 1.18, growl: 0, breath: 0.45, pace: 8, laugh: 'i', talk: ['i', 'e', 'u'] },
  logan: { pitch: 80, size: 0.76, growl: 0.75, breath: 0.2, pace: 5, laugh: 'a', talk: ['a', 'o'] },
  daltonomo: { pitch: 205, size: 1, growl: 0, breath: 0.35, pace: 10, laugh: 'e', talk: ['e', 'i', 'a', 'o'] },
  havarti: { pitch: 260, size: 1.1, growl: 0, breath: 0.2, pace: 7, laugh: 'a', talk: ['a', 'o', 'e'] },
  paris: { pitch: 125, size: 0.95, growl: 0, breath: 0.3, pace: 7, laugh: 'o', talk: ['o', 'e', 'a', 'u'], nasal: 2200 },
  dabber: { pitch: 240, size: 1.15, growl: 0, breath: 0.6, pace: 9, laugh: 'i', talk: ['e', 'i', 'u'], nasal: 2400 },
  dongmaster: { pitch: 88, size: 0.78, growl: 0.15, breath: 0.3, pace: 5, laugh: 'a', talk: ['a', 'o', 'u'] },
  kingrix: { pitch: 135, size: 0.95, growl: 0.05, breath: 0.1, pace: 6, laugh: 'o', talk: ['o', 'a', 'e', 'u'] },
};

/** Tiny seeded random, so the same line mumbles the same way each time. */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What `champ` sounds like saying `moment`; `n` picks among variations. */
export function utterance(champ: ChampionId, moment: VoiceMoment, n = 0): Syllable[] {
  const v = VOICES[champ];
  const rand = rng(n * 31 + moment.length * 7 + champ.length);
  const shape = (vowel: Vowel) => [...VOWELS[vowel].map((f) => f * v.size), ...(v.nasal ? [v.nasal] : [])];
  const syl = (at: number, vowel: Vowel, f0: number, f1: number, dur: number, vol: number, breath = v.breath, growl = v.growl): Syllable => ({
    at,
    f0: f0 * v.pitch,
    f1: f1 * v.pitch,
    dur,
    vol,
    formants: shape(vowel),
    breath,
    growl,
  });
  const beat = 1 / v.pace;
  switch (moment) {
    case 'laugh': {
      // "Ha ha ha ha", each one a little lower and softer.
      const count = 3 + Math.floor(rand() * 2);
      return Array.from({ length: count }, (_, i) => syl(i * beat * 1.1, v.laugh, 1.25 - i * 0.07, 1.1 - i * 0.07, beat * 0.75, 0.9 - i * 0.12, 0.5));
    }
    case 'line':
    case 'taunt': {
      // Gibberish speech: a run of syllables wandering in pitch, the last one rising (a taunt) or falling.
      const count = moment === 'line' ? 4 + Math.floor(rand() * 3) : 3;
      return Array.from({ length: count }, (_, i) => {
        const last = i === count - 1;
        const p = 0.9 + rand() * 0.3;
        const end = last ? (moment === 'taunt' ? p * 1.25 : p * 0.8) : p * (0.95 + rand() * 0.1);
        return syl(i * beat, v.talk[Math.floor(rand() * v.talk.length)], p, end, beat * (last ? 1.6 : 0.85), 0.75 + rand() * 0.2, rand() * v.breath);
      });
    }
    case 'cheer':
      // "Ha-HAAA!"
      return [syl(0, v.talk[0], 1.05, 1.1, beat * 0.7, 0.8, 0.5), syl(beat * 0.9, 'a', 1.3, 1.5, beat * 3, 1)];
    case 'kill':
      // A short bark of triumph.
      return [syl(0, v.talk[0], 1.2, 1.0, beat * 0.8, 0.9), syl(beat, 'a', 1.15, 0.9, beat * 1.8, 0.85)];
    case 'ult':
      // The big shout: a breath in, then a long cry that rises and falls, with all the growl they've got.
      return [syl(0, 'a', 0.95, 1.35, 0.32, 0.95, 0.6, Math.min(1, v.growl * 1.5 + 0.1)), syl(0.3, 'a', 1.35, 0.95, 0.55, 1, 0, Math.min(1, v.growl * 1.5 + 0.1))];
    case 'hurt':
      return [syl(0, rand() < 0.5 ? 'u' : 'e', 1.15, 0.85, 0.16, 0.8, 0.6)];
    case 'grumble':
      // "Hmm-mph": two low, short, falling sounds, under their breath.
      return [syl(0, v.talk[0], 0.9, 0.8, beat * 0.6, 0.5, 0.4), syl(beat * 0.7, 'u', 0.8, 0.62, beat * 1.1, 0.42, 0.5)];
    case 'death':
      return [syl(0, 'a', 1.1, 0.55, 0.75, 0.9, 0.4), syl(0.7, 'o', 0.6, 0.4, 0.45, 0.45, 0.6)];
  }
}
