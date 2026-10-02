import { describe, expect, it } from 'vitest';
import { TITLES, isTitleId, titleName } from '../shared/titles';
import { earned, emptyProfile, favourite, HISTORY_LENGTH, loadProfile, recordMatch, type MatchRecord } from './profile';
import { ago } from './ui/profileScreen';

const match = (o: Partial<MatchRecord> = {}): MatchRecord => ({ champ: 'logan', won: false, k: 2, d: 3, a: 4, cs: 60, mvp: false, ...o });

describe('your profile', () => {
  it('adds up your matches', () => {
    let p = emptyProfile();
    p = recordMatch(p, match({ won: true })).profile;
    p = recordMatch(p, match({ champ: 'kingrix' })).profile;
    expect([p.games, p.wins, p.kills, p.deaths, p.assists, p.cs]).toEqual([2, 1, 4, 6, 8, 120]);
    expect(p.champs.logan).toEqual({ games: 1, wins: 1 });
    expect(p.champs.kingrix).toEqual({ games: 1, wins: 0 });
  });

  it('unlocks titles as you go, each once', () => {
    let p = emptyProfile();
    expect([...earned(p)]).toEqual(['fresh']);
    const first = recordMatch(p, match({ won: true, d: 0, mvp: true }));
    expect(first.unlocked.map((t) => t.id).sort()).toEqual(['mvp', 'untouchable', 'winner']);
    p = first.profile;
    expect(recordMatch(p, match({ won: true })).unlocked).toEqual([]);
    for (let i = 0; i < 8; i++) p = recordMatch(p, match()).profile;
    // The tenth match, the tenth as Logan.
    const tenth = recordMatch(p, match());
    expect(tenth.unlocked.map((t) => t.id).sort()).toEqual(['main:logan', 'regular']);
    expect(titleName('main:logan')).toBe('Logan Lionheart Main');
    expect(favourite(tenth.profile)).toBe('logan');
  });

  it("knows its titles, and nothing else", () => {
    expect(TITLES.every((t) => isTitleId(t.id))).toBe(true);
    expect(isTitleId('emperor')).toBe(false);
    expect(isTitleId(42)).toBe(false);
  });
});

describe('match history', () => {
  const m = { champ: 'logan' as const, won: true, k: 3, d: 1, a: 5, cs: 80, mvp: false };
  it('keeps the newest matches first, twenty at most', () => {
    let p = emptyProfile();
    for (let i = 0; i < HISTORY_LENGTH + 5; i++) p = recordMatch(p, { ...m, k: i }, { at: 1000 + i, map: 'rift', length: 900 }).profile;
    expect(p.history).toHaveLength(HISTORY_LENGTH);
    expect(p.history[0]).toMatchObject({ k: HISTORY_LENGTH + 4, at: 1000 + HISTORY_LENGTH + 4, map: 'rift' });
    expect(p.games).toBe(HISTORY_LENGTH + 5);
  });

  it('drops entries that make no sense when loading', () => {
    const store = new Map<string, string>();
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    Object.assign(globalThis, { localStorage: ls });
    ls.setItem('moba.profile', JSON.stringify({ games: 2, history: [{ ...m, at: 5, map: 'aram', length: 600 }, { champ: 'nobody', won: 'yes' }, 'junk'] }));
    expect(loadProfile().history).toEqual([{ ...m, at: 5, map: 'aram', length: 600 }]);
  });

  it('says how long ago', () => {
    const now = 10_000_000;
    expect(ago(now - 20_000, now)).toBe('just now');
    expect(ago(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(ago(now - 30 * 3_600_000, now)).toBe('yesterday');
  });
});
