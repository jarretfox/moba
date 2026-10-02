import type { ChampionId } from '../champions/types';
import type { Unit } from './unit';

/**
 * ARAM-only adjustments, League-style: champions who are too weak (or too strong) in the Howling Hollow's
 * all-out brawl deal a little more (or less) damage there, or take a little less (or more). The Rift is
 * untouched. Tuned from bots-only 5v5 simulations (DESIGN.md has the numbers).
 */
export const ARAM_TUNING: Partial<Record<ChampionId, { dealt?: number; taken?: number }>> = {
  // Assassins with nobody alone to pick off.
  paris: { dealt: 1.15, taken: 0.85 },
  daltonomo: { dealt: 1.06, taken: 0.94 },
};

function tuningOf(u: Unit | null | undefined): { dealt?: number; taken?: number } | undefined {
  const id = (u as { info?: { id?: ChampionId } } | null | undefined)?.info?.id;
  return id ? ARAM_TUNING[id] : undefined;
}

/** How much an ARAM hit from `source` on `target` is scaled by (1 for everyone untuned). */
export function aramScale(source: Unit | null, target: Unit): number {
  return (tuningOf(source?.creditTo)?.dealt ?? 1) * (tuningOf(target)?.taken ?? 1);
}
