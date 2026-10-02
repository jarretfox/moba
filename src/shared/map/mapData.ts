import type { PlayerTeam } from '../constants';
import type { Vec2 } from '../math';
import { mirrorShape, type Shape } from './shapes';

export type GroundStyle = 'base' | 'lane' | 'jungle' | 'river';

export interface GroundPiece {
  style: GroundStyle;
  shape: Shape;
}

export type Lane = 'top' | 'bot' | 'mid';

/** Which map: the Rift (two lanes, a jungle, the Warden) or the Howling Hollow (ARAM: one lane, Halloween). */
export type MapId = 'rift' | 'aram';
export type StructureRole = 'outerShootie' | 'innerShootie' | 'oakner' | 'baseShootie' | 'daBase';

export type CampKind = 'gutterRats' | 'mossback' | 'emberToad' | 'glowcap';

export interface CampSpot {
  kind: CampKind;
  pos: Vec2;
  /** Whose half of the map the camp is on (anyone can take it). */
  side: PlayerTeam;
}

export interface StructureSpot {
  role: StructureRole;
  team: PlayerTeam;
  /** Null for the structures inside the base. */
  lane: Lane | null;
  pos: Vec2;
}

/**
 * Where a map event can happen (sim/events.ts). A boss site has a spot to arrive at and a short `path` to
 * pace. An escort site's `path` runs from blue's end to red's end, the cart starting at `pos` in the
 * middle. A capture site is just the spot. A map with no sites gets no events.
 */
export interface EventSite {
  kind: 'boss' | 'escort' | 'capture';
  pos: Vec2;
  path?: Vec2[];
}

export interface MapData {
  id: MapId;
  /** How it's drawn: the usual dusk, or Halloween (pumpkins, dead trees, a purple night). */
  theme: 'classic' | 'halloween';
  /** ARAM: no Recall (walk home or wait to die), and its own pace (see shared/sim/match.ts). */
  aram?: boolean;
  /** Where health relics (pumpkins) grow, if the map has any (see sim/relics.ts). */
  relics?: Vec2[];
  width: number;
  height: number;
  /** Nav grid resolution in world units. */
  cellSize: number;
  /** Walkable areas (the style only affects how they're drawn). */
  ground: GroundPiece[];
  /** Solid terrain carved back out of the ground. */
  blockers: Shape[];
  /** Tall grass: hides whoever stands in it from anyone outside that patch. */
  brush: Shape[];
  structures: StructureSpot[];
  /** Jungle camps. */
  camps: CampSpot[];
  /** Chud routes, written from blue's side (blue Da Base → red Da Base). Use lanePath for either team. */
  lanes: Partial<Record<Lane, Vec2[]>>;
  spawns: Record<PlayerTeam, Vec2>;
  /** Where the match's events can turn up; left out, the map has none. */
  eventSites?: EventSite[];
}

/** The route a team's Chuds march down a lane, starting beside their own Da Base. */
export function lanePath(map: MapData, team: PlayerTeam, lane: Lane): Vec2[] {
  const path = map.lanes[lane] ?? [];
  return team === 1 ? path : [...path].reverse();
}

/** The lanes a map has. */
export function lanesOf(map: MapData): Lane[] {
  return (Object.keys(map.lanes) as Lane[]).filter((l) => (map.lanes[l]?.length ?? 0) > 0);
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

// Brush for ambushes: two lane-edge patches, two in the jungle, one by the river mouth.
const quadrantBrush: Shape[] = [
  { type: 'rect', x: 3100, y: 1340, w: 400, h: 130 }, // top lane, jungle side, by the side path
  { type: 'rect', x: 5100, y: 730, w: 400, h: 130 }, // top lane, outer edge, near the river
  { type: 'circle', x: 3150, y: 2150, r: 140 }, // jungle corner by the lane wall
  { type: 'circle', x: 4700, y: 3000, r: 150 }, // between the wall chunk and the pillar, on the way to the pit
  { type: 'circle', x: 5780, y: 2250, r: 120 }, // river, just below the mouth
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

// Jungle camps in blue's top quadrant: [kind here, kind in the mirrored bottom quadrant]. Each team gets one of each.
const quadrantCamps: { pos: Vec2; kinds: [CampKind, CampKind] }[] = [
  { pos: { x: 3450, y: 2170 }, kinds: ['gutterRats', 'mossback'] }, // off the side path from the lane
  { pos: { x: 4600, y: 2150 }, kinds: ['emberToad', 'glowcap'] }, // deeper in, toward the river
];

// Blue's base structures sit on the horizontal center line, so they only mirror across to red.
const baseStructures: StructureSpot[] = [
  { role: 'daBase', team: 1, lane: null, pos: { x: 1100, y: 3500 } },
  { role: 'baseShootie', team: 1, lane: null, pos: { x: 1650, y: 3500 } },
];

// Blue's top-lane Chud route to the river: out beside Da Base, up the climb, along the top edge.
const blueTopToRiver: Vec2[] = [
  { x: 1350, y: 3000 },
  { x: 2000, y: 1450 },
  { x: 2150, y: 1150 },
  { x: 6000, y: 1100 },
];
const topLane: Vec2[] = [...blueTopToRiver, ...blueTopToRiver.slice(0, -1).reverse().map((p) => ({ x: W - p.x, y: p.y }))];

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
  id: 'rift',
  theme: 'classic',
  width: W,
  height: H,
  cellSize: 50,
  ground: mirror4(quadrantGround, (g, mx, my) => ({ ...g, shape: mirrorShape(g.shape, W, H, mx, my) })),
  blockers: mirror4(quadrantBlockers, (s, mx, my) => mirrorShape(s, W, H, mx, my)),
  brush: mirror4(quadrantBrush, (s, mx, my) => mirrorShape(s, W, H, mx, my)),
  structures: [
    ...mirror4(quadrantStructures, mirrorStructure),
    ...baseStructures.flatMap((s) => [s, mirrorStructure(s, true, false)]),
  ],
  camps: [false, true].flatMap((mx) =>
    [false, true].flatMap((my) =>
      quadrantCamps.map((c) => ({
        kind: c.kinds[my ? 1 : 0],
        pos: { x: mx ? W - c.pos.x : c.pos.x, y: my ? H - c.pos.y : c.pos.y },
        side: (mx ? 2 : 1) as PlayerTeam,
      })),
    ),
  ),
  lanes: {
    top: topLane,
    bot: topLane.map((p) => ({ x: p.x, y: H - p.y })),
  },
  spawns: {
    1: { x: 500, y: 3500 },
    2: { x: W - 500, y: 3500 },
  },
  // Every site sits on the river's center line (or runs symmetrically across it), the same distance from
  // both Da Bases. Each kind has a top and a bottom one; which is used is rolled per event.
  eventSites: [false, true].flatMap((my) => {
    const y = (v: number) => (my ? H - v : v);
    return [
      // Three Chuds in a Coat amble up and down the river, between the lane mouth and the crab's stretch.
      { kind: 'boss', pos: { x: W / 2, y: y(2000) }, path: [{ x: W / 2, y: y(1650) }, { x: W / 2, y: y(2400) }] },
      // Old Wick's cart: through the jungle at the height of the camps, from blue's side path to red's.
      { kind: 'escort', pos: { x: W / 2, y: y(2000) }, path: [{ x: 3300, y: y(2000) }, { x: 4350, y: y(1980) }, { x: 5350, y: y(1960) }, { x: W / 2, y: y(2000) }, { x: W - 5350, y: y(1960) }, { x: W - 4350, y: y(1980) }, { x: W - 3300, y: y(2000) }] },
      // The Royal Tax Stall: in the river by the lane's mouth, out of the outer Shooties' reach.
      { kind: 'capture', pos: { x: W / 2, y: y(1650) } },
    ] satisfies EventSite[];
  }),
};
