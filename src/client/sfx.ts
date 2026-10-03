import type { ChampionId } from '../shared/champions/types';
import type { Vec2 } from '../shared/math';
import type { EntitySnap, FxKind, GameEvent } from '../shared/protocol';
import type { SoundName } from './audio';

export { spatialize } from './mix';

/** What to play for an event: the sound, where it happened (none = right in your ear), and how loud. */
export interface SoundCue {
  name: SoundName;
  at?: Vec2;
  gain: number;
  /**
   * A more particular recording to look for first (samples.ts), for sounds the synth shares: one ability's
   * cast ("cast:scrimby:3"), one effect ("fx:steamBurst"). Without one, the sound's own recording, if any.
   */
  take?: string;
  /** Play the synthesized sound too, under the recording (a heavy hit's thump). */
  over?: boolean;
}

/** Each champion's basic attack, and the signature under their casts. */
export const ATTACK_SOUND: Record<ChampionId, SoundName> = {
  marksman: 'atkBow', barbarian: 'atkAxe', willmore: 'atkHook', hunnag: 'atkSpore', logan: 'atkClaw', kingrix: 'atkScepter',
  dongmaster: 'atkPunch', dabber: 'atkRig', paris: 'atkEpee', havarti: 'atkCheese', daltonomo: 'atkDagger', scrimby: 'atkToken', bigwhale: 'atkCoin',
};
export const CAST_SOUND: Record<ChampionId, SoundName> = {
  marksman: 'castStamp', barbarian: 'castDrum', willmore: 'castClank', hunnag: 'castBubble', logan: 'castGrowl', kingrix: 'castRoyal',
  dongmaster: 'castGrunt', dabber: 'castFlick', paris: 'castFlourish', havarti: 'castAngelic', daltonomo: 'castJingle', scrimby: 'castHonk', bigwhale: 'castCashier',
};

export const MELEE: ReadonlySet<ChampionId> = new Set(['barbarian', 'willmore', 'logan', 'dongmaster', 'paris', 'daltonomo']);

/** A hit this big (as a share of the target's max health) gets the heavy sound. */
export const HEAVY_HIT = 0.08;

export const FX_SOUNDS: Partial<Record<FxKind, [SoundName, number]>> = {
  aimLine: ['warn', 0.6],
  trapSnap: ['snap', 0.8],
  roll: ['whoosh', 0.6],
  cleave: ['swing', 0.9],
  pounce: ['whoosh', 0.7],
  maul: ['swing', 0.9],
  warCry: ['roar', 0.8],
  slam: ['boom', 0.6],
  berserk: ['roar', 0.9],
  recall: ['recall', 0.5],
  wardenMark: ['warn', 0.9],
  wardenSlam: ['wardenSlam', 1],
  burrow: ['dig', 0.7],
  surface: ['boom', 0.7],
  hookPull: ['whoosh', 0.6],
  tunnel: ['dig', 0.9],
  lob: ['whoosh', 0.35],
  rotBurst: ['magic', 0.6],
  pulse: ['magic', 0.25],
  hop: ['dig', 0.5],
  deepMark: ['warn', 0.8],
  deepHands: ['boom', 0.9],
  lionheart: ['whoosh', 0.7],
  mane: ['magic', 0.5],
  roar: ['roar', 1],
  summon: ['cast', 0.7],
  kneel: ['boom', 0.5],
  decree: ['kill', 0.6],
  nowYouSeeMe: ['whoosh', 0.5],
  backstab: ['hit', 0.7],
  jackbox: ['snap', 0.9],
  boxShot: ['shoot', 0.35],
  doubleAct: ['magic', 0.8],
  cloneBoom: ['boom', 0.9],
  curdle: ['hit', 0.6],
  fondue: ['magic', 0.5],
  rindBlade: ['snap', 0.4],
  divineFondue: ['magic', 0.9],
  fondueEruption: ['boom', 1],
  cheeseWave: ['swing', 0.4],
  ascend: ['fanfare', 0.5],
  fleche: ['swing', 0.9],
  cafeBreak: ['magic', 0.35],
  touche: ['snap', 0.5],
  encore: ['magic', 0.8],
  hotbox: ['whoosh', 0.3],
  stickyIcky: ['whoosh', 0.28],
  lightItUp: ['boom', 0.55],
  cloudNine: ['magic', 0.8],
  chinCheck: ['whoosh', 0.8],
  mewing: ['magic', 0.4],
  sigmaStare: ['warn', 0.6],
  ascension: ['roar', 1],
  // Item actives.
  lanternLight: ['lantern', 0.7],
  aegisWard: ['aegis', 0.8],
  drumBeat: ['warDrum', 0.8],
  expressHorn: ['horn', 0.9],
  expressCrash: ['boom', 1],
  manhole: ['castClank', 0.5],
  steamBurst: ['whoosh', 0.7],
  jaywalk: ['whoosh', 0.45],
  mustard: ['hitMagic', 0.4],
  cashRain: ['kaching', 0.6],
  tip: ['gold', 0.2],
  yachtParty: ['chime', 0.5],
  paperwork: ['snap', 0.6],
  breach: ['whoosh', 0.8],
  splashZone: ['quake', 0.9],
  // Summoner spells.
  flash: ['magic', 0.55],
  ghost: ['whoosh', 0.5],
  summonerHeal: ['chime', 0.6],
  barrier: ['aegis', 0.7],
  exhaust: ['hitMagic', 0.5],
  ignite: ['boom', 0.4],
  cleanse: ['chime', 0.5],
  teleportStart: ['recall', 0.6],
  teleportArrive: ['recall', 0.8],
  smite: ['impact', 0.7],
  clarity: ['chime', 0.5],
  markHit: ['hit', 0.6],
  markDash: ['whoosh', 0.6],
};

/**
 * The sound for one game event, if it gets one. Chuds and monsters stay quiet compared to champions, and
 * your own level-ups and gold are the only private sounds; everything else plays where it happened.
 */
export function cueFor(ev: GameEvent, ents: ReadonlyMap<number, EntitySnap>, myId: number): SoundCue | null {
  switch (ev.e) {
    case 'attack': {
      const src = ents.get(ev.src);
      if (!src) return null;
      const at = { x: src.x, y: src.y };
      switch (src.k) {
        case 'champion':
          return { name: src.champ ? ATTACK_SOUND[src.champ] : 'swing', at, gain: src.id === myId ? 0.9 : 0.5 };
        case 'structure':
          return { name: 'tower', at, gain: 0.7 };
        case 'chud':
          return { name: src.chud === 'ranged' || src.chud === 'siege' ? 'shoot' : 'swing', at, gain: 0.18 };
        default:
          return { name: 'swing', at, gain: 0.3 };
      }
    }
    case 'dmg': {
      if (ev.target !== myId && ev.src !== myId) return null;
      const t = ents.get(ev.target);
      if (!t) return null;
      // Your own basic attacks sound on anything (a Chud, a monster, a Shootie), like League: you hear every hit land.
      if (t.k !== 'champion' && ev.target !== myId) {
        const me = ev.b && ev.src === myId ? ents.get(myId) : undefined;
        if (!me) return null;
        return { name: 'hit', at: { x: t.x, y: t.y }, gain: 0.32, take: me.champ ? `hit:${me.champ}` : undefined };
      }
      // Heavy hits land with more weight; magic stings rather than thumps; a hit on you has a deeper body.
      const heavy = ev.amount >= (t.mhp ?? 1000) * HEAVY_HIT;
      const name: SoundName = heavy ? 'hitHeavy' : ev.type === 'magic' ? 'hitMagic' : ev.target === myId ? 'hitMe' : 'hit';
      // The hitter's own impact, if they have one recorded (a punch, a blade, a splat), over the thump of a heavy one.
      const by = ev.src !== undefined ? ents.get(ev.src) : undefined;
      const take = by?.k === 'champion' && by.champ ? `hit:${by.champ}` : undefined;
      return { name, at: { x: t.x, y: t.y }, gain: ev.target === myId ? 0.75 : 0.4, take, over: heavy };
    }
    case 'death': {
      const t = ents.get(ev.id);
      if (!t) return null;
      const at = { x: t.x, y: t.y };
      if (t.k === 'champion') return { name: 'death', at, gain: 0.9 };
      if (t.k === 'structure') return { name: t.role === 'daBase' ? 'baseFall' : 'collapse', at, gain: 1 };
      if (t.k === 'monster' && t.mon === 'warden') return { name: 'wardenFall', at, gain: 1 };
      if (t.k === 'monster' && t.mon === 'crab') return { name: 'crabSqueak', at, gain: 0.7 };
      return { name: 'smallDeath', at, gain: 0.25 };
    }
    case 'cast': {
      const src = ents.get(ev.src);
      return src ? { name: src.champ ? CAST_SOUND[src.champ] : 'cast', at: { x: src.x, y: src.y }, gain: src.id === myId ? 0.5 : 0.35, take: src.champ ? `cast:${src.champ}:${ev.slot}` : undefined } : null;
    }
    case 'castFail':
      return ev.src === myId ? { name: 'deny', gain: 0.5 } : null;
    case 'attackStop':
      return null;
    case 'level':
      return ev.id === myId ? { name: 'levelUp', gain: 0.7 } : null;
    case 'gold':
      return ev.id === myId && ev.amount > 0 ? { name: 'gold', gain: 0.35 } : null;
    case 'kill':
      return { name: 'kill', gain: 0.5 };
    case 'fx': {
      const s = FX_SOUNDS[ev.fx];
      return s ? { name: s[0], at: { x: ev.x, y: ev.y }, gain: s[1], take: `fx:${ev.fx}` } : null;
    }
    case 'zap':
      return { name: 'tower', at: { x: ev.x2, y: ev.y2 }, gain: 0.9 };
    case 'heal':
      return null;
    case 'emote':
      return null; // champions say it in their own voice (voices.ts)
    case 'ping':
      return { name: ev.kind === 'danger' ? 'pingDanger' : ev.kind === 'missing' ? 'pingMissing' : 'ping', gain: 0.6 };
    case 'evt':
      return null; // the map events make their own noise (render/events.ts)
  }
}

/**
 * The announcer's sound for a kill-feed line: the till when your side collects a bounty, a fanfare or a
 * toll for the big ones, the kill chime otherwise.
 */
export function announceSound(ev: Extract<GameEvent, { e: 'kill' }>, big: boolean, ours: boolean): SoundName {
  if (ev.what === 'champion' && ev.shutdown && ours) return 'kaching';
  return big ? (ours ? 'fanfare' : 'toll') : 'kill';
}
