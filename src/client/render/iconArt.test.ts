import { describe, expect, it } from 'vitest';
import { CHAMPION_INFO } from '../../shared/champions/registry';
import { ITEMS } from '../../shared/items';
import { ICON_ART, iconKey } from './iconArt';

describe('icon art', () => {
  it('has a drawing for every ability, passive and item icon', () => {
    const used = [
      ...Object.values(CHAMPION_INFO).flatMap((c) => [c.passive.icon, ...c.abilities.map((a) => a.icon)]),
      ...Object.values(ITEMS).map((it) => it.icon),
    ];
    expect(used.filter((e) => !ICON_ART[iconKey(e)])).toEqual([]);
  });

  it('treats an emoji with or without its presentation mark as the same icon', () => {
    expect(iconKey('🛡️')).toBe(iconKey('🛡'));
    expect(ICON_ART[iconKey('🛡')]).toBeDefined();
  });
});
