import type { MapId } from '../shared/map/mapData';
import { CHAMPION_INFO } from '../shared/champions/registry';
import type { ChampionId } from '../shared/champions/types';
import { DEFAULT_TITLE, TITLES, isTitleId, type TitleDef } from '../shared/titles';

// Your record, kept in this browser: matches, wins, takedowns, the champions you play. Milestones unlock
// titles (shared/titles.ts), and the one you pick shows under your name in matches.

export interface Profile {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  mvps: number;
  /** Wins without dying once. */
  flawless: number;
  champs: Partial<Record<ChampionId, { games: number; wins: number }>>;
  /** The title you wear. */
  title: string;
  /** Your most recent matches, newest first (up to HISTORY_LENGTH). */
  history: HistoryEntry[];
}

/** One match in your history. */
export interface HistoryEntry extends MatchRecord {
  /** When it ended (milliseconds since 1970). */
  at: number;
  map: MapId;
  /** How long it ran, in seconds. */
  length: number;
  /** Which look the champion wore. */
  skin?: number;
}

/** How many matches the history keeps. */
export const HISTORY_LENGTH = 20;

/** One match, from your point of view. */
export interface MatchRecord {
  champ: ChampionId;
  won: boolean;
  k: number;
  d: number;
  a: number;
  cs: number;
  mvp: boolean;
}

const KEY = 'moba.profile';

export const emptyProfile = (): Profile => ({ games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0, mvps: 0, flawless: 0, champs: {}, title: DEFAULT_TITLE, history: [] });

/** A saved history entry that still makes sense (older saves, or hand-edited ones, may not). */
function isEntry(e: unknown): e is HistoryEntry {
  const h = e as Partial<HistoryEntry> | null;
  return !!h && typeof h === 'object' && typeof h.champ === 'string' && Object.hasOwn(CHAMPION_INFO, h.champ) && typeof h.won === 'boolean' && typeof h.at === 'number' && typeof h.length === 'number' && (h.map === 'rift' || h.map === 'aram');
}

export function loadProfile(): Profile {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Profile> | null;
    if (!raw || typeof raw !== 'object') return emptyProfile();
    const p = { ...emptyProfile(), ...raw };
    if (!isTitleId(p.title)) p.title = DEFAULT_TITLE;
    p.history = Array.isArray(p.history) ? p.history.filter(isEntry).slice(0, HISTORY_LENGTH) : [];
    return p;
  } catch {
    return emptyProfile(); // storage blocked or garbled: start fresh
  }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // not worth bothering the player about
  }
}

/** Which titles a record has earned. */
export function earned(p: Profile): Set<string> {
  const ids = new Set<string>(['fresh']);
  const add = (id: string, ok: boolean) => ok && ids.add(id);
  add('regular', p.games >= 10);
  add('oldHand', p.games >= 50);
  add('winner', p.wins >= 1);
  add('baseBreaker', p.wins >= 10);
  add('legend', p.wins >= 50);
  add('slayer', p.kills >= 100);
  add('wingman', p.assists >= 100);
  add('chudBotherer', p.cs >= 1000);
  add('untouchable', p.flawless >= 1);
  add('mvp', p.mvps >= 1);
  for (const [champ, rec] of Object.entries(p.champs)) add(`main:${champ}`, (rec?.games ?? 0) >= 10);
  return ids;
}

/** Adds a match to the record (and, with `entry`, to the history), and says which titles it newly unlocked. */
export function recordMatch(p: Profile, m: MatchRecord, entry?: Omit<HistoryEntry, keyof MatchRecord>): { profile: Profile; unlocked: TitleDef[] } {
  const before = earned(p);
  const champ = p.champs[m.champ] ?? { games: 0, wins: 0 };
  const profile: Profile = {
    ...p,
    games: p.games + 1,
    wins: p.wins + (m.won ? 1 : 0),
    kills: p.kills + m.k,
    deaths: p.deaths + m.d,
    assists: p.assists + m.a,
    cs: p.cs + m.cs,
    mvps: p.mvps + (m.mvp ? 1 : 0),
    flawless: p.flawless + (m.won && m.d === 0 ? 1 : 0),
    champs: { ...p.champs, [m.champ]: { games: champ.games + 1, wins: champ.wins + (m.won ? 1 : 0) } },
    history: entry ? [{ ...m, ...entry }, ...p.history].slice(0, HISTORY_LENGTH) : p.history,
  };
  const now = earned(profile);
  return { profile, unlocked: TITLES.filter((t) => now.has(t.id) && !before.has(t.id)) };
}

/** The champion you've played most (ties: most wins), if any. */
export function favourite(p: Profile): ChampionId | null {
  const list = Object.entries(p.champs) as [ChampionId, { games: number; wins: number }][];
  list.sort((a, b) => b[1].games - a[1].games || b[1].wins - a[1].wins);
  return list[0]?.[0] ?? null;
}
