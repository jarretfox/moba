import { Container, Graphics, Text } from 'pixi.js';
import type { GroundStyle, MapData } from '../../shared/map/mapData';
import type { NavGrid } from '../../shared/map/navGrid';
import type { Shape } from '../../shared/map/shapes';

const COLORS = {
  void: 0x121811,
  wall: 0x1a2317,
  wallEdge: 0x0c110b,
  blueBase: 0x323d57,
  redBase: 0x573536,
  lane: 0x6b5a42,
  jungle: 0x2c4327,
  river: 0x285468,
} as const;

/** Draw order: later styles paint over earlier ones where they overlap. */
const STYLE_ORDER: GroundStyle[] = ['jungle', 'base', 'lane', 'river'];

export function buildMap(map: MapData): Container {
  const root = new Container();
  const g = new Graphics();
  root.addChild(g);

  g.rect(-2000, -2000, map.width + 4000, map.height + 4000).fill(COLORS.void);

  for (const style of STYLE_ORDER) {
    for (const piece of map.ground) {
      if (piece.style !== style) continue;
      drawShape(g, piece.shape, groundColor(style, piece.shape, map));
    }
  }
  // Outlines first, fills on top: overlapping wall pieces then read as one solid mass without seams.
  for (const b of map.blockers) strokeShape(g, b, COLORS.wallEdge);
  for (const b of map.blockers) drawShape(g, b, COLORS.wall);

  const label = (text: string, x: number, y: number) => {
    const t = new Text({
      text,
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 56, fontWeight: '800', fill: 0xffffff, letterSpacing: 4 },
    });
    t.alpha = 0.1;
    t.anchor.set(0.5);
    t.position.set(x, y);
    root.addChild(t);
  };
  label('DA BASE', map.spawns[1].x + 600, map.spawns[1].y);
  label('DA BASE', map.spawns[2].x - 600, map.spawns[2].y);
  label('THE WARDEN', map.width / 2, map.height / 2);
  label('TOP LANE', map.width / 2, 1100);
  label('BOT LANE', map.width / 2, map.height - 1100);

  return root;
}

/** Debug overlay: green where units can walk, amber where the clearance margin trims the ground. */
export function buildNavOverlay(grid: NavGrid): Graphics {
  const g = new Graphics();
  const s = grid.cellSize;
  for (let cy = 0; cy < grid.rows; cy++) {
    for (let cx = 0; cx < grid.cols; cx++) {
      const i = cy * grid.cols + cx;
      if (grid.walkable[i]) g.rect(cx * s + 1, cy * s + 1, s - 2, s - 2).fill({ color: 0x4ade80, alpha: 0.12 });
      else if (grid.open[i]) g.rect(cx * s + 1, cy * s + 1, s - 2, s - 2).fill({ color: 0xf59e0b, alpha: 0.25 });
    }
  }
  return g;
}

function groundColor(style: GroundStyle, shape: Shape, map: MapData): number {
  if (style !== 'base') return COLORS[style];
  const x = shape.type === 'capsule' ? shape.ax : shape.x;
  return x < map.width / 2 ? COLORS.blueBase : COLORS.redBase;
}

function drawShape(g: Graphics, s: Shape, color: number): void {
  switch (s.type) {
    case 'circle':
      g.circle(s.x, s.y, s.r).fill(color);
      return;
    case 'rect':
      g.rect(s.x, s.y, s.w, s.h).fill(color);
      return;
    case 'capsule': {
      g.circle(s.ax, s.ay, s.r).fill(color);
      g.circle(s.bx, s.by, s.r).fill(color);
      const len = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1;
      const nx = (-(s.by - s.ay) / len) * s.r;
      const ny = ((s.bx - s.ax) / len) * s.r;
      g.poly([s.ax + nx, s.ay + ny, s.bx + nx, s.by + ny, s.bx - nx, s.by - ny, s.ax - nx, s.ay - ny]).fill(color);
      return;
    }
  }
}

function strokeShape(g: Graphics, s: Shape, color: number): void {
  const style = { width: 14, color };
  if (s.type === 'circle') g.circle(s.x, s.y, s.r).stroke(style);
  else if (s.type === 'rect') g.rect(s.x, s.y, s.w, s.h).stroke(style);
}
