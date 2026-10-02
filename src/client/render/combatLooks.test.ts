import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { ChampionId } from '../../shared/champions/types';
import type { EntitySnap, FxKind } from '../../shared/protocol';
import { ATTACK, ATTACKS, attackAnim } from './animation';
import { IMPACT, LAUNCH, MELEE_LOOK, attackLook, meleeNow, nextSwing } from './attacks';
import type { FxLayer } from './fx';
import { CAST_COLORS, SIGNATURES, castSignature } from './signatures';
import { playSpell } from './spells';

const IDS = Object.keys(CHAMPION_INFO) as ChampionId[];

/**
 * A stand-in for the effects layer: every building block just notes that it was called, and any drawing
 * callback handed to one is run for a few frames (so what the effect draws is exercised too). Timers are
 * kept so a test can fire them.
 */
function fakeFx(): { fx: FxLayer; calls: string[]; timers: { at: number; fn: () => void }[]; flush(): void } {
  const calls: string[] = [];
  const timers: { at: number; fn: () => void }[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push(name);
    for (const a of args) {
      if (typeof a !== 'function') continue;
      for (const t of [0, 0.5, 1]) a(new Graphics(), t);
    }
  };
  const particles = new Proxy({}, { get: (_, k) => record(`particles.${String(k)}`) });
  const fx = new Proxy({}, {
    get(_, k) {
      if (k === 'particles') return particles;
      if (k === 'dt') return 1 / 60;
      if (k === 'density') return 1;
      if (k === 'rate') return (n: number) => Math.ceil(n / 60);
      if (k === 'later') return (at: number, fn: () => void) => timers.push({ at, fn });
      return record(String(k));
    },
  }) as FxLayer;
  const flush = () => {
    while (timers.length) timers.shift()!.fn();
  };
  return { fx, calls, timers, flush };
}

const unit = (champ: ChampionId, x: number, y: number, id = 1): EntitySnap => ({ id, k: 'champion', tm: 1, champ, x, y, r: 36, f: 0 });

describe('cast signatures', () => {
  it('give every champion a mark of their own, in their own color, for basics and the bigger one for ultimates', () => {
    for (const id of IDS) {
      expect(SIGNATURES[id]).toBeTypeOf('function');
      expect(CAST_COLORS[id]).toBeGreaterThan(0);
      for (const slot of [0, 3] as const) {
        const { fx, calls } = fakeFx();
        castSignature(fx, unit(id, 100, 200), slot);
        expect(calls.length, `${id} slot ${slot}`).toBeGreaterThan(1);
      }
    }
    // Nobody gets the old rune circle any more: that was the complaint.
    for (const id of IDS) {
      const { fx, calls } = fakeFx();
      castSignature(fx, unit(id, 0, 0), 0);
      expect(calls).not.toContain('sigil');
    }
  });

  it('do nothing for a unit that is not a champion', () => {
    const { fx, calls } = fakeFx();
    castSignature(fx, { id: 5, k: 'chud', tm: 1, x: 0, y: 0, r: 20, f: 0 }, 0);
    expect(calls).toEqual([]);
  });
});

describe('basic attacks', () => {
  it('give every champion two or more swings, each landing its blow partway through', () => {
    for (const id of IDS) {
      expect(ATTACKS[id].length).toBeGreaterThanOrEqual(2);
      for (const a of ATTACKS[id]) {
        expect(a.hit ?? 0.5).toBeGreaterThan(0.1);
        expect(a.hit ?? 0.5).toBeLessThan(0.9);
        expect(a.dur).toBeLessThanOrEqual(0.45);
      }
      expect(ATTACK[id]).toBe(ATTACKS[id][0]);
      // Swings come round in turn, and never run off the end of the list.
      expect(attackAnim(id, 0)).toBe(ATTACKS[id][0]);
      expect(attackAnim(id, ATTACKS[id].length)).toBe(ATTACKS[id][0]);
      expect(attackAnim(id, 1)).toBe(ATTACKS[id][1]);
    }
    expect(nextSwing(77)).toBe(0);
    expect(nextSwing(77)).toBe(1);
    expect(nextSwing(78)).toBe(0);
  });

  it('give every swing of every champion a launch and a hit of its own', () => {
    for (const id of IDS) {
      for (let swing = 0; swing < ATTACKS[id].length; swing++) {
        const { fx, calls, flush } = fakeFx();
        const src = unit(id, 100, 100, 1);
        const tgt = unit('kingrix', 190, 104, 2);
        attackLook(fx, src, tgt, swing, ATTACKS[id][swing], true, () => tgt);
        expect(calls, `${id} swing ${swing} before the blow`).toEqual([]);
        flush();
        expect(calls.length, `${id} swing ${swing}`).toBeGreaterThan(1);
      }
      expect(LAUNCH[id]).toBeTypeOf('function');
      expect(IMPACT[id]).toBeTypeOf('function');
    }
  });

  it('land a blow by hand at once, and a shot only after it has flown', () => {
    const melee = fakeFx();
    attackLook(melee.fx, unit('barbarian', 0, 0, 1), unit('kingrix', 90, 0, 2), 0, ATTACKS.barbarian[0], false, () => unit('kingrix', 90, 0, 2));
    expect(melee.timers).toHaveLength(1);
    const ranged = fakeFx();
    attackLook(ranged.fx, unit('marksman', 0, 0, 1), unit('kingrix', 600, 0, 2), 0, ATTACKS.marksman[0], false, () => unit('kingrix', 600, 0, 2));
    expect(ranged.timers).toHaveLength(2);
    expect(ranged.timers[1].at).toBeGreaterThan(ranged.timers[0].at);
    // A shot at someone who's gone by the time it lands hits nothing.
    const gone = fakeFx();
    attackLook(gone.fx, unit('marksman', 0, 0, 1), unit('kingrix', 600, 0, 2), 0, ATTACKS.marksman[0], false, () => undefined);
    gone.timers[1].fn();
    expect(gone.calls).toEqual([]);
  });

  it('treat Havarti as melee up close and ranged once her reach has grown', () => {
    for (const id of MELEE_LOOK) expect(meleeNow(id, unit(id, 0, 0), unit('kingrix', 500, 0))).toBe(true);
    expect(meleeNow('marksman', unit('marksman', 0, 0), unit('kingrix', 60, 0))).toBe(false);
    expect(meleeNow('havarti', unit('havarti', 0, 0), unit('kingrix', 120, 0))).toBe(true);
    expect(meleeNow('havarti', unit('havarti', 0, 0), unit('kingrix', 500, 0))).toBe(false);
  });
});

describe('spell looks', () => {
  it('give every effect the simulation can send a look', () => {
    // Every kind, so adding one to the protocol without a look here fails to compile.
    const kinds: Record<FxKind, true> = {
      aimLine: true, trapSnap: true, roll: true, cleave: true, pounce: true, maul: true, warCry: true, slam: true, berserk: true, recall: true,
      wardenMark: true, wardenSlam: true, burrow: true, surface: true, hookPull: true, tunnel: true, lob: true, rotBurst: true, pulse: true, hop: true,
      deepMark: true, deepHands: true, lionheart: true, mane: true, roar: true, summon: true, kneel: true, decree: true, chinCheck: true, mewing: true,
      sigmaStare: true, ascension: true, hotbox: true, stickyIcky: true, lightItUp: true, cloudNine: true, fleche: true, cafeBreak: true, touche: true,
      encore: true, curdle: true, fondue: true, rindBlade: true, divineFondue: true, fondueEruption: true, cheeseWave: true, ascend: true,
      nowYouSeeMe: true, backstab: true, jackbox: true, boxShot: true, doubleAct: true, cloneBoom: true, lanternLight: true, aegisWard: true, drumBeat: true,
      static: true, spellblade: true, royalPause: true, relic: true,
    };
    for (const kind of Object.keys(kinds) as FxKind[]) {
      const { fx, calls, flush } = fakeFx();
      playSpell(fx, { e: 'fx', fx: kind, x: 100, y: 100, x2: 300, y2: 160, r: 120, dur: 0.6, team: 1 }, true);
      flush();
      expect(calls.length, kind).toBeGreaterThan(0);
    }
  });

  it('keep the rune circle off champions\' own abilities', () => {
    const own: FxKind[] = ['aimLine', 'berserk', 'pulse', 'hop', 'deepMark', 'summon', 'decree'];
    for (const kind of own) {
      const { fx, calls, flush } = fakeFx();
      playSpell(fx, { e: 'fx', fx: kind, x: 0, y: 0, x2: 200, y2: 0, r: 100, dur: 0.5, team: 1 }, true);
      flush();
      expect(calls, kind).not.toContain('sigil');
    }
  });
});
