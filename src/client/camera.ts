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

  zoomBy(factor: number): void {
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  }

  apply(world: Container, screenW: number, screenH: number): void {
    world.scale.set(this.zoom);
    world.position.set(screenW / 2 - this.x * this.zoom, screenH / 2 - this.y * this.zoom);
  }

  toWorld(sx: number, sy: number, screenW: number, screenH: number): Vec2 {
    return { x: (sx - screenW / 2) / this.zoom + this.x, y: (sy - screenH / 2) / this.zoom + this.y };
  }
}
