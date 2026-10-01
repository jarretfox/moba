import { describe, expect, it } from 'vitest';
import type { ChampionId } from '../shared/champions/types';
import { CHAMPION_INFO } from '../shared/champions/registry';
import { utterance, type VoiceMoment } from './voices';

const MOMENTS: VoiceMoment[] = ['taunt', 'laugh', 'cheer', 'line', 'kill', 'ult', 'hurt', 'death'];
const ALL = Object.keys(CHAMPION_INFO) as ChampionId[];
const avgPitch = (champ: ChampionId) => {
  const s = utterance(champ, 'line', 1);
  return s.reduce((sum, x) => sum + x.f0, 0) / s.length;
};

describe('champion voices', () => {
  it('give every champion something to say for every moment, and nothing silly', () => {
    for (const champ of ALL) {
      for (const moment of MOMENTS) {
        const said = utterance(champ, moment, 3);
        expect(said.length).toBeGreaterThan(0);
        for (const s of said) {
          expect(s.f0).toBeGreaterThan(40);
          expect(s.f0).toBeLessThan(700);
          expect(s.dur).toBeGreaterThan(0);
          expect(s.vol).toBeGreaterThan(0);
          expect(s.vol).toBeLessThanOrEqual(1);
          expect(s.formants.length).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('sound like who they are: the lion and the Barbarian deep, HunnaG high', () => {
    expect(avgPitch('logan')).toBeLessThan(avgPitch('kingrix'));
    expect(avgPitch('barbarian')).toBeLessThan(avgPitch('marksman'));
    expect(avgPitch('hunnag')).toBeGreaterThan(avgPitch('marksman'));
    // Bigger bodies, lower vowels.
    expect(utterance('logan', 'ult')[0].formants[0]).toBeLessThan(utterance('hunnag', 'ult')[0].formants[0]);
  });

  it('mumble the same way for the same line, and differently for another', () => {
    expect(utterance('willmore', 'line', 2)).toEqual(utterance('willmore', 'line', 2));
    expect(utterance('willmore', 'line', 2)).not.toEqual(utterance('willmore', 'line', 5));
  });

  it('end a taunt rising and a line falling', () => {
    const taunt = utterance('kingrix', 'taunt', 1);
    const line = utterance('kingrix', 'line', 1);
    const last = (s: ReturnType<typeof utterance>) => s[s.length - 1];
    expect(last(taunt).f1).toBeGreaterThan(last(taunt).f0);
    expect(last(line).f1).toBeLessThan(last(line).f0);
  });
});
