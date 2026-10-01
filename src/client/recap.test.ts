import { describe, expect, it } from 'vitest';
import { DamageLog, buildRecap, type HitRecord } from './recap';

const hit = (t: number, key: string, label: string, amount: number, name = key): HitRecord => ({ t, key, name, label, amount });

describe('the death recap', () => {
  it('adds up who hurt you and with what, biggest first', () => {
    const hits = [
      hit(10, 'barb', 'Cleave', 200, 'Bot Barbarian'),
      hit(11, 'barb', 'Basic attacks', 80, 'Bot Barbarian'),
      hit(12, 'barb', 'Cleave', 150, 'Bot Barbarian'),
      hit(12.5, 'shootie', 'Shootie shots', 260, 'Outer Shootie'),
      hit(13, 'chud1', 'Chud hits', 20, 'Chud'),
    ];
    const recap = buildRecap(hits, 14);
    expect(recap.map((r) => [r.name, r.total])).toEqual([
      ['Bot Barbarian', 430],
      ['Outer Shootie', 260],
      ['Chud', 20],
    ]);
    expect(recap[0].parts).toEqual([
      { label: 'Cleave', amount: 350 },
      { label: 'Basic attacks', amount: 80 },
    ]);
  });

  it('only counts the last moments, and only the top few sources', () => {
    const hits = [hit(0, 'old', 'Cleave', 999), ...['a', 'b', 'c', 'd', 'e'].map((k, i) => hit(20 + i, k, 'Basic attacks', 10 + i))];
    const recap = buildRecap(hits, 25, 15, 4);
    expect(recap.some((r) => r.name === 'old')).toBe(false);
    expect(recap).toHaveLength(4);
    expect(recap[0].name).toBe('e');
  });

  it('keeps two sources with the same name apart', () => {
    const recap = buildRecap([hit(1, 'chud1', 'Chud hits', 20, 'Chud'), hit(1, 'chud2', 'Chud hits', 30, 'Chud')], 2);
    expect(recap.map((r) => r.total)).toEqual([30, 20]);
  });
});

describe('putting a hit down to something', () => {
  it('blames the latest basic attack or ability, and lingering effects after a while', () => {
    const log = new DamageLog();
    log.noteCast(7, 'Cleave', 10);
    expect(log.labelFor(7, 10.4)).toBe('Cleave');
    log.noteAttack(7, 11);
    expect(log.labelFor(7, 11.1)).toBe('Basic attacks');
    log.noteCast(7, 'Leap', 11.5);
    expect(log.labelFor(7, 11.6)).toBe('Leap');
    expect(log.labelFor(7, 20)).toBe('Lingering effects');
    expect(log.labelFor(99, 20)).toBe('Lingering effects');
  });

  it('remembers who an attacker was after they vanish', () => {
    const log = new DamageLog();
    log.add({ t: 1, key: '7', name: 'Bot Barbarian', champ: 'barbarian', label: 'Cleave', amount: 100 });
    log.add({ t: 2, key: '7', label: 'Lingering effects', amount: 40 });
    log.add({ t: 2, key: '9', label: 'Lingering effects', amount: 10 });
    const recap = log.recap(3);
    expect(recap[0]).toMatchObject({ name: 'Bot Barbarian', champ: 'barbarian', total: 140 });
    expect(recap[1].name).toBe('Something unseen');
    // Long after the last sighting, the hits still go down under the right name.
    log.add({ t: 15, key: '7', label: 'Lingering effects', amount: 5 });
    expect(log.recap(20)[0]).toMatchObject({ name: 'Bot Barbarian', champ: 'barbarian', total: 5 });
  });
});
