// Sound effects, synthesized on the fly with Web Audio: no files to load or license, and every sound is
// a few lines of oscillators, noise and envelopes below.

export type SoundName =
  | 'swing'
  | 'shoot'
  | 'hit'
  | 'cast'
  | 'magic'
  | 'boom'
  | 'whoosh'
  | 'dig'
  | 'roar'
  | 'death'
  | 'smallDeath'
  | 'tower'
  | 'levelUp'
  | 'gold'
  | 'kill'
  | 'warn'
  | 'recall'
  | 'snap'
  | 'click'
  | 'buy'
  | 'victory'
  | 'defeat'
  /** The announcer: good news for your side, and bad. */
  | 'fanfare'
  | 'toll';

/** The same sound won't restart sooner than this, so a lane full of Chuds doesn't become a buzz. */
const MIN_GAP: Partial<Record<SoundName, number>> = { swing: 0.06, shoot: 0.06, hit: 0.07, smallDeath: 0.09, gold: 0.12, tower: 0.1, cast: 0.05 };
/** At most this many sounds start in any quarter second. */
const VOICE_CAP = 14;
const MUTE_KEY = 'moba.muted';

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // storage blocked: the setting just won't stick
  }
}

export class Sound {
  muted = loadMuted();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly lastPlayed = new Map<SoundName, number>();
  private recent: number[] = [];

  constructor() {
    // Browsers only allow audio after the player has interacted with the page.
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    saveMuted(this.muted);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  /** Play a sound at `gain` (0..1), panned left/right by `pan` (-1..1). */
  play(name: SoundName, gain = 1, pan = 0): void {
    if (this.muted || gain < 0.03) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < (MIN_GAP[name] ?? 0)) return;
    this.recent = this.recent.filter((t) => now - t < 0.25);
    if (this.recent.length >= VOICE_CAP) return;
    this.recent.push(now);
    this.lastPlayed.set(name, now);

    const out = ctx.createGain();
    out.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner).connect(this.master!);
    RECIPES[name](new Voice(ctx, out, this.noise!), now);
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      // A gentle compressor so a big fight gets fuller rather than clipping.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(this.ctx.destination);
      this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }
}

/** Building blocks for one sound: tones and noise with simple envelopes, all feeding one output. */
class Voice {
  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly noiseBuf: AudioBuffer,
  ) {}

  /** A pitched tone gliding from f0 to f1 over `dur`, fading out. */
  tone(at: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.005): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    o.connect(this.env(at, dur, vol, attack));
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** Filtered noise, the filter sweeping from f0 to f1: swooshes, impacts, dirt. */
  noise(at: number, filter: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1, attack = 0.003): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    src.connect(f).connect(this.env(at, dur, vol, attack));
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  private env(at: number, dur: number, vol: number, attack: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    g.connect(this.out);
    return g;
  }
}

/** Notes for the little jingles. */
const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, A4: 440, F4: 349.23, D4: 293.66, Bb4: 466.16, G4: 392 };

const RECIPES: Record<SoundName, (v: Voice, t: number) => void> = {
  swing: (v, t) => v.noise(t, 'bandpass', 2400, 600, 0.09, 0.5, 2),
  shoot: (v, t) => {
    v.tone(t, 'triangle', 900, 320, 0.08, 0.25);
    v.noise(t, 'highpass', 3000, 1500, 0.05, 0.15);
  },
  hit: (v, t) => {
    v.tone(t, 'sine', 170, 60, 0.12, 0.5);
    v.noise(t, 'lowpass', 1800, 400, 0.06, 0.3);
  },
  cast: (v, t) => v.tone(t, 'triangle', 320, 760, 0.16, 0.22, 0.01),
  magic: (v, t) => {
    v.tone(t, 'sine', 880, 1320, 0.28, 0.16, 0.02);
    v.tone(t, 'sine', 893, 1100, 0.28, 0.12, 0.02);
  },
  boom: (v, t) => {
    v.tone(t, 'sine', 90, 35, 0.45, 0.8);
    v.noise(t, 'lowpass', 900, 120, 0.4, 0.6);
  },
  whoosh: (v, t) => v.noise(t, 'bandpass', 500, 2600, 0.24, 0.35, 1.5, 0.05),
  dig: (v, t) => {
    v.noise(t, 'lowpass', 700, 200, 0.3, 0.5, 1, 0.02);
    v.noise(t + 0.08, 'bandpass', 900, 300, 0.2, 0.25, 3);
  },
  roar: (v, t) => {
    v.tone(t, 'sawtooth', 140, 85, 0.6, 0.18, 0.05);
    v.tone(t, 'sawtooth', 147, 80, 0.6, 0.14, 0.05);
    v.noise(t, 'bandpass', 600, 250, 0.55, 0.3, 1.2, 0.05);
  },
  death: (v, t) => {
    v.tone(t, 'sawtooth', 420, 70, 0.5, 0.2, 0.01);
    v.noise(t, 'lowpass', 1200, 200, 0.35, 0.2);
  },
  smallDeath: (v, t) => v.tone(t, 'square', 300, 90, 0.12, 0.08),
  tower: (v, t) => {
    v.tone(t, 'square', 230, 110, 0.2, 0.14);
    v.noise(t, 'bandpass', 1400, 500, 0.18, 0.2, 2);
  },
  levelUp: (v, t) => {
    v.tone(t, 'triangle', NOTE.C5, NOTE.C5, 0.14, 0.3);
    v.tone(t + 0.09, 'triangle', NOTE.E5, NOTE.E5, 0.14, 0.3);
    v.tone(t + 0.18, 'triangle', NOTE.G5, NOTE.G5, 0.14, 0.3);
    v.tone(t + 0.27, 'triangle', NOTE.C6, NOTE.C6, 0.3, 0.3);
  },
  gold: (v, t) => {
    v.tone(t, 'sine', 1320, 1320, 0.07, 0.18);
    v.tone(t + 0.06, 'sine', 1760, 1760, 0.12, 0.18);
  },
  kill: (v, t) => {
    for (const f of [NOTE.C5, NOTE.E5, NOTE.G5]) v.tone(t, 'triangle', f, f, 0.6, 0.12, 0.01);
    v.tone(t + 0.12, 'sine', NOTE.C6, NOTE.C6, 0.5, 0.1);
  },
  warn: (v, t) => {
    v.tone(t, 'square', 180, 170, 0.22, 0.08, 0.02);
    v.tone(t + 0.25, 'square', 180, 170, 0.22, 0.08, 0.02);
  },
  recall: (v, t) => v.tone(t, 'sine', 400, 1200, 0.6, 0.15, 0.1),
  snap: (v, t) => {
    v.noise(t, 'highpass', 4000, 2000, 0.05, 0.4);
    v.tone(t, 'square', 600, 200, 0.06, 0.15);
  },
  click: (v, t) => v.tone(t, 'square', 1200, 900, 0.03, 0.08),
  buy: (v, t) => {
    v.tone(t, 'sine', 1046, 1046, 0.06, 0.2);
    v.tone(t + 0.05, 'sine', 1568, 1568, 0.16, 0.2);
  },
  victory: (v, t) => {
    const tune = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
    tune.forEach((f, i) => v.tone(t + i * 0.18, 'triangle', f, f, i === 3 ? 0.9 : 0.2, 0.3));
  },
  fanfare: (v, t) => {
    for (const f of [NOTE.G4, NOTE.C5, NOTE.E5]) v.tone(t, 'sawtooth', f, f, 0.18, 0.045, 0.01);
    for (const f of [NOTE.C5, NOTE.E5, NOTE.G5]) v.tone(t + 0.16, 'sawtooth', f, f, 0.7, 0.05, 0.02);
    v.tone(t + 0.16, 'triangle', NOTE.C6, NOTE.C6, 0.8, 0.12, 0.02);
  },
  toll: (v, t) => {
    v.tone(t, 'sine', 110, 108, 1.6, 0.32, 0.005);
    v.tone(t, 'triangle', 220, 216, 0.9, 0.12, 0.005);
    v.tone(t, 'sine', 297, 294, 0.7, 0.08, 0.005);
  },
  defeat: (v, t) => {
    const tune = [NOTE.A4, NOTE.F4, NOTE.D4];
    tune.forEach((f, i) => v.tone(t + i * 0.3, 'triangle', f, f * (i === 2 ? 0.94 : 1), i === 2 ? 1.0 : 0.3, 0.28));
  },
};
