import type { EntitySnap } from '../../shared/protocol';
import { beastHeight } from './beasts';
import { BUILDS, UNIT_BUILDS } from './builds';
import { BUILDING, buildingHeight } from './structures';
import type { Proportions } from './rig';

// Everything that walks stands up off the ground, so things that happen "to" it (hits, numbers, words, a
// halo of sparks) happen up on the body rather than at its feet. Structures, totems and the like are flat.

type Sized = Pick<EntitySnap, 'k' | 'r' | 'champ' | 'chud' | 'mon' | 'role'>;

const tall = (s: Proportions) => s.thigh + s.shin + s.torso + s.headH;

/** How tall a unit stands, in units of its radius (0 for flat things). */
function stands(e: Sized): number {
  switch (e.k) {
    case 'champion':
      return e.champ ? tall(BUILDS[e.champ].size) : 0;
    case 'chud':
      return e.chud === 'siege' ? beastHeight('siege') : tall(UNIT_BUILDS[`chud:${e.chud ?? 'melee'}`].size);
    case 'guard':
      return tall(UNIT_BUILDS.guard.size);
    case 'monster':
      return e.mon === 'warden' ? tall(UNIT_BUILDS['monster:warden'].size) : beastHeight(e.mon ?? 'rat');
    case 'dummy':
      return beastHeight('dummy');
    case 'structure':
      return e.role ? buildingHeight(e.role) : 0;
    default:
      return 0;
  }
}

/** How tall a unit stands above its spot on the ground, in world units (its radius, for flat things). */
export function standHeight(e: Sized): number {
  return (stands(e) || 1) * e.r;
}

/** How far above its spot a unit gets hit: the middle of the body (the spot itself for flat things). */
export function chestHeight(e: Sized): number {
  return stands(e) ? stands(e) * e.r * 0.5 : 0;
}

/** Where a Shootie or Da Base's crystal floats, above its spot: Shootie shots and beams start there. */
export function crystalHeight(e: Sized): number {
  if (e.role === 'daBase') return BUILDING.daBase.crystal * e.r;
  if (e.k === 'structure' && e.role !== 'oakner') return BUILDING.shootie.crystal * e.r;
  return chestHeight(e);
}

/** How high arrows, bolts and thrown things fly. */
export const FLIGHT = 40;

/** Projectiles that roll or slide along the ground instead of flying. */
const GROUNDED: ReadonlySet<string> = new Set(['cheeseWheel', 'longshot']);

export function flightHeight(vis: string | undefined): number {
  return vis && GROUNDED.has(vis) ? 0 : FLIGHT;
}
