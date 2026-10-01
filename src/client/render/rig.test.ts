import { describe, expect, it } from 'vitest';
import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { ChampionId } from '../../shared/champions/types';
import { Beast } from './beasts';
import { BUILDS, UNIT_BUILDS, unitPalette } from './builds';
import { SKINS, palette } from './champions';
import { Rig, type Figure, type RigInput } from './rig';
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
    expect(standHeight({ k: 'structure', r: 120 })).toBe(120);
    expect(chestHeight({ k: 'structure', r: 120 })).toBe(0);
    expect(chestHeight({ k: 'totem', r: 30 })).toBe(0);
  });

  it('stand everything else that walks up too, as tall as the figure drawn for it', () => {
    const figures: [Figure, Parameters<typeof standHeight>[0]][] = [
      ...(['melee', 'ranged', 'brute'] as const).map((chud): [Figure, Parameters<typeof standHeight>[0]] => [new Rig(UNIT_BUILDS[`chud:${chud}`], 28, unitPalette(0x3d8bfd)), { k: 'chud', r: 28, chud }]),
      [new Beast('siege', 38, 0x3d8bfd), { k: 'chud', r: 38, chud: 'siege' }],
      [new Rig(UNIT_BUILDS.guard, 30, unitPalette(0xe5484d)), { k: 'guard', r: 30 }],
      [new Rig(UNIT_BUILDS['monster:warden'], 110, unitPalette(0xe8a33d)), { k: 'monster', r: 110, mon: 'warden' }],
      ...(['rat', 'ratKing', 'mossback', 'emberToad', 'glowcap'] as const).map((mon): [Figure, Parameters<typeof standHeight>[0]] => [new Beast(mon, 50), { k: 'monster', r: 50, mon }]),
      [new Beast('dummy', 40), { k: 'dummy', r: 40 }],
    ];
    for (const [fig, snap] of figures) {
      fig.update({ ...still, speed: 300 });
      expect(fig.height).toBeCloseTo(standHeight(snap), 6);
      expect(chestHeight(snap)).toBeGreaterThan(0);
      expect(fig.height).toBeGreaterThan(0.8 * snap.r);
    }
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

  it('draw a shared look once, and keep it when one of them goes', () => {
    const a = new Rig(UNIT_BUILDS['chud:melee'], 28, unitPalette(0x3d8bfd), 'test:chud');
    const b = new Rig(UNIT_BUILDS['chud:melee'], 28, unitPalette(0x3d8bfd), 'test:chud');
    const c = new Rig(UNIT_BUILDS['chud:melee'], 28, unitPalette(0x3d8bfd));
    expect(b.part.head.context).toBe(a.part.head.context);
    expect(c.part.head.context).not.toBe(a.part.head.context);
    expect(a.part.torso.context.instructions.length).toBeGreaterThan(0);
    a.root.destroy({ children: true });
    expect(b.part.torso.context.destroyed).toBe(false);
    expect(b.part.torso.context.instructions.length).toBeGreaterThan(0);
    const d = new Rig(UNIT_BUILDS['chud:melee'], 28, unitPalette(0x3d8bfd), 'test:chud');
    expect(d.part.torso.context).toBe(b.part.torso.context);
  });

  it('drop their weapon and lose their hat when they die, and get them back when they return', () => {
    const rig = new Rig(BUILDS.kingrix, R, palette('kingrix'));
    run(rig, {}, 2);
    const before = rig.root.children.length;
    for (let f = 1; f <= 90; f++) run(rig, { dead: f / 60 }, 1);
    // The scepter and the crown are now loose on the ground, the held ones hidden.
    expect(rig.root.children.length).toBe(before + 2);
    expect(rig.part.weapon.visible).toBe(false);
    expect(rig.part.dangle.visible).toBe(false);
    for (const loose of rig.root.children.slice(before)) expect(Math.abs(loose.y)).toBeLessThan(0.2 * R);
    // Toppled over backward.
    expect(Math.abs(rig.root.children[0].rotation)).toBeGreaterThan(1.2);
    run(rig, { dead: 0 }, 1);
    expect(rig.root.children.length).toBe(before);
    expect(rig.part.weapon.visible && rig.part.dangle.visible).toBe(true);
  });

  it('pull faces: a wince when hit, a grin, closed eyes asleep, and X-ed out when dead', () => {
    const rig = new Rig(BUILDS.dongmaster, R, palette('dongmaster'));
    const face = (rig as unknown as { face: Record<'lids' | 'happy' | 'ko' | 'hurt' | 'grin', { visible: boolean }> }).face;
    run(rig, { expression: 'hurt' }, 1);
    expect([face.lids.visible, face.hurt.visible, face.grin.visible]).toEqual([true, true, false]);
    run(rig, { expression: 'grin' }, 1);
    expect([face.lids.visible, face.happy.visible, face.grin.visible, face.hurt.visible]).toEqual([false, true, true, false]);
    run(rig, { posture: { lie: -1 } }, 1);
    expect(face.lids.visible).toBe(true);
    run(rig, { dead: 0.5 }, 1);
    expect([face.ko.visible, face.lids.visible, face.grin.visible]).toEqual([true, false, false]);
  });

  it('leave a swoosh behind a fast swing, and none at rest', () => {
    const rig = new Rig(BUILDS.barbarian, R, palette('barbarian'));
    run(rig, {}, 5);
    expect(rig.part.streak.context.instructions.length).toBe(0);
    for (let f = 0; f < 8; f++) run(rig, { turn: -1.6 + f * 0.35 }, 1);
    expect(rig.part.streak.context.instructions.length).toBeGreaterThan(0);
    run(rig, { turn: 1.2 }, 20);
    expect(rig.part.streak.context.instructions.length).toBe(0);
  });

  it('flip right over when knocked up, landing the right way up', () => {
    const rig = new Rig(BUILDS.willmore, R, palette('willmore'));
    const body = rig.root.children[0];
    run(rig, { air: 1, tumble: 0.5 }, 1);
    expect(Math.abs(body.rotation)).toBeCloseTo(Math.PI, 3);
    run(rig, { air: 1, tumble: 1 }, 1);
    expect(Math.cos(body.rotation)).toBeCloseTo(1, 6);
  });

  it('let a cape swing out behind when running, and settle when stood still', () => {
    const rig = new Rig(BUILDS.kingrix, R, palette('kingrix'));
    run(rig, { speed: 340, vx: 340 }, 40);
    const torso = rig.part.torso.rotation;
    expect(rig.part.back.rotation - torso).toBeGreaterThan(0.1);
    run(rig, {}, 180);
    expect(Math.abs(rig.part.back.rotation - rig.part.torso.rotation)).toBeLessThan(0.02);
  });

  it('sit down, and lie flat', () => {
    const rig = new Rig(BUILDS.paris, R, palette('paris'));
    run(rig, {}, 2);
    const standing = rig.part.torso.y;
    run(rig, { posture: { sit: 1 } }, 2);
    expect(rig.part.torso.y).toBeGreaterThan(standing + 0.3 * R);
    expect(Math.abs(rig.part.frontThigh.rotation)).toBeLessThan(0.5);
    run(rig, { posture: { lie: 1 } }, 2);
    expect(rig.root.children[0].rotation).toBeCloseTo(Math.PI / 2, 3);
    run(rig, { facing: -1, posture: { lie: 1 } }, 2);
    expect(rig.root.children[0].rotation).toBeCloseTo(-Math.PI / 2, 3);
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
