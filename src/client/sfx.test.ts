import { describe, expect, it } from 'vitest';
import type { EntitySnap } from '../shared/protocol';
import { CHAMPION_INFO } from '../shared/champions/registry';
import type { ChampionId } from '../shared/champions/types';
import { ATTACK_SOUND, CAST_SOUND, cueFor } from './sfx';

const ME = 1;
const snap = (id: number, extra: Partial<EntitySnap>): EntitySnap => ({ id, k: 'champion', tm: 1, x: 100 * id, y: 50, f: 0, r: 35, ...extra });
const ents = new Map<number, EntitySnap>([
  [1, snap(1, { champ: 'marksman' })],
  [2, snap(2, { champ: 'barbarian', tm: 2 })],
  [3, snap(3, { k: 'chud', chud: 'melee', tm: 2 })],
  [4, snap(4, { k: 'structure', role: 'outerShootie', tm: 2 })],
  [5, snap(5, { k: 'monster', mon: 'warden', tm: 0 })],
]);

describe('sound cues', () => {
  it('give every champion their own attack, and keep Chuds quiet', () => {
    expect(cueFor({ e: 'attack', src: 1, target: 2 }, ents, ME)).toMatchObject({ name: 'atkBow' });
    expect(cueFor({ e: 'attack', src: 2, target: 1 }, ents, ME)).toMatchObject({ name: 'atkAxe', at: { x: 200, y: 50 } });
    expect(cueFor({ e: 'attack', src: 4, target: 1 }, ents, ME)).toMatchObject({ name: 'tower' });
    const chud = cueFor({ e: 'attack', src: 3, target: 1 }, ents, ME)!;
    const champ = cueFor({ e: 'attack', src: 2, target: 1 }, ents, ME)!;
    expect(chud.gain).toBeLessThan(champ.gain / 2);
  });

  it('sound different for every champion, attacks and casts alike', () => {
    const ids = Object.keys(CHAMPION_INFO) as ChampionId[];
    expect(new Set(ids.map((id) => ATTACK_SOUND[id])).size).toBe(ids.length);
    expect(new Set(ids.map((id) => CAST_SOUND[id])).size).toBe(ids.length);
    expect(cueFor({ e: 'cast', src: 2, slot: 0, x: 0, y: 0 }, ents, ME)).toMatchObject({ name: CAST_SOUND.barbarian });
  });

  it('only play hits you deal or take, on champions', () => {
    expect(cueFor({ e: 'dmg', src: 2, target: 1, amount: 50, type: 'physical' }, ents, ME)).toMatchObject({ name: 'hit' });
    expect(cueFor({ e: 'dmg', src: 1, target: 2, amount: 50, type: 'physical' }, ents, ME)).toMatchObject({ name: 'hit' });
    expect(cueFor({ e: 'dmg', src: 1, target: 3, amount: 50, type: 'physical' }, ents, ME)).toBeNull();
    expect(cueFor({ e: 'dmg', src: 3, target: 2, amount: 50, type: 'physical' }, ents, ME)).toBeNull();
  });

  it('make deaths sound like what died', () => {
    expect(cueFor({ e: 'death', id: 2 }, ents, ME)).toMatchObject({ name: 'death' });
    expect(cueFor({ e: 'death', id: 3 }, ents, ME)).toMatchObject({ name: 'smallDeath' });
    expect(cueFor({ e: 'death', id: 4 }, ents, ME)).toMatchObject({ name: 'boom' });
    expect(cueFor({ e: 'death', id: 5 }, ents, ME)).toMatchObject({ name: 'boom' });
  });

  it('keep level-ups and gold private, and announce kills to everyone', () => {
    expect(cueFor({ e: 'level', id: ME, level: 2 }, ents, ME)).toEqual({ name: 'levelUp', gain: 0.7 });
    expect(cueFor({ e: 'level', id: 2, level: 2 }, ents, ME)).toBeNull();
    expect(cueFor({ e: 'gold', id: ME, amount: 21 }, ents, ME)).toMatchObject({ name: 'gold' });
    expect(cueFor({ e: 'gold', id: 2, amount: 21 }, ents, ME)).toBeNull();
    expect(cueFor({ e: 'kill', killer: 'A', victim: 'B', team: 1 }, ents, ME)).toMatchObject({ name: 'kill' });
    expect(cueFor({ e: 'kill', killer: 'A', victim: 'B', team: 1 }, ents, ME)?.at).toBeUndefined();
  });

  it('give the big moments their own sound, where they happen', () => {
    expect(cueFor({ e: 'fx', fx: 'wardenSlam', x: 10, y: 20 }, ents, ME)).toEqual({ name: 'boom', at: { x: 10, y: 20 }, gain: 1 });
    expect(cueFor({ e: 'fx', fx: 'roar', x: 0, y: 0 }, ents, ME)).toMatchObject({ name: 'roar' });
    expect(cueFor({ e: 'fx', fx: 'burrow', x: 0, y: 0 }, ents, ME)).toMatchObject({ name: 'dig' });
    expect(cueFor({ e: 'fx', fx: 'deepMark', x: 0, y: 0 }, ents, ME)).toMatchObject({ name: 'warn' });
  });

  it("stay silent for things that aren't there", () => {
    expect(cueFor({ e: 'attack', src: 99, target: 1 }, ents, ME)).toBeNull();
    expect(cueFor({ e: 'death', id: 99 }, ents, ME)).toBeNull();
  });
});
