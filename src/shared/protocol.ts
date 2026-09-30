// Messages between a player's client and the host. The host runs in a Web Worker in the hosting
// player's tab; their own client talks to it directly, and friends' messages arrive over WebRTC
// (PeerJS) and are relayed to it by that tab. Nothing from a client is trusted.
import type { ChampionId } from './champions/types';
import type { PlayerTeam, Slot, Team } from './constants';
import type { StructureRole } from './map/mapData';

/** Connection id of the hosting player's own client. Remote players get `peer:`-prefixed ids, so nobody else can claim it. */
export const LOCAL_CONN = 'local';

export type Command =
  | { k: 'move'; x: number; y: number }
  | { k: 'attack'; target: number }
  | { k: 'stop' }
  | { k: 'cast'; slot: Slot; x: number; y: number }
  | { k: 'recall' };

export type ClientMessage =
  /** Enter the lobby. */
  | { t: 'hello'; name: string }
  /** Change team and/or champion while in the lobby. */
  | { t: 'pick'; team?: PlayerTeam; champion?: ChampionId }
  /** Host only: start the match once everyone has picked. */
  | { t: 'start'; mode: MatchMode }
  | { t: 'cmd'; cmd: Command }
  /** Keep-alive, handled by the network layer; never reaches the game. */
  | { t: 'ping' };

/** 'bots': 3v3, with bots in every slot no human takes. 'practice': no bots — the Chud waves and training dummies. */
export type MatchMode = 'bots' | 'practice';

export interface LobbyPlayer {
  id: string;
  name: string;
  team: PlayerTeam;
  champion: ChampionId | null;
  host: boolean;
}

export interface LobbyState {
  players: LobbyPlayer[];
  phase: 'lobby' | 'playing';
}

export type HostMessage =
  /** The lobby changed. `you` is the recipient's own player id. */
  | { t: 'lobby'; lobby: LobbyState; you: string }
  /** The match started; this is your champion. */
  | { t: 'welcome'; unitId: number; team: Team }
  | { t: 'snap'; snap: Snapshot }
  | { t: 'refused'; reason: string }
  /** Keep-alive, handled by the network layer. */
  | { t: 'ping' };

export type DamageType = 'physical' | 'magic' | 'true';
/** Gameplay: root, stun, slow, weaken (deals less damage). Display only: airborne (mid-leap), berserk, recall (channeling home). */
export type StatusKind = 'root' | 'stun' | 'slow' | 'weaken' | 'airborne' | 'berserk' | 'recall';
export type ChudType = 'melee' | 'ranged' | 'siege' | 'brute';
export type EntityKind = 'champion' | 'dummy' | 'chud' | 'structure' | 'projectile' | 'trap';

/** Cosmetic cues the client turns into effects. They never affect gameplay. */
export type FxKind = 'aimLine' | 'trapSnap' | 'roll' | 'cleave' | 'warCry' | 'slam' | 'berserk' | 'recall';

export type GameEvent =
  | { e: 'dmg'; src?: number; target: number; amount: number; type: DamageType }
  | { e: 'attack'; src: number; target: number }
  | { e: 'cast'; src: number; slot: Slot; x: number; y: number }
  | { e: 'heal'; target: number; amount: number }
  | { e: 'death'; id: number }
  | { e: 'fx'; fx: FxKind; x: number; y: number; x2?: number; y2?: number; r?: number; dur?: number; team?: Team };

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
  chud?: ChudType;
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
  /** Seconds until the next Chud wave leaves Da Base. */
  nextWave?: number;
  /** Set on the final snapshot, once a Da Base has fallen. */
  winner?: Team;
}
