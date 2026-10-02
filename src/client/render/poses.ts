import type { ChampionId } from '../../shared/champions/types';
import { BUILDS } from './builds';
import type { RigInput } from './rig';

// How champions take the end of a match, for the end screen. The winners celebrate in character: the Oak
// hoists his axe and hops, Dongmaster flexes, Logan roars, Daltonomo takes a bow, Paris salutes with his
// épée, King Rix holds his scepter high with a hand on his hip, Dabber spins. The losers slump: heads
// down and arms hanging, sat on the ground with their heads in their hands, or flat on their faces.
// Each is a loop: a function of the seconds since the screen came up.

export type EndPose = (t: number) => Partial<RigInput>;

const TAU = Math.PI * 2;
/** 0 → 1 → 0 over a beat starting at `from`, lasting `len` (of a loop `t` already wrapped into). */
const beat = (t: number, from: number, len: number) => (t < from || t > from + len ? 0 : Math.sin(((t - from) / len) * Math.PI));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** A hop every so often (in the air for half of each `period`). */
const hop = (t: number, period: number, height: number) => Math.max(0, Math.sin((t / period) * TAU)) * height;

/** The turn that points their weapon at `angle` (−π/2 straight up), whatever its usual hold. */
function aim(champ: ChampionId, angle: number): number {
  const hold = BUILDS[champ].weapon?.hold;
  return hold === undefined ? 0 : (angle - hold) / 1.2;
}

/** Arms up, weapon up, hopping. */
const hooray = (champ: ChampionId, height = 0.45): EndPose => (t) => ({
  air: hop(t, 1.05, height),
  turn: aim(champ, -1.35),
  posture: { armF: [-1.35, 0.15], armB: [-1.55, 0.1] },
  expression: 'grin',
});

const CHEERS: Record<ChampionId, EndPose> = {
  barbarian: (t) => ({ ...hooray('barbarian', 0.3)(t), grow: Math.max(0, Math.sin((t / 1.05) * TAU)) * 0.05 }),
  marksman: hooray('marksman'),
  dongmaster: (t) => ({
    // A double biceps, pumped, turning to show both sides.
    grow: 0.04 + Math.sin(t * 5) * 0.035,
    twist: Math.sin(t * 1.3) * 0.3,
    posture: { armF: [-0.45, 2.1], armB: [-0.65, 2.2], bow: -0.1 },
    expression: 'grin',
  }),
  logan: (t) => {
    // Rears back, then a great roar at the sky, shaking with it.
    const k = t % 2.6;
    const roar = beat(k, 0.35, 1.5);
    return {
      lunge: roar * 0.25 - beat(k, 0, 0.4) * 0.1,
      grow: roar * 0.1 + Math.sin(t * 40) * 0.015 * roar,
      look: -0.5 * roar,
      posture: { armF: [-0.7, 0.6], armB: [-0.5, 0.5], bow: -0.15 },
      expression: 'grin',
    };
  },
  daltonomo: (t) => {
    // A flourish, then a deep theatrical bow, one arm across the belly and the other swept out behind.
    const b = beat(t % 2.8, 0.6, 1.8);
    return {
      posture: { bow: 0.95 * b, armF: [lerp(-1.2, 1.1, b), lerp(0.3, 1.5, b)], armB: [lerp(-1.8, 2.4, b), 0.2] },
      look: 0.3 * b,
      expression: 'grin',
    };
  },
  paris: (t) => {
    // The épée up before his face in salute, then a flourish of a lunge.
    const k = t % 3;
    const lunge = beat(k, 1.6, 1.1);
    return {
      lunge: lunge * 0.25,
      turn: lerp(aim('paris', -1.5), aim('paris', 0), lunge),
      posture: { armF: [lerp(0.2, -0.05, lunge), lerp(1.7, 0, lunge)], armB: [-1.3, 0.6] },
      expression: 'grin',
    };
  },
  kingrix: (t) => ({
    // Regal: scepter held high, a hand on his hip, chin up.
    turn: aim('kingrix', -1.4),
    look: -0.15,
    twist: Math.sin(t * 1.1) * 0.1,
    posture: { armF: [-1.4, 0.1], armB: [2.2, 1.6], bow: -0.12 },
    expression: 'grin',
  }),
  willmore: (t) => {
    // A jig.
    const s = Math.sin(t * 7);
    return {
      air: hop(t, 0.45, 0.25),
      twist: s * 0.3,
      posture: { armF: [-1.0 + 0.6 * s, 0.6], armB: [-1.0 - 0.6 * s, 0.6] },
      expression: 'grin',
    };
  },
  hunnag: (t) => ({
    // The staff aloft, swaying.
    air: hop(t, 1.4, 0.2),
    turn: aim('hunnag', -1.5),
    twist: Math.sin(t * 1.6) * 0.2,
    look: -0.2,
    posture: { armF: [-1.3, 0.2], armB: [-1.0, 0.5] },
    expression: 'grin',
  }),
  dabber: (t) => {
    // A spin in the air every so often.
    const k = t % 2.2;
    const spin = k > 1.4 ? Math.min(1, (k - 1.4) / 0.6) : 0;
    return { ...hooray('dabber', 0.25)(t), twist: spin * TAU, air: spin > 0 ? Math.sin(spin * Math.PI) * 0.6 : hop(t, 0.7, 0.15) };
  },
  havarti: (t) => {
    // A little side-to-side dance, an arm up on each side in turn.
    const s = Math.sin(t * 4);
    return {
      air: hop(t, 0.8, 0.15),
      twist: s * 0.25,
      posture: { armF: s > 0 ? [-1.3, 0.2] : [0.9, 0.6], armB: s > 0 ? [0.9, 0.6] : [-1.4, 0.2] },
      expression: 'grin',
    };
  },
  scrimby: hooray('scrimby', 0.35),
  bigwhale: (t) => ({
    // Throws money in the air, delighted with himself.
    grow: 0.04 + Math.sin(t * 4) * 0.03,
    posture: { armF: [-1.4, 0.3], armB: [-1.5, 0.2] },
    expression: 'grin',
  }),
};

type Slump = 'slump' | 'sit' | 'flat';

/** How each one takes a loss. */
const SLUMP: Record<ChampionId, Slump> = {
  marksman: 'slump',
  barbarian: 'sit',
  willmore: 'flat',
  hunnag: 'slump',
  logan: 'flat',
  kingrix: 'sit',
  dongmaster: 'slump',
  dabber: 'sit',
  paris: 'slump',
  havarti: 'flat',
  daltonomo: 'sit',
  scrimby: 'sit',
  bigwhale: 'flat',
};

function slump(champ: ChampionId, style: Slump): EndPose {
  // The weapon hangs, pointing at the ground.
  const down = aim(champ, 1.3);
  switch (style) {
    case 'sit':
      // Sat down, elbows on the knees, head in the hands; a wince now and then.
      return (t) => ({ turn: down, posture: { sit: 1, bow: 0.55, look: 0.5, armF: [0.6, 1.9], armB: [0.8, 1.7] }, expression: t % 5 > 4.2 ? 'hurt' : null });
    case 'flat':
      // Flat on their face, out cold.
      return () => ({ turn: down, posture: { lie: 1, armF: [0.1, 0], armB: [0.25, 0.1] }, expression: 'ko' });
    default:
      // Head down, arms hanging, a heavy sigh (eyes closed) every few seconds.
      return (t) => ({ turn: down, grow: -0.03, posture: { bow: 0.45, look: 0.55, armF: [1.5, 0.05], armB: [1.62, 0.05] }, expression: t % 4 > 3 ? 'sleep' : null });
  }
}

/** Whether they end up lying full length (so the line-up can make room for them). */
export function liesDown(champ: ChampionId, won: boolean): boolean {
  return !won && SLUMP[champ] === 'flat';
}

/** How a champion takes the end of the match: celebrating if they won, slumped if they lost. */
export function endPose(champ: ChampionId, won: boolean): EndPose {
  return won ? CHEERS[champ] : slump(champ, SLUMP[champ]);
}
