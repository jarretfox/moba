import type { Container } from 'pixi.js';
import { clamp, type Vec2 } from '../shared/math';

/** Pixels from the window edge that start panning when the camera is unlocked. */
const EDGE = 18;
/** Screen pixels per second. */
const PAN_SPEED = 1500;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.3;

export class Camera {
  x = 0;
  y = 0;
  zoom = 0.9;
  locked = true;
  /** Current shake strength in screen pixels; decays on its own. */
  private trauma = 0;
  private shakeTime = 0;

  constructor(private readonly bounds: { width: number; height: number }) {}

  update(dt: number, follow: Vec2 | null, mouse: Vec2 | null, screenW: number, screenH: number, centerHeld: boolean): void {
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

  zoomBy(factor: number): void {
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  }

  apply(world: Container, screenW: number, screenH: number, dt = 0): void {
    this.shakeTime += dt;
    this.trauma = Math.max(0, this.trauma - dt * 60);
    // Smooth shake from a few out-of-step sine waves, so it rattles rather than jitters.
    const sx = this.trauma * (Math.sin(this.shakeTime * 71) * 0.6 + Math.sin(this.shakeTime * 43) * 0.4);
    const sy = this.trauma * (Math.sin(this.shakeTime * 59 + 1) * 0.6 + Math.sin(this.shakeTime * 37 + 2) * 0.4);
    world.scale.set(this.zoom);
    world.position.set(screenW / 2 - this.x * this.zoom + sx, screenH / 2 - this.y * this.zoom + sy);
  }

  toWorld(sx: number, sy: number, screenW: number, screenH: number): Vec2 {
    return { x: (sx - screenW / 2) / this.zoom + this.x, y: (sy - screenH / 2) / this.zoom + this.y };
  }
}
