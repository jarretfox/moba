import type { PlayerTeam } from '../constants';
import type { Vec2 } from '../math';
import { mirrorShape, type Shape } from './shapes';

export type GroundStyle = 'base' | 'lane' | 'jungle' | 'river';

export interface GroundPiece {
  style: GroundStyle;
  shape: Shape;
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
  spawns: Record<PlayerTeam, Vec2>;
}

const W = 12000;
const H = 7000;

// The layout is authored for the top-left quadrant only (blue base, top lane, blue's top jungle)
// and mirrored into the other three, so both teams and both lanes are identical.
//
//              TOP LANE
//  ┌──●──●───────── river ─────────●──●──┐
//  │  jungle   jungle  ~~   jungle   jungle│
// [B]──exit      pillar  WARDEN pillar   exit──[R]
//  │  jungle   jungle  ~~   jungle   jungle│
//  └──●──●───────── river ─────────●──●──┘
//              BOT LANE
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

function mirror4<T>(items: T[], map: (item: T, mx: boolean, my: boolean) => T): T[] {
  return [false, true].flatMap((mx) => [false, true].flatMap((my) => items.map((it) => map(it, mx, my))));
}

export const MAP: MapData = {
  width: W,
  height: H,
  cellSize: 50,
  ground: mirror4(quadrantGround, (g, mx, my) => ({ ...g, shape: mirrorShape(g.shape, W, H, mx, my) })),
  blockers: mirror4(quadrantBlockers, (s, mx, my) => mirrorShape(s, W, H, mx, my)),
  spawns: {
    1: { x: 500, y: 3500 },
    2: { x: W - 500, y: 3500 },
  },
};
