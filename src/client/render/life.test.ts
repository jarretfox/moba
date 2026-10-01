import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { Beast } from './beasts';
import { BICKER, dressChud } from './chudLife';
import type { RigInput } from './rig';

const still: RigInput = { dt: 1 / 30, speed: 0, facing: 1, turn: 0, reach: 0, twist: 0, lunge: 0, grow: 0, stretch: 0, air: 0 };

/** Runs a creature for `seconds`, returning what it got up to each frame. */
function live(b: Beast, seconds: number, input: Partial<RigInput> = {}): void {
  for (let t = 0; t < seconds; t += 1 / 30) b.update({ ...still, ...input });
}

type Inside = { doze: number; zs: unknown[]; fly: Graphics | null; flyGone: number; flip: number; act: unknown; crumb: Graphics | null; head: Graphics | null; tongue: Graphics | null };
const inside = (b: Beast) => b as unknown as Inside;

describe('Chuds of their own', () => {
  it('dress each Chud the same way every time, but not all alike', () => {
    expect(dressChud(new Graphics(), 28, 7)).toEqual(dressChud(new Graphics(), 28, 7));
    const looks = Array.from({ length: 80 }, (_, id) => dressChud(new Graphics(), 28, id));
    const hats = new Set(looks.map((l) => l.hat));
    // Pots, buckets, cones and the rest, and some bareheaded.
    expect(hats.size).toBeGreaterThanOrEqual(6);
    expect(hats.has(-1)).toBe(true);
    expect(new Set(looks.map((l) => l.face)).size).toBeGreaterThanOrEqual(6);
    // Brutes have spikes up there already: a pot or nothing.
    for (let id = 0; id < 40; id++) expect([-1, 0]).toContain(dressChud(new Graphics(), 34, id, true).hat);
    // Something is drawn when there's something to wear.
    const g = new Graphics();
    const dressed = Array.from({ length: 20 }, (_, id) => id).find((id) => dressChud(new Graphics(), 28, id).hat >= 0)!;
    dressChud(g, 28, dressed);
    expect(g.context.instructions.length).toBeGreaterThan(0);
    for (const [line, reply] of BICKER) expect(line.length && reply.length).toBeTruthy();
  });
});

describe('monsters left alone', () => {
  it('the Mossback nods off with z\'s drifting up, and wakes the moment anything happens', () => {
    const b = new Beast('mossback', 50);
    live(b, 1);
    expect(inside(b).doze).toBeLessThan(0.05);
    live(b, 6);
    expect(inside(b).doze).toBeGreaterThan(0.8);
    expect(inside(b).zs.length).toBeGreaterThan(0);
    expect(inside(b).head!.rotation).toBeGreaterThan(0.25);
    live(b, 0.6, { speed: 120 });
    expect(inside(b).doze).toBeLessThan(0.1);
    expect(inside(b).zs.length).toBe(0);
  });

  it('the Ember Toad snaps a fly out of the air, and another turns up', () => {
    const b = new Beast('emberToad', 50);
    let seen = 0;
    let eaten = 0;
    let lash = 0;
    let wasGone = true;
    for (let t = 0; t < 20; t += 1 / 30) {
      b.update(still);
      const { fly, flyGone, tongue } = inside(b);
      if (fly!.alpha > 0.9) seen++;
      if (flyGone > 0 && !wasGone) eaten++;
      wasGone = flyGone > 0;
      lash = Math.max(lash, tongue!.scale.x);
    }
    // Buzzing round for a good while before each snap, and snapped up more than once.
    expect(seen / 30).toBeGreaterThan(3);
    expect(eaten).toBeGreaterThanOrEqual(2);
    expect(lash).toBeGreaterThan(1);
    // Fighting, there's no fly.
    live(b, 2, { reach: 0.3 });
    expect(inside(b).fly!.alpha).toBeLessThan(0.05);
  });

  it('the rats squabble, rounding on each other and nipping; the Rat King minds his crumb', () => {
    const rat = new Beast('rat', 30);
    const flips = new Set<number>();
    let nip = 0;
    for (let t = 0; t < 12; t += 1 / 30) {
      rat.update(still);
      flips.add(inside(rat).flip);
      nip = Math.max(nip, inside(rat).head!.x);
    }
    expect(flips.size).toBe(2);
    expect(nip).toBeGreaterThan(0.6 * 30 + 0.1 * 30);
    const king = new Beast('ratKing', 40);
    live(king, 5);
    expect(inside(king).crumb!.alpha).toBeGreaterThan(0.9);
    // Something's happening: back to facing the way the game says.
    live(rat, 0.2, { speed: 100, facing: -1 });
    expect(inside(rat).flip).toBe(-1);
    live(rat, 0.2, { speed: 100, facing: 1 });
    expect(inside(rat).flip).toBe(1);
  });
});
