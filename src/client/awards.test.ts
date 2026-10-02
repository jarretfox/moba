import { describe, expect, it } from 'vitest';
import type { ScoreRow } from '../shared/protocol';
import { goldGraph, pickAwards, type MatchTally } from './awards';

const row = (id: number, name: string, o: Partial<ScoreRow> = {}): ScoreRow => ({ id, name, champ: 'logan', team: 1, lv: 9, k: 0, d: 0, a: 0, cs: 0, dmg: 0, tdmg: 0, taken: 0, gold: 0, items: [], ...o });
const none: MatchTally = { warden: {}, executed: {} };

describe('end-of-match awards', () => {
  it('goes to whoever has the most of something worth mentioning', () => {
    const rows = [row(1, 'Ann', { tdmg: 4200, k: 2 }), row(2, 'Bo', { cs: 61 }), row(3, 'Cy', { k: 7, d: 1 })];
    const awards = pickAwards(rows, none);
    expect(awards.map((a) => [a.title, a.row.name, a.detail])).toEqual([
      ['Shootie Slayer', 'Ann', '4.2k damage to structures'],
      ['Chud Muncher', 'Bo', '61 Chuds and monsters'],
      ['Bloodthirsty', 'Cy', '7 kills'],
    ]);
  });

  it('crowns a Pumpkin Glutton on the Hollow', () => {
    const awards = pickAwards([row(1, 'Ann', { pk: 2 }), row(2, 'Bo', { pk: 5 })], none);
    expect(awards.map((a) => [a.title, a.row.name, a.detail])).toEqual([['Pumpkin Glutton', 'Bo', 'Ate 5 pumpkins']]);
  });

  it('counts the Warden and deaths to Chuds from the tally', () => {
    const rows = [row(1, 'Ann'), row(2, 'Bo')];
    const awards = pickAwards(rows, { warden: { Bo: 2 }, executed: { Ann: 1 } });
    expect(awards.map((a) => [a.title, a.row.name, a.detail])).toEqual([
      ['Warden Thief', 'Bo', 'Took the Warden 2 times'],
      ['Outplayed by a Chud', 'Ann', 'Killed by a Chud or a Shootie'],
    ]);
  });

  it('spreads awards around before anyone gets a second, and stops at the limit', () => {
    const star = row(1, 'Star', { tdmg: 5000, cs: 90, k: 12, a: 9, taken: 9000, gold: 15000 });
    const rows = [star, row(2, 'Bo', { d: 6 }), row(3, 'Cy', { a: 2 })];
    const awards = pickAwards(rows, none, 2);
    expect(awards.map((a) => [a.title, a.row.name])).toEqual([
      ['Shootie Slayer', 'Star'],
      ['Respawn Regular', 'Bo'],
    ]);
    expect(pickAwards(rows, none, 3).map((a) => a.title)).toEqual(['Shootie Slayer', 'Chud Muncher', 'Respawn Regular']);
  });

  it('goes to whoever is listed first on a tie', () => {
    expect(pickAwards([row(1, 'Ann', { k: 5 }), row(2, 'Bo', { k: 5 })], none)[0].row.name).toBe('Ann');
  });

  it('gives nothing for a quiet match', () => {
    expect(pickAwards([row(1, 'Ann', { k: 1, cs: 4 })], none)).toEqual([]);
  });
});

describe('the gold graph', () => {
  it('draws the lead over time, with the biggest leads labelled', () => {
    const svg = goldGraph([
      { t: 0, lead: 0 },
      { t: 300, lead: 1500 },
      { t: 600, lead: -2400 },
      { t: 900, lead: 200 },
    ]);
    expect(svg).toContain('+1.5k');
    expect(svg).toContain('−2.4k');
    expect(svg).toContain('5m');
    expect(svg).toContain('10m');
    expect(svg.match(/clip-path="url\(#gold-/g)).toHaveLength(2);
  });

  it('needs at least two readings', () => {
    expect(goldGraph([{ t: 0, lead: 0 }])).toBe('');
  });
});
