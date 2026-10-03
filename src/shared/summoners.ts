import { MAX_LEVEL } from './sim/progression';

/**
 * Summoner spells: two per player, picked in champion select and cast with D and F, like League's. They
 * don't belong to any champion, and they don't rank up: what they do grows with your level instead. The
 * numbers are League's, scaled to this game's 13 levels. The casting lives in sim/summonerCasts.ts.
 */
export type SummonerId = 'flash' | 'ghost' | 'heal' | 'barrier' | 'exhaust' | 'ignite' | 'cleanse' | 'teleport' | 'smite' | 'clarity' | 'mark';

/** What a summoner spell is aimed at: nothing, a spot, or something near the cursor. */
export type SummonerTargeting = 'self' | 'point' | 'enemyChampion' | 'jungle' | 'allyPost';

export interface SummonerInfo {
  id: SummonerId;
  name: string;
  /** Its picture (see client/render/iconArt.ts). */
  icon: string;
  cooldown: number;
  targeting: SummonerTargeting;
  /** How far from you it reaches (aimed and targeted ones). */
  range?: number;
  /** Which maps it can be taken on (League keeps Smite and Teleport off ARAM, and Clarity and Mark on it). */
  maps: 'rift' | 'aram' | 'both';
  /** For the tooltip (numbers by level read "80–318": level 1 to level 13). */
  description: string;
}

/** A number that grows from `at1` at level 1 to `atMax` at the top level. */
export function byLevel(at1: number, atMax: number, level: number): number {
  return at1 + ((atMax - at1) * (Math.max(1, Math.min(MAX_LEVEL, level)) - 1)) / (MAX_LEVEL - 1);
}

export const FLASH = { range: 400 };
export const GHOST = { speed: [0.24, 0.48], duration: 10 };
export const HEAL = { amount: [80, 318], radius: 850, speed: 0.3, speedFor: 1 };
export const BARRIER = { shield: [105, 411], duration: 2.5 };
export const EXHAUST = { range: 650, slow: 0.3, weaken: 0.35, duration: 2.5 };
export const IGNITE = { range: 600, damage: [70, 410], duration: 5, wounds: 0.4 };
/** Cleanse's tenacity: stuns, roots, slows and fears that land in the next few seconds are this much shorter. */
export const CLEANSE = { tenacity: 0.65, duration: 3 };
/** Teleport: the channel, how close to the cursor its destination must be, and what's left of the cooldown if it's cut short. */
export const TELEPORT = { channel: 4, pick: 900, cutShort: 15 };
export const SMITE = { range: 500, damage: [400, 700] };
export const CLARITY = { self: 0.5, allies: 0.25, radius: 600 };
/** Mark: the snowball, the damage it does, how long the mark lasts, and the dash to whoever's marked. */
export const MARK = { range: 1600, speed: 1300, width: 60, damage: [15, 75], markFor: 3, dashSpeed: 1400 };
/** Targeted summoners pick the nearest fitting target within this of the cursor. */
export const SUMMONER_PICK = 300;

const levels = (pair: number[], unit = '') => `${pair[0]}–${pair[1]}${unit}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export const SUMMONERS: Record<SummonerId, SummonerInfo> = {
  flash: {
    id: 'flash', name: 'Flash', icon: 'sum:flash', cooldown: 300, targeting: 'point', range: FLASH.range, maps: 'both',
    description: `Blink up to ${FLASH.range} toward the cursor, over walls and all.`,
  },
  ghost: {
    id: 'ghost', name: 'Ghost', icon: 'sum:ghost', cooldown: 210, targeting: 'self', maps: 'both',
    description: `Run ${levels(GHOST.speed.map((v) => v * 100), '%')} faster for ${GHOST.duration}s (by level), and pass through other units.`,
  },
  heal: {
    id: 'heal', name: 'Heal', icon: 'sum:heal', cooldown: 240, targeting: 'self', maps: 'both',
    description: `Heal yourself and the most hurt allied champion within ${HEAL.radius} for ${levels(HEAL.amount)} (by level). Both run ${pct(HEAL.speed)} faster for ${HEAL.speedFor}s.`,
  },
  barrier: {
    id: 'barrier', name: 'Barrier', icon: 'sum:barrier', cooldown: 180, targeting: 'self', maps: 'both',
    description: `A shield of ${levels(BARRIER.shield)} (by level) for ${BARRIER.duration}s.`,
  },
  exhaust: {
    id: 'exhaust', name: 'Exhaust', icon: 'sum:exhaust', cooldown: 210, targeting: 'enemyChampion', range: EXHAUST.range, maps: 'both',
    description: `The enemy champion at the cursor is slowed ${pct(EXHAUST.slow)} and deals ${pct(EXHAUST.weaken)} less damage for ${EXHAUST.duration}s.`,
  },
  ignite: {
    id: 'ignite', name: 'Ignite', icon: 'sum:ignite', cooldown: 180, targeting: 'enemyChampion', range: IGNITE.range, maps: 'both',
    description: `Set the enemy champion at the cursor alight: ${levels(IGNITE.damage)} true damage over ${IGNITE.duration}s (by level), and ${pct(IGNITE.wounds)} less healing meanwhile.`,
  },
  cleanse: {
    id: 'cleanse', name: 'Cleanse', icon: 'sum:cleanse', cooldown: 210, targeting: 'self', maps: 'both',
    description: `Shake off stuns, roots, slows, fears, Exhaust and Ignite (works while stunned), and shrug off ${pct(CLEANSE.tenacity)} of any more for ${CLEANSE.duration}s. Not knock-ups.`,
  },
  teleport: {
    id: 'teleport', name: 'Teleport', icon: 'sum:teleport', cooldown: 300, targeting: 'allyPost', maps: 'rift',
    description: `After a ${TELEPORT.channel}s channel, appear beside the allied Shootie, Oakner or Chud nearest the cursor (anywhere on the map: aim with the camera or on the minimap). Moving or acting cancels it, and so do stuns; cut short, it's back in ${TELEPORT.cutShort}s.`,
  },
  smite: {
    id: 'smite', name: 'Smite', icon: 'sum:smite', cooldown: 90, targeting: 'jungle', range: SMITE.range, maps: 'rift',
    description: `${levels(SMITE.damage)} true damage (by level) to the monster or enemy Chud at the cursor. For junglers: steal the Warden.`,
  },
  clarity: {
    id: 'clarity', name: 'Clarity', icon: 'sum:clarity', cooldown: 240, targeting: 'self', maps: 'aram',
    description: `Get back ${pct(CLARITY.self)} of your max mana, and allies within ${CLARITY.radius} ${pct(CLARITY.allies)} of theirs.`,
  },
  mark: {
    id: 'mark', name: 'Mark', icon: 'sum:mark', cooldown: 80, targeting: 'point', range: MARK.range, maps: 'aram',
    description: `Throw a snowball toward the cursor: the first enemy it hits takes ${levels(MARK.damage)} true damage (by level) and is marked for ${MARK.markFor}s. Press again while they're marked to dash to them.`,
  },
};

export const SUMMONER_IDS = Object.keys(SUMMONERS) as SummonerId[];
/** The two you start with until you pick: League's most taken. */
export const DEFAULT_SUMMONERS: readonly [SummonerId, SummonerId] = ['flash', 'heal'];
/** The keys they're cast with. */
export const SUMMONER_KEYS = ['D', 'F'] as const;

export function isSummonerId(v: unknown): v is SummonerId {
  return typeof v === 'string' && Object.hasOwn(SUMMONERS, v);
}

/** Whether a spell can be taken on a map ("rift" or "aram"). */
export function allowedOn(id: SummonerId, map: string): boolean {
  const m = SUMMONERS[id].maps;
  return m === 'both' || m === (map === 'aram' ? 'aram' : 'rift');
}

/** The spells that can be taken on a map, in the order champion select shows them. */
export function summonersFor(map: string): SummonerId[] {
  return SUMMONER_IDS.filter((id) => allowedOn(id, map));
}

/**
 * A pair of spells that's fine for `map`: two different ones it allows, keeping what it can of `pick` (from
 * anyone's browser, so not trusted) and filling the rest from the defaults, in order.
 */
export function fixSummoners(pick: unknown, map: string): [SummonerId, SummonerId] {
  const out: SummonerId[] = [];
  const offer = Array.isArray(pick) ? pick.slice(0, 2) : [];
  for (const id of offer) if (isSummonerId(id) && allowedOn(id, map) && !out.includes(id)) out.push(id);
  for (const id of [...DEFAULT_SUMMONERS, ...summonersFor(map)]) {
    if (out.length >= 2) break;
    if (!out.includes(id)) out.push(id);
  }
  return [out[0], out[1]];
}
