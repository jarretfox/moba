// Messages between a player's client and the host. Today the host is a Web Worker in the same
// browser; in M2 the same messages travel over WebRTC to whichever friend is hosting.
import type { ChampionId } from './champions/types';
import type { Slot, Team } from './constants';
import type { StructureRole } from './map/mapData';

export type Command =
  | { k: 'move'; x: number; y: number }
  | { k: 'attack'; target: number }
  | { k: 'stop' }
  | { k: 'cast'; slot: Slot; x: number; y: number };

export type ClientMessage =
  | { t: 'join'; name: string; champion: ChampionId }
  | { t: 'cmd'; cmd: Command };

export type HostMessage =
  | { t: 'welcome'; unitId: number; team: Team }
  | { t: 'snap'; snap: Snapshot };

export type DamageType = 'physical' | 'magic' | 'true';
export type StatusKind = 'root' | 'stun' | 'slow';
export type EntityKind = 'champion' | 'dummy' | 'structure' | 'projectile' | 'trap';

/** Cosmetic cues the client turns into effects. They never affect gameplay. */
export type FxKind = 'aimLine' | 'trapSnap' | 'roll';

export type GameEvent =
  | { e: 'dmg'; target: number; amount: number; type: DamageType }
  | { e: 'attack'; src: number; target: number }
  | { e: 'cast'; src: number; slot: Slot; x: number; y: number }
  | { e: 'death'; id: number }
  | { e: 'fx'; fx: FxKind; x: number; y: number; x2?: number; y2?: number; dur?: number; team?: Team };

export interface EntitySnap {
  id: number;
  k: EntityKind;
  tm: Team;
  x: number;
  y: number;
  /** Facing, radians. */
  f: number;
  r: number;
  hp?: number;
  mhp?: number;
  mp?: number;
  mmp?: number;
  name?: string;
  champ?: ChampionId;
  st?: StatusKind[];
  /** Projectile look. */
  vis?: string;
  dead?: boolean;
  armed?: boolean;
  role?: StructureRole;
  /** Structure can't be damaged yet (the ones in front of it are still standing). */
  inv?: boolean;
  /** Seconds until a destroyed Oakner regrows. */
  regrow?: number;
}

export interface AbilitySnap {
  rank: number;
  /** Seconds of cooldown remaining. */
  cd: number;
}

/** Private state only the owning player receives. */
export interface MeSnap {
  id: number;
  abilities: AbilitySnap[];
  passiveStacks: number;
  empowered: boolean;
  respawnIn: number;
}

export interface Snapshot {
  tick: number;
  /** Host sim time in seconds. */
  time: number;
  ents: EntitySnap[];
  ev: GameEvent[];
  me?: MeSnap;
}
