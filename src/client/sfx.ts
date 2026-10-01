import type { ChampionId } from '../shared/champions/types';
import type { Vec2 } from '../shared/math';
import type { EntitySnap, FxKind, GameEvent } from '../shared/protocol';
import type { SoundName } from './audio';

/** What to play for an event: the sound, where it happened (none = right in your ear), and how loud. */
export interface SoundCue {
  name: SoundName;
  at?: Vec2;
  gain: number;
}

export const MELEE: ReadonlySet<ChampionId> = new Set(['barbarian', 'willmore', 'logan', 'dongmaster', 'paris']);

const FX_SOUNDS: Partial<Record<FxKind, [SoundName, number]>> = {
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
  wardenSlam: ['boom', 1],
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
  hotbox: ['whoosh', 0.45],
  stickyIcky: ['whoosh', 0.4],
  lightItUp: ['boom', 0.55],
  cloudNine: ['magic', 0.8],
  chinCheck: ['whoosh', 0.8],
  mewing: ['magic', 0.4],
  sigmaStare: ['warn', 0.6],
  ascension: ['roar', 1],
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
          return { name: src.champ && MELEE.has(src.champ) ? 'swing' : 'shoot', at, gain: src.id === myId ? 0.7 : 0.5 };
        case 'structure':
          return { name: 'tower', at, gain: 0.6 };
        case 'chud':
          return { name: src.chud === 'ranged' || src.chud === 'siege' ? 'shoot' : 'swing', at, gain: 0.18 };
        default:
          return { name: 'swing', at, gain: 0.3 };
      }
    }
    case 'dmg': {
      if (ev.target !== myId && ev.src !== myId) return null;
      const t = ents.get(ev.target);
      if (!t || (t.k !== 'champion' && ev.target !== myId)) return null;
      return { name: 'hit', at: { x: t.x, y: t.y }, gain: ev.target === myId ? 0.6 : 0.4 };
    }
    case 'death': {
      const t = ents.get(ev.id);
      if (!t) return null;
      const at = { x: t.x, y: t.y };
      if (t.k === 'champion') return { name: 'death', at, gain: 0.9 };
      if (t.k === 'structure') return { name: 'boom', at, gain: 1 };
      if (t.k === 'monster' && t.mon === 'warden') return { name: 'boom', at, gain: 1 };
      return { name: 'smallDeath', at, gain: 0.25 };
    }
    case 'cast': {
      const src = ents.get(ev.src);
      return src ? { name: 'cast', at: { x: src.x, y: src.y }, gain: src.id === myId ? 0.45 : 0.3 } : null;
    }
    case 'level':
      return ev.id === myId ? { name: 'levelUp', gain: 0.7 } : null;
    case 'gold':
      return ev.id === myId && ev.amount > 0 ? { name: 'gold', gain: 0.35 } : null;
    case 'kill':
      return { name: 'kill', gain: 0.5 };
    case 'fx': {
      const s = FX_SOUNDS[ev.fx];
      return s ? { name: s[0], at: { x: ev.x, y: ev.y }, gain: s[1] } : null;
    }
    case 'heal':
      return null;
    case 'emote':
      return null; // champions say it in their own voice (voices.ts)
    case 'ping':
      return { name: ev.kind === 'danger' ? 'pingDanger' : ev.kind === 'missing' ? 'pingMissing' : 'ping', gain: 0.6 };
  }
}
