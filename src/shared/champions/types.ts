export type ChampionId = 'marksman';

export type Targeting =
  /** Skillshot fired toward the cursor. */
  | { kind: 'direction'; range: number; width: number }
  /** Ground-targeted; the point is clamped to range. */
  | { kind: 'point'; range: number; radius: number }
  | { kind: 'self' };

/** Static ability facts shared by the sim (validation) and the client (HUD, aim indicators). */
export interface AbilityInfo {
  name: string;
  description: string;
  cost: number;
  cooldown: number;
  castTime: number;
  targeting: Targeting;
}

export interface ChampionInfo {
  id: ChampionId;
  name: string;
  title: string;
  passive: { name: string; description: string };
  abilities: [AbilityInfo, AbilityInfo, AbilityInfo, AbilityInfo];
}
