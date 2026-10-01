import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from './settings';

describe('saved settings', () => {
  it('start from the defaults when nothing (or nonsense) is saved', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
  });

  it('keep what makes sense, clamp volumes, and ignore the rest', () => {
    const s = parseSettings(JSON.stringify({ master: 0.3, music: 4, effects: -1, quality: 'ultra', showFps: 'yes' }));
    expect(s.master).toBe(0.3);
    expect(s.music).toBe(1);
    expect(s.effects).toBe(0);
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality);
    expect(s.showFps).toBe(DEFAULT_SETTINGS.showFps);
    expect(parseSettings(JSON.stringify({ quality: 'low', showFps: true }))).toMatchObject({ quality: 'low', showFps: true });
    expect(parseSettings(JSON.stringify({ colorblind: true, uiScale: 3 }))).toMatchObject({ colorblind: true, uiScale: 1.3 });
    expect(parseSettings(JSON.stringify({ colorblind: 'yes', uiScale: 0.1 }))).toMatchObject({ colorblind: false, uiScale: 0.8 });
  });
});
