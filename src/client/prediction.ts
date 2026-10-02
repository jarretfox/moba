import { dist, type Vec2 } from '../shared/math';

/**
 * Your own champion, on your own screen, a step ahead of the host. Playing over the internet, a click
 * has to reach the host and its answer come back before the host's copy of you moves, and then the
 * screen plays a little behind that for smoothness: a quarter of a second or more of walking in place.
 * So when you order a walk, your champion sets off at once along the same path the host will take, and
 * quietly settles back onto the host's position once it's had time to catch up. If the two disagree by
 * more than the lag can explain (a stun, a knock-back, a crowd in the way), the host's word wins.
 */
export class SelfPrediction {
  private pos: Vec2 | null = null;
  private path: Vec2[] = [];
  private arrivedAt = -Infinity;
  /** Which way we're walking, for facing. */
  heading: number | null = null;

  /** `lag`: about how far behind (in seconds) the host's newest word on us is when it gets here. */
  constructor(private readonly lag: number) {}

  /** A walk was ordered: set off along `path` (from wherever we're drawn now) at once. */
  walk(path: Vec2[]): void {
    this.path = path.map((p) => ({ ...p }));
    this.arrivedAt = -Infinity;
  }

  /** Something else was ordered (an attack, a cast, a stop): the host's word goes from here. */
  release(): void {
    this.path = [];
    this.arrivedAt = -Infinity;
  }

  get walking(): boolean {
    return this.path.length > 0;
  }

  /**
   * Where to draw us this frame. `shown` is where the host has us as played back (smooth, but behind);
   * `newest` is its latest word. `free`: we can walk (not dead, stunned, rooted or dashing).
   */
  update(dt: number, now: number, shown: Vec2, newest: Vec2, speed: number, free: boolean): Vec2 {
    if (!free) {
      this.pos = null;
      this.path = [];
      this.heading = null;
      return shown;
    }
    if (!this.pos) {
      if (!this.path.length) return shown;
      this.pos = { ...shown };
    }
    const pos = this.pos;
    this.heading = null;
    if (this.path.length) {
      let budget = speed * dt;
      while (budget > 0 && this.path.length) {
        const next = this.path[0];
        const d = dist(pos, next);
        if (d > 1e-6) this.heading = Math.atan2(next.y - pos.y, next.x - pos.x);
        if (d <= budget) {
          pos.x = next.x;
          pos.y = next.y;
          this.path.shift();
          budget -= d;
        } else {
          pos.x += ((next.x - pos.x) / d) * budget;
          pos.y += ((next.y - pos.y) / d) * budget;
          budget = 0;
        }
      }
      if (!this.path.length) this.arrivedAt = now;
      // Further from the host than lag can explain: something stopped us there. Drift back to it.
      if (dist(pos, newest) > speed * (this.lag + 0.15) + 60) this.ease(pos, newest, dt, 6);
      return { ...pos };
    }
    // Arrived: hold still while the host's copy walks up to us, then settle onto it.
    if (now - this.arrivedAt > this.lag + 0.3) {
      this.ease(pos, shown, dt, 10);
      if (dist(pos, shown) < 0.5) this.pos = null;
    }
    return { ...pos };
  }

  private ease(pos: Vec2, to: Vec2, dt: number, rate: number): void {
    const k = 1 - Math.exp(-dt * rate);
    pos.x += (to.x - pos.x) * k;
    pos.y += (to.y - pos.y) * k;
  }
}
