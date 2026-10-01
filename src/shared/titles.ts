import { CHAMPION_INFO } from './champions/registry';
import type { ChampionId } from './champions/types';

// Titles players earn over their matches (kept in their own browser: see client/profile.ts) and wear under
// their name, for everyone to see. The host only checks a title is one of these; earning them is on trust,
// among friends.

export interface TitleDef {
  id: string;
  name: string;
  /** How to earn it. */
  hint: string;
}

const champTitles: TitleDef[] = (Object.keys(CHAMPION_INFO) as ChampionId[]).map((id) => ({
  id: `main:${id}`,
  name: `${CHAMPION_INFO[id].name} Main`,
  hint: `Play 10 matches as ${CHAMPION_INFO[id].name}`,
}));

export const TITLES: readonly TitleDef[] = [
  { id: 'fresh', name: 'Fresh Bloke', hint: 'Everyone starts somewhere' },
  { id: 'regular', name: 'Regular', hint: 'Play 10 matches' },
  { id: 'oldHand', name: 'Old Hand', hint: 'Play 50 matches' },
  { id: 'winner', name: 'Winner', hint: 'Win a match' },
  { id: 'baseBreaker', name: 'Da Base Breaker', hint: 'Win 10 matches' },
  { id: 'legend', name: 'Legend of Da Base', hint: 'Win 50 matches' },
  { id: 'slayer', name: 'Slayer', hint: 'Take down 100 champions' },
  { id: 'wingman', name: 'Wingman', hint: 'Get 100 assists' },
  { id: 'chudBotherer', name: 'Chud Botherer', hint: 'Last-hit 1,000 Chuds and monsters' },
  { id: 'untouchable', name: 'Untouchable', hint: 'Win a match without dying once' },
  { id: 'mvp', name: 'MVP', hint: 'Be the MVP of a match' },
  ...champTitles,
];

export const DEFAULT_TITLE = 'fresh';

export function titleName(id: string | undefined): string | undefined {
  return TITLES.find((t) => t.id === id)?.name;
}

export const isTitleId = (v: unknown): v is string => typeof v === 'string' && TITLES.some((t) => t.id === v);
