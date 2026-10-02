import { describe, expect, it } from 'vitest';
import type { ItemId } from '../shared/items';
import type { MeSnap } from '../shared/protocol';
import { itemChanges, statGains, suggest } from './shop';

const stats = (o: Partial<MeSnap['stats']> = {}): MeSnap['stats'] => ({ ad: 50, ap: 0, armor: 20, mr: 20, as: 0.7, ms: 340, haste: 0, ls: 0, range: 150, bad: 0, bhp: 0, ...o });

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

describe("Wick's suggestions", () => {
  const build: ItemId[] = ['shiv', 'treads', 'fang', 'striders', 'reaver'];

  it('tick off the build as you go, counting parts built into bigger things', () => {
    expect(suggest(build, [], 500).next).toBe('shiv');
    // The Shiv went into the Fang: both done, boots next.
    const s = suggest(build, ['fang'], 400);
    expect(s.steps.map((x) => x.done)).toEqual([true, false, true, false, false]);
    expect(s.next).toBe('treads');
    expect(suggest(build, ['striders', 'reaver'], 0).next).toBeNull();
  });

  it("point you at a part when you can't afford the whole thing yet", () => {
    // Bloodreaver is next but costs 2000 with the Fang in hand; 400 buys the Shiv that goes in it.
    const s = suggest(build, ['fang', 'striders'], 400);
    expect(s.toward).toBe('reaver');
    expect(s.next).toBe('shiv');
    // Rich enough: the whole thing.
    expect(suggest(build, ['fang', 'striders'], 5000).next).toBe('reaver');
  });
});
