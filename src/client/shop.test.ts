import { describe, expect, it } from 'vitest';
import type { MeSnap } from '../shared/protocol';
import { itemChanges, statGains } from './shop';

const stats = (o: Partial<MeSnap['stats']> = {}): MeSnap['stats'] => ({ ad: 50, ap: 0, armor: 20, mr: 20, as: 0.7, ms: 340, haste: 0, ls: 0, ...o });

describe('what a purchase changed', () => {
  it('finds the items bought and sold, and where they went', () => {
    expect(itemChanges(['longsword'] as never, ['longsword', 'boots'] as never)).toEqual({ bought: [{ id: 'boots', slot: 1 }], sold: [] });
    expect(itemChanges(['longsword', 'boots'] as never, ['boots'] as never)).toEqual({ bought: [], sold: [{ id: 'longsword', slot: 0 }] });
    // A second copy of the same thing counts as bought; reshuffled slots don't count at all.
    expect(itemChanges(['a', 'b'] as never, ['b', 'a', 'a'] as never).bought).toEqual([{ id: 'a', slot: 2 }]);
    expect(itemChanges(['a', 'b'] as never, ['b', 'a'] as never)).toEqual({ bought: [], sold: [] });
  });

  it('lists the stats that went up, health first', () => {
    const gains = statGains(stats(), stats({ ad: 75, as: 0.85, ms: 340 }), [600, 750]);
    expect(gains.map((g) => g.text)).toEqual(['+150 Health', '+25 Attack damage', '+0.15 Attack speed']);
    expect(statGains(stats(), stats({ ad: 40 }))).toEqual([]);
  });
});
