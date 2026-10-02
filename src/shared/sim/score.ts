import { Champion } from '../champions/champion';
import type { ScoreRow } from '../protocol';
import type { Unit } from './unit';
import type { World } from './world';

/** A champion's running match stats: what the scoreboard and match reports show. */
export interface Score {
  kills: number;
  deaths: number;
  assists: number;
  /** Chuds and jungle monsters finished off. */
  cs: number;
  damageToChampions: number;
  damageToStructures: number;
  damageTaken: number;
  /** Everything earned, passive income included; selling doesn't count. */
  goldEarned: number;
  /** Pumpkins eaten on the Howling Hollow. */
  pumpkins: number;
}

export const newScore = (): Score => ({ kills: 0, deaths: 0, assists: 0, cs: 0, damageToChampions: 0, damageToStructures: 0, damageTaken: 0, goldEarned: 0, pumpkins: 0 });

/** Damage after armor and shields, credited to whoever's behind it (a king for his guards). */
export function recordDamage(source: Unit | null, target: Unit, dealt: number): void {
  if (dealt <= 0) return;
  const credit = source?.creditTo;
  if (target instanceof Champion && (!credit || credit.team !== target.team)) target.score.damageTaken += dealt;
  if (!(credit instanceof Champion) || credit.team === target.team) return;
  if (target instanceof Champion) credit.score.damageToChampions += dealt;
  else if (target.kind === 'structure') credit.score.damageToStructures += dealt;
}

/** Everyone's line on the scoreboard, blue first. */
export function scoreRows(world: World): ScoreRow[] {
  return world
    .units()
    .filter((u): u is Champion => u instanceof Champion)
    .sort((a, b) => a.team - b.team || a.id - b.id)
    .map((c) => ({
      id: c.id,
      name: c.name,
      champ: c.info.id,
      ...(c.skin ? { skin: c.skin } : {}),
      team: c.team as ScoreRow['team'],
      lv: c.level,
      k: c.score.kills,
      d: c.score.deaths,
      a: c.score.assists,
      cs: c.score.cs,
      dmg: Math.round(c.score.damageToChampions),
      tdmg: Math.round(c.score.damageToStructures),
      taken: Math.round(c.score.damageTaken),
      gold: Math.round(c.score.goldEarned),
      items: [...c.items],
      ...(c.score.pumpkins ? { pk: c.score.pumpkins } : {}),
    }));
}
