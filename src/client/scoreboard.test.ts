import { describe, expect, it } from 'vitest';
import { TEAM } from '../shared/constants';
import type { ScoreRow } from '../shared/protocol';
import { matchReport } from './scoreboard';

const row = (over: Partial<ScoreRow>): ScoreRow => ({ id: 1, name: 'Jo', champ: 'marksman', team: TEAM.blue, lv: 12, k: 5, d: 2, a: 7, cs: 142, dmg: 14230, tdmg: 3200, taken: 9100, gold: 9800, items: ['longbow', 'striders'], ...over });

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
