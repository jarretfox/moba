import { Container, Graphics, Rectangle, type Renderer } from 'pixi.js';
import { SKIN_COUNT, type ChampionId } from '../../shared/champions/types';
import { arc } from './draw';

// Champion art, drawn in code like the rest of the game. Every figure is seen from above, facing right
// (+x), sized to the champion's radius `r`, and lives on the layer that turns to face where they're going.
// The team shows as a colored ring underneath (drawChampionBase), so the figures keep their own colors.
// Every color comes from the champion's palette, so a skin is just a different palette.

const OUTLINE = { width: 2, color: 0x0b0f14 };
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
  paris: { jacket: 0xf2efe6, jacketShade: 0xc9c3b4, beret: 0x1d2b4a, stem: 0x0f1a30, scarf: 0xc0182b, skin: SKIN, mustache: 0x2a1a10, blade: 0xd8dde6, guard: 0xd9a52b, grip: 0x2a1a10 },
  dabber: { fur: 0x7d8a6a, hood: 0x2f4a2a, hoodEdge: 0x1f3320, eyes: 0xff4a4a, ear: 0xd89a9a, tail: 0xd89a9a, nose: 0xe07a8a, rig: 0x9fe6c8, rigEdge: 0x3d6a5a, smoke: 0xb8f07a, wood: 0x5a3a1a, string: 0xe8e0cc },
  dongmaster: { skin: 0xe2b48a, skinDark: 0xb98a62, tank: 0x1c1c22, hair: 0x2a1a10, band: 0xe5484d, wrap: 0xf2efe6 },
};

/** Each champion's looks: the classic one first, then two skins (just different palettes). */
export const SKINS: Record<ChampionId, readonly { name: string; colors: Palette }[]> = {
  marksman: [
    { name: 'Greenwood', colors: {} },
    { name: 'Frost Ranger', colors: { cloak: 0x34506e, hood: 0x6fa8d6, quiver: 0x4a5a6a, bow: 0xb8d8f0, face: 0x1a2533, fletch: 0xdff7ff } },
    { name: 'Ember Hunter', colors: { cloak: 0x6b2a1a, hood: 0xc0502a, quiver: 0x3a2a1a, bow: 0x2a1a10, fletch: 0xffb347, face: 0x2a1410 } },
  ],
  barbarian: [
    { name: 'Unchained', colors: {} },
    { name: 'Frostborn', colors: { skin: 0xb8c8d8, fur: 0xe8eef4, furDot: 0xc8d4e0, helmet: 0x6a8aa8, horns: 0xffffff, blade: 0x9fe6ff } },
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
const SWATCH: Record<ChampionId, string> = { marksman: 'cloak', barbarian: 'fur', willmore: 'lid', hunnag: 'cap', logan: 'mane', kingrix: 'cape', dongmaster: 'tank', dabber: 'hood', paris: 'beret' };

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

/** The champion without their weapon (see drawChampionWeapon, which animates on its own). */
export function drawChampionFigure(g: Graphics, id: ChampionId, r: number, skin = 0): void {
  FIGURES[id](g, r, palette(id, skin));
}

/**
 * Draws the champion's weapon around its pivot (their hand) and says where that pivot sits on the figure,
 * so the weapon can swing, draw back or whirl while the body stays put.
 */
export function drawChampionWeapon(g: Graphics, id: ChampionId, r: number, skin = 0): { x: number; y: number } {
  const w = championWeapon(id, skin);
  w.draw(g, r);
  return { x: w.pivot[0] * r, y: w.pivot[1] * r };
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

export function championWeapon(id: ChampionId, skin = 0): Weapon {
  return WEAPONS[id](palette(id, skin));
}

const WEAPONS: Record<ChampionId, (p: Palette) => Weapon> = {
  marksman: (p) => ({
    pivot: [0.35, 0],
    draw(g, r) {
      arc(g, 0, 0, 0.95 * r, -1.15, 1.15).stroke({ width: 4, color: p.bow }); // bow
      const tip = { x: Math.cos(1.15) * 0.95 * r, y: Math.sin(1.15) * 0.95 * r };
      g.moveTo(tip.x, -tip.y).lineTo(0, 0).lineTo(tip.x, tip.y).stroke({ width: 1.5, color: p.string }); // string
      g.moveTo(0, 0).lineTo(1.05 * r, 0).stroke({ width: 2, color: p.arrow }); // arrow
      g.poly([1.05 * r, -5, 1.25 * r, 0, 1.05 * r, 5]).fill(p.tip);
    },
  }),
  barbarian: (p) => ({
    pivot: [0.3, 0.75],
    draw(g, r) {
      g.moveTo(0, 0).lineTo(1.05 * r, -0.2 * r).stroke({ width: 5, color: p.haft }); // haft
      g.poly([0.85 * r, -0.6 * r, 1.2 * r, -0.45 * r, 1.25 * r, 0, 0.85 * r, 0.2 * r, 0.95 * r, -0.2 * r]).fill(p.blade).stroke(OUTLINE); // blade
      g.moveTo(1.18 * r, -0.42 * r).lineTo(1.22 * r, -0.02 * r).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    },
  }),
  willmore: (p) => ({
    pivot: [0.3, 0.6],
    draw(g, r) {
      g.moveTo(0, 0).lineTo(0.55 * r, 0.15 * r).stroke({ width: 2, color: p.rope }); // rope
      arc(g, 0.7 * r, 0, 0.22 * r, -0.5, 3.4).stroke({ width: 4, color: p.hook }); // hook
    },
  }),
  hunnag: (p) => ({
    pivot: [0.2, 0.65],
    draw(g, r) {
      g.moveTo(0, 0).lineTo(1.05 * r, -0.15 * r).stroke({ width: 3, color: p.staff }); // staff
      g.circle(1.1 * r, -0.15 * r, 0.36 * r).fill({ color: p.orbGlow, alpha: 0.25 });
      g.circle(1.1 * r, -0.15 * r, 0.18 * r).fill(p.orb).stroke({ width: 1.5, color: p.orbEdge });
    },
  }),
  logan: (p) => ({
    // Two front paws, reaching out from under the mane.
    pivot: [0.45, 0],
    behind: true,
    draw(g, r) {
      for (const side of [-1, 1]) {
        g.ellipse(0.1 * r, side * 0.46 * r, 0.22 * r, 0.17 * r).fill(p.paw).stroke({ width: 1.5, color: p.maneEdge });
        for (let i = -1; i <= 1; i++) g.circle(0.28 * r, side * 0.46 * r + i * 0.08 * r, 0.045 * r).fill(p.maneEdge);
      }
    },
  }),
  paris: (p) => ({
    // His épée: a long thin blade, a bell guard, a short grip.
    pivot: [0.3, 0.55],
    draw(g, r) {
      g.moveTo(-0.18 * r, 0).lineTo(0.05 * r, 0).stroke({ width: 4, color: p.grip });
      g.moveTo(0.1 * r, 0).lineTo(1.55 * r, 0).stroke({ width: 2.5, color: p.blade });
      g.circle(1.55 * r, 0, 1.6).fill(p.blade);
      g.ellipse(0.1 * r, 0, 0.06 * r, 0.16 * r).fill(p.guard).stroke({ width: 1.5, color: OUTLINE.color });
      g.moveTo(0.4 * r, -1.5).lineTo(1.3 * r, -1.5).stroke({ width: 1, color: 0xffffff, alpha: 0.6 });
    },
  }),
  dabber: (p) => ({
    // His rig: a little crossbow with a glass bulb bubbling on the stock.
    pivot: [0.3, 0.55],
    draw(g, r) {
      g.moveTo(0, 0).lineTo(0.75 * r, -0.1 * r).stroke({ width: 4, color: p.wood });
      g.moveTo(0.55 * r, -0.4 * r).quadraticCurveTo(0.75 * r, -0.1 * r, 0.55 * r, 0.22 * r).stroke({ width: 3, color: p.wood });
      g.moveTo(0.55 * r, -0.4 * r).lineTo(0.55 * r, 0.22 * r).stroke({ width: 1, color: p.string });
      g.circle(0.3 * r, -0.05 * r, 0.14 * r).fill({ color: p.rig, alpha: 0.85 }).stroke({ width: 2, color: p.rigEdge });
      g.circle(0.26 * r, -0.09 * r, 0.04 * r).fill({ color: 0xffffff, alpha: 0.7 });
      g.circle(0.38 * r, -0.28 * r, 0.06 * r).fill({ color: p.smoke, alpha: 0.5 });
    },
  }),
  dongmaster: (p) => ({
    // Two big wrapped fists, up in a guard.
    pivot: [0.5, 0],
    draw(g, r) {
      for (const side of [-1, 1]) {
        const y = side * 0.5 * r;
        g.roundRect(-0.05 * r, y - 0.17 * r, 0.34 * r, 0.34 * r, 0.1 * r).fill(p.skin).stroke(OUTLINE);
        g.roundRect(-0.12 * r, y - 0.15 * r, 0.12 * r, 0.3 * r, 0.05 * r).fill(p.wrap).stroke({ width: 1.5, color: OUTLINE.color });
        for (let i = -1; i <= 1; i++) g.moveTo(0.22 * r, y + i * 0.09 * r).lineTo(0.28 * r, y + i * 0.09 * r).stroke({ width: 1.5, color: p.skinDark });
      }
    },
  }),
  kingrix: (p) => ({
    pivot: [0.3, 0.6],
    draw(g, r) {
      g.moveTo(0, 0).lineTo(0.9 * r, -0.15 * r).stroke({ width: 3, color: p.scepter }); // scepter
      g.circle(0.95 * r, -0.16 * r, 0.15 * r).fill(p.orb).stroke({ width: 1.5, color: 0x8a6a1e });
      g.circle(0.95 * r, -0.16 * r, 0.06 * r).fill(p.gem);
    },
  }),
};

const FIGURES: Record<ChampionId, (g: Graphics, r: number, p: Palette) => void> = {
  /** A hooded archer in a cloak, a quiver on her back. */
  marksman(g, r, p) {
    g.ellipse(-0.15 * r, 0, 0.95 * r, 0.85 * r).fill(p.cloak).stroke(OUTLINE); // cloak
    g.roundRect(-1.05 * r, 0.1 * r, 0.6 * r, 0.3 * r, 4).fill(p.quiver).stroke(OUTLINE); // quiver
    for (const y of [0.13, 0.25, 0.37]) g.poly([-1.2 * r, y * r - 4, -1.05 * r, y * r, -1.2 * r, y * r + 4]).fill(p.fletch);
    g.circle(0.1 * r, 0, 0.48 * r).fill(p.hood).stroke(OUTLINE); // hood
    g.circle(0.3 * r, 0, 0.22 * r).fill(p.face); // face in shadow
    g.circle(0.55 * r, 0.35 * r, 0.14 * r).fill(p.hand); // drawing hand
  },

  /** Broad shoulders, fur pauldrons, a horned helmet, and a broken shackle on one wrist. */
  barbarian(g, r, p) {
    g.ellipse(0, 0, 0.75 * r, 1.0 * r).fill(p.skin).stroke(OUTLINE); // shoulders
    for (const side of [-1, 1]) {
      g.circle(-0.05 * r, side * 0.68 * r, 0.38 * r).fill(p.fur).stroke(OUTLINE); // fur
      for (const [x, y] of [[-0.2, 0.55], [0.1, 0.6], [-0.05, 0.85]]) g.circle(x * r, side * y * r, 0.1 * r).fill(p.furDot);
    }
    g.circle(0.15 * r, 0, 0.42 * r).fill(p.skin).stroke(OUTLINE); // head
    g.circle(0.1 * r, 0, 0.36 * r).fill(p.helmet).stroke(OUTLINE); // helmet
    for (const side of [-1, 1]) g.poly([0.05 * r, side * 0.3 * r, 0.6 * r, side * 0.8 * r, 0.32 * r, side * 0.24 * r]).fill(p.horns).stroke(OUTLINE); // horns
    for (let i = 0; i < 3; i++) g.ellipse(0.35 * r + i * 7, -0.85 * r - i * 3, 4, 2.5).stroke({ width: 2, color: p.chain }); // broken chain
  },

  /** A Chud in goggles and a trash-can-lid crown, a sack of junk on his back. */
  willmore(g, r, p) {
    g.circle(-0.65 * r, 0.1 * r, 0.5 * r).fill(p.sack).stroke(OUTLINE); // junk sack
    g.moveTo(-0.9 * r, -0.05 * r).lineTo(-0.45 * r, 0.3 * r).stroke({ width: 2, color: p.patch }); // a patch
    g.circle(0, 0, 0.8 * r).fill(p.body).stroke(OUTLINE); // body
    g.circle(0.05 * r, 0, 0.36 * r).fill(p.lid).stroke(OUTLINE); // the lid
    g.roundRect(-0.03 * r, -0.08 * r, 0.16 * r, 0.16 * r, 2).fill(p.lidKnob);
    g.moveTo(0.5 * r, -0.28 * r).lineTo(0.5 * r, 0.28 * r).stroke({ width: 3, color: p.strap }); // goggle strap
    for (const side of [-1, 1]) g.circle(0.55 * r, side * 0.28 * r, 0.2 * r).fill(p.goggles).stroke({ width: 3, color: p.rim }); // goggles
  },

  /** A Chud under a spotted mushroom cap, eyes glowing. */
  hunnag(g, r, p) {
    g.circle(0, 0, 0.8 * r).fill(p.body).stroke(OUTLINE); // body
    g.ellipse(-0.1 * r, 0, 0.9 * r, 0.85 * r).fill(p.cap).stroke(OUTLINE); // the cap
    for (const [x, y, rr] of [[-0.45, -0.35, 0.16], [-0.1, 0.4, 0.13], [-0.55, 0.25, 0.1], [0.15, -0.3, 0.12], [-0.25, -0.05, 0.09]]) g.circle(x * r, y * r, rr * r).fill(p.spots);
    for (const side of [-1, 1]) g.circle(0.62 * r, side * 0.2 * r, 0.09 * r).fill(p.eyes); // eyes under the brim
    for (const [x, y] of [[0.9, -0.5], [0.4, -0.85], [-0.8, 0.75]]) g.circle(x * r, y * r, 2.5).fill({ color: p.eyes, alpha: 0.8 }); // spores
  },

  /** A lion from above: a great mane, muzzle forward, and a broken collar from the royal cage. */
  logan(g, r, p) {
    const mane: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = i % 2 === 0 ? 1.05 * r : 0.82 * r;
      mane.push(Math.cos(a) * rr - 0.05 * r, Math.sin(a) * rr);
    }
    g.poly(mane).fill(p.mane).stroke({ width: 2, color: p.maneEdge });
    g.circle(0, 0, 0.7 * r).fill(p.face);
    arc(g, -0.05 * r, 0, 0.62 * r, 2.2, 4.1).stroke({ width: 4, color: p.collar }); // the broken collar
    g.ellipse(-0.75 * r, -0.62 * r, 4, 2.5).stroke({ width: 2, color: p.collar });
    for (const side of [-1, 1]) g.circle(-0.02 * r, side * 0.48 * r, 0.14 * r).fill(p.mane).stroke({ width: 1.5, color: p.maneEdge }); // ears
    g.ellipse(0.35 * r, 0, 0.42 * r, 0.32 * r).fill(p.muzzle).stroke({ width: 1.5, color: p.maneEdge }); // muzzle
    for (const side of [-1, 1]) g.circle(0.2 * r, side * 0.2 * r, 0.06 * r).fill(p.eyes); // eyes
    g.poly([0.62 * r, -0.1 * r, 0.75 * r, 0, 0.62 * r, 0.1 * r]).fill(p.nose); // nose
  },

  /** A fencing master from above: white jacket, red cravat, a beret at an angle, and a mustache that curls. */
  paris(g, r, p) {
    g.ellipse(-0.08 * r, 0, 0.68 * r, 0.88 * r).fill(p.jacket).stroke(OUTLINE); // jacket
    g.moveTo(-0.5 * r, -0.4 * r).quadraticCurveTo(-0.2 * r, 0, -0.5 * r, 0.4 * r).stroke({ width: 2, color: p.jacketShade }); // a seam
    g.poly([0.18 * r, -0.2 * r, 0.42 * r, 0, 0.18 * r, 0.2 * r, 0.05 * r, 0]).fill(p.scarf).stroke({ width: 1.5, color: OUTLINE.color }); // cravat
    g.circle(0.12 * r, 0, 0.3 * r).fill(p.skin).stroke(OUTLINE); // head
    for (const side of [-1, 1]) {
      g.moveTo(0.36 * r, side * 0.04 * r).quadraticCurveTo(0.5 * r, side * 0.26 * r, 0.32 * r, side * 0.34 * r).stroke({ width: 3, color: p.mustache, cap: 'round' }); // the mustache
      g.circle(0.33 * r, side * 0.33 * r, 0.03 * r).fill(p.mustache);
    }
    g.ellipse(0.04 * r, -0.06 * r, 0.3 * r, 0.27 * r).fill(p.beret).stroke(OUTLINE); // beret, tilted
    g.circle(0.0 * r, -0.12 * r, 0.05 * r).fill(p.stem);
  },

  /** A rat in a hoodie: snout out front, red eyes, round ears poking out, a long tail, a little smoke. */
  dabber(g, r, p) {
    g.moveTo(-0.6 * r, 0.1 * r).quadraticCurveTo(-1.3 * r, 0.9 * r, -1.75 * r, 0.2 * r).stroke({ width: 7, color: OUTLINE.color, cap: 'round' });
    g.moveTo(-0.6 * r, 0.1 * r).quadraticCurveTo(-1.3 * r, 0.9 * r, -1.75 * r, 0.2 * r).stroke({ width: 4, color: p.tail, cap: 'round' }); // tail
    g.ellipse(-0.15 * r, 0, 0.72 * r, 0.8 * r).fill(p.hood).stroke(OUTLINE); // hoodie
    for (const side of [-1, 1]) g.circle(0.12 * r, side * 0.36 * r, 0.17 * r).fill(p.fur).stroke(OUTLINE); // ears
    for (const side of [-1, 1]) g.circle(0.14 * r, side * 0.37 * r, 0.09 * r).fill(p.ear);
    arc(g, 0.15 * r, 0, 0.44 * r, Math.PI * 0.55, Math.PI * 1.45).stroke({ width: 6, color: p.hoodEdge }); // hood round the head
    g.ellipse(0.28 * r, 0, 0.36 * r, 0.3 * r).fill(p.fur).stroke(OUTLINE); // head
    g.poly([0.45 * r, -0.2 * r, 0.9 * r, 0, 0.45 * r, 0.2 * r]).fill(p.fur).stroke(OUTLINE); // snout
    g.circle(0.88 * r, 0, 0.07 * r).fill(p.nose);
    for (const side of [-1, 1]) {
      g.moveTo(0.74 * r, side * 0.07 * r).lineTo(0.98 * r, side * 0.26 * r).stroke({ width: 1.2, color: 0xe8e0cc, alpha: 0.8 }); // whiskers
      g.circle(0.5 * r, side * 0.13 * r, 0.065 * r).fill(p.eyes); // red eyes
    }
    for (const [x, y, rr] of [[-0.35, -0.75, 0.12], [-0.6, -0.55, 0.09], [0.0, -0.9, 0.08]]) g.circle(x * r, y * r, rr * r).fill({ color: p.smoke, alpha: 0.45 }); // smoke
  },

  /** A giga chad from above: traps like hills, a tank top, slicked-back hair, a sweatband, and THE jaw. */
  dongmaster(g, r, p) {
    g.ellipse(-0.05 * r, 0, 0.78 * r, 1.08 * r).fill(p.skin).stroke(OUTLINE); // shoulders
    g.ellipse(-0.12 * r, 0, 0.55 * r, 0.7 * r).fill(p.tank).stroke(OUTLINE); // tank top
    for (const side of [-1, 1]) g.moveTo(-0.1 * r, side * 0.62 * r).quadraticCurveTo(0.25 * r, side * 0.75 * r, 0.3 * r, side * 0.95 * r).stroke({ width: 2, color: p.skinDark }); // delts
    g.roundRect(0.2 * r, -0.32 * r, 0.56 * r, 0.64 * r, 0.16 * r).fill(p.skin).stroke(OUTLINE); // THE jaw, squared off
    g.moveTo(0.68 * r, -0.24 * r).lineTo(0.68 * r, 0.24 * r).stroke({ width: 3, color: p.skinDark }); // its shadow
    g.moveTo(0.76 * r, -0.07 * r).lineTo(0.67 * r, 0).lineTo(0.76 * r, 0.07 * r).stroke({ width: 2.5, color: p.skinDark }); // cleft chin
    g.circle(0.04 * r, 0, 0.34 * r).fill(p.skin).stroke(OUTLINE); // head
    g.moveTo(-0.3 * r, 0).arc(0.04 * r, 0, 0.33 * r, Math.PI, Math.PI * 1.62).quadraticCurveTo(0.3 * r, 0, 0.16 * r, 0.31 * r).arc(0.04 * r, 0, 0.33 * r, Math.PI * 0.38, Math.PI).closePath().fill(p.hair); // slicked-back hair
    arc(g, 0.04 * r, 0, 0.32 * r, -0.7, 0.7).stroke({ width: 5, color: p.band }); // sweatband across the brow
    g.moveTo(-0.45 * r, -0.62 * r).lineTo(-0.2 * r, -0.85 * r).stroke({ width: 3, color: 0xffffff, alpha: 0.35 }); // the shine
  },

  /** The king from above: a cape, an ermine collar, and a jeweled crown. */
  kingrix(g, r, p) {
    g.ellipse(-0.35 * r, 0, 0.85 * r, 0.95 * r).fill(p.cape).stroke(OUTLINE); // cape
    g.ellipse(0, 0, 0.5 * r, 0.72 * r).fill(p.ermine).stroke(OUTLINE); // ermine
    for (const [x, y] of [[-0.25, -0.45], [-0.3, 0.4], [0.2, -0.55], [0.15, 0.55], [-0.4, 0]]) g.ellipse(x * r, y * r, 2, 3).fill(p.spots);
    g.circle(0.1 * r, 0, 0.33 * r).fill(p.skin).stroke(OUTLINE); // head
    g.circle(0.1 * r, 0, 0.28 * r).stroke({ width: 5, color: p.crown }); // crown band
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.circle(0.1 * r + Math.cos(a) * 0.28 * r, Math.sin(a) * 0.28 * r, 0.07 * r).fill(i % 2 ? p.jewelA : p.jewelB).stroke({ width: 1, color: 0x8a6a1e });
    }
  },
};

/** Portraits in the classic look, filled in once at startup by renderPortraits. */
export const PORTRAITS: Partial<Record<ChampionId, string>> = {};
/** Every look's portrait, keyed "champion:skin". */
const SKIN_PORTRAITS: Record<string, string> = {};

/** A champion's portrait in a given look (the classic one if that look's isn't ready). */
export function portraitOf(id: ChampionId, skin = 0): string | undefined {
  return SKIN_PORTRAITS[`${id}:${skin}`] ?? PORTRAITS[id];
}

/**
 * One small picture per champion and look, for the HUD and the champion select: the figure facing up on
 * a dark disc. Rendered once with the game's own renderer, so the art only lives in one place.
 */
export function renderPortraits(renderer: Renderer, ids: readonly ChampionId[]): Record<ChampionId, string> {
  const out = {} as Record<ChampionId, string>;
  const R = 40;
  for (const id of ids) {
    for (let skin = 0; skin < SKIN_COUNT; skin++) {
      const root = new Container();
      const bg = new Graphics().circle(0, 0, R * 1.7).fill(0x10161f);
      const fig = new Container();
      const body = new Graphics();
      drawChampionFigure(body, id, R, skin);
      const weapon = new Graphics();
      weapon.position.copyFrom(drawChampionWeapon(weapon, id, R, skin));
      fig.addChild(id === 'logan' ? weapon : body, id === 'logan' ? body : weapon);
      fig.rotation = -Math.PI / 2; // facing up, at the viewer
      fig.scale.set(1.15);
      root.addChild(bg, fig);
      const canvas = renderer.extract.canvas({ target: root, frame: new Rectangle(-R * 1.7, -R * 1.7, R * 3.4, R * 3.4), resolution: 2 });
      const url = (canvas as HTMLCanvasElement).toDataURL('image/png');
      SKIN_PORTRAITS[`${id}:${skin}`] = url;
      if (skin === 0) out[id] = url;
      root.destroy({ children: true });
    }
  }
  return out;
}
