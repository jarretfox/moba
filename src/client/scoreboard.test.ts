import { describe, expect, it } from 'vitest';
import { TEAM } from '../shared/constants';
import type { ScoreRow } from '../shared/protocol';
import { matchReport, pickMvp } from './scoreboard';

const row = (over: Partial<ScoreRow>): ScoreRow => ({ id: 1, name: 'Jo', champ: 'marksman', team: TEAM.blue, lv: 12, k: 5, d: 2, a: 7, cs: 142, dmg: 14230, tdmg: 3200, taken: 9100, gold: 9800, items: ['longbow', 'striders'], ...over });

describe('the MVP', () => {
  it('is the best showing on the winning team, even if a loser had more kills', () => {
    const rows = [
      row({ id: 1, team: TEAM.blue, k: 4, d: 3, a: 6, dmg: 9000 }),
      row({ id: 2, team: TEAM.blue, k: 7, d: 2, a: 3, dmg: 15000 }),
      row({ id: 3, team: TEAM.red, k: 12, d: 1, a: 2, dmg: 22000 }),
    ];
    expect(pickMvp(rows, TEAM.blue)?.id).toBe(2);
    expect(pickMvp(rows, undefined)?.id).toBe(3);
  });

  it('holds deaths against you', () => {
    const rows = [row({ id: 1, k: 6, d: 9, a: 2, dmg: 10000 }), row({ id: 2, k: 5, d: 0, a: 2, dmg: 10000 })];
    expect(pickMvp(rows, TEAM.blue)?.id).toBe(2);
  });
});

describe('the match report', () => {
  it("says who won, how long it took, and each champion's numbers, team by team", () => {
    const text = matchReport([row({}), row({ id: 2, name: 'Bot Logan Lionheart', champ: 'logan', team: TEAM.red, items: [] })], TEAM.blue, 18 * 60 + 42);
    const lines = text.split('\n');
    expect(lines[0]).toMatch(/18:42 · Blue won$/);
    expect(lines[1]).toBe('BLUE (won)');
    expect(lines[2]).toBe('  Jo (Marksman) Lv12 5/2/7 · CS 142 · dmg 14.2k · taken 9.1k · towers 3.2k · gold 9.8k · Pride Longbow, Swiftstriders');
    expect(lines[3]).toBe('RED');
    expect(lines[4]).toContain('Bot Logan Lionheart (Logan Lionheart) Lv12');
    expect(lines[4]).toContain('no items');
  });
});
