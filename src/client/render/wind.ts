import type { Weather } from '../../shared/weather';

// The wind over the map: what makes the brush lean, the banners flap, the leaves stir and the grass round
// a champion's legs sway. A gentle breeze on a clear evening, next to nothing in the mist, more in the
// rain, and in a storm a strong wind that comes in gusts. Everywhere sways a little out of step, so a
// field of grass ripples rather than tilting all at once.

const STRENGTH: Record<Weather, number> = { clear: 0.55, mist: 0.3, rain: 1, storm: 1.7 };

export class Wind {
  private time = Math.random() * 100;
  /** How hard it's blowing (about 0.3 to 1.7). */
  strength = STRENGTH.clear;

  setWeather(kind: Weather | null): void {
    this.strength = STRENGTH[kind ?? 'clear'];
  }

  update(dt: number): void {
    this.time += dt;
  }

  /** Gusts: 1 most of the time, rising now and then (hard, in a storm). */
  gust(): number {
    const g = Math.max(0, Math.sin(this.time * 0.31) * Math.sin(this.time * 0.17 + 1));
    return 1 + g * (this.strength > 1.2 ? 1.4 : 0.6);
  }

  /** How far things lean at a spot right now, about −1 to 1 times the strength. */
  at(x: number, y: number): number {
    return Math.sin(this.time * 1.7 + x * 0.004 + y * 0.0025) * this.strength * this.gust();
  }

  /** A quicker flutter (flags, leaves) at a spot. */
  flutter(x: number, phase = 0): number {
    return Math.sin(this.time * 7.5 + x * 0.01 + phase) * (0.4 + 0.6 * this.strength);
  }
}
