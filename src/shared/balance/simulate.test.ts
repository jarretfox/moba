import { describe, expect, it } from 'vitest';
import { TEAM } from '../constants';
import type { ScoreRow } from '../protocol';
import { formatReport, seededRandom, simulateMatch, summarize, wilson, type MatchResult } from './simulate';

const row = (over: Partial<ScoreRow & { lane: 'top' | 'bot' }>): ScoreRow & { lane: 'top' | 'bot' } => ({
  id: 1, name: 'Bot', champ: 'marksman', team: TEAM.blue, lv: 10, k: 2, d: 1, a: 3, cs: 50, dmg: 5000, tdmg: 1000, taken: 4000, gold: 4000, items: [], lane: 'bot', ...over,
});

describe('the balance simulator', () => {
  it('replays the same match from the same seed, with six different-per-team champions', () => {
    const a = simulateMatch(7, 0.5);
    const b = simulateMatch(7, 0.5);
    expect(a).toEqual(b);
    expect(a.winner).toBe(0); // half a minute: nobody wins that fast
    expect(a.champions).toHaveLength(6);
    for (const team of [TEAM.blue, TEAM.red]) {
      const ids = a.champions.filter((c) => c.team === team).map((c) => c.champ);
      expect(new Set(ids).size).toBe(3);
    }
    expect(simulateMatch(8, 0.5).champions.map((c) => c.champ)).not.toEqual(a.champions.map((c) => c.champ));
  }, 30_000);

  it('gives honest error bars on small samples', () => {
    const [lo, hi] = wilson(6, 10);
    expect(lo).toBeCloseTo(0.31, 2);
    expect(hi).toBeCloseTo(0.83, 2);
    expect(wilson(0, 0)).toEqual([0, 1]);
    const [lo2, hi2] = wilson(600, 1000);
    expect(hi2 - lo2).toBeLessThan(0.07);
  });

  it('averages each champion over finished matches only, and counts wins by team', () => {
    const results: MatchResult[] = [
      { seed: 1, winner: TEAM.blue, minutes: 20, champions: [row({ champ: 'logan', team: TEAM.blue, k: 4 }), row({ champ: 'hunnag', team: TEAM.red, k: 0 })] },
      { seed: 2, winner: TEAM.red, minutes: 30, champions: [row({ champ: 'logan', team: TEAM.blue, k: 2 }), row({ champ: 'hunnag', team: TEAM.red, k: 6 })] },
      { seed: 3, winner: 0, minutes: 45, champions: [row({ champ: 'logan', team: TEAM.blue, k: 99 })] },
    ];
    const s = summarize(results);
    expect(s).toMatchObject({ games: 3, finished: 2, blueWins: 1, redWins: 1 });
    const logan = s.champions.find((c) => c.champ === 'logan')!;
    expect(logan).toMatchObject({ games: 2, wins: 1, winRate: 0.5, k: 3 });
    expect(s.minutes.median).toBe(30);
  });

  it('prints a table with every champion', () => {
    const s = summarize([{ seed: 1, winner: TEAM.blue, minutes: 18, champions: [row({ champ: 'kingrix' }), row({ champ: 'willmore', team: TEAM.red })] }]);
    const text = formatReport(s);
    expect(text).toContain('King Rix');
    expect(text).toContain('Willmore');
    expect(text).toMatch(/1 games \(1 finished\)/);
  });

  it('has a repeatable random stream', () => {
    const a = seededRandom(3);
    const b = seededRandom(3);
    const xs = Array.from({ length: 5 }, () => a());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});
