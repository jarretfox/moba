import type { StructureRole } from '../map/mapData';
import type { EntityKind } from '../protocol';

/** How far each kind of unit sees. Used by the host's fog of war and by each client to draw its own. */
export const SIGHT = {
  champion: 1100,
  chud: 800,
  /** HunnaG's Mushroom Totem. */
  totem: 700,
  structure: { outerShootie: 1100, innerShootie: 1100, baseShootie: 1100, oakner: 700, daBase: 900 } satisfies Record<StructureRole, number>,
} as const;

/** Sight radius for an entity; 0 for things that don't grant vision (projectiles, traps, practice dummies). */
export function sightOf(kind: EntityKind, role?: StructureRole): number {
  switch (kind) {
    case 'champion':
      return SIGHT.champion;
    case 'chud':
      return SIGHT.chud;
    case 'totem':
      return SIGHT.totem;
    case 'structure':
      return role ? SIGHT.structure[role] : 0;
    default:
      return 0;
  }
}
