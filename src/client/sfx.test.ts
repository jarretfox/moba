import { describe, expect, it } from 'vitest';
import type { EntitySnap } from '../shared/protocol';
import { CHAMPION_INFO } from '../shared/champions/registry';
import type { ChampionId } from '../shared/champions/types';
import { ATTACK_SOUND, CAST_SOUND, FX_SOUNDS, announceSound, cueFor, spatialize } from './sfx';

const ME = 1;
const snap = (id: number, extra: Partial<EntitySnap>): EntitySnap => ({ id, k: 'champion', tm: 1, x: 100 * id, y: 50, f: 0, r: 35, mhp: 1000, ...extra });
const ents = new Map<number, EntitySnap>([
  [1, snap(1, { champ: 'marksman' })],
  [2, snap(2, { champ: 'barbarian', tm: 2 })],
  [3, snap(3, { k: 'chud', chud: 'melee', tm: 2 })],
  [4, snap(4, { k: 'structure', role: 'outerShootie', tm: 2 })],
  [5, snap(5, { k: 'monster', mon: 'warden', tm: 0 })],
  [6, snap(6, { k: 'structure', role: 'daBase', tm: 2 })],
  [7, snap(7, { k: 'monster', mon: 'crab', tm: 0 })],
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

  it('give heavy hits weight and magic a sting', () => {
    expect(cueFor({ e: 'dmg', src: 2, target: 1, amount: 79, type: 'physical' }, ents, ME)).toMatchObject({ name: 'hit' });
    expect(cueFor({ e: 'dmg', src: 2, target: 1, amount: 80, type: 'physical' }, ents, ME)).toMatchObject({ name: 'hitHeavy' });
    expect(cueFor({ e: 'dmg', src: 2, target: 1, amount: 30, type: 'magic' }, ents, ME)).toMatchObject({ name: 'hitMagic' });
    expect(cueFor({ e: 'dmg', src: 2, target: 1, amount: 300, type: 'magic' }, ents, ME)).toMatchObject({ name: 'hitHeavy' });
  });

  it('make deaths sound like what died', () => {
    expect(cueFor({ e: 'death', id: 2 }, ents, ME)).toMatchObject({ name: 'death' });
    expect(cueFor({ e: 'death', id: 3 }, ents, ME)).toMatchObject({ name: 'smallDeath' });
    expect(cueFor({ e: 'death', id: 4 }, ents, ME)).toMatchObject({ name: 'collapse' });
    expect(cueFor({ e: 'death', id: 5 }, ents, ME)).toMatchObject({ name: 'wardenFall' });
    expect(cueFor({ e: 'death', id: 6 }, ents, ME)).toMatchObject({ name: 'baseFall' });
    expect(cueFor({ e: 'death', id: 7 }, ents, ME)).toMatchObject({ name: 'crabSqueak' });
  });

  it('give the item actives their own sounds', () => {
    expect(FX_SOUNDS.lanternLight?.[0]).toBe('lantern');
    expect(FX_SOUNDS.aegisWard?.[0]).toBe('aegis');
    expect(FX_SOUNDS.drumBeat?.[0]).toBe('warDrum');
    expect(cueFor({ e: 'fx', fx: 'drumBeat', x: 5, y: 6 }, ents, ME)).toMatchObject({ name: 'warDrum', at: { x: 5, y: 6 } });
  });

  it('ring the till for a bounty, and otherwise cheer or toll', () => {
    const kill = { e: 'kill', killer: 'A', victim: 'B', team: 1, what: 'champion' } as const;
    expect(announceSound({ ...kill, shutdown: true, bounty: 450 }, true, true)).toBe('kaching');
    // Being the one shut down isn't a payday.
    expect(announceSound({ ...kill, shutdown: true, bounty: 450 }, true, false)).toBe('toll');
    expect(announceSound(kill, true, true)).toBe('fanfare');
    expect(announceSound(kill, true, false)).toBe('toll');
    expect(announceSound(kill, false, true)).toBe('kill');
    expect(announceSound({ ...kill, what: 'crab', shutdown: true }, false, true)).toBe('kill');
  });

  it('place sounds on screen: full and dry in the middle, quieter, panned and further off toward the edge', () => {
    const here = spatialize(0, 0, 800);
    expect(here).toEqual({ gain: 1, pan: 0, far: 0 });
    const right = spatialize(800, 0, 800);
    expect(right.pan).toBeGreaterThan(0.5);
    expect(right.gain).toBeLessThan(1);
    expect(right.far).toBeCloseTo(0.5);
    const gone = spatialize(-2000, 0, 800);
    expect(gone.gain).toBe(0);
    expect(gone.pan).toBe(-0.6);
    expect(gone.far).toBe(1);
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
    expect(cueFor({ e: 'fx', fx: 'wardenSlam', x: 10, y: 20 }, ents, ME)).toEqual({ name: 'wardenSlam', at: { x: 10, y: 20 }, gain: 1 });
    expect(cueFor({ e: 'fx', fx: 'roar', x: 0, y: 0 }, ents, ME)).toMatchObject({ name: 'roar' });
    expect(cueFor({ e: 'fx', fx: 'burrow', x: 0, y: 0 }, ents, ME)).toMatchObject({ name: 'dig' });
    expect(cueFor({ e: 'fx', fx: 'deepMark', x: 0, y: 0 }, ents, ME)).toMatchObject({ name: 'warn' });
  });

  it("stay silent for things that aren't there", () => {
    expect(cueFor({ e: 'attack', src: 99, target: 1 }, ents, ME)).toBeNull();
    expect(cueFor({ e: 'death', id: 99 }, ents, ME)).toBeNull();
  });
});
