import { Container, Graphics, Rectangle, type Renderer } from 'pixi.js';
import { BUILDS } from './builds';
import { Rig } from './rig';
import { SKIN_COUNT, type ChampionId } from '../../shared/champions/types';

// Champions' colors and looks. The figures themselves are built in builds.ts and posed by rig.ts; here
// are the palettes they're painted from (a skin is just a different palette), the team ring under their
// feet, and the portraits for the HUD and champion select.

const SKIN = 0xd6a274;
const CHUD_SKIN = 0x87916c;

type Palette = Record<string, number>;

/** The classic look of each champion. */
const CLASSIC: Record<ChampionId, Palette> = {
  marksman: { cloak: 0x2f5d3a, hood: 0x3d7a4a, quiver: 0x6b4a2b, fletch: 0xe8d7b0, face: 0x1d2a20, hand: SKIN, bow: 0x8a5a2b, string: 0xf2efe6, arrow: 0xe8d7b0, tip: 0xb8bec6 },
  barbarian: { skin: SKIN, fur: 0x6b4a2b, furDot: 0x8a6a44, helmet: 0x8a9099, horns: 0xefe3c8, chain: 0x8a9099, haft: 0x6b4a2b, blade: 0xb8bec6 },
  willmore: { sack: 0x7a6a4a, patch: 0x4a3f2a, body: CHUD_SKIN, lid: 0x9aa1ab, lidKnob: 0x5d636d, strap: 0x6b5a22, goggles: 0x9fe6ff, rim: 0xb8a46a, rope: 0x8a6a44, hook: 0x5d636d },
  hunnag: { body: CHUD_SKIN, cap: 0x7a3fb0, spots: 0xe8d7ff, eyes: 0xb8f07a, staff: 0x6b4a2b, orb: 0xb8f07a, orbGlow: 0x8fd14f, orbEdge: 0x3d6a14 },
  logan: { mane: 0xd98a2b, maneEdge: 0x8a4f12, face: 0xe8a33d, muzzle: 0xf2c27a, collar: 0x8a9099, eyes: 0x2e1a08, nose: 0x5a2e12, paw: 0xe8a33d },
  kingrix: { cape: 0xa8232e, ermine: 0xf2f2f2, spots: 0x111111, skin: SKIN, crown: 0xffd166, jewelA: 0xc0182b, jewelB: 0x3d8bfd, scepter: 0xd9a52b, orb: 0xffd166, gem: 0xc0182b },
  daltonomo: { tunicA: 0x7a3fb0, tunicB: 0xffd166, hatA: 0x7a3fb0, hatB: 0xffd166, bell: 0xffe29a, face: 0xf6f0e8, grin: 0xc0182b, eye: 0x1a1a22, ruff: 0xffffff, blade: 0xd8dde6, hilt: 0x5a3a1a },
  havarti: { wheel: 0xf3dc8a, rind: 0xd9a52b, holes: 0xd8b860, wing: 0xfff6dc, wingEdge: 0xd8c48a, halo: 0xffe29a, face: 0xfbe9b7, eyes: 0x5a3a1a, blade: 0xffe9a8, hilt: 0x8a6a1e, flame: 0xffd166 },
  paris: { jacket: 0xf2efe6, jacketShade: 0xc9c3b4, beret: 0x1d2b4a, stem: 0x0f1a30, scarf: 0xc0182b, skin: SKIN, mustache: 0x2a1a10, blade: 0xd8dde6, guard: 0xd9a52b, grip: 0x2a1a10 },
  dabber: { fur: 0x7d8a6a, hood: 0x2f4a2a, hoodEdge: 0x1f3320, eyes: 0xff4a4a, ear: 0xd89a9a, tail: 0xd89a9a, nose: 0xe07a8a, rig: 0x9fe6c8, rigEdge: 0x3d6a5a, smoke: 0xb8f07a, wood: 0x5a3a1a, string: 0xe8e0cc },
  dongmaster: { skin: 0xe2b48a, skinDark: 0xb98a62, tank: 0x1c1c22, hair: 0x2a1a10, band: 0xe5484d, wrap: 0xf2efe6 },
};

/** Each champion's looks: the classic one first, then two skins (just different palettes). */
export const SKINS: Record<ChampionId, readonly { name: string; colors: Palette }[]> = {
  marksman: [
    { name: 'By the Book', colors: {} },
    { name: 'Frost Ranger', colors: { cloak: 0x34506e, hood: 0x6fa8d6, quiver: 0x4a5a6a, bow: 0xb8d8f0, face: 0x1a2533, fletch: 0xdff7ff } },
    { name: 'Ember Hunter', colors: { cloak: 0x6b2a1a, hood: 0xc0502a, quiver: 0x3a2a1a, bow: 0x2a1a10, fletch: 0xffb347, face: 0x2a1410 } },
  ],
  barbarian: [
    { name: 'The Oak', colors: {} },
    { name: 'Tinfoil', colors: { helmet: 0xe2e8ef, horns: 0xb8c4d0, fur: 0x5a5f6a, furDot: 0x8a9099, blade: 0xc9d3dc, chain: 0xe2e8ef } },
    { name: 'Blood Rage', colors: { skin: 0xc06050, fur: 0x2a1a14, furDot: 0x4a2a20, helmet: 0x3a3a40, horns: 0xc0182b, blade: 0xe5484d, haft: 0x2a1a14 } },
  ],
  willmore: [
    { name: 'Gutter King', colors: {} },
    { name: 'Rust Baron', colors: { lid: 0xb0602a, lidKnob: 0x6a3416, sack: 0x5a3a2a, hook: 0x8a4a2a, goggles: 0xffb070, rim: 0x6a3416 } },
    { name: 'Sewer Royal', colors: { lid: 0xffd166, lidKnob: 0xc0182b, sack: 0x5a2a6a, goggles: 0xb98be0, rim: 0xffd166, hook: 0xd9a52b } },
  ],
  hunnag: [
    { name: 'Rot of the Deep', colors: {} },
    { name: 'Glowcap', colors: { cap: 0x2f7fb8, spots: 0xdff7ff, eyes: 0x9fe6ff, orb: 0x9fe6ff, orbGlow: 0x6fd6ff, orbEdge: 0x1a4a6a } },
    { name: 'Bloodcap', colors: { cap: 0xb3202a, spots: 0xffe0e0, eyes: 0xffb347, orb: 0xffb347, orbGlow: 0xff7a2f, orbEdge: 0x6a1a10 } },
  ],
  logan: [
    { name: 'Lionheart', colors: {} },
    { name: 'White Lion', colors: { mane: 0xf2efe6, maneEdge: 0x9a9488, face: 0xe8e2d4, muzzle: 0xffffff, collar: 0xffd166, paw: 0xe8e2d4, eyes: 0x3d6a8a } },
    { name: 'Shadow Lion', colors: { mane: 0x2a2430, maneEdge: 0x0e0c12, face: 0x5a4a3a, muzzle: 0x8a7a6a, collar: 0xb98be0, paw: 0x5a4a3a, eyes: 0xffd166, nose: 0x1a1410 } },
  ],
  daltonomo: [
    { name: 'Court Jester', colors: {} },
    { name: 'Midnight Mummer', colors: { tunicA: 0x1c1c22, tunicB: 0xc0182b, hatA: 0x1c1c22, hatB: 0xc0182b, bell: 0xc9d1dc, face: 0xe8e8e8, grin: 0x111111 } },
    { name: 'Pastel Fool', colors: { tunicA: 0xffb6d5, tunicB: 0x9fe6c8, hatA: 0xffb6d5, hatB: 0x9fe6c8, bell: 0xffffff, grin: 0xff6b8a } },
  ],
  havarti: [
    { name: 'The Aged One', colors: {} },
    { name: 'Blue Cheese', colors: { wheel: 0xe6ecef, rind: 0x9fb4c8, holes: 0x5a7aa8, wing: 0xe6f4ff, wingEdge: 0x9fb4c8, halo: 0xbfe0ff, blade: 0xd8ecff, flame: 0x8fd0ff } },
    { name: 'Smoked Gouda', colors: { wheel: 0xe8a85a, rind: 0x7a3a12, holes: 0xc0803a, wing: 0xffe6c8, wingEdge: 0xc89a6a, halo: 0xffb070, blade: 0xffd7a0, flame: 0xff9f43 } },
  ],
  paris: [
    { name: 'Boulevard', colors: {} },
    { name: 'Midnight Masquerade', colors: { jacket: 0x2a2a32, jacketShade: 0x16161c, beret: 0x6a1a2a, stem: 0x3a0a14, scarf: 0xc9d1dc, guard: 0xc9d1dc, blade: 0xb8c6ff } },
    { name: 'Rosé', colors: { jacket: 0xffd6e0, jacketShade: 0xe8a8b8, beret: 0xc0406a, stem: 0x7a1a3a, scarf: 0xffffff, guard: 0xffd166 } },
  ],
  dabber: [
    { name: 'Dank', colors: {} },
    { name: 'Purple Haze', colors: { hood: 0x5a2a7a, hoodEdge: 0x3a1a50, smoke: 0xc89bff, rig: 0xd8b4ff, rigEdge: 0x5a2a7a } },
    { name: 'Gutter Glam', colors: { hood: 0xe8e8e8, hoodEdge: 0xb0b0b0, fur: 0x6a6a6a, smoke: 0xffd166, rig: 0xffe29a, rigEdge: 0xb08a2a, wood: 0x2a2a2a } },
  ],
  dongmaster: [
    { name: 'Jawline Eternal', colors: {} },
    { name: 'Bronze God', colors: { skin: 0xc98a4a, skinDark: 0x8a5a2a, tank: 0xffd166, hair: 0x1a1008, band: 0xffffff, wrap: 0xffd166 } },
    { name: 'Sigma Grindset', colors: { tank: 0x5a5f6a, band: 0x111111, hair: 0x5a3a1a, wrap: 0x2a2a30 } },
  ],
  kingrix: [
    { name: 'The Crown', colors: {} },
    { name: 'Midnight King', colors: { cape: 0x2a2a6a, ermine: 0xd8dce8, crown: 0xc9d1dc, scepter: 0xa8b0bc, orb: 0xc9d1dc, gem: 0x3d8bfd, jewelA: 0x3d8bfd, jewelB: 0xb98be0 } },
    { name: 'Golden Tyrant', colors: { cape: 0xd9a52b, ermine: 0xfff1c1, crown: 0xffd166, gem: 0x8fd14f, jewelA: 0x8fd14f, jewelB: 0xc0182b, scepter: 0xffd166 } },
  ],
};

/** The color that sums up each look, for the swatches in champion select. */
const SWATCH: Record<ChampionId, string> = { marksman: 'cloak', barbarian: 'fur', willmore: 'lid', hunnag: 'cap', logan: 'mane', kingrix: 'cape', dongmaster: 'tank', dabber: 'hood', paris: 'beret', havarti: 'wheel', daltonomo: 'hatA' };

export function palette(id: ChampionId, skin = 0): Palette {
  return { ...CLASSIC[id], ...(SKINS[id][skin]?.colors ?? {}) };
}

export function swatchColor(id: ChampionId, skin: number): number {
  return palette(id, skin)[SWATCH[id]];
}

/** The disc under a champion: shadow, a ring in their team's color, and a white edge for yourself. */
export function drawChampionBase(g: Graphics, r: number, teamColor: number, self: boolean): void {
  g.circle(4, 6, r).fill({ color: 0x000000, alpha: 0.35 });
  g.circle(0, 0, r).fill({ color: teamColor, alpha: 0.22 }).stroke({ width: 5, color: teamColor });
  if (self) g.circle(0, 0, r + 4).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
}

/** A part that moves on its own: a weapon, a tail, a head, a tongue. */
export interface Weapon {
  /** Where it's held, in units of the unit's radius. */
  pivot: [number, number];
  /** Draws it with the pivot at (0, 0). */
  draw(g: Graphics, r: number): void;
  /** Drawn under the body instead of on top (paws, a head inside a shell). */
  behind?: boolean;
  /** Idle sway: [radians, times per second]. Default a gentle breath. */
  sway?: [number, number];
  /** How long it is at rest, along its length (1 = as drawn). */
  rest?: number;
}

/** Portraits in the classic look, filled in once at startup by renderPortraits. */
export const PORTRAITS: Partial<Record<ChampionId, string>> = {};
/** Every look's portrait, keyed "champion:skin". */
const SKIN_PORTRAITS: Record<string, string> = {};

/** A champion's portrait in a given look (the classic one if that look's isn't ready). */
export function portraitOf(id: ChampionId, skin = 0): string | undefined {
  return SKIN_PORTRAITS[`${id}:${skin}`] ?? PORTRAITS[id];
}

/**
 * One small picture per champion and look, for the HUD and the champion select: head and shoulders on a
 * dark disc. Rendered once with the game's own renderer, so the art only lives in one place.
 */
export function renderPortraits(renderer: Renderer, ids: readonly ChampionId[]): Record<ChampionId, string> {
  const out = {} as Record<ChampionId, string>;
  const R = 40;
  for (const id of ids) {
    for (let skin = 0; skin < SKIN_COUNT; skin++) {
      const root = new Container();
      const bg = new Graphics().circle(0, 0, R * 1.7).fill(0x10161f);
      // A bust: head and shoulders, standing at ease, a little larger than life.
      const rig = new Rig(BUILDS[id], R, palette(id, skin));
      rig.update({ dt: 0, speed: 0, facing: 1, turn: 0, reach: 0, twist: 0, lunge: 0, grow: 0, stretch: 0, air: 0 });
      const k = (R * 2.9) / (rig.height * 0.62);
      rig.root.scale.set(k);
      rig.root.position.set(-R * 0.15, -R * 1.7 + 6 + rig.height * k);
      root.addChild(bg, rig.root);
      const canvas = renderer.extract.canvas({ target: root, frame: new Rectangle(-R * 1.7, -R * 1.7, R * 3.4, R * 3.4), resolution: 2 });
      const url = (canvas as HTMLCanvasElement).toDataURL('image/png');
      SKIN_PORTRAITS[`${id}:${skin}`] = url;
      if (skin === 0) out[id] = url;
      root.destroy({ children: true });
    }
  }
  return out;
}
