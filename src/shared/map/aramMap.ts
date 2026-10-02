import type { Vec2 } from '../math';
import type { GroundPiece, MapData, StructureSpot } from './mapData';
import type { Shape } from './shapes';

// The Howling Hollow, for ARAM: one long lane through a haunted graveyard, Da Base at each end. Authored
// for blue's (left) half and mirrored across the middle, like the Rift.
//
//    trees    alcove(brush)            graves                alcove(brush)    trees
//  [D s O i  o]======pumpkins======[ graveyard plaza ]======pumpkins======[o  i O s D]
//    trees    alcove(brush)            graves                alcove(brush)    trees
//
// D = Da Base, s = base Shootie, O = Oakner, i = inner Shootie, o = outer Shootie

const W = 8400;
const H = 3400;
const Y = H / 2;

const mirrorX = (x: number) => W - x;

function mirrorShape(s: Shape): Shape {
  switch (s.type) {
    case 'circle':
      return { ...s, x: mirrorX(s.x) };
    case 'rect':
      return { ...s, x: W - s.x - s.w };
    case 'capsule':
      return { ...s, ax: mirrorX(s.ax), bx: mirrorX(s.bx) };
  }
}

const both = <T>(items: T[], mirror: (t: T) => T): T[] => [...items, ...items.map(mirror)];

const halfGround: GroundPiece[] = [
  { style: 'base', shape: { type: 'circle', x: 1000, y: Y, r: 900 } },
  // The lane: wide, straight, flagged with old grave slabs.
  { style: 'lane', shape: { type: 'capsule', ax: 1500, ay: Y, bx: 4200, by: Y, r: 560 } },
  // Grassy alcoves off the lane, with brush to lurk in.
  { style: 'jungle', shape: { type: 'circle', x: 2450, y: Y - 560, r: 360 } },
  { style: 'jungle', shape: { type: 'circle', x: 2450, y: Y + 560, r: 360 } },
  { style: 'jungle', shape: { type: 'circle', x: 3550, y: Y - 520, r: 300 } },
  { style: 'jungle', shape: { type: 'circle', x: 3550, y: Y + 520, r: 300 } },
];

// The middle: a wider graveyard plaza (not mirrored: it straddles the line).
const plaza: GroundPiece = { style: 'lane', shape: { type: 'circle', x: W / 2, y: Y, r: 760 } };

const halfBlockers: Shape[] = [
  // Tumbled tombs at the lane's edges, splitting the alcoves from the lane a little.
  { type: 'circle', x: 3050, y: Y - 470, r: 130 },
  { type: 'circle', x: 3050, y: Y + 470, r: 130 },
  // A crypt at each side of the plaza.
  { type: 'rect', x: 3780, y: Y - 700, w: 220, h: 160 },
  { type: 'rect', x: 3780, y: Y + 540, w: 220, h: 160 },
];

const halfBrush: Shape[] = [
  { type: 'circle', x: 2450, y: Y - 640, r: 170 },
  { type: 'circle', x: 2450, y: Y + 640, r: 170 },
  { type: 'circle', x: 3600, y: Y - 590, r: 140 },
  { type: 'circle', x: 3600, y: Y + 590, r: 140 },
];

const blueStructures: StructureSpot[] = [
  { role: 'daBase', team: 1, lane: null, pos: { x: 1000, y: Y } },
  { role: 'baseShootie', team: 1, lane: null, pos: { x: 1450, y: Y } },
  { role: 'oakner', team: 1, lane: 'mid', pos: { x: 1900, y: Y } },
  { role: 'innerShootie', team: 1, lane: 'mid', pos: { x: 2400, y: Y } },
  // Far enough back that the middle (and its pumpkins) is out of both sides' Shootie range.
  { role: 'outerShootie', team: 1, lane: 'mid', pos: { x: 2950, y: Y } },
];

const relicSpots: Vec2[] = [
  { x: 3350, y: Y - 300 },
  { x: 3350, y: Y + 300 },
  { x: 3900, y: Y - 220 },
  { x: 3900, y: Y + 220 },
];

export const ARAM_MAP: MapData = {
  id: 'aram',
  theme: 'halloween',
  aram: true,
  width: W,
  height: H,
  cellSize: 50,
  ground: [...both(halfGround, (g) => ({ ...g, shape: mirrorShape(g.shape) })), plaza],
  blockers: both(halfBlockers, mirrorShape),
  brush: both(halfBrush, mirrorShape),
  structures: both(blueStructures, (s) => ({ ...s, team: 2, pos: { x: mirrorX(s.pos.x), y: s.pos.y } })),
  camps: [],
  lanes: { mid: [{ x: 1300, y: Y }, { x: W / 2, y: Y }, { x: mirrorX(1300), y: Y }] },
  spawns: { 1: { x: 350, y: Y }, 2: { x: mirrorX(350), y: Y } },
  relics: both(relicSpots, (p) => ({ x: mirrorX(p.x), y: p.y })),
};
