export type ChampionId = 'marksman' | 'barbarian' | 'willmore' | 'hunnag';

/** What a champion's second bar holds. Rage starts empty and is earned in combat; mana starts full and regenerates. Some have none. */
export type Resource = 'mana' | 'rage' | 'none';

export type Targeting =
  /** Skillshot fired toward the cursor. */
  | { kind: 'direction'; range: number; width: number }
  /** Ground-targeted; the point is clamped to range. */
  | { kind: 'point'; range: number; radius: number }
  /** A wedge in front of the champion, aimed at the cursor. `angle` is the full spread in degrees. */
  | { kind: 'cone'; range: number; angle: number }
  /** Centered on the champion; `radius` is only for the aim indicator. */
  | { kind: 'self'; radius?: number };

/** Static ability facts shared by the sim (validation) and the client (HUD, aim indicators). */
export interface AbilityInfo {
  name: string;
  description: string;
  /** Per rank: index 0 is rank 1. */
  cost: number[];
  /** Seconds, per rank, before ability haste. */
  cooldown: number[];
  castTime: number;
  targeting: Targeting;
}

/** What a champion gains each level after the first. Attack speed grows as a percentage of base. */
export interface StatGrowth {
  maxHp: number;
  hpRegen: number;
  maxMana: number;
  manaRegen: number;
  ad: number;
  armor: number;
  mr: number;
  attackSpeedPct: number;
}

export interface ChampionInfo {
  id: ChampionId;
  name: string;
  title: string;
  resource: Resource;
  passive: { name: string; description: string };
  abilities: [AbilityInfo, AbilityInfo, AbilityInfo, AbilityInfo];
}

/** Rank-scaled numbers written the way League's tooltips do: "60/95/130/165". */
export const perRank = (values: readonly number[], fmt: (n: number) => string = String): string => values.map(fmt).join('/');

/** A per-rank table's value at `rank` (rank 1's value while unlearned). */
export const atRank = <T>(values: readonly T[], rank: number): T => values[Math.min(values.length - 1, Math.max(0, rank - 1))];
