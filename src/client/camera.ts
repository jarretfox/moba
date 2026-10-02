import type { Container } from 'pixi.js';
import { clamp, type Vec2 } from '../shared/math';

/** Pixels from the window edge that start panning when the camera is unlocked. */
const EDGE = 18;
/** Screen pixels per second. */
const PAN_SPEED = 1500;

/**
 * How much of the map the screen shows, in world units, zoomed all the way out: about what League or Dota
 * show at their furthest (a champion sees 1100, so their sight reaches about to the edges of the screen).
 * It's the same on every screen: a bigger monitor shows the same patch of map, larger, not more of it.
 */
export const MAX_VIEW = { w: 2400, h: 1350 };
/** And zoomed all the way in: this many world units across. */
export const MIN_VIEW_W = 1000;
/** Where a match starts. */
const START_VIEW_W = 1500;

/**
 * The zoom that shows `view` world units across, but never more than the furthest-out view in either
 * direction: a tall or very wide screen gets the same limit, not extra map past it.
 */
export function fitZoom(view: number, screenW: number, screenH: number): number {
  const w = Math.min(view, MAX_VIEW.w);
  const h = (w * MAX_VIEW.h) / MAX_VIEW.w;
  return Math.max(screenW / w, screenH / h);
}

export class Camera {
  x = 0;
  y = 0;
  /** Screen pixels per world unit, worked out each frame from `view` and the screen's size. */
  zoom = 0.9;
  locked = true;
  /** How many world units across the screen shows (what the mouse wheel changes). */
  private view = START_VIEW_W;
  /** Current shake strength in screen pixels; decays on its own. */
  private trauma = 0;
  private shakeTime = 0;
  /** A shove in screen pixels, springing back. */
  private kickX = 0;
  private kickY = 0;
  /** A brief zoom-in, as a share of the zoom. */
  private punchZ = 0;

  constructor(private readonly bounds: { width: number; height: number }) {}

  update(dt: number, follow: Vec2 | null, mouse: Vec2 | null, screenW: number, screenH: number, centerHeld: boolean): void {
    this.zoom = fitZoom(this.view, screenW, screenH);
    if (follow && (this.locked || centerHeld)) {
      this.x = follow.x;
      this.y = follow.y;
    } else if (mouse) {
      const step = (PAN_SPEED * dt) / this.zoom;
      if (mouse.x <= EDGE) this.x -= step;
      else if (mouse.x >= screenW - EDGE) this.x += step;
      if (mouse.y <= EDGE) this.y -= step;
      else if (mouse.y >= screenH - EDGE) this.y += step;
    }
    this.x = clamp(this.x, 0, this.bounds.width);
    this.y = clamp(this.y, 0, this.bounds.height);
  }

  /** Kick the camera: `amount` is roughly the shake in screen pixels. Overlapping kicks don't stack past the biggest. */
  shake(amount: number): void {
    this.trauma = Math.min(26, Math.max(this.trauma, amount));
  }

  /** Shove the view (screen pixels), e.g. away from whatever just hit you; it springs back. */
  kick(dx: number, dy: number): void {
    this.kickX += dx;
    this.kickY += dy;
    const m = Math.hypot(this.kickX, this.kickY);
    if (m > 30) {
      this.kickX *= 30 / m;
      this.kickY *= 30 / m;
    }
  }

  /** A quick zoom-in on something huge (0.03 = 3%). */
  punch(amount: number): void {
    this.punchZ = Math.max(this.punchZ, amount);
  }

  /** Zooms in (factor > 1) or out, within the limits. */
  zoomBy(factor: number): void {
    this.view = clamp(this.view / factor, MIN_VIEW_W, MAX_VIEW.w);
  }

  apply(world: Container, screenW: number, screenH: number, dt = 0): void {
    this.shakeTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 60);
    // Smooth shake from a few out-of-step sine waves, so it rattles rather than jitters.
    const sx = this.trauma * (Math.sin(this.shakeTime * 71) * 0.6 + Math.sin(this.shakeTime * 43) * 0.4);
    const sy = this.trauma * (Math.sin(this.shakeTime * 59 + 1) * 0.6 + Math.sin(this.shakeTime * 37 + 2) * 0.4);
    const back = Math.exp(-dt * 14);
    this.kickX *= back;
    this.kickY *= back;
    this.punchZ *= Math.exp(-dt * 9);
    const zoom = this.zoom * (1 + this.punchZ);
    world.scale.set(zoom);
    world.position.set(screenW / 2 - this.x * zoom + sx + this.kickX, screenH / 2 - this.y * zoom + sy + this.kickY);
  }

  toWorld(sx: number, sy: number, screenW: number, screenH: number): Vec2 {
    return { x: (sx - screenW / 2) / this.zoom + this.x, y: (sy - screenH / 2) / this.zoom + this.y };
  }
}
