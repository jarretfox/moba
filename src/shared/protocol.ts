// Messages between a player's client and the host. The host runs in a Web Worker in the hosting
// player's tab; their own client talks to it directly, and friends' messages arrive over WebRTC
// (PeerJS) and are relayed to it by that tab. Nothing from a client is trusted.
import type { ChampionId } from './champions/types';
import type { PlayerTeam, Slot, Team } from './constants';
import type { ItemId } from './items';
import type { StructureRole } from './map/mapData';
import type { SnapshotDelta } from './snapshotCodec';

/** Connection id of the hosting player's own client. Remote players get `peer:`-prefixed ids, so nobody else can claim it. */
export const LOCAL_CONN = 'local';

export type Command =
  | { k: 'move'; x: number; y: number }
  | { k: 'attack'; target: number }
  | { k: 'stop' }
  | { k: 'cast'; slot: Slot; x: number; y: number }
  | { k: 'recall' }
  /** Spend a skill point on an ability. */
  | { k: 'levelUp'; slot: Slot }
  /** Shop, only in your fountain or while dead. */
  | { k: 'buy'; item: ItemId }
  /** Sell the item in this inventory slot. */
  | { k: 'sell'; slot: number };

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
  | { t: 'snap'; snap: SnapshotDelta }
  | { t: 'refused'; reason: string }
  /** Keep-alive, handled by the network layer. */
  | { t: 'ping' };

export type DamageType = 'physical' | 'magic' | 'true';
/** Gameplay: root, stun, slow, weaken (deals less damage). Display only: airborne (mid-leap), berserk, recall (channeling home). */
export type StatusKind =
  | 'root'
  | 'stun'
  | 'slow'
  | 'weaken'
  | 'airborne'
  | 'berserk'
  | 'recall'
  | 'unchained'
  /** Willmore's Burrow: fast, can't attack, hidden from enemies. */
  | 'burrowed'
  /** Dragged under by Down Below (or Willmore doing the dragging): can't act or be hit, hidden. */
  | 'underground'
  /** Logan's Maul: reveals the target, even burrowed. */
  | 'bleed'
  /** HunnaG's Rot (amount = stacks). */
  | 'rot'
  /** Faster movement (amount = bonus share). */
  | 'speed'
  /** Running away in terror, can't act. */
  | 'fear'
  /** King Rix's Royal Decree: revealed to everyone, takes more damage (amount = extra share). */
  | 'decreed'
  /** A Chud under King Rix's Royal Tax. */
  | 'royal'
  | BuffKind;
/** Jungle buffs: Ember Toad's and Glowcap's. */
export type BuffKind = 'ember' | 'glowcap';
export type MonsterKind = 'rat' | 'ratKing' | 'mossback' | 'emberToad' | 'glowcap' | 'warden';

/** One champion's line on the scoreboard. `dmg` is to champions, `tdmg` to structures; `gold` is everything earned. */
export interface ScoreRow {
  id: number;
  name: string;
  champ: ChampionId;
  team: PlayerTeam;
  lv: number;
  k: number;
  d: number;
  a: number;
  cs: number;
  dmg: number;
  tdmg: number;
  taken: number;
  gold: number;
  items: ItemId[];
}

/** Everyone's view of the Warden: when it wakes, and which team is Unchained (Uprising if Willmore or HunnaG took it). */
export interface WardenStatus {
  alive: boolean;
  /** Seconds until it wakes, while it's not around. */
  wakesIn?: number;
  unchained?: { team: PlayerTeam; left: number; uprising: boolean }[];
}
export type ChudType = 'melee' | 'ranged' | 'siege' | 'brute';
export type EntityKind = 'champion' | 'dummy' | 'chud' | 'structure' | 'monster' | 'totem' | 'guard' | 'projectile' | 'trap' | 'pickup' | 'zone';

/** Cosmetic cues the client turns into effects. They never affect gameplay. */
export type FxKind =
  | 'aimLine'
  | 'trapSnap'
  | 'roll'
  | 'cleave'
  /** Logan's Pounce and Maul: their own looks, not the Marksman's roll or the Barbarian's cleave. */
  | 'pounce'
  | 'maul'
  | 'warCry'
  | 'slam'
  | 'berserk'
  | 'recall'
  | 'wardenMark'
  | 'wardenSlam'
  | 'burrow'
  | 'surface'
  | 'hookPull'
  | 'tunnel'
  | 'lob'
  | 'rotBurst'
  | 'pulse'
  | 'hop'
  | 'deepMark'
  | 'deepHands'
  | 'lionheart'
  | 'mane'
  | 'roar'
  | 'summon'
  | 'kneel'
  | 'decree';

export type GameEvent =
  | { e: 'dmg'; src?: number; target: number; amount: number; type: DamageType }
  | { e: 'attack'; src: number; target: number }
  | { e: 'cast'; src: number; slot: Slot; x: number; y: number }
  | { e: 'heal'; target: number; amount: number }
  | { e: 'death'; id: number }
  | { e: 'level'; id: number; level: number }
  | { e: 'gold'; id: number; amount: number }
  /**
   * For the kill feed and the announcer, which everyone sees. `team` is the killer's side (0 when nobody gets
   * the credit) and `what` says what fell. Champion kills also carry the killer's streak, whether it ended
   * the victim's streak (3 or more), and whether the victim's whole team is now dead.
   */
  | { e: 'kill'; killer: string; victim: string; team: Team; what?: 'champion' | 'warden' | StructureRole; streak?: number; shutdown?: boolean; ace?: boolean }
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
  /** Shield soaking damage on top of health. */
  sh?: number;
  mp?: number;
  mmp?: number;
  name?: string;
  champ?: ChampionId;
  /** Champion level. */
  lv?: number;
  st?: StatusKind[];
  /** Projectile look. */
  vis?: string;
  dead?: boolean;
  armed?: boolean;
  role?: StructureRole;
  chud?: ChudType;
  mon?: MonsterKind;
  /** A little icon over a champion's head that everyone can see, e.g. Willmore's next piece of junk. */
  badge?: string;
  /** Structure can't be damaged yet (the ones in front of it are still standing). */
  inv?: boolean;
  /** Seconds until a destroyed Oakner regrows. */
  regrow?: number;
}

export interface AbilitySnap {
  rank: number;
  /** Seconds of cooldown remaining. */
  cd: number;
  /** A word for the slot right now, e.g. "Boot" or "Surface". */
  note?: string;
}

/** Private state only the owning player receives. */
export interface MeSnap {
  id: number;
  abilities: AbilitySnap[];
  passiveStacks: number;
  empowered: boolean;
  respawnIn: number;
  level: number;
  xp: number;
  /** Experience needed for the next level; 0 at max level. */
  xpNext: number;
  /** Unspent skill points. */
  points: number;
  gold: number;
  items: ItemId[];
  /** Standing where the shop will serve you. */
  inShop: boolean;
  /** Jungle buffs and the seconds left on each. */
  buffs: { kind: BuffKind; left: number }[];
  /** For the shop's stat panel. `as` is attacks per second; `ls` is lifesteal in percent. */
  stats: { ad: number; ap: number; armor: number; mr: number; as: number; ms: number; haste: number; ls: number };
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
  warden?: WardenStatus;
  /** The scoreboard, refreshed every couple of seconds (and on the final snapshot). */
  scores?: ScoreRow[];
}
