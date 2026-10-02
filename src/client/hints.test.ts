import { describe, expect, it } from 'vitest';
import { hintDone, nextHint, type HintContext, type HintId } from './hints';

const start: HintContext = { time: 2, inShop: true, gold: 500, items: 0, shopOpened: false, moved: false, points: 0, learned: 0, casts: 0, hp: 1, dead: false, recalling: false, shootieAlone: false, attackMoved: false };
const none = new Set<HintId>();

describe('first-match tips', () => {
  it('starts with the shop, then moving, one at a time', () => {
    expect(nextHint(start, none)).toBe('shop');
    expect(nextHint(start, new Set(['shop']))).toBe('move');
    expect(nextHint({ ...start, items: 1, moved: true }, none)).toBe(null);
  });

  it('never shows a tip twice', () => {
    const c = { ...start, inShop: false, moved: true, points: 1 };
    expect(nextHint(c, none)).toBe('skill');
    expect(nextHint(c, new Set(['skill']))).toBe(null);
  });

  it('goes away once it has been followed', () => {
    expect(hintDone('skill', { ...start, points: 1 })).toBe(false);
    expect(hintDone('skill', { ...start, points: 0 })).toBe(true);
    expect(hintDone('shop', { ...start, shopOpened: true })).toBe(true);
    expect(hintDone('recall', { ...start, hp: 0.2, recalling: true })).toBe(true);
  });

  it('speaks up about low health and enemy Shooties out on the map', () => {
    const out = { ...start, inShop: false, moved: true, items: 1 };
    expect(nextHint({ ...out, hp: 0.2 }, none)).toBe('recall');
    expect(nextHint({ ...out, hp: 0.2, inShop: true }, none)).toBe(null);
    expect(nextHint({ ...out, shootieAlone: true }, none)).toBe('shootie');
  });

  it('points out the scoreboard while you wait to respawn', () => {
    expect(nextHint({ ...start, inShop: false, items: 1, moved: true, dead: true }, none)).toBe('scoreboard');
  });
});
