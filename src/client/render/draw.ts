import type { Graphics } from 'pixi.js';

/**
 * Starts a fresh arc. Pixi's own `arc()` carries on from wherever the last path ended (often (0, 0)
 * after a circle or polygon), which draws a stray line to the start of the arc.
 */
export function arc(g: Graphics, x: number, y: number, r: number, from: number, to: number, counterclockwise = false): Graphics {
  return g.moveTo(x + Math.cos(from) * r, y + Math.sin(from) * r).arc(x, y, r, from, to, counterclockwise);
}
