// Messages between a player's client and the host. The host runs in a Web Worker in the hosting
// player's tab; their own client talks to it directly, and friends' messages arrive over WebRTC
// (PeerJS) and are relayed to it by that tab. Nothing from a client is trusted.
import type { ChampionId } from './champions/types';
import type { PlayerTeam, Slot, Team } from './constants';
import type { MapId } from './map/mapData';
import type { ItemId } from './items';
import type { Weather } from './weather';
import type { StructureRole } from './map/mapData';
import type { SnapshotDelta } from './snapshotCodec';

/** Connection id of the hosting player's own client. Remote players get `peer:`-prefixed ids, so nobody else can claim it. */
export const LOCAL_CONN = 'local';

/** Map pings, which only the pinger's team sees: look here, danger, on my way, enemy missing, need help. */
export type PingKind = 'look' | 'danger' | 'omw' | 'missing' | 'assist';
export const PING_KINDS: readonly PingKind[] = ['look', 'danger', 'omw', 'missing', 'assist'];

/** Emotes players can send (1–4): a taunt, a laugh, a cheer, a line from the champion's story. */
export type EmoteKind = 'taunt' | 'laugh' | 'cheer' | 'line';
export const EMOTE_KINDS: readonly EmoteKind[] = ['taunt', 'laugh', 'cheer', 'line'];

export type Command =
  | { k: 'move'; x: number; y: number }
  | { k: 'attack'; target: number }
  | { k: 'stop' }
  /** Walk to (x, y), attacking the first enemy that comes into reach on the way. */
  | { k: 'attackMove'; x: number; y: number }
  | { k: 'cast'; slot: Slot; x: number; y: number }
  | { k: 'recall' }
  /** Spend a skill point on an ability. */
  | { k: 'levelUp'; slot: Slot }
  /** Shop, only in your fountain or while dead. */
  | { k: 'buy'; item: ItemId }
  /** Sell the item in this inventory slot. */
  | { k: 'sell'; slot: number }
  /** Take back the last purchase or sale, while still at the shop. */
  | { k: 'undo' }
  /** Use the item in this inventory slot (its active), aimed at a spot if it needs one. */
  | { k: 'use'; slot: number; x: number; y: number }
  /** Mark a spot on the map for your team. */
  | { k: 'ping'; kind: PingKind; x: number; y: number }
  | { k: 'emote'; kind: EmoteKind };

export type ClientMessage =
  /** Enter the lobby (wearing a title you've earned, if you like: see shared/titles.ts). */
  /** `rejoin`: the token from your welcome, to take your champion back after a dropped connection. */
  | { t: 'hello'; name: string; title?: string; rejoin?: string }
  /** Change team and/or champion while in the lobby. */
  | { t: 'pick'; team?: PlayerTeam; champion?: ChampionId; skin?: number }
  /** Host only: start the match once everyone has picked. */
  | { t: 'start'; mode: MatchMode }
  /** Host only, in the lobby: change the match settings. */
  | { t: 'settings'; settings: Partial<MatchSettings> }
  /** After the match: play again (the host can swap the teams' sides). */
  | { t: 'rematch'; swap?: boolean }
  /** ARAM All Random: swap your random champion for another (while rerolls last). */
  | { t: 'reroll' }
  | { t: 'cmd'; cmd: Command }
  /** Say something: to your team, or to everyone (`all`). */
  | { t: 'chat'; text: string; all: boolean }
  /** Keep-alive, handled by the network layer; never reaches the game. */
  | { t: 'ping' };

/** Longest chat line, in characters. */
export const MAX_CHAT = 140;

/** 'bots': 3v3, with bots in every slot no human takes. 'practice': no bots — the Chud waves and training dummies. */
export type MatchMode = 'bots' | 'practice';

/** The host's choices for the match, shown to everyone in the lobby. */
export interface MatchSettings {
  /** The weather, or 'random' to roll it. */
  weather: Weather | 'random';
  /** Start at night (only the look: the sky, the lanterns, the moon). */
  night: boolean;
  /** Gold everyone starts with. */
  gold: number;
  /** A quicker game: more gold and experience, shorter death timers. */
  fast: boolean;
  /** The map: the Rift (3v3), or the Howling Hollow for ARAM. */
  map: MapId;
  /** ARAM: players a side, bots filling the gaps (the Rift is always 3). */
  teamSize: number;
  /** ARAM: everyone gets a random champion (with rerolls), or picks as usual. */
  aramPick: 'random' | 'pick';
}

export const START_GOLD_OPTIONS = [500, 1500, 3000] as const;
export const TEAM_SIZE_OPTIONS = [3, 4, 5] as const;
export const DEFAULT_SETTINGS: MatchSettings = { weather: 'random', night: false, gold: START_GOLD_OPTIONS[0], fast: false, map: 'rift', teamSize: 3, aramPick: 'random' };
/** ARAM All Random: rerolls each player gets. */
export const ARAM_REROLLS = 2;
/** Players a side, under these settings. */
export const teamSizeOf = (s: MatchSettings): number => (s.map === 'aram' ? s.teamSize : 3);
/** How much a fast game speeds things up. */
export const FAST_RATES = { gold: 1.5, xp: 1.5, respawn: 0.5 };
/** Starting at night: how far into the evening the look starts (deep night, the moon up). */
export const NIGHT_CLOCK = 1080;

export interface LobbyPlayer {
  id: string;
  name: string;
  team: PlayerTeam;
  champion: ChampionId | null;
  /** Which of the champion's looks (0 is the classic one). */
  skin: number;
  host: boolean;
  /** The title they wear (an id from shared/titles.ts). */
  title?: string;
  /** ARAM All Random: rerolls left. */
  rerolls?: number;
}

export interface LobbyState {
  players: LobbyPlayer[];
  phase: 'lobby' | 'playing';
  settings: MatchSettings;
}

export type HostMessage =
  /** The lobby changed. `you` is the recipient's own player id. */
  | { t: 'lobby'; lobby: LobbyState; you: string }
  /** The match started; this is your champion. */
  | {
      t: 'welcome';
      unitId: number;
      team: Team;
      weather?: Weather;
      /** When (match seconds) the rain clears up, if it does. */
      clears?: number;
      /** The map the match is on (the Rift if left out). */
      map?: MapId;
      /** Seconds to add to the match clock for the look of the sky (starting at night). */
      clock?: number;
      /** Friends over the network: a token to say hello with if the connection drops, to get this champion back. */
      rejoin?: string;
      /** This is a rejoin: the match is already on (no intro). */
      back?: boolean;
    }
  | { t: 'snap'; snap: SnapshotDelta }
  | { t: 'refused'; reason: string }
  /** Who wants a rematch so far (the host starting one sends everyone back to the lobby). */
  | { t: 'rematch'; votes: string[]; of: number }
  /** A chat line, from a player by name (and champion, once the match is on). */
  | { t: 'chat'; from: string; team: PlayerTeam; all: boolean; text: string; champ?: ChampionId }
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
  /** Dongmaster's Mewing (a shield, and tenacity) and Ascension (his giga form). */
  | 'mewing'
  | 'ascended'
  /** Dark Dabber: hiding in smoke (Hotbox), fast hands after it, resin on his victims (amount = stacks), Cloud Nine. */
  | 'hazed'
  | 'blazed'
  | 'resin'
  | 'cloudNine'
  /** Master Paris: mid-Flèche (can't be hit), on his Café Break, Touché, Encore. */
  | 'untargetable'
  | 'meditating'
  | 'touche'
  | 'encore'
  /** Havarti: resists curdled by Holy Wheel (amount = share), invulnerable under Divine Fondue, Rind Blade ready. */
  | 'curdled'
  | 'blessed'
  | 'rindBlade'
  /** Daltonomo, invisible after Now You See Me. */
  | 'vanished'
  /** Items: Wounds (less healing, amount = share cut), Sunder (less armor, amount = share), a Rotroot burn, the Royal Hourglass's stasis. */
  | 'wounds'
  | 'sundered'
  | 'burning'
  | 'stasis'
  | BuffKind;
/** Jungle buffs: Ember Toad's and Glowcap's. Then the team buffs the map events pay out (sim/eventBuffs.ts). */
export type BuffKind = 'ember' | 'glowcap' | 'deepPockets' | 'wicksFavor' | 'royalFavor';
export type MonsterKind = 'rat' | 'ratKing' | 'mossback' | 'emberToad' | 'glowcap' | 'warden' | 'crab' | 'coat' | 'looseChud';

// ─── Map events (sim/events.ts) ───────────────────────────────────────────────

/** The kinds of event that can turn up during a match: a boss to race for, a cart to push, a spot to hold. */
export type EventKind = 'boss' | 'escort' | 'capture';
/** Everyone's view of the current event, for the HUD readout and the markers. */
export interface EventStatus {
  kind: EventKind;
  /** What to call it: "Three Chuds in a Coat", "Old Wick's Cart", "The Royal Tax Stall". */
  name: string;
  /** Announced and on its way, running, or just finished (the result stays up a moment). */
  phase: 'soon' | 'live' | 'done';
  /** Seconds until it starts (soon) or until it's over (live). */
  left: number;
  /** Where it is right now: the boss's site, the cart, the stall. */
  x: number;
  y: number;
  /** Boss: health left (0–1). Escort: the cart's place along its path, 0 at blue's end and 1 at red's. */
  progress?: number;
  /** Capture: each team's bar (0–1). Escort: how many of each team are pushing. */
  blue?: number;
  red?: number;
  /** Who's winning it right now (holding the stall, pushing the cart), or who won. */
  team?: PlayerTeam;
  /** The boss has lost its patience. */
  enraged?: boolean;
}
/**
 * Moments in an event: the announcer's notices (`soon`, `start`, `won`, `over`, which everyone hears) and
 * the boss's telegraphs (`topple` warns of the strip from (x, y) toward (x2, y2), `crash` is it landing,
 * `add` is a Chud tumbling out, `enrage` its mood) and the stall paying out (`collect`), which only those
 * who can see them get.
 */
export type EventCue = 'soon' | 'start' | 'won' | 'over' | 'topple' | 'crash' | 'add' | 'enrage' | 'collect';

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
  /** The look they're wearing (left out for the classic one). */
  skin?: number;
}

/** Everyone's view of the Warden: when it wakes, and which team is Unchained (Uprising if Willmore or HunnaG took it). */
export interface WardenStatus {
  alive: boolean;
  /** Seconds until it wakes, while it's not around. */
  wakesIn?: number;
  unchained?: { team: PlayerTeam; left: number; uprising: boolean }[];
}
export type ChudType = 'melee' | 'ranged' | 'siege' | 'brute';
export type EntityKind = 'champion' | 'dummy' | 'chud' | 'structure' | 'monster' | 'totem' | 'guard' | 'projectile' | 'trap' | 'pickup' | 'zone' | 'ward';

/** Cosmetic cues the client turns into effects. They never affect gameplay. */
export type FxKind =
  /** ARAM: a pumpkin (health relic) eaten. */
  | 'relic'
  /** Item passives: Stormstring's chain lightning (from x, y to x2, y2), a Spellblade hit, the Royal Hourglass going off. */
  | 'static'
  | 'spellblade'
  | 'royalPause'
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
  | 'decree'
  /** Dongmaster. */
  | 'chinCheck'
  | 'mewing'
  | 'sigmaStare'
  | 'ascension'
  /** Dark Dabber. */
  | 'hotbox'
  | 'stickyIcky'
  | 'lightItUp'
  | 'cloudNine'
  /** Master Paris. */
  | 'fleche'
  | 'cafeBreak'
  | 'touche'
  | 'encore'
  /** Havarti. */
  | 'curdle'
  | 'fondue'
  | 'rindBlade'
  | 'divineFondue'
  | 'fondueEruption'
  | 'cheeseWave'
  | 'ascend'
  /** Daltonomo. */
  | 'nowYouSeeMe'
  | 'backstab'
  | 'jackbox'
  | 'boxShot'
  | 'doubleAct'
  | 'cloneBoom'
  /** Item actives: the Lantern's light landing, the Aegis's ward going up, the Drum's beat. */
  | 'lanternLight'
  | 'aegisWard'
  | 'drumBeat';

export type GameEvent =
  | { e: 'dmg'; src?: number; target: number; amount: number; type: DamageType }
  | { e: 'attack'; src: number; target: number }
  | { e: 'cast'; src: number; slot: Slot; x: number; y: number }
  /** A cast that couldn't go off, and why (only the caster's team is told; their screen says so). */
  | { e: 'castFail'; src: number; slot: Slot; why: CastFail }
  | { e: 'heal'; target: number; amount: number }
  | { e: 'death'; id: number }
  | { e: 'level'; id: number; level: number }
  | { e: 'gold'; id: number; amount: number }
  /**
   * For the kill feed and the announcer, which everyone sees. `team` is the killer's side (0 when nobody gets
   * the credit) and `what` says what fell. Champion kills also carry the killer's streak, whether it ended
   * the victim's streak (3 or more), and whether the victim's whole team is now dead.
   */
  | {
      e: 'kill';
      killer: string;
      victim: string;
      team: Team;
      what?: 'champion' | 'warden' | 'crab' | 'event' | StructureRole;
      streak?: number;
      shutdown?: boolean;
      /** Gold the killer got for ending the victim's spree (their bounty). */
      bounty?: number;
      ace?: boolean;
      /** Who did it and who fell, as champions in their looks, for portraits in the kill feed. */
      killerChamp?: ChampionId;
      killerSkin?: number;
      victimChamp?: ChampionId;
      victimSkin?: number;
    }
  | { e: 'fx'; fx: FxKind; x: number; y: number; x2?: number; y2?: number; r?: number; dur?: number; team?: Team }
  /** A fountain's crystal zapping an enemy on (or shooting into) its platform: from (x, y) to (x2, y2). */
  | { e: 'zap'; x: number; y: number; x2: number; y2: number; team: PlayerTeam }
  /**
   * A champion emoting, or quipping after a kill ('kill', with the victim's champion in `vs`). `n` picks
   * which of their lines, the same on every screen.
   */
  | { e: 'emote'; id: number; kind: EmoteKind | 'kill'; n: number; vs?: ChampionId }
  /** A teammate's ping (only their team is told). */
  | { e: 'ping'; kind: PingKind; x: number; y: number; from: number; name: string; team: PlayerTeam }
  /** A map event's moment (see EventCue). `all` marks the announcements everyone gets; the rest are seen where they happen. */
  | { e: 'evt'; k: EventCue; kind: EventKind; x: number; y: number; x2?: number; y2?: number; r?: number; dur?: number; team?: Team; text?: string; all?: boolean };

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
  /** Which look the champion wears (left out for the classic one). */
  skin?: number;
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
  /** A champion on a killing spree: the gold on their head (a WANTED poster over them). */
  bty?: number;
  /** The title a player's champion wears under their name (an id from shared/titles.ts). */
  ttl?: string;
}

export interface AbilitySnap {
  rank: number;
  /** Seconds of cooldown remaining. */
  cd: number;
  /** A word for the slot right now, e.g. "Boot" or "Surface". */
  note?: string;
}

/** Private state only the owning player receives. */
/** A player's cast pressed this many seconds early (before its cooldown, a cast or a dash ends) is held and fires when it can. */
export const CAST_QUEUE = 0.4;

/** Why a cast didn't happen: nobody to cast it on, still cooling down, or not enough mana. */
export type CastFail = 'target' | 'cooldown' | 'mana';

export interface MeSnap {
  id: number;
  /** The ability waiting to go off: pressed a moment early, or walking into reach to cast it. */
  queued?: Slot;
  /** Practice Range: your last hits on enemy Chuds, and the ones that died near you to something else. */
  drill?: { hits: number; missed: number };
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
  /** There's a purchase or sale this visit that can be taken back. */
  undo?: boolean;
  /** What you're attacking right now (the unit your attack order is on), while you have one. */
  tgt?: number;
  /** Seconds until each inventory slot's item can be used again (0 when ready, or when it has no active). */
  itemCd?: number[];
  /** Jungle buffs and the seconds left on each. */
  buffs: { kind: BuffKind; left: number }[];
  /** For the shop's stat panel. `as` is attacks per second; `ls` is lifesteal in percent. */
  stats: {
    ad: number;
    ap: number;
    armor: number;
    mr: number;
    as: number;
    ms: number;
    haste: number;
    ls: number;
    /** Basic attack range. */
    range: number;
    /** Attack damage from items and buffs (what "bonus AD" ratios use). */
    bad: number;
    /** Health from items and buffs (what "bonus health" ratios use). */
    bhp: number;
  };
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
  /** The map event that's announced or running, if any. */
  event?: EventStatus;
}
