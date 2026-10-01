import { describe, expect, it } from 'vitest';
import { RECIPES, type SoundName } from './audio';
import { resolveInfo } from './mix';
import { ATTACK_SOUND, CAST_SOUND } from './sfx';

// Web Audio isn't here under Vitest, so these check the table of sounds rather than what they sound like:
// which bus each sits on, what dips the music, and that nothing in the interface can be crowded out.

const names = Object.keys(RECIPES) as SoundName[];
const info = (n: SoundName) => resolveInfo(RECIPES[n]);

describe('the sound recipes', () => {
  it('have every sound on a bus with a way to play it', () => {
    for (const n of names) {
      expect(['fx', 'ui', 'voice']).toContain(RECIPES[n].bus);
      expect(typeof RECIPES[n].play).toBe('function');
    }
  });

  it('keep the interface and the announcer in your ear, in tune, and never crowded out', () => {
    for (const n of ['click', 'hover', 'buy', 'gold', 'deny', 'levelUp', 'rankUp', 'chat', 'kaching', 'titleUnlock', 'rematch', 'fanfare', 'toll', 'kill', 'victory', 'defeat', 'ping', 'pingDanger'] as const) {
      expect(RECIPES[n].bus, n).toBe('ui');
      expect(info(n).priority, n).toBe(true);
      expect(info(n).pitch, n).toBe(0);
      expect(info(n).duck, n).toBe(0);
    }
  });

  it('put the champions in the world, with a little wobble so repeats differ', () => {
    for (const n of [...Object.values(ATTACK_SOUND), ...Object.values(CAST_SOUND)]) {
      expect(['fx', 'voice']).toContain(RECIPES[n].bus);
      expect(info(n).priority, n).toBe(false);
    }
    expect(info('atkAxe').pitch).toBeGreaterThan(0);
    // Jingles stay in tune.
    expect(info('castRoyal').pitch).toBe(0);
    expect(info('castAngelic').pitch).toBe(0);
  });

  it('let only the big, close things duck the music, Da Base falling most of all', () => {
    expect(info('baseFall').duck).toBeGreaterThan(info('collapse').duck);
    expect(info('collapse').duck).toBeGreaterThan(info('hitHeavy').duck);
    expect(info('wardenFall').duck).toBeGreaterThan(info('wardenSlam').duck);
    for (const n of ['swing', 'hit', 'click', 'crabSkitter', 'hover', 'atkBow'] as const) expect(info(n).duck, n).toBe(0);
  });

  it('rate-limit the sounds a lane full of Chuds makes', () => {
    for (const n of ['swing', 'shoot', 'hit', 'smallDeath', 'tower'] as const) expect(info(n).gap, n).toBeGreaterThanOrEqual(0.06);
    expect(info('thunder').gap).toBeGreaterThanOrEqual(1);
  });

  it('send the big open-air sounds into the hall more than the dry little ones', () => {
    expect(info('toll').send).toBeGreaterThan(info('click').send);
    expect(info('collapse').send).toBeGreaterThan(info('hit').send);
    expect(info('heartbeat').send).toBe(0);
  });
});
