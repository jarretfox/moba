import type { Team } from '../constants';
import type { Vec2 } from '../math';
import type { EntityKind, EntitySnap } from '../protocol';
import type { World } from './world';

export interface Entity {
  readonly id: number;
  readonly kind: EntityKind;
  team: Team;
  pos: Vec2;
  radius: number;
  /** Set to drop the entity at the end of the tick. Units die and respawn instead. */
  removed: boolean;
  update(world: World): void;
  snapshot(world: World): EntitySnap;
}
