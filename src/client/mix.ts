// The mixing desk behind audio.ts, in plain arithmetic so it can be tested without Web Audio: which bus a
// sound belongs on and how it sits there, how distance dulls and wets a sound, the crowd limit that keeps
// a big fight readable, the pitch wobble that stops repeats sounding like a machine, and the room itself
// (the impulse response the shared reverb convolves everything with).

/** Effects happen in the world; the interface is in your ear; voices sit between, a little wetter. */
export type Bus = 'fx' | 'ui' | 'voice';

/** How a sound sits in the mix. Its recipe (audio.ts) says what it sounds like. */
export interface SoundInfo {
  bus: Bus;
  /** Reverb send, 0–1, on top of whatever distance adds. */
  send?: number;
  /** How far the music and ambience dip under it, 0–1: only for the big, close ones. */
  duck?: number;
  /** Random pitch wobble either way, in cents (0 for jingles that have to stay in tune). */
  pitch?: number;
  /** Won't start again sooner than this, in seconds. */
  gap?: number;
  /** Starts even when the quarter second is full: the announcer, the interface. */
  priority?: boolean;
}

/** What each bus assumes unless a sound says otherwise. */
export const BUS_DEFAULTS: Record<Bus, Required<Omit<SoundInfo, 'bus'>>> = {
  fx: { send: 0.12, duck: 0, pitch: 40, gap: 0.04, priority: false },
  ui: { send: 0.04, duck: 0, pitch: 0, gap: 0.02, priority: true },
  voice: { send: 0.2, duck: 0, pitch: 25, gap: 0, priority: false },
};

export function resolveInfo(info: SoundInfo): Required<SoundInfo> {
  return { ...BUS_DEFAULTS[info.bus], ...info };
}

/** At most this many sounds start in any quarter second (the interface and the announcer don't count). */
export const VOICE_CAP = 16;

/**
 * Keeps a crowd of sounds readable: the same sound won't restart inside its gap (a lane of Chuds would be
 * a buzz otherwise), and only so many start in any quarter second. Priority sounds skip the crowd limit
 * but keep their own gap.
 */
export class RateLimiter {
  private readonly last = new Map<string, number>();
  private recent: number[] = [];

  constructor(
    private readonly cap = VOICE_CAP,
    private readonly window = 0.25,
  ) {}

  /** Whether `name` may start at `now`, and books it if so. */
  allow(name: string, now: number, gap: number, priority = false): boolean {
    if (now - (this.last.get(name) ?? -Infinity) < gap) return false;
    this.recent = this.recent.filter((t) => now - t < this.window);
    if (!priority && this.recent.length >= this.cap) return false;
    this.recent.push(now);
    this.last.set(name, now);
    return true;
  }
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

/** Where a sound is on your screen: how loud it is, which side it's on, and how far off (0 here, 1 at the edge of hearing). */
export interface Placement {
  gain: number;
  pan: number;
  far: number;
}

/**
 * Places a sound by its offset from the middle of the screen, with `halfView` half the screen's width in
 * world units. Full volume across the middle of the view, fading to nothing a screen's width out.
 */
export function spatialize(dx: number, dy: number, halfView: number): Placement {
  const d = Math.hypot(dx, dy);
  return {
    gain: clamp(1 - (d - halfView * 0.6) / (halfView * 1.4)),
    pan: clamp(dx / halfView, -1, 1) * 0.6,
    far: clamp(d / (halfView * 2)),
  };
}

export interface DistanceCues {
  /** Lowpass cutoff in Hz: things far off lose their top end. */
  lowpass: number;
  /** Extra reverb: things far off are mostly room. */
  send: number;
}

/** Near sounds are left alone; past a fifth of the way out they get duller and wetter the further they are. */
export function distanceCues(far: number): DistanceCues {
  const k = clamp((far - 0.2) / 0.8);
  return { lowpass: 1200 + 16800 * (1 - k) ** 2, send: 0.35 * k };
}

/** A playback-rate multiplier up to `cents` either way, so the hundredth swing sounds like a swing, not a sample. */
export function pitchJitter(cents: number, rand: () => number = Math.random): number {
  if (cents <= 0) return 1;
  return 2 ** (((rand() * 2 - 1) * cents) / 1200);
}

export interface Levels {
  master: number;
  fx: number;
  ui: number;
  voice: number;
  ambience: number;
  music: number;
}

/** The bus gains for the settings: everything but the music follows the effects slider; mute silences the master. */
export function busLevels(s: { master: number; music: number; effects: number }, muted: boolean): Levels {
  return {
    master: muted ? 0 : 0.6 * s.master,
    fx: s.effects,
    ui: 0.9 * s.effects,
    voice: s.effects,
    ambience: s.effects,
    music: s.music,
  };
}

/**
 * The room: a stereo impulse response for the shared reverb. A short pre-delay, a handful of early
 * reflections (placed a little differently in each ear), then a dense tail dying away over `seconds`,
 * its top end going first. Made from noise, so there's no file.
 */
export function impulseResponse(sampleRate: number, seconds: number, rand: () => number = Math.random): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const len = Math.floor(sampleRate * seconds);
  const pre = Math.floor(sampleRate * 0.012);
  const early = [0.017, 0.023, 0.031, 0.043, 0.059, 0.071];
  const channel = (ch: number): Float32Array<ArrayBuffer> => {
    const d = new Float32Array(len);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      // The later the noise comes, the more it's smoothed: the highs die first, as in a real hall.
      lp += (rand() * 2 - 1 - lp) * (0.75 - 0.6 * t);
      d[i] = lp * Math.exp(-5.5 * t) * (1 - t);
    }
    early.forEach((s, k) => {
      const at = pre + Math.floor(sampleRate * (s + (ch ? 0.004 : 0) * (k % 2 ? 1 : -1)));
      if (at < len) d[at] += (k % 2 ? -1 : 1) * 0.5 * Math.exp(-k * 0.35);
    });
    return d;
  };
  return [channel(0), channel(1)];
}
