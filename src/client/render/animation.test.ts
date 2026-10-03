import { describe, expect, it } from 'vitest';
import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { ChampionId } from '../../shared/champions/types';
import type { Slot } from '../../shared/constants';
import { ATTACK, ATTACKS, EMOTE_ANIM, FIDGETS, UNIT_ATTACK, castAnim, sample, timedTo, wardenWindup, type Anim } from './animation';

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

  it('give every champion a few things to do while standing around', () => {
    for (const id of Object.keys(CHAMPION_INFO) as ChampionId[]) expect(FIDGETS[id].length).toBeGreaterThanOrEqual(2);
  });

  it('start and end every move at rest, so nothing snaps when one finishes', () => {
    const moves: Anim[] = [];
    for (const id of Object.keys(CHAMPION_INFO) as ChampionId[]) {
      moves.push(ATTACK[id]);
      for (const slot of [0, 1, 2, 3] as Slot[]) moves.push(castAnim(id, slot));
    }
    moves.push(...Object.values(UNIT_ATTACK), ...Object.values(EMOTE_ANIM), wardenWindup(1.2), ...Object.values(FIDGETS).flat());
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

describe('basic attacks timed to the hit', () => {
  it('land their blow exactly when the windup says, slow or fast', () => {
    for (const list of Object.values(ATTACKS)) {
      for (const a of list) {
        for (const windup of [0.12, 0.2, 0.31]) {
          const timed = timedTo(a, windup);
          expect(timed.dur * (timed.hit ?? 0.5)).toBeCloseTo(windup, 5);
        }
      }
    }
  });

  it('stay within reason for an absurd attack speed', () => {
    const a = ATTACKS.barbarian[0];
    expect(timedTo(a, 0.001).dur).toBeCloseTo(a.dur / 3, 5);
    expect(timedTo(a, 10).dur).toBeCloseTo(a.dur * 4, 5);
  });
});
