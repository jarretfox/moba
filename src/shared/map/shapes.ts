import { segmentDistance } from '../math';

export type Shape =
  | { type: 'circle'; x: number; y: number; r: number }
  | { type: 'rect'; x: number; y: number; w: number; h: number }
  | { type: 'capsule'; ax: number; ay: number; bx: number; by: number; r: number };

export function shapeContains(s: Shape, px: number, py: number): boolean {
  switch (s.type) {
    case 'circle':
      return (px - s.x) ** 2 + (py - s.y) ** 2 <= s.r * s.r;
    case 'rect':
      return px >= s.x && px <= s.x + s.w && py >= s.y && py <= s.y + s.h;
    case 'capsule':
      return segmentDistance({ x: px, y: py }, { x: s.ax, y: s.ay }, { x: s.bx, y: s.by }).d <= s.r;
  }
}

/** Mirror a shape across the vertical (mx) and/or horizontal (my) center line of a w×h map. */
export function mirrorShape(s: Shape, w: number, h: number, mx: boolean, my: boolean): Shape {
  const fx = (x: number) => (mx ? w - x : x);
  const fy = (y: number) => (my ? h - y : y);
  switch (s.type) {
    case 'circle':
      return { ...s, x: fx(s.x), y: fy(s.y) };
    case 'rect':
      return { ...s, x: mx ? w - s.x - s.w : s.x, y: my ? h - s.y - s.h : s.y };
    case 'capsule':
      return { ...s, ax: fx(s.ax), ay: fy(s.ay), bx: fx(s.bx), by: fy(s.by) };
  }
}
