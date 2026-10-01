import { describe, expect, it } from 'vitest';
import { TEAM } from '../../shared/constants';
import { MAP } from '../../shared/map/mapData';
import { FOUNTAIN_RADIUS } from '../../shared/sim/fountain';
import type { FxLayer } from './fx';
import { Shopkeeper, wickSpot } from './shopkeeper';

describe('Old Wick', () => {
  it('can be clicked on (him or his rug of wares), and stands where walking up to him puts you at the shop', () => {
    for (const team of [TEAM.blue, TEAM.red]) {
      const at = wickSpot(MAP, team);
      const wick = new Shopkeeper(at.x, at.y, at.facing, {} as FxLayer);
      // His middle, his hood, his rug.
      expect(wick.hit({ x: at.x, y: at.y - 60 })).toBe(true);
      expect(wick.hit({ x: at.x, y: at.y - 120 })).toBe(true);
      expect(wick.hit({ x: at.x + 92 * at.facing, y: at.y + 18 })).toBe(true);
      // Not the ground round about.
      expect(wick.hit({ x: at.x - 160 * at.facing, y: at.y })).toBe(false);
      expect(wick.hit({ x: at.x, y: at.y + 200 })).toBe(false);
      // The spot a customer walks up to is in reach of the shop.
      const s = MAP.spawns[team];
      expect(Math.hypot(wick.counter.x - s.x, wick.counter.y - s.y)).toBeLessThan(FOUNTAIN_RADIUS - 50);
    }
  });
});
