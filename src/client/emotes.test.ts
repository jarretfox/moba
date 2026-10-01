import { describe, expect, it } from 'vitest';
import { CHAMPION_INFO } from '../shared/champions/registry';
import type { ChampionId } from '../shared/champions/types';
import { EMOTE_KINDS } from '../shared/protocol';
import { emoteLine } from './emotes';

describe('champion lines', () => {
  it('has something for every champion to say for every emote and after a kill', () => {
    for (const id of Object.keys(CHAMPION_INFO) as ChampionId[]) {
      for (const kind of [...EMOTE_KINDS, 'kill' as const]) expect(emoteLine(id, kind, 7).length).toBeGreaterThan(0);
    }
  });

  it('picks the same line for the same number, on any screen', () => {
    expect(emoteLine('barbarian', 'line', 4)).toBe(emoteLine('barbarian', 'line', 4));
    expect(emoteLine('barbarian', 'kill', 0)).not.toBe(emoteLine('barbarian', 'kill', 1));
  });

  it('saves something special for the rivalry', () => {
    const toRix = [0, 1, 2].map((n) => emoteLine('logan', 'kill', n, 'kingrix'));
    const toOthers = [0, 1, 2].map((n) => emoteLine('logan', 'kill', n, 'marksman'));
    expect(toRix.some((l) => l.includes('Rix') || l.includes('Kneel') || l.includes('lion'))).toBe(true);
    expect(toRix).not.toEqual(toOthers);
    expect(emoteLine('kingrix', 'kill', 0, 'logan')).toMatch(/cage|lion|kitty/i);
  });
});
