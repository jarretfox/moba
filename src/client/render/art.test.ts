import { Sprite, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ART_PARTS, parseArtIndex, parsePartsManifest, sheetFrames, type PartArt } from './art';
import { palette } from './champions';
import { buildFor } from './costumes';
import { Rig, type RigInput } from './rig';

const still: RigInput = { dt: 1 / 60, speed: 0, facing: 1, turn: 0, reach: 0, twist: 0, lunge: 0, grow: 0, stretch: 0, air: 0 };

describe('the painted art index', () => {
  it('keeps what makes sense and drops the rest', () => {
    const index = parseArtIndex({
      champions: { scrimby: [0, 2, 'x', -1, 9] },
      fx: {
        steamBurst: { file: 'fx/scrimby/steam.png', frames: 16, cols: 4, size: 2.4, replace: true, glow: 'yes' },
        broken: { file: '../../etc/passwd', frames: 4, cols: 2, size: 1 },
        empty: { file: 'fx/a.png', frames: 0, cols: 2, size: 1 },
      },
      sprites: { 'projectile:hotdog': { file: 'sprites/hotdog.png', width: 40, anchor: [0.5, 0.5] }, bad: { file: 'x.png', width: -1 } },
    });
    expect(index.champions.scrimby).toEqual([0, 2]);
    expect(Object.keys(index.fx)).toEqual(['steamBurst']);
    expect(index.fx.steamBurst).toMatchObject({ frames: 16, cols: 4, fps: 24, replace: true, glow: false });
    expect(Object.keys(index.sprites)).toEqual(['projectile:hotdog']);
    expect(parseArtIndex('nonsense')).toEqual({ champions: {}, fx: {}, sprites: {} });
  });

  it('reads a look’s parts, ignoring parts the rig doesn’t have', () => {
    const m = parsePartsManifest({ pxPerR: 320, parts: { head: { file: 'head.png', origin: [-0.5, -1] }, tail: { file: 'tail.png', origin: [0, 0] }, torso: { file: 'torso.png' } } }, ART_PARTS);
    expect(m?.pxPerR).toBe(320);
    expect(Object.keys(m!.parts)).toEqual(['head']);
    expect(parsePartsManifest({ parts: {} }, ART_PARTS)).toBeNull();
  });

  it('cuts a sheet into its frames, left to right and down', () => {
    const sheet = new Texture({ source: Texture.WHITE.source, frame: Texture.WHITE.frame });
    const frames = sheetFrames(sheet, 3, 2);
    expect(frames).toHaveLength(3);
    expect(frames[1].frame.x).toBeCloseTo(sheet.width / 2);
    expect(frames[2].frame.y).toBeCloseTo(sheet.height / 2);
  });
});

describe('a painted figure', () => {
  // A 100×100 picture per part, its top-left at (−0.5r, −0.5r): the joint is the picture's middle.
  const pxPerR = 100;
  const art = (): PartArt => ({
    pxPerR,
    parts: Object.fromEntries(ART_PARTS.map((p) => [p, { texture: Texture.WHITE, origin: [-0.5, -0.5] as const }])),
  });
  const r = 32;

  it('pins every picture at its part’s joint, however the part is posed', () => {
    const rig = new Rig({ ...buildFor('scrimby', 0, true), art: art() }, r, palette('scrimby'));
    const painted = (rig as unknown as { painted: { part: keyof Rig['part']; sprite: Sprite }[] }).painted;
    expect(painted.length).toBeGreaterThan(10);
    for (const input of [still, { ...still, speed: 300, turn: 0.8, reach: 0.5, lunge: 0.3 }, { ...still, facing: -1, dead: 0.4 }]) {
      for (let i = 0; i < 5; i++) rig.update(input);
      for (const { part, sprite } of painted) {
        const g = rig.part[part];
        // The drawn part is posed but not shown; the picture is shown instead.
        expect(g.renderable).toBe(false);
        // The picture's pixel (50, 50) is the part's own (0, 0): they land on the same spot. So does any
        // other point, e.g. half an r along the part.
        for (const [lx, ly] of [[0, 0], [0.5 * r, 0.2 * r]]) {
          const a = sprite.toGlobal({ x: (lx / r + 0.5) * pxPerR, y: (ly / r + 0.5) * pxPerR });
          const b = g.toGlobal({ x: lx, y: ly });
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01);
        }
      }
    }
  });

  it('throws the painted hat and cup when they die, and puts them back after', () => {
    const rig = new Rig({ ...buildFor('scrimby', 0, true), art: art() }, r, palette('scrimby'));
    rig.update(still);
    const before = rig.root.children.length;
    rig.update({ ...still, dead: 0.1 });
    const flung = rig.root.children.slice(before);
    expect(flung.length).toBeGreaterThan(0);
    expect(flung.every((c) => c instanceof Sprite)).toBe(true);
    rig.update(still);
    expect(rig.root.children.length).toBe(before);
  });
});
