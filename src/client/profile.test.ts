import { describe, expect, it } from 'vitest';
import { TITLES, isTitleId, titleName } from '../shared/titles';
import { earned, emptyProfile, favourite, recordMatch, type MatchRecord } from './profile';

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
