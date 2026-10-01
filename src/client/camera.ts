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
  /** A shove in screen pixels, springing back. */
  private kickX = 0;
  private kickY = 0;
  /** A brief zoom-in, as a share of the zoom. */
  private punchZ = 0;

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

  zoomBy(factor: number): void {
    this.zoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
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
