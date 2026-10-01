import { describe, expect, it } from 'vitest';
import type { ChampionId } from '../shared/champions/types';
import type { ScoreRow } from '../shared/protocol';
import { introLines } from './intro';

const row = (champ: ChampionId, team: 1 | 2, id = 0): ScoreRow => ({ id, name: champ, champ, team, lv: 1, k: 0, d: 0, a: 0, cs: 0, dmg: 0, tdmg: 0, taken: 0, gold: 0, items: [] });

describe('what gets said as a match opens', () => {
  it('has Logan and King Rix trade words when they face each other', () => {
    const lines = introLines([row('logan', 1), row('kingrix', 2), row('marksman', 1)], 0);
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.champ).sort()).toEqual(['kingrix', 'logan']);
  });

  it('keeps the rivals quiet when they are on the same side', () => {
    expect(introLines([row('logan', 1), row('kingrix', 1), row('marksman', 2)], 0)).toEqual([]);
  });

  it('remarks on a mirror match', () => {
    const [line] = introLines([row('barbarian', 1), row('barbarian', 2)], 0);
    expect(line.champ).toBeUndefined();
    expect(line.text).toContain('Two Oaks');
  });

  it('hears the Warden stir when someone from the Deep is playing', () => {
    expect(introLines([row('willmore', 1), row('logan', 2)], 0)[0].text).toContain('Warden');
    expect(introLines([row('marksman', 1), row('barbarian', 2)], 0)).toEqual([]);
  });

  it('picks among the rivals’ exchanges', () => {
    const rows = [row('logan', 1), row('kingrix', 2)];
    expect(introLines(rows, 0)).not.toEqual(introLines(rows, 1));
  });
});
