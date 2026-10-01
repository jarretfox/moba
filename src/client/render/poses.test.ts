import { describe, expect, it } from 'vitest';
import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { ChampionId } from '../../shared/champions/types';
import { BUILDS } from './builds';
import { palette } from './champions';
import { endPose, liesDown } from './poses';
import { Rig, type RigInput } from './rig';

const IDS = Object.keys(CHAMPION_INFO) as ChampionId[];
const still: RigInput = { dt: 1 / 30, speed: 0, facing: 1, turn: 0, reach: 0, twist: 0, lunge: 0, grow: 0, stretch: 0, air: 0 };

describe('end-screen poses', () => {
  it('give every champion a celebration and a slump that keep them in one piece', () => {
    for (const id of IDS) {
      for (const won of [true, false]) {
        const rig = new Rig(BUILDS[id], 36, palette(id));
        const pose = endPose(id, won);
        for (let t = 0; t < 6; t += 1 / 30) {
          const input = pose(t);
          for (const v of Object.values(input)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
          rig.update({ ...still, ...input });
          for (const part of Object.values(rig.part)) expect(Number.isFinite(part.x) && Number.isFinite(part.y)).toBe(true);
        }
        // Winners grin the whole time; losers never do.
        const faces = new Set(Array.from({ length: 60 }, (_, i) => pose(i / 10).expression ?? null));
        if (won) expect([...faces]).toEqual(['grin']);
        else expect(faces.has('grin')).toBe(false);
      }
    }
  });

  it('celebrate in character: Dongmaster flexes, Logan roars at the sky, Daltonomo bows', () => {
    const over = (id: ChampionId, pick: (i: Partial<RigInput>) => number) => Array.from({ length: 90 }, (_, i) => pick(endPose(id, true)(i / 30)));
    // Dongmaster: both forearms curled up, pumping.
    const flex = endPose('dongmaster', true)(0).posture!;
    expect(flex.armF![1]).toBeGreaterThan(1.5);
    expect(flex.armB![1]).toBeGreaterThan(1.5);
    expect(Math.max(...over('dongmaster', (i) => i.grow ?? 0))).toBeGreaterThan(0.05);
    // Logan: head thrown back mid-roar.
    expect(Math.min(...over('logan', (i) => i.look ?? 0))).toBeLessThan(-0.4);
    // Daltonomo: bent right over.
    expect(Math.max(...over('daltonomo', (i) => i.posture?.bow ?? 0))).toBeGreaterThan(0.8);
  });

  it('slump the losers: heads down, sat on the ground, or flat out', () => {
    expect(endPose('paris', false)(0).posture!.look).toBeGreaterThan(0.3);
    expect(endPose('daltonomo', false)(0).posture!.sit).toBe(1);
    expect(endPose('logan', false)(0).posture!.lie).toBe(1);
    expect(liesDown('logan', false)).toBe(true);
    expect(liesDown('logan', true)).toBe(false);
  });
});
