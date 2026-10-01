import { describe, expect, it } from 'vitest';
import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { ChampionId } from '../../shared/champions/types';
import { RECALLS } from './recalls';

describe('signature recalls', () => {
  it('give every champion a routine that stays sensible for the whole four seconds', () => {
    for (const id of Object.keys(CHAMPION_INFO) as ChampionId[]) {
      const routine = RECALLS[id];
      expect(routine).toBeDefined();
      for (let t = 0; t <= 4; t += 0.05) {
        const pose = routine.pose(t);
        for (const v of Object.values(pose)) {
          expect(Number.isFinite(v)).toBe(true);
          expect(Math.abs(v)).toBeLessThan(3.2);
        }
        // Nobody shrinks away to nothing or balloons out of their circle.
        expect(pose.grow ?? 0).toBeGreaterThan(-0.6);
        expect(pose.grow ?? 0).toBeLessThan(0.4);
      }
    }
  });

});
