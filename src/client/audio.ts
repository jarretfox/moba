// Sound effects, synthesized on the fly with Web Audio: no files to load or license, and every sound is
// a few lines of oscillators, noise and envelopes below. Music and the ambient soundscape are in music.ts.

import { Music, Soundscape } from './music';
import { onSettings, settings } from './settings';
import type { Syllable } from './voices';

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
  /** Menus: a soft tick when the pointer moves onto something you can click. */
  | 'hover'
  /** Weight under big hits: a thump you feel, a crack, and a rumble after. */
  | 'impact'
  /** The biggest ones: slams that shake the ground. */
  | 'quake'
  /** An ultimate going off: a rush in, then a boom. */
  | 'ultimate'
  /** A Chud wave marching out. */
  | 'horn'
  /** Old Wick, the shopkeeper: a wheezy "heh heh heh", a low "ahhh...", and a no-sale buzz. */
  | 'chuckle'
  | 'murmur'
  | 'deny'
  /** A bright little chime: awards on the end screen, a new tip. */
  | 'chime'
  /** Each champion's own basic attack. */
  | 'atkBow'
  | 'atkAxe'
  | 'atkHook'
  | 'atkSpore'
  | 'atkClaw'
  | 'atkScepter'
  | 'atkPunch'
  | 'atkRig'
  | 'atkEpee'
  | 'atkCheese'
  | 'atkDagger'
  /** And a signature under every cast: a stamp, a drum, a clank, bubbles, a growl, a royal chime... */
  | 'castStamp'
  | 'castDrum'
  | 'castClank'
  | 'castBubble'
  | 'castGrowl'
  | 'castRoyal'
  | 'castGrunt'
  | 'castFlick'
  | 'castFlourish'
  | 'castAngelic'
  | 'castJingle'
  /** Your Da Base in danger. */
  | 'heartbeat'
  /** The announcer: good news for your side, and bad. */
  | 'fanfare'
  | 'toll'
  /** Map pings from your team. */
  | 'ping'
  | 'pingDanger'
  | 'pingMissing'
  /** A champion's emote or quip. */
  | 'emote'
  /** A storm's thunder, rolling in after the lightning. */
  | 'thunder';

/** The same sound won't restart sooner than this, so a lane full of Chuds doesn't become a buzz. */
const MIN_GAP: Partial<Record<SoundName, number>> = { hover: 0.05, swing: 0.06, shoot: 0.06, hit: 0.07, smallDeath: 0.09, gold: 0.12, tower: 0.1, cast: 0.05 };
/** At most this many sounds start in any quarter second. */
const VOICE_CAP = 14;
const MUTE_KEY = 'moba.muted';
const MUSIC_KEY = 'moba.musicOff';

function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function saveFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // storage blocked: the setting just won't stick
  }
}

let shared: Sound | null = null;

/** The one sound engine, shared by the menus and the match. */
export function getSound(): Sound {
  return (shared ??= new Sound());
}

export class Sound {
  muted = loadFlag(MUTE_KEY);
  musicOn = !loadFlag(MUSIC_KEY);
  private music: Music | null = null;
  private scape: Soundscape | null = null;
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
    onSettings(() => this.applyVolumes());
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    saveFlag(MUTE_KEY, this.muted);
    this.applyVolumes();
    return this.muted;
  }

  /** Master (and mute), music and effects volumes from the settings. */
  private applyVolumes(): void {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55 * settings.master, this.ctx.currentTime, 0.02);
    this.music?.setLevel(settings.music);
    this.scape?.setLevel(settings.effects);
  }

  /** Plays a sound only if audio's already running (menus: never wake audio up from a hover). */
  playIfReady(name: SoundName, gain = 1): void {
    if (this.ctx?.state === 'running') this.play(name, gain);
  }

  /** Music on or off (N); sound effects carry on. */
  toggleMusic(): boolean {
    this.musicOn = this.music ? this.music.toggle() : !this.musicOn;
    saveFlag(MUSIC_KEY, !this.musicOn);
    return this.musicOn;
  }

  /** The music dips for a moment under something huge, so it lands. */
  duck(depth: number): void {
    this.music?.duck(depth);
  }

  /** How much of a fight you're in, 0–1: brings the drums in. */
  setIntensity(v: number): void {
    this.music?.setIntensity(v);
  }

  /** Rain on the soundscape, 0–1. */
  setRain(v: number): void {
    this.scape?.setRain(v);
  }

  /** How hard the wind blows (1 = an ordinary evening), and whether it's cold (snow: no crickets). */
  setWind(k: number, cold: boolean): void {
    this.scape?.setWind(k, cold);
  }

  /** How much jungle and river is around the camera, 0–1 each: crickets and water. */
  setPlace(jungle: number, river: number): void {
    this.scape?.setPlace(jungle, river);
  }

  /** A champion talking (see voices.ts): each syllable a buzz shaped into its vowel, with breath and growl. */
  speak(syllables: readonly Syllable[], gain = 1, pan = 0): void {
    gain *= settings.effects;
    if (this.muted || gain < 0.03 || !syllables.length) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    this.recent = this.recent.filter((t) => now - t < 0.25);
    if (this.recent.length >= VOICE_CAP) return;
    this.recent.push(now);
    const out = ctx.createGain();
    out.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner).connect(this.master!);
    const v = new Voice(ctx, out, this.noise!);
    for (const s of syllables) {
      const at = now + s.at;
      if (s.breath > 0) v.noise(at, 'bandpass', 1800, 1200, 0.06, 0.1 * s.breath, 1.2);
      v.vowel(at + (s.breath > 0 ? 0.03 : 0), s.f0, s.f1, s.dur, s.vol, s.formants, 0.015);
      if (s.growl > 0) v.noise(at, 'lowpass', 520, 240, s.dur, 0.45 * s.growl * s.vol, 0.8, 0.02);
    }
  }

  /** Play a sound at `gain` (0..1), panned left/right by `pan` (-1..1). */
  play(name: SoundName, gain = 1, pan = 0): void {
    gain *= settings.effects;
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
      this.music = new Music(this.ctx, this.master, this.noise, this.musicOn);
      this.scape = new Soundscape(this.ctx, this.master);
      this.applyVolumes();
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

  /** A buzzy voice through vowel formants: mutters and chuckles. */
  vowel(at: number, f0: number, f1: number, dur: number, vol: number, formants: readonly number[], attack = 0.02): void {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    const out = this.env(at, dur, vol, attack);
    for (const f of formants) {
      const band = this.ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = f;
      band.Q.value = 5;
      o.connect(band).connect(out);
    }
    o.start(at);
    o.stop(at + dur + 0.02);
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
  hover: (v, t) => v.tone(t, 'sine', 1800, 1700, 0.025, 0.05),
  impact: (v, t) => {
    v.tone(t, 'sine', 150, 42, 0.32, 0.75, 0.003); // the thump
    v.noise(t, 'highpass', 5200, 2400, 0.045, 0.35); // the crack
    v.noise(t, 'lowpass', 1400, 220, 0.2, 0.42); // the body
    v.noise(t + 0.03, 'lowpass', 320, 70, 0.7, 0.22, 1, 0.03); // the rumble after
  },
  quake: (v, t) => {
    v.tone(t, 'sine', 85, 26, 1.1, 0.95, 0.004);
    v.tone(t, 'triangle', 60, 30, 0.6, 0.35, 0.004);
    v.noise(t, 'highpass', 3200, 1500, 0.07, 0.4);
    v.noise(t, 'lowpass', 700, 55, 1.3, 0.6, 1, 0.01);
    // Debris pattering down after.
    for (let i = 0; i < 5; i++) v.noise(t + 0.12 + i * 0.09 + Math.random() * 0.05, 'bandpass', 900 + Math.random() * 900, 300, 0.07, 0.15, 3);
  },
  horn: (v, t) => {
    for (const [dt, f, dur] of [[0, 196, 0.5], [0.42, 293.66, 0.95]] as const) {
      v.tone(t + dt, 'sawtooth', f * 0.97, f, dur, 0.06, 0.08);
      v.tone(t + dt, 'triangle', f, f, dur, 0.14, 0.06);
    }
  },
  chuckle: (v, t) => {
    // "heh heh heh heh", each one a breath and a low buzzy "eh", sinking.
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.13;
      v.noise(at, 'bandpass', 1900, 1300, 0.05, 0.07, 1.5);
      v.vowel(at + 0.02, 152 - i * 9, 130 - i * 9, 0.1, 1.1 - i * 0.14, [540, 1750], 0.01);
    }
  },
  murmur: (v, t) => {
    // "Ahhh... mmm."
    v.noise(t, 'bandpass', 1400, 900, 0.12, 0.05, 1.2, 0.03);
    v.vowel(t + 0.05, 122, 94, 0.7, 0.9, [720, 1150], 0.08);
    v.vowel(t + 0.62, 104, 86, 0.45, 0.6, [300, 900], 0.05);
  },
  deny: (v, t) => {
    v.tone(t, 'square', 220, 190, 0.08, 0.16);
    v.tone(t + 0.1, 'square', 180, 140, 0.14, 0.16);
  },
  // ── Champions' attacks
  atkBow: (v, t) => {
    v.tone(t, 'triangle', 230, 170, 0.14, 0.28); // the twang
    v.tone(t, 'sine', 460, 340, 0.08, 0.1);
    v.noise(t + 0.01, 'bandpass', 3200, 1400, 0.09, 0.18, 2); // the arrow away
  },
  atkAxe: (v, t) => {
    v.noise(t, 'bandpass', 900, 260, 0.2, 0.45, 1.2); // a heavy whoosh
    v.tone(t + 0.12, 'sine', 115, 55, 0.16, 0.4); // and a thud
  },
  atkHook: (v, t) => {
    for (let i = 0; i < 4; i++) v.noise(t + i * 0.035, 'bandpass', 4200 + i * 400, 3000, 0.035, 0.55, 4); // chain links
    v.tone(t + 0.12, 'square', 620, 420, 0.05, 0.14);
  },
  atkSpore: (v, t) => {
    v.tone(t, 'sine', 280, 720, 0.09, 0.25); // a wet pop
    v.noise(t, 'lowpass', 1200, 400, 0.1, 0.14);
  },
  atkClaw: (v, t) => {
    v.noise(t, 'bandpass', 2600, 800, 0.13, 0.35, 1.5); // the swipe
    v.noise(t, 'lowpass', 320, 160, 0.16, 0.18); // a rumble in the chest
  },
  atkScepter: (v, t) => {
    v.tone(t, 'sine', 880, 1320, 0.12, 0.16);
    v.tone(t + 0.04, 'sine', 1320, 1760, 0.12, 0.1);
  },
  atkPunch: (v, t) => {
    v.tone(t, 'sine', 150, 50, 0.13, 0.36); // a meaty thump
    v.noise(t, 'lowpass', 900, 220, 0.08, 0.22);
  },
  atkRig: (v, t) => {
    v.tone(t, 'sine', 2050, 2350, 0.06, 0.1); // the glass clinks
    v.noise(t + 0.03, 'highpass', 2600, 1200, 0.22, 0.16); // and puffs
  },
  atkEpee: (v, t) => {
    v.tone(t, 'sawtooth', 1800, 2700, 0.07, 0.05); // a thin zing
    v.noise(t, 'highpass', 6200, 3000, 0.07, 0.24);
  },
  atkCheese: (v, t) => {
    v.noise(t, 'bandpass', 1800, 700, 0.16, 0.3, 1.2);
    v.noise(t, 'highpass', 4200, 3000, 0.28, 0.07); // the blade sizzles
  },
  atkDagger: (v, t) => {
    v.noise(t, 'bandpass', 3200, 1500, 0.06, 0.55, 2);
    v.tone(t + 0.03, 'sine', 2200, 2200, 0.12, 0.12); // his bells jingle
    v.tone(t + 0.06, 'sine', 2900, 2900, 0.1, 0.09);
  },
  // ── Their signatures under every cast
  castStamp: (v, t) => {
    v.tone(t, 'sine', 125, 75, 0.1, 0.25); // a rubber stamp coming down
    v.noise(t, 'lowpass', 1600, 300, 0.08, 0.16);
  },
  castDrum: (v, t) => {
    v.tone(t, 'sine', 95, 50, 0.24, 0.28);
    v.tone(t + 0.16, 'sine', 95, 50, 0.24, 0.23);
  },
  castClank: (v, t) => {
    v.tone(t, 'square', 420, 380, 0.08, 0.15);
    v.noise(t, 'bandpass', 2600, 2000, 0.16, 0.45, 4);
  },
  castBubble: (v, t) => {
    for (let i = 0; i < 3; i++) v.tone(t + i * 0.05, 'sine', 300 + i * 120, 620 + i * 150, 0.05, 0.2);
  },
  castGrowl: (v, t) => {
    v.noise(t, 'lowpass', 420, 200, 0.35, 0.7, 1, 0.04);
    v.tone(t, 'sawtooth', 92, 72, 0.3, 0.14, 0.04);
  },
  castRoyal: (v, t) => {
    [NOTE.C6, 1318.5, 1568].forEach((f, i) => v.tone(t + i * 0.05, 'sine', f, f, 0.2, 0.2));
  },
  castGrunt: (v, t) => v.vowel(t, 112, 88, 0.18, 0.75, [480, 1400], 0.01),
  castFlick: (v, t) => {
    v.noise(t, 'highpass', 5200, 3000, 0.03, 0.18); // the lighter's click
    v.noise(t + 0.05, 'bandpass', 900, 400, 0.22, 0.14); // and the flame
  },
  castFlourish: (v, t) => {
    v.noise(t, 'bandpass', 1000, 4200, 0.16, 0.55, 1.5); // a sweep of the blade
    v.tone(t + 0.12, 'sine', 1500, 1500, 0.12, 0.18);
  },
  castAngelic: (v, t) => {
    for (const [f, vol] of [[660, 0.12], [990, 0.08], [1320, 0.06]] as const) v.tone(t, 'sine', f, f, 0.42, vol, 0.06);
  },
  castJingle: (v, t) => {
    [2200, 2900, 2550, 3100].forEach((f, i) => v.tone(t + i * 0.04, 'sine', f, f, 0.12, 0.14));
    v.tone(t, 'sawtooth', 420, 390, 0.12, 0.09); // a little honk
  },
  chime: (v, t) => {
    [1318.5, 1760, 2093].forEach((f, i) => v.tone(t + i * 0.06, 'sine', f, f, 0.35, 0.12, 0.004));
  },
  heartbeat: (v, t) => {
    v.tone(t, 'sine', 72, 40, 0.16, 0.7, 0.004);
    v.tone(t + 0.19, 'sine', 66, 38, 0.16, 0.5, 0.004);
  },
  ultimate: (v, t) => {
    v.noise(t, 'bandpass', 250, 3000, 0.32, 0.32, 1.2, 0.2); // the rush in
    v.tone(t + 0.28, 'sine', 120, 34, 0.9, 0.85, 0.004);
    v.noise(t + 0.28, 'lowpass', 900, 70, 1, 0.5, 1, 0.01);
    v.tone(t + 0.28, 'sawtooth', 220, 110, 0.5, 0.08, 0.01);
  },
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
  thunder: (v, t) => {
    v.noise(t, 'lowpass', 900, 70, 2.6, 0.55, 0.7, 0.02);
    v.noise(t + 0.15, 'lowpass', 300, 50, 3, 0.45, 0.9, 0.3);
    v.tone(t, 'sine', 55, 38, 2.2, 0.2, 0.2);
  },
  emote: (v, t) => {
    v.tone(t, 'triangle', 620, 760, 0.07, 0.2);
    v.tone(t + 0.07, 'triangle', 760, 980, 0.1, 0.2);
  },
  ping: (v, t) => {
    v.tone(t, 'sine', 880, 880, 0.08, 0.25);
    v.tone(t + 0.07, 'sine', 1320, 1320, 0.14, 0.22);
  },
  pingDanger: (v, t) => {
    for (let i = 0; i < 3; i++) v.tone(t + i * 0.11, 'square', 1400, 1100, 0.08, 0.08, 0.004);
  },
  pingMissing: (v, t) => {
    v.tone(t, 'triangle', 660, 520, 0.16, 0.25);
    v.tone(t + 0.16, 'triangle', 520, 780, 0.22, 0.25);
  },
  defeat: (v, t) => {
    const tune = [NOTE.A4, NOTE.F4, NOTE.D4];
    tune.forEach((f, i) => v.tone(t + i * 0.3, 'triangle', f, f * (i === 2 ? 0.94 : 1), i === 2 ? 1.0 : 0.3, 0.28));
  },
};
