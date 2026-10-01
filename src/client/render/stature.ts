import type { EntitySnap } from '../../shared/protocol';
import { BUILDS } from './builds';

// Champions stand up off the ground, so things that happen "to" them (hits, numbers, words, a halo of
// sparks) happen up on the body rather than at their feet. Everything else is still drawn flat.

type Sized = Pick<EntitySnap, 'k' | 'r' | 'champ'>;

/** How tall a unit stands above its spot on the ground, in world units. */
export function standHeight(e: Sized): number {
  if (e.k === 'champion' && e.champ) {
    const s = BUILDS[e.champ].size;
    return (s.thigh + s.shin + s.torso + s.headH) * e.r;
  }
  return e.r;
}

/** How far above its spot a unit gets hit: the middle of the body (the spot itself for flat things). */
export function chestHeight(e: Sized): number {
  return e.k === 'champion' && e.champ ? standHeight(e) * 0.5 : 0;
}

/** How high arrows, bolts and thrown things fly. */
export const FLIGHT = 40;

/** Projectiles that roll or slide along the ground instead of flying. */
const GROUNDED: ReadonlySet<string> = new Set(['cheeseWheel', 'longshot']);

export function flightHeight(vis: string | undefined): number {
  return vis && GROUNDED.has(vis) ? 0 : FLIGHT;
}
