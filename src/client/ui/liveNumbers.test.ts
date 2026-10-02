import { describe, expect, it } from 'vitest';
import { liveDescription, type LiveStats } from './liveNumbers';

const stats: LiveStats = { ad: 100, ap: 50, bad: 30, bhp: 200, mhp: 900 };
const flat = (text: string, rank: number) => liveDescription(text, rank, stats);

describe('descriptions worked out for you', () => {
  it('pick out your rank and add up what it scales with', () => {
    const parts = flat('Fire a bolt for 55/85/115/145 (+90% AD) physical damage.', 2);
    expect(parts.find((p) => p.kind === 'rank')?.text).toBe('85');
    expect(parts.find((p) => p.kind === 'total')?.text).toBe(' = 175');
    expect(parts.map((p) => p.text).join('')).toBe('Fire a bolt for 55/85/115/145 (+90% AD) = 175 physical damage.');
  });

  it('handle two ratios, bonus stats, single numbers and unlearned abilities', () => {
    expect(flat('takes 70/100/130/160 (+60% AP, +30% bonus AD) magic damage', 0).find((p) => p.kind === 'total')?.text).toBe(' = 109');
    expect(flat('a 60/90 (+15% bonus health) shield', 2).find((p) => p.kind === 'total')?.text).toBe(' = 120');
    expect(flat('deals 40 (+50% bonus AD) magic damage', 1).find((p) => p.kind === 'total')?.text).toBe(' = 55');
  });

  it('leave everything else alone', () => {
    expect(flat('Lasts 4s and slows by 30%.', 1)).toEqual([{ text: 'Lasts 4s and slows by 30%.' }]);
    const pct = flat('move 10%/15%/20% faster', 3);
    expect(pct.find((p) => p.kind === 'rank')?.text).toBe('20%');
    expect(pct.some((p) => p.kind === 'total')).toBe(false);
  });
});
