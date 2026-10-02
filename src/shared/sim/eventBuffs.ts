import type { BuffKind } from '../protocol';
import type { Stats } from './unit';

// The team buffs the map events pay out (see events.ts). They live here, away from the sim, so the
// champion's stat pipeline, the jungle's buff table and the HUD can all read the numbers without pulling
// the whole event system in.

export type EventBuffKind = 'deepPockets' | 'wicksFavor' | 'royalFavor';

/** Deep Pockets (from Three Chuds in a Coat): gold trickles in for a while. */
export const DEEP_POCKETS = { duration: 90, goldPerSecond: 2 };
/** Wick's Favor (from delivering Old Wick's cart): quicker on your feet and harder to hurt. */
export const WICKS_FAVOR = { duration: 90, speed: 0.1, armor: 15, mr: 15 };
/** Royal Favor (from holding the Royal Tax Stall): a little more of everything that hurts. */
export const ROYAL_FAVOR = { duration: 90, ad: 15, ap: 25, attackSpeedPct: 0.1 };

export const EVENT_BUFFS: Record<EventBuffKind, { name: string; duration: number }> = {
  deepPockets: { name: 'Deep Pockets', duration: DEEP_POCKETS.duration },
  wicksFavor: { name: "Wick's Favor", duration: WICKS_FAVOR.duration },
  royalFavor: { name: 'Royal Favor', duration: ROYAL_FAVOR.duration },
};

export const isEventBuff = (kind: BuffKind): kind is EventBuffKind => kind in EVENT_BUFFS;

/** What each buff does to a champion's stats this tick (Deep Pockets pays gold instead; events.ts ticks it). */
export function applyEventBuffs(has: (kind: BuffKind) => boolean, s: Stats): void {
  if (has('wicksFavor')) {
    s.moveSpeed *= 1 + WICKS_FAVOR.speed;
    s.armor += WICKS_FAVOR.armor;
    s.mr += WICKS_FAVOR.mr;
  }
  if (has('royalFavor')) {
    s.ad += ROYAL_FAVOR.ad;
    s.ap += ROYAL_FAVOR.ap;
    s.attackSpeed *= 1 + ROYAL_FAVOR.attackSpeedPct;
  }
}
