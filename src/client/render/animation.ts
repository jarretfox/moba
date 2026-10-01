import type { ChampionId } from '../../shared/champions/types';
import type { Slot } from '../../shared/constants';

// How champions move when they attack and cast: a few keyframes per move, played on the figure and the
// weapon in their hand. Turns are in radians (positive is clockwise on screen), distances in the
// champion's radius, and every move starts and ends at rest.

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

/** Basic attacks. */
export const ATTACK: Record<ChampionId, Anim> = {
  // Wind the axe back, then sweep it across the front.
  barbarian: { dur: 0.32, turn: [[0, 0], [0.3, 0.8], [0.55, -1.5], [1, 0]], twist: [[0, 0], [0.3, 0.15], [0.55, -0.2], [1, 0]], lunge: [[0, 0], [0.5, 0.15], [1, 0]] },
  // Draw the string back, loose, and rock back from the shot.
  marksman: { dur: 0.3, reach: [[0, 0], [0.45, -0.22], [0.55, 0.06], [1, 0]], lunge: [[0, 0], [0.55, -0.08], [1, 0]] },
  // Whirl the hook round once and fling it out.
  willmore: { dur: 0.36, turn: [[0, 0], [1, -TAU]], reach: [[0, 0], [0.55, 0.35], [1, 0]] },
  // Pull the staff back and jab the spore forward.
  hunnag: { dur: 0.32, turn: [[0, 0], [0.3, 0.4], [0.55, -0.25], [1, 0]], reach: [[0, 0], [0.3, -0.12], [0.55, 0.32], [1, 0]] },
  // Paws out and a lunge with the swipe.
  logan: { dur: 0.28, reach: [[0, 0], [0.35, 0.55], [1, 0]], lunge: [[0, 0], [0.35, 0.2], [1, 0]] },
  // A royal flourish of the scepter.
  kingrix: { dur: 0.36, turn: [[0, 0], [0.35, -0.9], [0.6, 0.5], [1, 0]], reach: [[0, 0], [0.5, 0.15], [1, 0]] },
};

/** Casting an ability, unless the slot has its own move below. */
export const CAST: Record<ChampionId, Anim> = {
  barbarian: { dur: 0.45, turn: [[0, 0], [0.3, -1.3], [0.7, -1.3], [1, 0]], grow: [[0, 0], [0.3, 0.12], [1, 0]] },
  marksman: { dur: 0.4, reach: [[0, 0], [0.4, -0.3], [0.5, 0.08], [1, 0]], grow: [[0, 0], [0.4, 0.06], [1, 0]] },
  willmore: { dur: 0.5, turn: [[0, 0], [1, -TAU * 2]], grow: [[0, 0], [0.3, 0.08], [1, 0]] },
  hunnag: { dur: 0.5, turn: [[0, 0], [0.35, -1.1], [0.7, -1.1], [1, 0]], reach: [[0, 0], [0.35, 0.2], [1, 0]], grow: [[0, 0], [0.35, 0.1], [1, 0]] },
  logan: { dur: 0.4, reach: [[0, 0], [0.3, 0.4], [1, 0]], grow: [[0, 0], [0.3, 0.15], [1, 0]] },
  kingrix: { dur: 0.5, turn: [[0, 0], [0.35, -1.4], [0.7, -1.4], [1, 0]], grow: [[0, 0], [0.35, 0.1], [1, 0]] },
};

/** Abilities with a move of their own. */
const SLOT_MOVES: Partial<Record<`${ChampionId}:${Slot}`, Anim>> = {
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
  // KNEEL!: the scepter raised high, then brought down.
  'kingrix:2': { dur: 0.5, turn: [[0, 0], [0.4, -1.6], [0.6, 0.4], [1, 0]], grow: [[0, 0], [0.4, 0.15], [0.6, -0.05], [1, 0]] },
};

export function castAnim(champ: ChampionId, slot: Slot): Anim {
  return SLOT_MOVES[`${champ}:${slot}`] ?? CAST[champ];
}
