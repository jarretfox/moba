import { describe, expect, it } from 'vitest';
import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { ChampionId } from '../../shared/champions/types';
import { BUILDS } from './builds';
import { SKINS, palette } from './champions';
import { Rig, type RigInput } from './rig';
import { chestHeight, standHeight } from './stature';

const IDS = Object.keys(CHAMPION_INFO) as ChampionId[];
const R = 36;
const still: RigInput = { dt: 1 / 60, speed: 0, facing: 1, turn: 0, reach: 0, twist: 0, lunge: 0, grow: 0, stretch: 0, air: 0 };

function run(rig: Rig, input: Partial<RigInput>, frames: number): void {
  for (let i = 0; i < frames; i++) rig.update({ ...still, ...input });
}

describe('champion rigs', () => {
  it('build every champion in every look, standing a sensible height', () => {
    for (const id of IDS) {
      expect(BUILDS[id]).toBeDefined();
      for (let skin = 0; skin < SKINS[id].length; skin++) {
        const rig = new Rig(BUILDS[id], R, palette(id, skin));
        run(rig, {}, 2);
        // Taller than the circle they stand in, but not a beanpole.
        expect(rig.height).toBeGreaterThan(2 * R);
        expect(rig.height).toBeLessThan(3.2 * R);
        // Bars, hits and words go where the view puts the head and body.
        expect(standHeight({ k: 'champion', r: R, champ: id })).toBeCloseTo(rig.height, 6);
        expect(chestHeight({ k: 'champion', r: R, champ: id })).toBeCloseTo(rig.height / 2, 6);
      }
    }
    // Flat things stay flat.
    expect(standHeight({ k: 'chud', r: 28 })).toBe(28);
    expect(chestHeight({ k: 'chud', r: 28 })).toBe(0);
  });

  it('stand with their feet on the spot and their head above it', () => {
    for (const id of IDS) {
      const rig = new Rig(BUILDS[id], R, palette(id));
      run(rig, {}, 5);
      const foot = rig.part.frontFoot;
      const head = rig.part.head;
      expect(Math.abs(foot.y)).toBeLessThan(0.15 * R);
      expect(Math.abs(foot.x)).toBeLessThan(0.4 * R);
      expect(head.y).toBeLessThan(-1.2 * R);
    }
  });

  it('swing their legs in turn while walking, and settle when they stop', () => {
    const rig = new Rig(BUILDS.paris, R, palette('paris'));
    let spread = 0;
    for (let i = 0; i < 90; i++) {
      run(rig, { speed: 340 }, 1);
      spread = Math.max(spread, Math.abs(rig.part.frontThigh.rotation - rig.part.backThigh.rotation));
    }
    expect(spread).toBeGreaterThan(0.5);
    run(rig, { speed: 0 }, 60);
    expect(Math.abs(rig.part.frontThigh.rotation - rig.part.backThigh.rotation)).toBeLessThan(0.05);
  });

  it('face left by mirroring, and spin with a full twist', () => {
    const rig = new Rig(BUILDS.daltonomo, R, palette('daltonomo'));
    const body = rig.root.children[0];
    run(rig, { facing: 1 }, 1);
    expect(body.scale.x).toBeGreaterThan(0);
    run(rig, { facing: -1 }, 1);
    expect(body.scale.x).toBeLessThan(0);
    // Half way through a spin, they're seen from the other side.
    run(rig, { facing: 1, twist: Math.PI }, 1);
    expect(body.scale.x).toBeLessThan(0);
  });

  it('raise the arm for a negative turn and reach out in front for a reach', () => {
    const rig = new Rig(BUILDS.barbarian, R, palette('barbarian'));
    run(rig, {}, 2);
    const rest = rig.part.frontUpper.rotation;
    run(rig, { turn: -1.5 }, 1);
    expect(rig.part.frontUpper.rotation).toBeLessThan(rest - 1);
    // Raised, the weapon points up (negative angle on screen).
    expect(rig.part.weapon.rotation).toBeLessThan(-1.5);
    run(rig, { reach: 0.7 }, 1);
    expect(Math.abs(rig.part.frontUpper.rotation)).toBeLessThan(0.3);
    expect(rig.part.frontHand.x).toBeGreaterThan(0.6 * R);
  });

  it('leave the ground in a leap', () => {
    const rig = new Rig(BUILDS.logan, R, palette('logan'));
    run(rig, {}, 2);
    const body = rig.root.children[0];
    expect(body.y).toBeCloseTo(0, 6);
    run(rig, { air: 1 }, 1);
    expect(body.y).toBeLessThan(-0.5 * R);
  });
});
