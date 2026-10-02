import type { ChampionId } from '../../shared/champions/types';
import type { Slot } from '../../shared/constants';

// How champions move when they attack and cast: a few keyframes per move, played on the figure and the
// weapon in their hand. Turns are in radians (positive is clockwise on screen), distances in the
// champion's radius, and every move starts and ends at rest.
//
// Champions stand side-on (see rig.ts), facing right: a negative turn raises the arm and weapon up and
// back, a positive one brings them down and forward; a reach pushes the hand out in front; a twist turns
// the whole figure (a full turn is a spin); a lunge leans and steps forward; grow rears up. Chuds and
// monsters are still seen from above, where a turn swings the weapon round.

/** [time 0–1, value] */
export type Key = readonly [number, number];

export interface Anim {
  /** Seconds. */
  dur: number;
  /** The weapon turning around its grip. */
  turn?: readonly Key[];
  /** The weapon pushed forward (+) or drawn back (−). */
  reach?: readonly Key[];
  /** The whole figure twisting. */
  twist?: readonly Key[];
  /** The whole figure lunging forward (+) or recoiling (−). */
  lunge?: readonly Key[];
  /** The figure growing (0.1 = 10% bigger): rearing up for a big cast. */
  grow?: readonly Key[];
  /** The weapon stretching out along its length (1 = twice as long): a toad's tongue. */
  stretch?: readonly Key[];
  /** For attacks: how far through (0–1) the blow lands, when the weapon flashes. Halfway if left out. */
  hit?: number;
}

/** The value of a track at time t, eased between keys (0 if there's no track). */
export function sample(keys: readonly Key[] | undefined, t: number): number {
  if (!keys?.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const k = (t - t0) / (t1 - t0 || 1);
      const eased = k * k * (3 - 2 * k);
      return v0 + (v1 - v0) * eased;
    }
  }
  return keys[keys.length - 1][1];
}

const TAU = Math.PI * 2;

/**
 * Basic attacks: each champion's swings, played in turn so no two blows in a row look the same (see
 * `attackAnim`). Each has a wind-up (the weapon drawn back, a lean away), the blow itself at `hit`, and
 * a follow-through that settles back to rest. The first in each list is the champion's signature blow.
 */
export const ATTACKS: Record<ChampionId, readonly Anim[]> = {
  barbarian: [
    // The axe up over his head, held a hair at the top, then down like he's splitting a log.
    { dur: 0.36, hit: 0.6, turn: [[0, 0], [0.3, -1.8], [0.42, -1.85], [0.6, 1.0], [1, 0]], lunge: [[0, 0], [0.3, -0.08], [0.42, -0.1], [0.6, 0.25], [1, 0]], grow: [[0, 0], [0.35, 0.06], [0.62, -0.05], [1, 0]] },
    // A flat sweep: coils right back, then whips the axe round level.
    { dur: 0.36, hit: 0.55, twist: [[0, 0], [0.3, -0.55], [0.4, -0.6], [0.58, 0.7], [1, 0]], turn: [[0, 0], [0.3, -0.4], [0.55, 0.5], [1, 0]], lunge: [[0, 0], [0.3, -0.06], [0.58, 0.18], [1, 0]] },
    // A rising backhand: the axe low behind him, ripped up through them.
    { dur: 0.34, hit: 0.52, turn: [[0, 0], [0.28, 0.9], [0.4, 0.95], [0.55, -1.5], [1, 0]], lunge: [[0, 0], [0.28, -0.05], [0.55, 0.22], [1, 0]], grow: [[0, 0], [0.55, 0.08], [1, 0]] },
  ],
  marksman: [
    // Draw the string back, loose, and rock back from the shot.
    { dur: 0.3, hit: 0.45, reach: [[0, 0], [0.45, -0.22], [0.55, 0.06], [1, 0]], lunge: [[0, 0], [0.55, -0.08], [1, 0]] },
    // A snapshot: a short draw, loosed at once, a hop back onto the back foot.
    { dur: 0.28, hit: 0.4, reach: [[0, 0], [0.3, -0.16], [0.4, 0.08], [1, 0]], lunge: [[0, 0], [0.4, -0.14], [1, 0]], grow: [[0, 0], [0.4, -0.03], [1, 0]] },
    // A high draw: the bow lifted, a full draw, and loosed on the way down.
    { dur: 0.32, hit: 0.5, turn: [[0, 0], [0.4, -0.35], [0.6, -0.1], [1, 0]], reach: [[0, 0], [0.45, -0.26], [0.55, 0.06], [1, 0]] },
  ],
  willmore: [
    // Whirl the hook round once and fling it out.
    { dur: 0.36, hit: 0.55, turn: [[0, 0], [1, -TAU]], reach: [[0, 0], [0.55, 0.35], [1, 0]] },
    // The hook swung up over his head and brought down like a flail.
    { dur: 0.36, hit: 0.55, turn: [[0, 0], [0.3, -2.2], [0.55, 0.6], [1, 0]], lunge: [[0, 0], [0.3, -0.08], [0.55, 0.2], [1, 0]], reach: [[0, 0], [0.55, 0.3], [1, 0]] },
    // Flung out and yanked back: the blow lands on the yank.
    { dur: 0.38, hit: 0.6, reach: [[0, 0], [0.3, 0.55], [0.45, 0.5], [0.6, -0.25], [1, 0]], lunge: [[0, 0], [0.3, 0.12], [0.6, -0.12], [1, 0]] },
  ],
  hunnag: [
    // Lift the staff and jab the spore forward.
    { dur: 0.32, hit: 0.55, turn: [[0, 0], [0.3, -0.5], [0.55, 0.45], [1, 0]], reach: [[0, 0], [0.3, -0.12], [0.55, 0.32], [1, 0]] },
    // A tap of the staff that puffs a spore off the orb.
    { dur: 0.3, hit: 0.5, turn: [[0, 0], [0.3, -0.5], [0.5, 0.25], [1, 0]], reach: [[0, 0], [0.5, 0.1], [1, 0]], grow: [[0, 0], [0.5, 0.06], [1, 0]] },
    // The orb swept across in front of her.
    { dur: 0.34, hit: 0.55, twist: [[0, 0], [0.3, 0.3], [0.55, -0.25], [1, 0]], turn: [[0, 0], [0.3, -0.9], [0.55, 0.3], [1, 0]] },
  ],
  logan: [
    // Claws up, then raked down with a lunge.
    { dur: 0.3, hit: 0.5, turn: [[0, 0], [0.25, -1.3], [0.35, -1.35], [0.5, 0.7], [1, 0]], reach: [[0, 0], [0.5, 0.3], [1, 0]], lunge: [[0, 0], [0.25, -0.06], [0.5, 0.25], [1, 0]] },
    // A backhand swipe across them.
    { dur: 0.3, hit: 0.5, twist: [[0, 0], [0.25, -0.35], [0.5, 0.45], [1, 0]], reach: [[0, 0], [0.5, 0.45], [1, 0]], turn: [[0, 0], [0.25, -0.5], [0.5, 0.6], [1, 0]], lunge: [[0, 0], [0.5, 0.15], [1, 0]] },
    // A bite: the whole lion thrown forward, jaws first.
    { dur: 0.3, hit: 0.5, lunge: [[0, 0], [0.25, -0.12], [0.5, 0.42], [1, 0]], grow: [[0, 0], [0.25, 0.06], [0.5, -0.04], [1, 0]], reach: [[0, 0], [0.5, 0.25], [1, 0]] },
  ],
  kingrix: [
    // A royal flourish of the scepter.
    { dur: 0.36, hit: 0.6, turn: [[0, 0], [0.35, -0.9], [0.6, 0.5], [1, 0]], reach: [[0, 0], [0.5, 0.15], [1, 0]] },
    // A dismissive flick of the wrist.
    { dur: 0.32, hit: 0.5, turn: [[0, 0], [0.3, 0.35], [0.5, -0.7], [1, 0]], reach: [[0, 0], [0.5, 0.35], [1, 0]] },
    // The scepter pointed straight at them: the bolt comes off its tip.
    { dur: 0.36, hit: 0.4, reach: [[0, 0], [0.35, 0.55], [0.6, 0.5], [1, 0]], turn: [[0, 0], [0.35, 1.0], [0.6, 1.0], [1, 0]], grow: [[0, 0], [0.35, 0.04], [1, 0]] },
  ],
  daltonomo: [
    // A quick, sneaky stab.
    { dur: 0.26, hit: 0.3, reach: [[0, 0], [0.3, 0.45], [1, 0]], twist: [[0, 0], [0.3, 0.2], [1, 0]], lunge: [[0, 0], [0.3, 0.15], [1, 0]] },
    // A pirouette, knives out.
    { dur: 0.3, hit: 0.5, twist: [[0, 0], [1, TAU]], reach: [[0, 0], [0.5, 0.35], [1, 0]] },
    // An overhand stab, the knife raised and driven down.
    { dur: 0.3, hit: 0.5, turn: [[0, 0], [0.3, -1.4], [0.5, 0.7], [1, 0]], lunge: [[0, 0], [0.3, -0.05], [0.5, 0.2], [1, 0]] },
    // A ta-da backhand.
    { dur: 0.28, hit: 0.5, twist: [[0, 0], [0.25, 0.3], [0.5, -0.3], [1, 0]], turn: [[0, 0], [0.25, 0.5], [0.5, -0.6], [1, 0]], reach: [[0, 0], [0.5, 0.3], [1, 0]] },
  ],
  havarti: [
    // A downward slash of the flaming cheese knife.
    { dur: 0.32, hit: 0.55, turn: [[0, 0], [0.3, -1.3], [0.55, 0.9], [1, 0]], lunge: [[0, 0], [0.55, 0.12], [1, 0]] },
    // A level sweep of the blade.
    { dur: 0.32, hit: 0.55, twist: [[0, 0], [0.3, 0.35], [0.55, -0.3], [1, 0]], turn: [[0, 0], [0.3, -0.6], [0.55, 0.7], [1, 0]] },
    // A flick of the knife: an upward cut, or the flick that sends a cheese bolt once she's Aged.
    { dur: 0.3, hit: 0.45, reach: [[0, 0], [0.3, -0.2], [0.45, 0.4], [1, 0]], turn: [[0, 0], [0.3, 0.3], [0.45, -0.4], [1, 0]] },
  ],
  paris: [
    // A fencer's thrust: blade and body forward together.
    { dur: 0.26, hit: 0.3, reach: [[0, 0], [0.3, 0.5], [1, 0]], lunge: [[0, 0], [0.3, 0.25], [1, 0]] },
    // A deep lunge, after a half step back to gather it.
    { dur: 0.3, hit: 0.4, lunge: [[0, 0], [0.15, -0.1], [0.4, 0.45], [1, 0]], reach: [[0, 0], [0.15, -0.1], [0.4, 0.7], [1, 0]], twist: [[0, 0], [0.4, -0.15], [1, 0]] },
    // A moulinet: the blade circles up and over into a cut.
    { dur: 0.3, hit: 0.5, turn: [[0, 0], [0.25, -1.3], [0.5, 0.6], [1, 0]], reach: [[0, 0], [0.5, 0.3], [1, 0]] },
    // A flick of the wrist.
    { dur: 0.24, hit: 0.4, turn: [[0, 0], [0.2, 0.4], [0.4, -0.5], [1, 0]], reach: [[0, 0], [0.4, 0.45], [1, 0]], lunge: [[0, 0], [0.4, 0.1], [1, 0]] },
  ],
  dabber: [
    // The rig-bow kicks back as it fires.
    { dur: 0.3, hit: 0.3, reach: [[0, 0], [0.3, -0.15], [0.45, 0.08], [1, 0]], lunge: [[0, 0], [0.45, -0.06], [1, 0]] },
    // Fired from the hip, with a twitch.
    { dur: 0.28, hit: 0.3, twist: [[0, 0], [0.3, 0.25], [0.5, -0.1], [1, 0]], reach: [[0, 0], [0.3, -0.1], [0.4, 0.1], [1, 0]], grow: [[0, 0], [0.3, -0.04], [1, 0]] },
    // A hunch and a cough of smoke.
    { dur: 0.3, hit: 0.4, grow: [[0, 0], [0.25, -0.08], [0.45, 0.06], [1, 0]], reach: [[0, 0], [0.25, -0.18], [0.45, 0.1], [1, 0]] },
  ],
  dongmaster: [
    // A short, heavy jab.
    { dur: 0.28, hit: 0.35, reach: [[0, 0], [0.35, 0.55], [1, 0]], lunge: [[0, 0], [0.35, 0.15], [1, 0]], twist: [[0, 0], [0.35, -0.18], [1, 0]] },
    // A cross: the shoulder wound back, the whole body behind it.
    { dur: 0.3, hit: 0.45, twist: [[0, 0], [0.2, -0.3], [0.45, 0.3], [1, 0]], reach: [[0, 0], [0.2, -0.1], [0.45, 0.7], [1, 0]], lunge: [[0, 0], [0.45, 0.2], [1, 0]] },
    // An uppercut, from the knees.
    { dur: 0.32, hit: 0.5, turn: [[0, 0], [0.25, 0.5], [0.5, -1.3], [1, 0]], lunge: [[0, 0], [0.25, -0.08], [0.5, 0.22], [1, 0]], grow: [[0, 0], [0.25, -0.06], [0.5, 0.1], [1, 0]] },
    // A hook round the side.
    { dur: 0.3, hit: 0.5, twist: [[0, 0], [0.25, 0.35], [0.5, -0.4], [1, 0]], turn: [[0, 0], [0.25, -0.3], [0.5, 0.2], [1, 0]], reach: [[0, 0], [0.5, 0.45], [1, 0]] },
  ],
  scrimby: [
    // Flicks a subway token off the thumb.
    { dur: 0.28, hit: 0.35, reach: [[0, 0], [0.2, -0.15], [0.35, 0.35], [1, 0]], turn: [[0, 0], [0.35, -0.3], [1, 0]] },
    // A sidearm toss, still holding the coffee.
    { dur: 0.3, hit: 0.4, twist: [[0, 0], [0.25, 0.25], [0.4, -0.2], [1, 0]], reach: [[0, 0], [0.4, 0.3], [1, 0]] },
  ],
  bigwhale: [
    // Flips a gold coin at them, not even looking.
    { dur: 0.32, hit: 0.4, turn: [[0, 0], [0.25, 0.4], [0.4, -0.6], [1, 0]], grow: [[0, 0], [0.4, 0.04], [1, 0]] },
    // Peels a bill off the wad and flicks it.
    { dur: 0.3, hit: 0.45, reach: [[0, 0], [0.3, -0.1], [0.45, 0.3], [1, 0]], twist: [[0, 0], [0.45, 0.15], [1, 0]] },
  ],
};

/** Each champion's signature blow (the first of their swings). */
export const ATTACK: Record<ChampionId, Anim> = Object.fromEntries(Object.entries(ATTACKS).map(([id, list]) => [id, list[0]])) as Record<ChampionId, Anim>;

/** The move for a champion's `n`th basic attack: their swings taken in turn. */
export function attackAnim(champ: ChampionId, n: number): Anim {
  const list = ATTACKS[champ];
  return list[((n % list.length) + list.length) % list.length];
}

/** Casting an ability, unless the slot has its own move below. */
export const CAST: Record<ChampionId, Anim> = {
  barbarian: { dur: 0.45, turn: [[0, 0], [0.3, -1.3], [0.7, -1.3], [1, 0]], grow: [[0, 0], [0.3, 0.12], [1, 0]] },
  marksman: { dur: 0.4, reach: [[0, 0], [0.4, -0.3], [0.5, 0.08], [1, 0]], grow: [[0, 0], [0.4, 0.06], [1, 0]] },
  willmore: { dur: 0.5, turn: [[0, 0], [1, -TAU * 2]], grow: [[0, 0], [0.3, 0.08], [1, 0]] },
  hunnag: { dur: 0.5, turn: [[0, 0], [0.35, -1.1], [0.7, -1.1], [1, 0]], reach: [[0, 0], [0.35, 0.2], [1, 0]], grow: [[0, 0], [0.35, 0.1], [1, 0]] },
  logan: { dur: 0.4, reach: [[0, 0], [0.3, 0.4], [1, 0]], grow: [[0, 0], [0.3, 0.15], [1, 0]] },
  kingrix: { dur: 0.5, turn: [[0, 0], [0.35, -1.4], [0.7, -1.4], [1, 0]], grow: [[0, 0], [0.35, 0.1], [1, 0]] },
  dongmaster: { dur: 0.45, grow: [[0, 0], [0.3, 0.12], [1, 0]], reach: [[0, 0], [0.3, 0.25], [1, 0]] },
  dabber: { dur: 0.45, grow: [[0, 0], [0.3, 0.08], [1, 0]], reach: [[0, 0], [0.3, -0.2], [0.5, 0.1], [1, 0]] },
  paris: { dur: 0.4, turn: [[0, 0], [0.3, -1.2], [0.6, 0.6], [1, 0]] },
  havarti: { dur: 0.45, turn: [[0, 0], [0.35, -1.4], [0.7, -1.4], [1, 0]], grow: [[0, 0], [0.35, 0.1], [1, 0]] },
  daltonomo: { dur: 0.45, twist: [[0, 0], [1, TAU]] },
  scrimby: { dur: 0.4, reach: [[0, 0], [0.3, 0.4], [1, 0]], turn: [[0, 0], [0.3, -0.8], [1, 0]] },
  bigwhale: { dur: 0.45, turn: [[0, 0], [0.35, -1.3], [0.7, -1.3], [1, 0]], grow: [[0, 0], [0.35, 0.08], [1, 0]] },
};

/** Abilities with a move of their own. */
const SLOT_MOVES: Partial<Record<`${ChampionId}:${Slot}`, Anim>> = {
  // Express Train: a deep breath and a stamp.
  'scrimby:3': { dur: 0.45, grow: [[0, 0], [0.4, 0.12], [1, 0]], lunge: [[0, 0], [0.4, -0.1], [0.8, 0.15], [1, 0]] },
  // Splash Zone: a crouch to breach.
  'bigwhale:3': { dur: 0.5, grow: [[0, 0], [0.3, -0.12], [0.6, 0.16], [1, 0]] },
  // Cleave: a full spin with the axe out.
  'barbarian:0': { dur: 0.34, twist: [[0, 0], [1, -TAU]], turn: [[0, 0], [0.2, 0.5], [1, 0]] },
  // War Cry: rear up and roar.
  'barbarian:1': { dur: 0.5, grow: [[0, 0], [0.25, 0.22], [0.7, 0.18], [1, 0]], turn: [[0, 0], [0.25, -1.2], [1, 0]] },
  // Maul: two quick rakes.
  'logan:2': { dur: 0.4, reach: [[0, 0], [0.2, 0.6], [0.4, 0], [0.6, 0.6], [1, 0]], lunge: [[0, 0], [0.2, 0.25], [0.4, 0], [0.6, 0.25], [1, 0]], twist: [[0, 0], [0.2, -0.2], [0.6, 0.2], [1, 0]] },
  // Pride's Roar: throw the head back and roar.
  'logan:3': { dur: 0.55, grow: [[0, 0], [0.25, 0.28], [0.75, 0.22], [1, 0]], lunge: [[0, 0], [0.25, -0.15], [0.5, 0.15], [1, 0]] },
  // Longshot: a long, deep draw.
  'marksman:3': { dur: 0.6, reach: [[0, 0], [0.75, -0.4], [0.85, 0.1], [1, 0]], lunge: [[0, 0], [0.85, -0.15], [1, 0]] },
  // Now You See Me: shrinks into nothing.
  'daltonomo:0': { dur: 0.35, grow: [[0, 0], [0.4, -0.3], [1, 0]] },
  // Juggling Knives: a flick of the wrist.
  'daltonomo:2': { dur: 0.35, reach: [[0, 0], [0.3, -0.25], [0.5, 0.4], [1, 0]], turn: [[0, 0], [0.3, 0.4], [0.5, -0.3], [1, 0]] },
  // Double Act: a deep, theatrical bow.
  'daltonomo:3': { dur: 0.7, lunge: [[0, 0], [0.3, 0.25], [0.7, 0.25], [1, 0]], grow: [[0, 0], [0.3, -0.1], [0.7, -0.1], [1, 0]] },
  // Holy Wheel: wind up and hurl.
  'havarti:0': { dur: 0.4, reach: [[0, 0], [0.3, -0.25], [0.5, 0.35], [1, 0]], twist: [[0, 0], [0.3, 0.3], [0.5, -0.2], [1, 0]] },
  // Divine Fondue: blade raised to the sky.
  'havarti:3': { dur: 0.8, turn: [[0, 0], [0.3, -1.9], [0.8, -1.9], [1, 0]], grow: [[0, 0], [0.3, 0.16], [0.8, 0.12], [1, 0]] },
  // Flèche: the full lunge.
  'paris:0': { dur: 0.35, reach: [[0, 0], [0.3, 0.7], [1, 0]], lunge: [[0, 0], [0.3, 0.4], [1, 0]], twist: [[0, 0], [0.3, -0.2], [1, 0]] },
  // Café Break: settles in.
  'paris:1': { dur: 0.6, grow: [[0, 0], [0.4, -0.06], [1, 0]], turn: [[0, 0], [0.4, 0.8], [1, 0]] },
  // Encore: a salute to the crowd.
  'paris:3': { dur: 0.8, turn: [[0, 0], [0.3, -1.6], [0.7, -1.6], [1, 0]], grow: [[0, 0], [0.3, 0.12], [1, 0]] },
  // Hotbox: a crouch and a big puff.
  'dabber:0': { dur: 0.6, grow: [[0, 0], [0.3, -0.12], [0.6, 0.1], [1, 0]], twist: [[0, 0], [0.3, 0.3], [1, 0]] },
  // Light It Up: a flick of the lighter.
  'dabber:2': { dur: 0.4, turn: [[0, 0], [0.3, -1.2], [0.5, 0.3], [1, 0]] },
  // Cloud Nine: rig up high, rearing back into the smoke.
  'dabber:3': { dur: 0.7, grow: [[0, 0], [0.3, 0.18], [0.8, 0.12], [1, 0]], turn: [[0, 0], [0.3, -1.4], [0.8, -1.4], [1, 0]] },
  // Chin Check: wind back and throw the uppercut.
  'dongmaster:0': { dur: 0.35, turn: [[0, 0], [0.25, 0.4], [0.5, -1.5], [1, 0]], lunge: [[0, 0], [0.25, -0.1], [0.5, 0.3], [1, 0]], grow: [[0, 0], [0.25, -0.06], [0.5, 0.1], [1, 0]] },
  // Sigma Stare: lean in, dead still.
  'dongmaster:2': { dur: 0.6, lunge: [[0, 0], [0.3, 0.2], [0.8, 0.2], [1, 0]], grow: [[0, 0], [0.3, 0.06], [1, 0]] },
  // Ascension: a double biceps pose, swelling up.
  'dongmaster:3': { dur: 0.7, grow: [[0, 0], [0.3, 0.32], [0.8, 0.26], [1, 0]], reach: [[0, 0], [0.3, -0.25], [0.8, -0.25], [1, 0]] },
  // KNEEL!: the scepter raised high, then brought down.
  'kingrix:2': { dur: 0.5, turn: [[0, 0], [0.4, -1.6], [0.6, 0.4], [1, 0]], grow: [[0, 0], [0.4, 0.15], [0.6, -0.05], [1, 0]] },
};

/** Chuds' and monsters' attacks, keyed "chud:melee", "monster:rat" and so on. */
export const UNIT_ATTACK: Record<string, Anim> = {
  // A whack with the club.
  'chud:melee': { dur: 0.3, turn: [[0, 0], [0.35, -1.2], [0.6, 0.8], [1, 0]], lunge: [[0, 0], [0.6, 0.15], [1, 0]] },
  // The Brute winds right back and brings it down hard.
  'chud:brute': { dur: 0.45, turn: [[0, 0], [0.45, -1.7], [0.65, 1.0], [1, 0]], lunge: [[0, 0], [0.45, -0.1], [0.65, 0.2], [1, 0]], grow: [[0, 0], [0.45, 0.08], [0.65, -0.03], [1, 0]] },
  // A royal guard's spear thrust.
  guard: { dur: 0.32, reach: [[0, 0], [0.35, 0.5], [1, 0]], lunge: [[0, 0], [0.35, 0.18], [1, 0]] },
  // Whirl the sling once and let go.
  'chud:ranged': { dur: 0.32, turn: [[0, 0], [1, -TAU]], lunge: [[0, 0], [0.7, 0.06], [1, 0]] },
  // The cart's arm rocks back, then throws (and the cart bucks).
  'chud:siege': { dur: 0.45, reach: [[0, 0], [0.4, -0.35], [0.55, 0.25], [1, 0]], lunge: [[0, 0], [0.55, -0.08], [1, 0]] },
  'monster:rat': { dur: 0.26, lunge: [[0, 0], [0.4, 0.4], [1, 0]], twist: [[0, 0], [0.4, 0.15], [1, 0]] },
  'monster:ratKing': { dur: 0.3, lunge: [[0, 0], [0.4, 0.35], [1, 0]], twist: [[0, 0], [0.4, -0.15], [1, 0]] },
  // The head snaps out of the shell.
  'monster:mossback': { dur: 0.4, reach: [[0, 0], [0.35, 0.5], [1, 0]], lunge: [[0, 0], [0.35, 0.08], [1, 0]] },
  // Out shoots the tongue.
  'monster:emberToad': { dur: 0.36, stretch: [[0, 0], [0.3, 7], [0.65, 0], [1, 0]], grow: [[0, 0], [0.25, 0.06], [1, 0]] },
  // Puffs up, spores everywhere.
  'monster:glowcap': { dur: 0.4, grow: [[0, 0], [0.3, 0.15], [1, 0]] },
  // Swings its shackle round on the chain.
  'monster:warden': { dur: 0.5, turn: [[0, 0], [0.35, -1.2], [0.6, 0.8], [1, 0]], reach: [[0, 0], [0.55, 0.4], [1, 0]], lunge: [[0, 0], [0.55, 0.1], [1, 0]] },
};

/** The Warden rearing back through its slam warning, then crashing down as it ends. */
export function wardenWindup(telegraph: number): Anim {
  const dur = telegraph + 0.35;
  const hit = telegraph / dur;
  const after = hit + (1 - hit) * 0.35;
  return {
    dur,
    grow: [[0, 0], [hit * 0.9, 0.18], [after, -0.06], [1, 0]],
    lunge: [[0, 0], [hit * 0.9, -0.18], [after, 0.25], [1, 0]],
    turn: [[0, 0], [hit * 0.9, -2.4], [after, 0.5], [1, 0]],
    reach: [[0, 0], [hit * 0.9, -0.2], [after, 0.45], [1, 0]],
  };
}

/** Emotes and kill quips: a lunge for a taunt, a wobble for a laugh, bouncing for a cheer. */
export const EMOTE_ANIM: Record<'taunt' | 'laugh' | 'cheer' | 'line' | 'kill', Anim> = {
  taunt: { dur: 0.7, lunge: [[0, 0], [0.25, 0.3], [0.45, 0.25], [1, 0]], grow: [[0, 0], [0.25, 0.12], [1, 0]], turn: [[0, 0], [0.25, -0.8], [0.6, -0.8], [1, 0]] },
  laugh: { dur: 0.9, twist: [[0, 0], [0.15, 0.18], [0.3, -0.18], [0.45, 0.18], [0.6, -0.18], [0.8, 0.1], [1, 0]], grow: [[0, 0], [0.2, 0.06], [0.4, 0], [0.6, 0.06], [1, 0]] },
  cheer: { dur: 0.9, grow: [[0, 0], [0.2, 0.2], [0.4, 0], [0.6, 0.2], [0.8, 0], [1, 0]], turn: [[0, 0], [0.2, -1.2], [0.8, -1.2], [1, 0]] },
  line: { dur: 0.6, grow: [[0, 0], [0.3, 0.1], [1, 0]] },
  kill: { dur: 0.6, grow: [[0, 0], [0.25, 0.15], [1, 0]], turn: [[0, 0], [0.25, -1], [1, 0]] },
};

/**
 * What champions do with themselves when they stand still a while: little bits of character, played one
 * after another every several seconds.
 */
export const FIDGETS: Record<ChampionId, readonly Anim[]> = {
  marksman: [
    // Draws the string back gently, checks it, and lets it down.
    { dur: 1.6, reach: [[0, 0], [0.3, -0.18], [0.6, -0.18], [0.7, 0.02], [1, 0]], grow: [[0, 0], [0.3, 0.03], [1, 0]] },
    // A look over each shoulder.
    { dur: 1.8, twist: [[0, 0], [0.25, -0.6], [0.45, -0.6], [0.7, 0.55], [0.85, 0.55], [1, 0]] },
  ],
  barbarian: [
    // Hefts the axe up onto his shoulder, then back down.
    { dur: 1.7, turn: [[0, 0], [0.25, -1.9], [0.75, -1.9], [1, 0]], grow: [[0, 0], [0.25, 0.08], [0.75, 0.06], [1, 0]] },
    // Cracks his neck: a snap one way, a snap the other.
    { dur: 1.0, twist: [[0, 0], [0.2, 0.3], [0.3, 0], [0.55, -0.3], [0.65, 0], [1, 0]] },
  ],
  willmore: [
    // Turns round to rummage in his sack.
    { dur: 2.0, twist: [[0, 0], [0.25, 2.6], [0.4, 2.4], [0.5, 2.7], [0.6, 2.45], [0.75, 2.6], [1, 0]] },
    // Twirls the hook on its rope.
    { dur: 1.2, turn: [[0, 0], [1, TAU * 2]] },
  ],
  hunnag: [
    // Puffs up and lets out a cloud of spores, twice.
    { dur: 1.4, grow: [[0, 0], [0.2, 0.12], [0.4, 0], [0.6, 0.1], [0.8, 0], [1, 0]] },
    // Taps the staff on the ground.
    { dur: 1.2, reach: [[0, 0], [0.2, 0.15], [0.3, 0], [0.5, 0.15], [0.6, 0], [1, 0]], turn: [[0, 0], [0.2, 0.2], [0.6, 0.2], [1, 0]] },
  ],
  logan: [
    // Licks a paw: draws it in, a few quick licks, puts it down.
    { dur: 1.8, reach: [[0, 0], [0.25, -0.3], [0.8, -0.3], [1, 0]], twist: [[0, 0], [0.25, 0.25], [0.35, 0.18], [0.45, 0.25], [0.55, 0.18], [0.65, 0.25], [0.8, 0.25], [1, 0]] },
    // A long cat stretch: forward and low, then up.
    { dur: 2.0, lunge: [[0, 0], [0.35, 0.3], [0.6, 0.3], [1, 0]], reach: [[0, 0], [0.35, 0.5], [0.6, 0.5], [1, 0]], grow: [[0, 0], [0.35, -0.06], [0.75, 0.08], [1, 0]] },
  ],
  dongmaster: [
    // A flex: shoulders up, fists back, hold.
    { dur: 1.6, grow: [[0, 0], [0.25, 0.14], [0.75, 0.12], [1, 0]], reach: [[0, 0], [0.25, -0.2], [0.75, -0.2], [1, 0]] },
    // Admires his jawline from both sides.
    { dur: 1.8, twist: [[0, 0], [0.25, -0.5], [0.45, -0.5], [0.7, 0.5], [0.85, 0.5], [1, 0]], grow: [[0, 0], [0.25, 0.04], [0.7, 0.04], [1, 0]] },
    // Mewing: chin up, perfectly still.
    { dur: 2.0, lunge: [[0, 0], [0.2, 0.08], [0.85, 0.08], [1, 0]], grow: [[0, 0], [0.2, 0.05], [0.85, 0.05], [1, 0]] },
  ],
  daltonomo: [
    // Juggles his knives.
    { dur: 1.4, turn: [[0, 0], [0.15, -0.6], [0.3, 0.6], [0.45, -0.6], [0.6, 0.6], [0.75, -0.4], [1, 0]], grow: [[0, 0], [0.3, 0.04], [0.6, 0], [1, 0]] },
    // Takes a bow to nobody.
    { dur: 1.6, lunge: [[0, 0], [0.3, 0.2], [0.7, 0.2], [1, 0]], grow: [[0, 0], [0.3, -0.08], [0.7, -0.08], [1, 0]] },
    // Shakes his hat till the bells jingle.
    { dur: 1.0, twist: [[0, 0], [0.1, 0.25], [0.2, -0.25], [0.3, 0.25], [0.4, -0.25], [0.5, 0], [1, 0]] },
  ],
  havarti: [
    // A flutter of the wings.
    { dur: 1.0, grow: [[0, 0], [0.1, 0.06], [0.2, 0], [0.3, 0.06], [0.4, 0], [1, 0]] },
    // Twirls the knife.
    { dur: 1.0, turn: [[0, 0], [1, TAU]] },
    // A regal pose, chin up.
    { dur: 1.8, twist: [[0, 0], [0.25, -0.25], [0.75, -0.25], [1, 0]], grow: [[0, 0], [0.25, 0.06], [0.75, 0.06], [1, 0]] },
  ],
  paris: [
    // Twirls his mustache.
    { dur: 1.4, twist: [[0, 0], [0.2, 0.12], [0.35, 0.06], [0.5, 0.12], [0.65, 0.06], [1, 0]], grow: [[0, 0], [0.3, 0.03], [1, 0]] },
    // A fencer's salute: blade up to the face, then down.
    { dur: 1.6, turn: [[0, 0], [0.25, -1.6], [0.6, -1.6], [0.8, 0.4], [1, 0]] },
    // Inspects the tip of his blade.
    { dur: 1.8, reach: [[0, 0], [0.3, 0.2], [0.75, 0.2], [1, 0]], turn: [[0, 0], [0.3, 0.3], [0.75, 0.3], [1, 0]] },
  ],
  dabber: [
    // Sniffs the air, twitchy.
    { dur: 1.2, lunge: [[0, 0], [0.1, 0.06], [0.2, 0], [0.3, 0.06], [0.4, 0], [0.5, 0.06], [0.6, 0], [1, 0]], twist: [[0, 0], [0.3, 0.12], [0.6, -0.12], [1, 0]] },
    // A long pull on the rig, then a big exhale.
    { dur: 1.8, turn: [[0, 0], [0.25, -1.6], [0.6, -1.6], [0.75, 0], [1, 0]], grow: [[0, 0], [0.6, 0], [0.75, 0.08], [1, 0]] },
    // A good long scratch.
    { dur: 1.4, twist: [[0, 0], [0.2, 0.4], [0.3, 0.2], [0.4, 0.4], [0.5, 0.2], [0.6, 0.4], [1, 0]] },
  ],
  kingrix: [
    // Straightens his crown with the scepter hand, fussily.
    { dur: 1.8, turn: [[0, 0], [0.3, -2.3], [0.45, -2.15], [0.6, -2.35], [0.75, -2.2], [1, 0]], grow: [[0, 0], [0.3, 0.05], [1, 0]] },
    // Holds the scepter out to admire it.
    { dur: 1.6, reach: [[0, 0], [0.35, 0.3], [0.7, 0.3], [1, 0]], turn: [[0, 0], [0.35, -0.4], [0.5, -0.2], [0.7, -0.4], [1, 0]] },
  ],
  scrimby: [
    // Checks the time, impatient, taps a boot.
    { dur: 1.4, reach: [[0, 0], [0.25, -0.35], [0.75, -0.35], [1, 0]], twist: [[0, 0], [0.25, 0.2], [0.75, 0.2], [1, 0]] },
    // A sip of the coffee.
    { dur: 1.2, turn: [[0, 0], [0.3, -1.4], [0.7, -1.4], [1, 0]] },
  ],
  bigwhale: [
    // Counts his money, slowly, so everyone can see.
    { dur: 2.0, reach: [[0, 0], [0.2, -0.3], [0.35, -0.2], [0.5, -0.3], [0.65, -0.2], [0.8, -0.3], [1, 0]] },
    // Laughs at his own joke.
    { dur: 1.4, grow: [[0, 0], [0.2, 0.06], [0.35, 0], [0.5, 0.06], [0.65, 0], [1, 0]], lunge: [[0, 0], [0.3, -0.08], [1, 0]] },
  ],
};

export function castAnim(champ: ChampionId, slot: Slot): Anim {
  return SLOT_MOVES[`${champ}:${slot}`] ?? CAST[champ];
}
