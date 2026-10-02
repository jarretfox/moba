import type { ChampionId } from './types';

// What each champion is for, League-style: a main role (champion select groups them by it) and,
// for some, a second one they lean into.

export type Role = 'tank' | 'fighter' | 'assassin' | 'mage' | 'marksman' | 'support';

/** The roles in the order champion select shows them, with a name and a line on what they do. */
export const ROLE_INFO: Record<Role, { name: string; blurb: string }> = {
  tank: { name: 'Tank', blurb: 'Soaks the hits, starts the fights and holds the line.' },
  fighter: { name: 'Fighter', blurb: 'Up close and durable: wins the long brawls.' },
  assassin: { name: 'Assassin', blurb: 'Gets in, picks someone off, gets out.' },
  mage: { name: 'Mage', blurb: 'Spells from range: zones, burst and crowd control.' },
  marksman: { name: 'Marksman', blurb: 'Steady damage from range that grows with items.' },
  support: { name: 'Support', blurb: 'Keeps the team alive and sets up the kills.' },
};

export const ROLE_ORDER = Object.keys(ROLE_INFO) as Role[];

export const ROLES: Record<ChampionId, { main: Role; also?: Role }> = {
  logan: { main: 'tank', also: 'support' },
  dongmaster: { main: 'tank', also: 'fighter' },
  barbarian: { main: 'fighter' },
  willmore: { main: 'fighter', also: 'tank' },
  havarti: { main: 'fighter', also: 'support' },
  daltonomo: { main: 'assassin' },
  paris: { main: 'assassin', also: 'fighter' },
  hunnag: { main: 'mage', also: 'support' },
  marksman: { main: 'marksman' },
  dabber: { main: 'marksman', also: 'assassin' },
  kingrix: { main: 'support', also: 'mage' },
};
