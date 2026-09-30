import type { PlayerTeam } from '../constants';
import type { Vec2 } from '../math';
import { mirrorShape, type Shape } from './shapes';

export type GroundStyle = 'base' | 'lane' | 'jungle' | 'river';

export interface GroundPiece {
  style: GroundStyle;
  shape: Shape;
}

export type Lane = 'top' | 'bot';
export type StructureRole = 'outerShootie' | 'innerShootie' | 'oakner' | 'baseShootie' | 'daBase';

export interface StructureSpot {
  role: StructureRole;
  team: PlayerTeam;
  /** Null for the structures inside the base. */
  lane: Lane | null;
  pos: Vec2;
}

export interface MapData {
  width: number;
  height: number;
  /** Nav grid resolution in world units. */
  cellSize: number;
  /** Walkable areas (the style only affects how they're drawn). */
  ground: GroundPiece[];
  /** Solid terrain carved back out of the ground. */
  blockers: Shape[];
  structures: StructureSpot[];
  spawns: Record<PlayerTeam, Vec2>;
}

const W = 12000;
const H = 7000;

// The layout is authored for the top-left quadrant only (blue base, top lane, blue's top jungle)
// and mirrored into the other three, so both teams and both lanes are identical.
//
//                  TOP LANE
//    ┌─O──i────o───────── river ─────────o────i──O─┐
//    │       jungle        ~~        jungle        │
// [D s]──back door   pillar  WARDEN  pillar  back door──[s D]
//    │       jungle        ~~        jungle        │
//    └─O──i────o───────── river ─────────o────i──O─┘
//                  BOT LANE
// D = Da Base, s = base Shootie, O = Oakner, i = inner Shootie, o = outer Shootie
const quadrantGround: GroundPiece[] = [
  { style: 'base', shape: { type: 'circle', x: 1100, y: 3500, r: 950 } },
  // Lane: climbs out of the base, then runs along the top edge to the river.
  { style: 'lane', shape: { type: 'capsule', ax: 1500, ay: 2900, bx: 2100, by: 1100, r: 380 } },
  { style: 'lane', shape: { type: 'capsule', ax: 2100, ay: 1100, bx: 6000, by: 1100, r: 380 } },
  // Jungle block between the lanes, plus a back door from the base.
  { style: 'jungle', shape: { type: 'rect', x: 2900, y: 1900, w: 3100, h: 1600 } },
  { style: 'jungle', shape: { type: 'capsule', ax: 1900, ay: 3500, bx: 3000, by: 3500, r: 280 } },
  // Side path from lane into jungle.
  { style: 'jungle', shape: { type: 'capsule', ax: 3700, ay: 1100, bx: 3700, by: 2100, r: 230 } },
  // River: mouth into the lane and the band down the middle of the map.
  { style: 'river', shape: { type: 'capsule', ax: 6000, ay: 1100, bx: 6000, by: 2100, r: 300 } },
  { style: 'river', shape: { type: 'rect', x: 5700, y: 1900, w: 300, h: 1600 } },
];

const quadrantBlockers: Shape[] = [
  { type: 'rect', x: 3300, y: 2450, w: 1000, h: 350 }, // wall that splits the side path
  { type: 'circle', x: 5000, y: 2350, r: 250 }, // rock near the river
  { type: 'rect', x: 3900, y: 3150, w: 600, h: 350 }, // jungle center pillar
  // The Warden's pit: walls above and below, open on the left and right.
  { type: 'rect', x: 5250, y: 2650, w: 750, h: 300 },
  { type: 'rect', x: 5250, y: 2650, w: 250, h: 500 },
];

// Blue's top-lane structures, walking out from the base; mirrored to bot lane and to red.
const quadrantStructures: StructureSpot[] = [
  { role: 'oakner', team: 1, lane: 'top', pos: { x: 1620, y: 2540 } },
  { role: 'innerShootie', team: 1, lane: 'top', pos: { x: 2500, y: 1100 } },
  { role: 'outerShootie', team: 1, lane: 'top', pos: { x: 4300, y: 1100 } },
];

// Blue's base structures sit on the horizontal center line, so they only mirror across to red.
const baseStructures: StructureSpot[] = [
  { role: 'daBase', team: 1, lane: null, pos: { x: 1100, y: 3500 } },
  { role: 'baseShootie', team: 1, lane: null, pos: { x: 1650, y: 3500 } },
];

function mirror4<T>(items: T[], map: (item: T, mx: boolean, my: boolean) => T): T[] {
  return [false, true].flatMap((mx) => [false, true].flatMap((my) => items.map((it) => map(it, mx, my))));
}

function mirrorStructure(s: StructureSpot, mx: boolean, my: boolean): StructureSpot {
  return {
    role: s.role,
    team: mx ? 2 : 1,
    lane: s.lane && my ? 'bot' : s.lane,
    pos: { x: mx ? W - s.pos.x : s.pos.x, y: my ? H - s.pos.y : s.pos.y },
  };
}

export const MAP: MapData = {
  width: W,
  height: H,
  cellSize: 50,
  ground: mirror4(quadrantGround, (g, mx, my) => ({ ...g, shape: mirrorShape(g.shape, W, H, mx, my) })),
  blockers: mirror4(quadrantBlockers, (s, mx, my) => mirrorShape(s, W, H, mx, my)),
  structures: [
    ...mirror4(quadrantStructures, mirrorStructure),
    ...baseStructures.flatMap((s) => [s, mirrorStructure(s, true, false)]),
  ],
  spawns: {
    1: { x: 500, y: 3500 },
    2: { x: W - 500, y: 3500 },
  },
};
