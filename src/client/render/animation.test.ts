import { describe, expect, it } from 'vitest';
import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { ChampionId } from '../../shared/champions/types';
import type { Slot } from '../../shared/constants';
import { ATTACK, EMOTE_ANIM, UNIT_ATTACK, castAnim, sample, wardenWindup, type Anim } from './animation';

describe('champion animations', () => {
  it('ease between keyframes and hold the ends', () => {
    const keys = [[0, 0], [0.5, 1], [1, 0]] as const;
    expect(sample(keys, 0)).toBe(0);
    expect(sample(keys, 0.5)).toBe(1);
    expect(sample(keys, 0.25)).toBeCloseTo(0.5);
    expect(sample(keys, 0.1)).toBeLessThan(0.2); // eased: slow out of the start
    expect(sample(keys, 2)).toBe(0);
    expect(sample(undefined, 0.5)).toBe(0);
  });

  it('start and end every move at rest, so nothing snaps when one finishes', () => {
    const moves: Anim[] = [];
    for (const id of Object.keys(CHAMPION_INFO) as ChampionId[]) {
      moves.push(ATTACK[id]);
      for (const slot of [0, 1, 2, 3] as Slot[]) moves.push(castAnim(id, slot));
    }
    moves.push(...Object.values(UNIT_ATTACK), ...Object.values(EMOTE_ANIM), wardenWindup(1.2));
    for (const m of moves) {
      for (const track of [m.turn, m.reach, m.twist, m.lunge, m.grow, m.stretch]) {
        if (!track) continue;
        expect(sample(track, 0)).toBeCloseTo(0);
        // A full turn ends where it started.
        expect(Math.abs(Math.sin(sample(track, 1) / 2))).toBeCloseTo(0);
      }
    }
  });
});
