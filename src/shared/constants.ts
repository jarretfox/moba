/** The host simulates the game at a fixed rate; everything in the sim is measured in ticks of DT seconds. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export const TEAM = { neutral: 0, blue: 1, red: 2 } as const;
export type Team = (typeof TEAM)[keyof typeof TEAM];
export type PlayerTeam = typeof TEAM.blue | typeof TEAM.red;

export const SLOT_KEYS = ['Q', 'W', 'E', 'R'] as const;
export type Slot = 0 | 1 | 2 | 3;
