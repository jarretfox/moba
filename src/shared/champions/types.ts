export type ChampionId = 'marksman' | 'barbarian';

/** What a champion's second bar holds. Rage starts empty and is earned in combat; mana starts full and regenerates. */
export type Resource = 'mana' | 'rage';

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
  cost: number;
  cooldown: number;
  castTime: number;
  targeting: Targeting;
}

export interface ChampionInfo {
  id: ChampionId;
  name: string;
  title: string;
  resource: Resource;
  passive: { name: string; description: string };
  abilities: [AbilityInfo, AbilityInfo, AbilityInfo, AbilityInfo];
}
