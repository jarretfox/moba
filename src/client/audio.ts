// Sound effects, synthesized on the fly with Web Audio: no files to load or license, and every sound is
// a few lines of oscillators, noise and envelopes below. Music and the ambient soundscape are in music.ts;
// the plain arithmetic of the mix (buses, distance, the crowd limit, the room) is in mix.ts.
//
// The desk: effects, interface and voices each have a bus; the music and the ambience share a "bed" that
// dips under big moments; everything meets at the master, through a gentle glue compressor and a brickwall
// limiter so a team fight gets fuller rather than clipping. One convolution reverb (a generated hall) is
// shared by everything, each sound sending as much as suits it, and more the further off it is.

import { Music, Soundscape } from './music';
import { type Bus, RateLimiter, type SoundInfo, busLevels, distanceCues, impulseResponse, pitchJitter, resolveInfo } from './mix';
import { onSettings, settings } from './settings';
import type { Syllable } from './voices';
import type { Weather } from '../shared/weather';

export type SoundName =
  | 'swing'
  | 'shoot'
  /** Hits: a light one, a heavy one you feel, and a magic sting. */
  | 'hit'
  | 'hitHeavy'
  | 'hitMagic'
  | 'hitMe'
  | 'atkEdge'
  | 'incoming'
  | 'cast'
  | 'magic'
  | 'boom'
  | 'whoosh'
  | 'dig'
  | 'roar'
  | 'death'
  | 'smallDeath'
  /** A Shootie firing. */
  | 'tower'
  /** A Shootie or an Oakner coming down, and Da Base itself. */
  | 'collapse'
  | 'baseFall'
  /** An Oakner growing back. */
  | 'regrow'
  | 'levelUp'
  /** A skill point spent. */
  | 'rankUp'
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
  /** The Warden's iron fist, and the Warden going down. */
  | 'wardenSlam'
  | 'wardenFall'
  /** An ultimate going off: a rush in, then a boom. */
  | 'ultimate'
  /** A Chud wave marching out. */
  | 'horn'
  /** Old Wick, the shopkeeper: a wheezy "heh heh heh", a low "ahhh...", and a no-sale buzz. */
  | 'chuckle'
  | 'murmur'
  | 'deny'
  /** The shop opening and closing. */
  | 'shopOpen'
  | 'shopClose'
  /** A bright little chime: awards on the end screen, a new tip. */
  | 'chime'
  /** Landing from a knock-up or a leap. */
  | 'land'
  /** Item actives: the Glowworm Lantern, the Deepstone Aegis and the War Drum. */
  | 'lantern'
  | 'aegis'
  | 'warDrum'
  /** The Sewer Crab scuttling about, and its squeak when it's taken. */
  | 'crabSkitter'
  | 'crabSqueak'
  /** A bounty claimed: the till. */
  | 'kaching'
  /** A new title on the end screen, and the rematch going in. */
  | 'titleUnlock'
  | 'rematch'
  /** A line of chat. */
  | 'chat'
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
  /** Scrimby and Big Whale. */
  | 'atkToken'
  | 'atkCoin'
  | 'castHonk'
  | 'castCashier'
  /** Your Da Base in danger. */
  | 'heartbeat'
  /** The announcer: good news for your side, and bad. */
  | 'fanfare'
  | 'toll'
  /** A cinematic hit under the announcer's biggest lines. */
  | 'epic'
  /** Map pings from your team. */
  | 'ping'
  | 'pingDanger'
  | 'pingMissing'
  /** A champion's emote or quip. */
  | 'emote'
  /** A storm's thunder, rolling in after the lightning. */
  | 'thunder'
  /** The map events: the watchman's warning, the event opening, the Coat creaking over and crashing down, the cart's bell. */
  | 'eventWarn'
  | 'eventStart'
  | 'coatCreak'
  | 'coatCrash'
  | 'cartBell';

const MUTE_KEY = 'moba.muted';
const MUSIC_KEY = 'moba.musicOff';
/** How long the shared hall rings. */
const ROOM_SECONDS = 2.2;

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
  /** Playing on the Howling Hollow (see setHaunted). */
  private haunted = false;
  private scape: Soundscape | null = null;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Effects, interface and voices, and each one's send into the hall. */
  private buses: Record<Bus, GainNode> | null = null;
  private sends: Record<Bus, GainNode> | null = null;
  /** The ambience's bus and send: it follows the effects volume like the rest. */
  private ambBus: GainNode | null = null;
  private ambSend: GainNode | null = null;
  /** Music and ambience together, so one dip ducks both. */
  private bed: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly limiter = new RateLimiter();

  constructor() {
    // Browsers only allow audio after the player has interacted with the page.
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    onSettings(() => this.applyVolumes());
  }

  get isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    saveFlag(MUTE_KEY, this.muted);
    this.applyVolumes();
    return this.muted;
  }

  /** Master (and mute), music and effects volumes from the settings, onto every bus. */
  private applyVolumes(): void {
    if (!this.master || !this.ctx || !this.buses || !this.sends || !this.ambBus || !this.ambSend) return;
    const lv = busLevels(settings, this.muted);
    const now = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, now, 0.02);
    set(this.master, lv.master);
    for (const bus of ['fx', 'ui', 'voice'] as const) {
      set(this.buses[bus], lv[bus]);
      set(this.sends[bus], lv[bus]);
    }
    set(this.ambBus, lv.ambience);
    set(this.ambSend, lv.ambience);
    this.music?.setLevel(lv.music);
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

  /** The music and the ambience dip for a moment under something huge, so it lands. */
  duck(depth: number): void {
    if (!this.bed || !this.ctx || depth <= 0) return;
    const g = this.bed.gain;
    const now = this.ctx.currentTime;
    // Never come up for a smaller dip while a bigger one's still on.
    const to = Math.min(g.value, 1 - Math.min(0.95, depth));
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(to, now + 0.04);
    g.setTargetAtTime(1, now + 0.25, 0.5);
  }

  /** How much of a fight you're in, 0–1: brings the drums in. */
  setIntensity(v: number): void {
    this.music?.setIntensity(v);
  }

  /** How far into the night it is, 0–1: the crickets and owls come up, the wind and the music settle. */
  setNight(k: number): void {
    this.music?.setNight(k);
    this.scape?.setNight(k);
  }

  /** The Howling Hollow: the music turns spooky, and wolves, crows and moaning wind fill the night. */
  setHaunted(on: boolean): void {
    this.haunted = on;
    this.music?.setHaunted(on);
    this.scape?.setHaunted(on);
  }

  /** The match's weather (null for clear), and how hard its wind blows (1 = an ordinary evening). */
  setWeather(kind: Weather | null, windK: number): void {
    this.scape?.setWeather(kind, windK);
  }

  /** What's around the camera, 0–1 each: jungle (crickets), river (water), the Warden's pit (its drone) and structures (their hum). */
  setPlace(jungle: number, river: number, pit = 0, hum = 0): void {
    this.scape?.setPlace(jungle, river, pit, hum);
  }

  /** The match is over: the music steps back and the stinger plays. */
  endMatch(won: boolean): void {
    this.music?.hush(7);
    this.play(won ? 'victory' : 'defeat', 0.9);
  }

  /**
   * A champion talking (see voices.ts): each syllable a buzz shaped into its vowel, with breath and growl.
   * Long syllables get a little vibrato, and every vowel comes out a touch differently shaped.
   */
  speak(syllables: readonly Syllable[], gain = 1, pan = 0, far = 0): void {
    if (this.muted || gain * settings.effects < 0.03 || !syllables.length) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (!this.limiter.allow('speak', now, 0)) return;
    const v = this.route('voice', gain, pan, far, 0.2, pitchJitter(25));
    for (const s of syllables) {
      const at = now + s.at;
      if (s.breath > 0) v.noise(at, 'bandpass', 1800, 1200, 0.06, 0.1 * s.breath, 1.2);
      const formants = s.formants.map((f) => f * (0.97 + Math.random() * 0.06));
      v.vowel(at + (s.breath > 0 ? 0.03 : 0), s.f0, s.f1, s.dur, s.vol, formants, 0.015, s.dur > 0.3 ? 5.5 : 0);
      if (s.growl > 0) v.noise(at, 'lowpass', 520, 240, s.dur, 0.45 * s.growl * s.vol, 0.8, 0.02);
    }
  }

  /**
   * Play a sound at `gain` (0..1), panned left/right by `pan` (-1..1), from `far` away (0 right here, 1 at
   * the edge of hearing: duller and wetter the further).
   */
  play(name: SoundName, gain = 1, pan = 0, far = 0): void {
    if (this.muted || gain * settings.effects < 0.03) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== 'running') return;
    const recipe = RECIPES[name];
    const info = resolveInfo(recipe);
    const now = ctx.currentTime;
    if (!this.limiter.allow(name, now, info.gap, info.priority)) return;
    const v = this.route(info.bus, gain, pan, far, info.send, pitchJitter(info.pitch));
    // The big ones push the music and ambience down for a moment, when they're close.
    if (info.duck > 0) this.duck(info.duck * Math.min(1, gain) * (1 - far));
    // Effects start a hair late at random, so three Chuds swinging in the same frame don't land as one flat chord.
    recipe.play(v, now + (info.bus === 'fx' ? Math.random() * 0.012 : 0));
  }

  /** One sound's path to its bus: gain, the dullness of distance, pan, and a send into the hall. */
  private route(bus: Bus, gain: number, pan: number, far: number, send: number, rate: number): Voice {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.value = gain;
    const cues = distanceCues(far);
    let tail: AudioNode = out;
    if (cues.lowpass < 16000) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cues.lowpass;
      lp.Q.value = 0.5;
      out.connect(lp);
      tail = lp;
    }
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    tail.connect(panner).connect(this.buses![bus]);
    const wet = send + cues.send;
    if (wet > 0.01) {
      const s = ctx.createGain();
      s.gain.value = wet;
      tail.connect(s).connect(this.sends![bus]);
    }
    return new Voice(ctx, out, this.noise!, rate);
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      const ctx = (this.ctx = new Ctx());
      const gain = (v: number) => {
        const g = ctx.createGain();
        g.gain.value = v;
        return g;
      };
      // Master → a gentle glue compressor → a brickwall limiter → out.
      this.master = gain(this.muted ? 0 : 0.6);
      const glue = ctx.createDynamicsCompressor();
      glue.threshold.value = -18;
      glue.knee.value = 12;
      glue.ratio.value = 3;
      glue.attack.value = 0.01;
      glue.release.value = 0.2;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.001;
      limiter.release.value = 0.1;
      this.master.connect(glue).connect(limiter).connect(ctx.destination);
      // The hall everything shares, returned straight to the master (a hit's own tail shouldn't duck itself).
      this.reverb = ctx.createConvolver();
      const ir = ctx.createBuffer(2, Math.floor(ctx.sampleRate * ROOM_SECONDS), ctx.sampleRate);
      const [left, right] = impulseResponse(ctx.sampleRate, ROOM_SECONDS);
      ir.copyToChannel(left, 0);
      ir.copyToChannel(right, 1);
      this.reverb.buffer = ir;
      this.reverb.connect(gain(0.8)).connect(this.master);
      // The buses, each with its own send so turning effects down turns their reverb down too.
      this.buses = { fx: gain(1), ui: gain(1), voice: gain(1) };
      this.sends = { fx: gain(1), ui: gain(1), voice: gain(1) };
      for (const bus of ['fx', 'ui', 'voice'] as const) {
        this.buses[bus].connect(this.master);
        this.sends[bus].connect(this.reverb);
      }
      this.bed = gain(1);
      this.bed.connect(this.master);
      this.ambBus = gain(1);
      this.ambBus.connect(this.bed);
      this.ambSend = gain(1);
      this.ambSend.connect(this.reverb);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.music = new Music(ctx, this.bed, this.noise, this.musicOn);
      this.scape = new Soundscape(ctx, this.ambBus, this.ambSend);
      this.music.setHaunted(this.haunted);
      this.scape.setHaunted(this.haunted);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }
}

/** The partials of a struck bell, and of a coin: [ratio to the fundamental, level]. */
const BELL: readonly (readonly [number, number])[] = [[1, 1], [2, 0.5], [2.76, 0.3], [5.4, 0.12]];
const COIN: readonly (readonly [number, number])[] = [[1, 1], [2.3, 0.4], [3.9, 0.18]];

/**
 * Building blocks for one sound: tones and noise with simple envelopes, all feeding one output. `rate`
 * is the pitch wobble for this one playing (1 = as written), applied to everything pitched.
 */
class Voice {
  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly noiseBuf: AudioBuffer,
    private readonly rate = 1,
  ) {}

  /** A pitched tone gliding from f0 to f1 over `dur`, fading out; `cutoff` lowpasses it (saws and squares are harsh bare). */
  tone(at: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, attack = 0.005, cutoff?: number): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0 * this.rate, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * this.rate), at + dur);
    const env = this.env(at, dur, vol, attack);
    if (cutoff) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      o.connect(lp).connect(env);
    } else o.connect(env);
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
    f.frequency.setValueAtTime(f0 * this.rate, at);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * this.rate), at + dur);
    src.connect(f).connect(this.env(at, dur, vol, attack));
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  /** The hard edge at the front of a hit: a tiny burst of bright noise. */
  click(at: number, vol: number, bright = 4000): void {
    this.noise(at, 'highpass', bright, bright * 0.6, 0.018, vol, 0.7, 0.001);
  }

  /** A struck bell, a coin, a crystal: a few partials in bell-like ratios, the high ones dying first (and the ones past hearing left out). */
  bell(at: number, f: number, dur: number, vol: number, partials = BELL): void {
    partials.forEach(([ratio, level], i) => {
      if (f * ratio * this.rate < 18000) this.tone(at, 'sine', f * ratio, f * ratio * 0.998, dur * (1 - i * 0.15), vol * level, 0.002);
    });
  }

  /**
   * Frequency modulation: one oscillator wobbling another's pitch, for metal, zaps and squeaks. `ratio`
   * is the modulator's pitch against the carrier's, `index` how hard it modulates (in multiples of the
   * carrier's pitch); the index dies away over the sound, so it starts bright and mellows.
   */
  fm(at: number, f0: number, f1: number, ratio: number, index: number, dur: number, vol: number, attack = 0.003, type: OscillatorType = 'sine'): void {
    const car = this.ctx.createOscillator();
    car.type = type;
    car.frequency.setValueAtTime(f0 * this.rate, at);
    car.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * this.rate), at + dur);
    const mod = this.ctx.createOscillator();
    mod.frequency.setValueAtTime(f0 * this.rate * ratio, at);
    mod.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * this.rate * ratio), at + dur);
    const depth = this.ctx.createGain();
    depth.gain.setValueAtTime(Math.max(1, f0 * this.rate * index), at);
    depth.gain.exponentialRampToValueAtTime(Math.max(1, f0 * this.rate * index * 0.05), at + dur);
    mod.connect(depth).connect(car.frequency);
    car.connect(this.env(at, dur, vol, attack));
    mod.start(at);
    car.start(at);
    mod.stop(at + dur + 0.02);
    car.stop(at + dur + 0.02);
  }

  /** A buzzy voice through vowel formants: mutters and chuckles. `vibrato` in Hz wobbles the pitch a little. */
  vowel(at: number, f0: number, f1: number, dur: number, vol: number, formants: readonly number[], attack = 0.02, vibrato = 0): void {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * this.rate, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * this.rate), at + dur);
    if (vibrato > 0) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = vibrato;
      const depth = this.ctx.createGain();
      depth.gain.value = 18; // cents
      lfo.connect(depth).connect(o.detune);
      lfo.start(at);
      lfo.stop(at + dur + 0.02);
    }
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
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), at + Math.min(attack, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    g.connect(this.out);
    return g;
  }
}

/** Notes for the little jingles. */
const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, A4: 440, F4: 349.23, D4: 293.66, Bb4: 466.16, G4: 392 };

type Play = (v: Voice, t: number) => void;
/** What a sound sounds like, and how it sits in the mix. */
interface Recipe extends SoundInfo {
  play: Play;
}
type Extra = Omit<SoundInfo, 'bus'>;
const fx = (play: Play, extra: Extra = {}): Recipe => ({ bus: 'fx', ...extra, play });
const ui = (play: Play, extra: Extra = {}): Recipe => ({ bus: 'ui', ...extra, play });
const voice = (play: Play, extra: Extra = {}): Recipe => ({ bus: 'voice', ...extra, play });

/** Every sound, by name. Exported for the tests, which check the table without an AudioContext. */
export const RECIPES: Record<SoundName, Recipe> = {
  // ── Blows. Every hit is three layers: the edge (a click of bright noise), the body (a pitched thump) and
  // the tail (dirt dying away). The heavier the hit, the lower and longer the body and tail.
  swing: fx((v, t) => v.noise(t, 'bandpass', 2400, 600, 0.09, 0.5, 2), { gap: 0.06 }),
  shoot: fx((v, t) => {
    v.tone(t, 'triangle', 900, 320, 0.08, 0.25);
    v.noise(t, 'highpass', 3000, 1500, 0.05, 0.15);
  }, { gap: 0.06 }),
  hit: fx((v, t) => {
    v.click(t, 0.3, 3500);
    v.tone(t, 'sine', 180, 65, 0.11, 0.5);
    v.noise(t, 'lowpass', 1400, 300, 0.12, 0.28);
  }, { gap: 0.06 }),
  hitHeavy: fx((v, t) => {
    v.click(t, 0.45, 5000);
    v.tone(t, 'sine', 130, 42, 0.26, 0.7, 0.003);
    v.noise(t, 'bandpass', 2000, 700, 0.05, 0.3, 1.5); // the crack
    v.noise(t + 0.01, 'lowpass', 700, 110, 0.4, 0.35, 1, 0.01); // and the dirt
  }, { gap: 0.07, duck: 0.12, send: 0.18 }),
  hitMagic: fx((v, t) => {
    v.fm(t, 1100, 500, 2.01, 3, 0.2, 0.22); // a glassy sting
    v.tone(t, 'sine', 160, 70, 0.14, 0.35);
    v.noise(t, 'highpass', 5000, 2500, 0.08, 0.12);
  }, { gap: 0.06, send: 0.22 }),
  // A hit landing on you: the same blow with a deeper, longer body under it, so you feel it's yours.
  hitMe: fx((v, t) => {
    v.click(t, 0.38, 3600);
    v.tone(t, 'sine', 140, 46, 0.2, 0.75, 0.003);
    v.noise(t, 'lowpass', 1200, 240, 0.16, 0.3);
    v.noise(t + 0.01, 'lowpass', 500, 90, 0.26, 0.18, 1, 0.01);
  }, { gap: 0.06, duck: 0.05 }),
  // The edge on your own swing or shot: a bright snap on top of the champion's own sound, so you always
  // hear yourself start an attack, whatever else is going on.
  atkEdge: fx((v, t) => {
    v.click(t, 0.5, 6500);
    v.noise(t, 'highpass', 4500, 2500, 0.035, 0.28, 1);
  }, { gap: 0.05 }),
  // An enemy champion starting a swing or a shot at you: a quick rising whoosh, a beat before it lands.
  incoming: fx((v, t) => v.noise(t, 'bandpass', 600, 2400, 0.15, 0.4, 1.5, 0.02), { gap: 0.12 }),
  cast: fx((v, t) => v.tone(t, 'triangle', 320, 760, 0.16, 0.22, 0.01), { gap: 0.05 }),
  magic: fx((v, t) => {
    v.tone(t, 'sine', 880, 1320, 0.28, 0.14, 0.02);
    v.tone(t, 'sine', 893, 1100, 0.28, 0.1, 0.02);
    v.noise(t, 'bandpass', 2000, 5000, 0.25, 0.06, 2, 0.05); // a sparkle over it
  }, { send: 0.3 }),
  boom: fx((v, t) => {
    v.click(t, 0.3, 2000);
    v.tone(t, 'sine', 90, 35, 0.45, 0.8);
    v.noise(t, 'lowpass', 900, 120, 0.4, 0.6);
  }, { duck: 0.15, send: 0.25 }),
  whoosh: fx((v, t) => v.noise(t, 'bandpass', 500, 2600, 0.24, 0.35, 1.5, 0.05)),
  dig: fx((v, t) => {
    v.noise(t, 'lowpass', 700, 200, 0.3, 0.5, 1, 0.02);
    v.noise(t + 0.08, 'bandpass', 900, 300, 0.2, 0.25, 3);
    for (let i = 0; i < 4; i++) v.noise(t + 0.1 + i * 0.06, 'bandpass', 1200 + Math.random() * 800, 500, 0.04, 0.12, 4); // pebbles
  }),
  roar: fx((v, t) => {
    v.tone(t, 'sawtooth', 140, 85, 0.6, 0.18, 0.05, 1200);
    v.tone(t, 'sawtooth', 147, 80, 0.6, 0.14, 0.05, 1200);
    v.noise(t, 'bandpass', 600, 250, 0.55, 0.3, 1.2, 0.05);
    v.vowel(t + 0.02, 150, 90, 0.55, 0.5, [600, 1000], 0.04, 6); // a throat in it
  }, { duck: 0.15, send: 0.3 }),
  death: fx((v, t) => {
    v.tone(t, 'sawtooth', 420, 70, 0.5, 0.18, 0.01, 2000);
    v.noise(t, 'lowpass', 1200, 200, 0.35, 0.2);
    v.tone(t + 0.3, 'sine', 90, 40, 0.3, 0.4); // and they hit the ground
    v.noise(t + 0.3, 'lowpass', 600, 150, 0.2, 0.2);
  }, { send: 0.3 }),
  smallDeath: fx((v, t) => {
    // A Chud goes: a squelchy little yelp.
    v.tone(t, 'square', 300, 90, 0.12, 0.07, 0.003, 1500);
    v.noise(t, 'lowpass', 900, 200, 0.1, 0.1);
  }, { gap: 0.09 }),
  land: fx((v, t) => {
    v.click(t, 0.12, 1500);
    v.tone(t, 'sine', 140, 50, 0.12, 0.45, 0.003);
    v.noise(t, 'lowpass', 700, 180, 0.16, 0.25);
  }, { gap: 0.08 }),
  // ── Structures and the Warden.
  tower: fx((v, t) => {
    // The crystal charges, a rising whine and a swelling hiss...
    v.fm(t, 320, 2400, 1.5, 1.5, 0.09, 0.12, 0.05);
    v.noise(t, 'bandpass', 800, 5000, 0.09, 0.14, 2, 0.06);
    // ...then the bolt cracks away, with a boom under it and a sizzle hanging in the air.
    const go = t + 0.08;
    v.click(go, 0.6, 3000);
    v.tone(go, 'sawtooth', 1100, 180, 0.16, 0.2, 0.002, 2600);
    v.tone(go, 'sine', 120, 38, 0.38, 0.6, 0.003);
    v.noise(go, 'lowpass', 1600, 200, 0.25, 0.4);
    v.noise(go + 0.02, 'bandpass', 3800, 2200, 0.35, 0.12, 3, 0.01);
  }, { gap: 0.1, duck: 0.1, send: 0.22 }),
  collapse: fx((v, t) => {
    // Stone giving way: a deep rumble, cracks splitting through it, debris raining down and dust settling.
    v.tone(t, 'sine', 70, 24, 1.3, 0.85, 0.01);
    v.noise(t, 'lowpass', 500, 60, 1.6, 0.6, 1, 0.02);
    for (let i = 0; i < 5; i++) v.noise(t + 0.05 + i * 0.11 + Math.random() * 0.06, 'bandpass', 1500 + Math.random() * 1200, 400, 0.06, 0.35, 3);
    for (let i = 0; i < 9; i++) v.noise(t + 0.35 + i * 0.1 + Math.random() * 0.08, 'bandpass', 700 + Math.random() * 900, 300, 0.05, 0.14, 4);
    v.noise(t + 0.3, 'highpass', 1800, 900, 1.6, 0.07, 0.6, 0.3); // the dust
  }, { duck: 0.45, send: 0.3, gap: 0.3 }),
  baseFall: fx((v, t) => {
    // Da Base falls: the collapse, its great crystal bursting into a shower of ringing shards, and a sub-bass that goes on and on.
    RECIPES.collapse.play(v, t);
    v.tone(t, 'sine', 48, 22, 3.2, 0.7, 0.02);
    v.click(t + 0.08, 0.5, 6000);
    for (let i = 0; i < 8; i++) v.bell(t + 0.1 + i * 0.07 + Math.random() * 0.05, 1600 + Math.random() * 2600, 1.4, 0.07);
    v.noise(t + 0.1, 'highpass', 7000, 3000, 2.2, 0.1, 0.5, 0.02);
  }, { duck: 0.85, send: 0.4, gap: 0.5 }),
  regrow: fx((v, t) => {
    // An Oakner springs back: leaves rustling up and a rising chime.
    v.noise(t, 'bandpass', 2200, 3600, 0.6, 0.18, 1.5, 0.1);
    v.tone(t + 0.1, 'sine', 520, 1040, 0.5, 0.14, 0.05);
    [1046.5, 1318.5, 1568].forEach((f, i) => v.bell(t + 0.35 + i * 0.08, f, 0.9, 0.09));
  }, { send: 0.3, pitch: 0 }),
  wardenSlam: fx((v, t) => {
    // The iron fist comes down: a clang that rings, chains rattling after. The ground's own quake is added on top (landHeavy).
    v.click(t, 0.5, 2500);
    v.fm(t, 190, 160, 3.3, 7, 0.55, 0.3, 0.002);
    v.tone(t, 'square', 165, 150, 0.2, 0.12, 0.002, 1800);
    for (let i = 0; i < 7; i++) v.noise(t + 0.08 + i * 0.045 + Math.random() * 0.03, 'bandpass', 3200 + Math.random() * 1800, 2500, 0.03, 0.3, 6);
  }, { duck: 0.3, send: 0.3 }),
  wardenFall: fx((v, t) => {
    // The jailer goes down: iron groaning and buckling, chains pouring to the floor, and the pit shaking.
    v.tone(t, 'sawtooth', 80, 46, 1.7, 0.16, 0.05, 700);
    v.fm(t + 0.1, 140, 70, 2.8, 5, 1.4, 0.2, 0.05);
    for (let i = 0; i < 18; i++) v.noise(t + 0.2 + i * 0.07 + Math.random() * 0.05, 'bandpass', 2600 + Math.random() * 2400, 2000, 0.03, 0.22, 6);
    v.tone(t + 0.5, 'sine', 65, 24, 1.6, 0.8, 0.01);
    v.noise(t + 0.5, 'lowpass', 500, 60, 1.8, 0.5, 1, 0.02);
  }, { duck: 0.6, send: 0.35, gap: 0.5 }),
  // ── Weight under the big abilities.
  impact: fx((v, t) => {
    v.click(t, 0.35, 5200); // the crack
    v.tone(t, 'sine', 150, 42, 0.32, 0.75, 0.003); // the thump
    v.noise(t, 'lowpass', 1400, 220, 0.2, 0.42); // the body
    v.noise(t + 0.03, 'lowpass', 320, 70, 0.7, 0.22, 1, 0.03); // the rumble after
  }, { duck: 0.2, send: 0.2 }),
  quake: fx((v, t) => {
    v.tone(t, 'sine', 85, 26, 1.1, 0.95, 0.004);
    v.tone(t, 'triangle', 60, 30, 0.6, 0.35, 0.004);
    v.noise(t, 'highpass', 3200, 1500, 0.07, 0.4);
    v.noise(t, 'lowpass', 700, 55, 1.3, 0.6, 1, 0.01);
    // Debris pattering down after.
    for (let i = 0; i < 5; i++) v.noise(t + 0.12 + i * 0.09 + Math.random() * 0.05, 'bandpass', 900 + Math.random() * 900, 300, 0.07, 0.15, 3);
  }, { duck: 0.35, send: 0.3, gap: 0.15 }),
  ultimate: fx((v, t) => {
    v.noise(t, 'bandpass', 250, 3000, 0.32, 0.32, 1.2, 0.2); // the rush in
    v.tone(t, 'sine', 300, 1200, 0.3, 0.06, 0.15);
    v.tone(t + 0.28, 'sine', 120, 34, 0.9, 0.85, 0.004);
    v.noise(t + 0.28, 'lowpass', 900, 70, 1, 0.5, 1, 0.01);
    v.tone(t + 0.28, 'sawtooth', 220, 110, 0.5, 0.08, 0.01, 1500);
  }, { duck: 0.25, send: 0.3 }),
  // ── The life of the map.
  horn: fx((v, t) => {
    for (const [dt, f, dur] of [[0, 196, 0.5], [0.42, 293.66, 0.95]] as const) {
      v.noise(t + dt, 'bandpass', 800, 500, 0.08, 0.08, 1.5, 0.01); // the breath into it
      v.tone(t + dt, 'sawtooth', f * 0.97, f, dur, 0.06, 0.08, 1800);
      v.tone(t + dt, 'triangle', f, f, dur, 0.14, 0.06);
    }
  }, { send: 0.4, pitch: 10 }),
  heartbeat: fx((v, t) => {
    v.tone(t, 'sine', 72, 40, 0.16, 0.7, 0.004);
    v.tone(t + 0.19, 'sine', 66, 38, 0.16, 0.5, 0.004);
  }, { pitch: 0, send: 0 }),
  thunder: fx((v, t) => {
    // Rolling in; half the time it's close enough to crack first.
    if (Math.random() < 0.5) {
      v.click(t, 0.5, 2000);
      v.noise(t, 'bandpass', 1800, 300, 0.12, 0.45, 1);
    }
    v.noise(t, 'lowpass', 900, 70, 2.6, 0.55, 0.7, 0.02);
    v.noise(t + 0.15, 'lowpass', 300, 50, 3, 0.45, 0.9, 0.3);
    v.tone(t, 'sine', 55, 38, 2.2, 0.2, 0.2);
  }, { duck: 0.2, send: 0.3, gap: 1 }),
  warn: fx((v, t) => {
    v.tone(t, 'square', 180, 170, 0.22, 0.08, 0.02, 1200);
    v.tone(t + 0.25, 'square', 180, 170, 0.22, 0.08, 0.02, 1200);
  }, { pitch: 0 }),
  recall: fx((v, t) => {
    // Winding up for home: a rising shimmer and climbing bells.
    v.tone(t, 'sine', 400, 1200, 0.9, 0.12, 0.1);
    v.noise(t, 'bandpass', 300, 2400, 1.0, 0.1, 2, 0.2);
    [784, 1046.5, 1318.5].forEach((f, i) => v.bell(t + 0.2 + i * 0.22, f, 0.8, 0.07));
  }, { send: 0.35, pitch: 0 }),
  snap: fx((v, t) => {
    v.noise(t, 'highpass', 4000, 2000, 0.05, 0.4);
    v.tone(t, 'square', 600, 200, 0.06, 0.15, 0.002, 2500);
  }),
  lantern: fx((v, t) => {
    // Light the Way: a glassy swell as the lantern opens, a soft whump of light, and the glowworms inside chirping.
    for (const [f, vol] of [[880, 0.1], [1320, 0.07], [1760, 0.05]] as const) v.tone(t, 'sine', f, f * 1.01, 1.1, vol, 0.25);
    v.tone(t, 'sine', 240, 130, 0.5, 0.2, 0.05);
    for (let i = 0; i < 4; i++) v.tone(t + 0.25 + i * 0.09 + Math.random() * 0.04, 'sine', 4200 + Math.random() * 1500, 5200, 0.05, 0.06);
  }, { send: 0.3 }),
  aegis: fx((v, t) => {
    // Deepstone Ward: stone grinding up out of the ground, then the shield ringing as it seals.
    v.noise(t, 'bandpass', 260, 700, 0.4, 0.35, 3, 0.02);
    v.fm(t + 0.12, 110, 130, 2, 2.5, 0.7, 0.3, 0.05);
    v.click(t + 0.3, 0.2, 2000);
    v.tone(t + 0.3, 'sine', 440, 445, 0.6, 0.12, 0.03);
  }, { send: 0.25 }),
  warDrum: fx((v, t) => {
    // War Beat: three beats on the skin, the last the biggest.
    [0, 0.22, 0.44].forEach((dt, i) => {
      const vol = i === 2 ? 1 : 0.75;
      v.click(t + dt, 0.15 * vol, 1500);
      v.tone(t + dt, 'sine', 95, 48, 0.3, 0.6 * vol, 0.003);
      v.noise(t + dt, 'bandpass', 420, 180, 0.05, 0.3 * vol, 1.2);
    });
  }, { duck: 0.15, send: 0.25 }),
  crabSkitter: fx((v, t) => {
    // Chitin on wet stone: a scurry of little clicks.
    const n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const at = t + i * 0.042 + Math.random() * 0.015;
      v.click(at, 0.25, 5000 + Math.random() * 2000);
      v.tone(at, 'square', 2600 + Math.random() * 800, 2200, 0.012, 0.04);
    }
  }, { gap: 0.3, send: 0.15 }),
  crabSqueak: fx((v, t) => {
    // Taken: an indignant squeak and a crunch of shell.
    v.fm(t, 1700, 2600, 1.5, 1.2, 0.14, 0.2, 0.01);
    v.fm(t + 0.13, 2400, 1300, 1.5, 1.6, 0.2, 0.18, 0.01);
    v.click(t + 0.02, 0.3, 3000);
    v.noise(t + 0.02, 'lowpass', 1800, 400, 0.1, 0.3);
  }),
  // ── Old Wick.
  chuckle: voice((v, t) => {
    // "heh heh heh heh", each one a breath and a low buzzy "eh", sinking.
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.13;
      v.noise(at, 'bandpass', 1900, 1300, 0.05, 0.07, 1.5);
      v.vowel(at + 0.02, 152 - i * 9, 130 - i * 9, 0.1, 1.1 - i * 0.14, [540, 1750], 0.01);
    }
  }),
  murmur: voice((v, t) => {
    // "Ahhh... mmm."
    v.noise(t, 'bandpass', 1400, 900, 0.12, 0.05, 1.2, 0.03);
    v.vowel(t + 0.05, 122, 94, 0.7, 0.9, [720, 1150], 0.08, 4.5);
    v.vowel(t + 0.62, 104, 86, 0.45, 0.6, [300, 900], 0.05);
  }),
  // ── The interface: crisp, close and dry, and never crowded out.
  click: ui((v, t) => {
    v.click(t, 0.15, 4500);
    v.tone(t, 'square', 1200, 900, 0.03, 0.07, 0.001, 3000);
  }),
  hover: ui((v, t) => v.tone(t, 'sine', 1800, 1700, 0.025, 0.05), { gap: 0.05 }),
  deny: ui((v, t) => {
    v.tone(t, 'square', 220, 190, 0.08, 0.14, 0.005, 1600);
    v.tone(t + 0.1, 'square', 180, 140, 0.14, 0.14, 0.005, 1400);
  }),
  rankUp: ui((v, t) => {
    v.click(t, 0.1, 5000);
    v.tone(t, 'sine', 1046, 1046, 0.06, 0.16, 0.003);
    v.tone(t + 0.06, 'sine', 1568, 1568, 0.12, 0.16, 0.003);
  }),
  buy: ui((v, t) => {
    // Coins into the purse: three bright clinks and the purse's thump.
    [2093, 2794, 3520].forEach((f, i) => v.bell(t + i * 0.055, f, 0.4, 0.14, COIN));
    v.tone(t + 0.02, 'sine', 170, 90, 0.08, 0.2);
  }),
  gold: ui((v, t) => {
    v.bell(t, 2637, 0.3, 0.14, COIN);
    v.bell(t + 0.05, 3520, 0.4, 0.1, COIN);
  }, { gap: 0.12 }),
  shopOpen: ui((v, t) => {
    // Wick's shutter going up and the jingle of his bag.
    v.noise(t, 'bandpass', 500, 900, 0.14, 0.2, 2, 0.01);
    v.tone(t, 'sine', 140, 110, 0.1, 0.2);
    [2200, 2900, 2500].forEach((f, i) => v.bell(t + 0.08 + i * 0.05, f, 0.25, 0.07, COIN));
  }),
  shopClose: ui((v, t) => {
    v.tone(t, 'sine', 160, 80, 0.12, 0.3);
    v.noise(t, 'lowpass', 1200, 300, 0.1, 0.2);
    v.bell(t + 0.04, 2400, 0.2, 0.06, COIN);
  }),
  levelUp: ui((v, t) => {
    // Four rising notes with bells on, and a shimmer sweeping up under them.
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => {
      v.tone(t + i * 0.09, 'triangle', f, f, i === 3 ? 0.5 : 0.16, 0.26, 0.004);
      v.bell(t + i * 0.09, f * 2, i === 3 ? 1.1 : 0.4, 0.07);
    });
    v.noise(t, 'bandpass', 1200, 6000, 0.45, 0.08, 2, 0.2);
  }, { send: 0.22 }),
  chime: ui((v, t) => [1318.5, 1760, 2093].forEach((f, i) => v.bell(t + i * 0.06, f, 0.5, 0.1)), { send: 0.2 }),
  chat: ui((v, t) => {
    // A soft pop for a line of chat.
    v.click(t, 0.08, 3000);
    v.tone(t, 'sine', 620, 980, 0.07, 0.18, 0.004);
  }),
  kaching: ui((v, t) => {
    // The till: the bell, the drawer banging open, and the coins spilling.
    v.bell(t, 2650, 0.7, 0.3);
    v.click(t + 0.08, 0.4, 2500);
    v.tone(t + 0.08, 'sine', 180, 90, 0.1, 0.4);
    v.noise(t + 0.08, 'lowpass', 1200, 300, 0.08, 0.25);
    for (let i = 0; i < 7; i++) v.bell(t + 0.16 + i * 0.045 + Math.random() * 0.02, 2400 + Math.random() * 1800, 0.35, 0.09, COIN);
  }, { send: 0.12 }),
  titleUnlock: ui((v, t) => {
    // A shimmer rising into a chord of bells.
    v.noise(t, 'bandpass', 900, 7000, 0.7, 0.14, 2, 0.3);
    v.tone(t, 'sine', 660, 2640, 0.7, 0.06, 0.1);
    [1318.5, 1661.2, 1975.5, 2637].forEach((f, i) => v.bell(t + 0.55 + i * 0.07, f, 1.6, 0.14));
  }, { send: 0.3 }),
  rematch: ui((v, t) => {
    // A drum roll and a horn: here we go again.
    for (let i = 0; i < 7; i++) v.tone(t + i * 0.05, 'sine', 160, 70, 0.1, 0.25 + i * 0.03, 0.002);
    v.tone(t + 0.3, 'sawtooth', 190, 262, 0.5, 0.07, 0.04, 1800);
    v.tone(t + 0.3, 'triangle', 196, 262, 0.5, 0.16, 0.04);
    v.noise(t + 0.3, 'highpass', 5000, 2500, 0.5, 0.08, 0.5, 0.01);
  }, { send: 0.25 }),
  emote: ui((v, t) => {
    v.tone(t, 'triangle', 620, 760, 0.07, 0.2);
    v.tone(t + 0.07, 'triangle', 760, 980, 0.1, 0.2);
  }),
  ping: ui((v, t) => {
    v.tone(t, 'sine', 880, 880, 0.08, 0.25);
    v.tone(t + 0.07, 'sine', 1320, 1320, 0.14, 0.22);
  }),
  pingDanger: ui((v, t) => {
    for (let i = 0; i < 3; i++) v.tone(t + i * 0.11, 'square', 1400, 1100, 0.08, 0.08, 0.004, 4000);
  }),
  pingMissing: ui((v, t) => {
    v.tone(t, 'triangle', 660, 520, 0.16, 0.25);
    v.tone(t + 0.16, 'triangle', 520, 780, 0.22, 0.25);
  }),
  // ── The announcer.
  kill: ui((v, t) => {
    for (const f of [NOTE.C5, NOTE.E5, NOTE.G5]) v.tone(t, 'triangle', f, f, 0.6, 0.11, 0.01);
    v.bell(t + 0.1, NOTE.C6, 0.6, 0.1);
  }, { send: 0.2 }),
  fanfare: ui((v, t) => {
    // Brass: a pickup chord into the big one (two saws a hair apart on every note), a drum under it and a cymbal over.
    for (const f of [NOTE.G4, NOTE.C5, NOTE.E5]) v.tone(t, 'sawtooth', f, f, 0.18, 0.045, 0.01, 2400);
    for (const f of [NOTE.C5, NOTE.E5, NOTE.G5]) {
      v.tone(t + 0.16, 'sawtooth', f * 0.996, f, 0.8, 0.04, 0.02, 2800);
      v.tone(t + 0.16, 'sawtooth', f * 1.004, f, 0.8, 0.04, 0.02, 2800);
    }
    v.tone(t + 0.16, 'triangle', NOTE.C6, NOTE.C6, 0.9, 0.1, 0.02);
    v.tone(t + 0.16, 'sine', 130.8, 130.8, 0.8, 0.3, 0.01);
    v.tone(t + 0.16, 'sine', 110, 50, 0.2, 0.3, 0.002);
    v.noise(t + 0.16, 'highpass', 6000, 3500, 0.9, 0.06, 0.5, 0.01);
  }, { send: 0.3 }),
  epic: ui((v, t) => {
    // A swell of noise rising into one huge low brass chord, with a sub boom, a timpani and a cymbal over it.
    v.noise(t, 'bandpass', 500, 3800, 0.32, 0.07, 1.4, 0.28);
    const at = t + 0.3;
    for (const f of [65.41, 98, 130.81, 155.56, 196]) {
      v.tone(at, 'sawtooth', f * 0.994, f, 1.7, 0.045, 0.02, 1100);
      v.tone(at, 'sawtooth', f * 1.006, f, 1.7, 0.045, 0.02, 1100);
    }
    v.tone(at, 'triangle', 261.63, 261.63, 1.2, 0.08, 0.03);
    v.tone(at, 'sine', 60, 28, 1.3, 0.55, 0.004);
    v.tone(at, 'sine', 150, 62, 0.32, 0.38, 0.002);
    v.noise(at, 'lowpass', 1000, 110, 1.1, 0.25, 1, 0.004);
    v.noise(at, 'highpass', 6000, 3200, 1.5, 0.07, 0.5, 0.01);
  }, { send: 0.45, duck: 0.55 }),
  toll: ui((v, t) => {
    // A great bell, slow and dark.
    v.click(t, 0.1, 1200);
    v.bell(t, 110, 2.2, 0.4, [[1, 1], [2, 0.45], [2.4, 0.25], [3.3, 0.15], [5.1, 0.08]]);
    v.noise(t, 'lowpass', 400, 80, 0.5, 0.15);
  }, { send: 0.4 }),
  victory: ui((v, t) => {
    // A roll of the drum, then a brass fanfare in D: D, F#, A and the D above held, the chord swelling under
    // it with a cymbal and a sparkle of bells.
    for (let i = 0; i < 5; i++) v.tone(t + i * 0.055, 'sine', 150, 60, 0.12, 0.3 - i * 0.03, 0.002);
    const tune = [[293.66, 0.2], [369.99, 0.2], [440, 0.2], [587.33, 1.6]] as const;
    tune.forEach(([f, dur], i) => {
      const at = t + 0.28 + i * 0.19;
      v.tone(at, 'sawtooth', f * 0.995, f, dur, 0.06, 0.02, 3000);
      v.tone(at, 'sawtooth', f * 1.005, f, dur, 0.06, 0.02, 3000);
      v.tone(at, 'triangle', f * 2, f * 2, dur, 0.05, 0.02);
    });
    const last = t + 0.28 + 3 * 0.19;
    for (const f of [146.83, 220, 293.66, 369.99]) v.tone(last, 'sawtooth', f, f, 1.8, 0.045, 0.25, 1600);
    v.tone(last, 'sine', 73.4, 73.4, 1.8, 0.3, 0.01);
    v.tone(last, 'sine', 120, 45, 0.25, 0.4, 0.002);
    v.noise(last, 'highpass', 6000, 3000, 1.4, 0.1, 0.5, 0.01);
    [1174.7, 1480, 1760, 2349].forEach((f, i) => v.bell(last + 0.1 + i * 0.09, f, 1.2, 0.07));
  }, { send: 0.35 }),
  defeat: ui((v, t) => {
    // A dull drum, a line sinking A, F, D with the last note sagging flat, and a low drone that outlasts it all.
    v.tone(t, 'sine', 110, 40, 0.5, 0.5, 0.004);
    v.noise(t, 'lowpass', 500, 80, 0.8, 0.3, 1, 0.005);
    const tune = [[440, 0.42], [349.23, 0.42], [293.66, 1.6]] as const;
    tune.forEach(([f, dur], i) => {
      const at = t + 0.25 + i * 0.45;
      const sag = i === 2 ? 0.93 : 1;
      v.tone(at, 'triangle', f, f * sag, dur, 0.22, 0.03, 2400);
      v.tone(at, 'sawtooth', f * 0.5, f * 0.5 * sag, dur, 0.06, 0.05, 900);
    });
    v.tone(t + 0.2, 'sine', 73.4, 70, 3.2, 0.25, 0.3);
    v.tone(t + 0.2, 'sawtooth', 36.7, 35, 3.2, 0.08, 0.5, 300);
    v.noise(t + 1.4, 'bandpass', 900, 500, 1.6, 0.06, 0.5, 0.8); // a dark wash
  }, { send: 0.4 }),
  // ── Champions' attacks.
  atkBow: fx((v, t) => {
    // Jordini's bowstring: a twang with a buzz in it, and the arrow hissing away.
    v.tone(t, 'triangle', 230, 170, 0.14, 0.26);
    v.fm(t, 460, 340, 2, 1.2, 0.08, 0.1, 0.002);
    v.noise(t + 0.01, 'bandpass', 3200, 1400, 0.09, 0.18, 2);
  }, { gap: 0.05 }),
  atkAxe: fx((v, t) => {
    // The Oak's axe: a heavy whoosh, then the chop, wood splitting under it.
    v.noise(t, 'bandpass', 900, 260, 0.2, 0.45, 1.2);
    v.click(t + 0.12, 0.4, 3000);
    v.tone(t + 0.12, 'sine', 115, 50, 0.18, 0.45);
    v.noise(t + 0.12, 'bandpass', 1800, 600, 0.05, 0.3, 1.5);
  }, { gap: 0.05, send: 0.18 }),
  atkHook: fx((v, t) => {
    // Willmore: chain links paying out, and the bin lid clanging at the end of them.
    for (let i = 0; i < 4; i++) v.noise(t + i * 0.035, 'bandpass', 4200 + i * 400, 3000, 0.035, 0.5, 4);
    v.fm(t + 0.12, 420, 400, 3.7, 4, 0.18, 0.14, 0.002);
  }, { gap: 0.05 }),
  atkSpore: fx((v, t) => {
    // HunnaG: a wet pop and a puff of spores.
    v.tone(t, 'sine', 280, 720, 0.09, 0.25);
    v.tone(t + 0.04, 'sine', 500, 900, 0.06, 0.12);
    v.noise(t, 'lowpass', 1200, 400, 0.1, 0.14);
    v.noise(t + 0.06, 'highpass', 4000, 2500, 0.18, 0.07);
  }, { gap: 0.05 }),
  atkClaw: fx((v, t) => {
    // Logan: three rakes of the claws over a rumble in the chest.
    for (let i = 0; i < 3; i++) v.noise(t + i * 0.03, 'bandpass', 2600 - i * 300, 800, 0.08, 0.3, 1.5);
    v.noise(t, 'lowpass', 320, 160, 0.16, 0.18);
  }, { gap: 0.05 }),
  atkScepter: fx((v, t) => {
    // King Rix: a bolt from the scepter with a ting of gold on it.
    v.tone(t, 'sine', 880, 1320, 0.12, 0.14);
    v.bell(t + 0.02, 2200, 0.25, 0.09, COIN);
    v.noise(t, 'bandpass', 3000, 6000, 0.1, 0.06, 2);
  }, { gap: 0.05, send: 0.2 }),
  atkToken: fx((v, t) => {
    // Scrimby: a subway token flicked off the thumb, a brassy little spin.
    v.click(t, 0.18, 4200);
    v.bell(t + 0.01, 1760, 0.18, 0.08, COIN);
    v.tone(t, 'triangle', 1200, 1900, 0.06, 0.06);
  }, { gap: 0.05 }),
  atkCoin: fx((v, t) => {
    // Big Whale: a coin flipped at them, ringing as it goes.
    v.bell(t, 2900, 0.3, 0.12, COIN);
    v.bell(t + 0.05, 3400, 0.25, 0.07, COIN);
    v.noise(t, 'highpass', 5000, 3000, 0.05, 0.04);
  }, { gap: 0.05, send: 0.15 }),
  atkPunch: fx((v, t) => {
    // Dongmaster: a fist landing, the knuckles, the meat, the air going out.
    v.click(t, 0.3, 2500);
    v.tone(t, 'sine', 150, 48, 0.14, 0.4);
    v.noise(t, 'bandpass', 700, 250, 0.06, 0.3, 1);
    v.noise(t + 0.02, 'lowpass', 900, 220, 0.1, 0.18);
  }, { gap: 0.05 }),
  atkRig: fx((v, t) => {
    // The Dabber: the glass clinks, the water burbles, and he puffs.
    v.bell(t, 2100, 0.15, 0.08, COIN);
    for (let i = 0; i < 3; i++) v.tone(t + 0.02 + i * 0.04, 'sine', 180 + i * 40, 260 + i * 40, 0.04, 0.12);
    v.noise(t + 0.05, 'highpass', 2600, 1200, 0.22, 0.14);
  }, { gap: 0.05 }),
  atkEpee: fx((v, t) => {
    // Paris: a thin zing and a ting off the point.
    v.tone(t, 'sawtooth', 1800, 2700, 0.07, 0.04, 0.003, 5000);
    v.noise(t, 'highpass', 6200, 3000, 0.07, 0.24);
    v.fm(t + 0.03, 3200, 3000, 1.4, 1.5, 0.12, 0.06, 0.002);
  }, { gap: 0.05 }),
  atkCheese: fx((v, t) => {
    // Havarti: a holy shing, the blade's sweep with a hint of choir in it, and a sizzle of molten cheese.
    v.noise(t, 'bandpass', 1800, 700, 0.16, 0.3, 1.2);
    for (const f of [660, 990]) v.tone(t, 'sine', f, f * 1.02, 0.2, 0.05, 0.02);
    v.noise(t, 'highpass', 4200, 3000, 0.28, 0.07);
  }, { gap: 0.05, send: 0.25 }),
  atkDagger: fx((v, t) => {
    // Daltonomo: a swish and the bells on his hat.
    v.noise(t, 'bandpass', 3200, 1500, 0.06, 0.55, 2);
    v.bell(t + 0.03, 2200, 0.15, 0.1, COIN);
    v.bell(t + 0.06, 2900, 0.15, 0.08, COIN);
  }, { gap: 0.05 }),
  // ── Their signatures under every cast.
  castStamp: fx((v, t) => {
    // Jordini's rubber stamp coming down, with a slap of paper.
    v.click(t, 0.2, 2000);
    v.tone(t, 'sine', 125, 75, 0.1, 0.25);
    v.noise(t, 'lowpass', 1600, 300, 0.08, 0.16);
  }),
  castDrum: fx((v, t) => {
    for (const dt of [0, 0.16]) {
      v.tone(t + dt, 'sine', 95, 50, 0.24, dt ? 0.23 : 0.28);
      v.noise(t + dt, 'bandpass', 400, 200, 0.04, dt ? 0.12 : 0.15, 1);
    }
  }),
  castClank: fx((v, t) => {
    v.fm(t, 420, 380, 3.5, 5, 0.18, 0.15, 0.002);
    v.noise(t, 'bandpass', 2600, 2000, 0.16, 0.4, 4);
  }),
  castBubble: fx((v, t) => {
    for (let i = 0; i < 3; i++) v.tone(t + i * 0.05, 'sine', 300 + i * 120, 620 + i * 150, 0.05, 0.2);
    v.noise(t, 'lowpass', 800, 300, 0.15, 0.08);
  }),
  castGrowl: fx((v, t) => {
    v.noise(t, 'lowpass', 420, 200, 0.35, 0.7, 1, 0.04);
    v.tone(t, 'sawtooth', 92, 72, 0.3, 0.14, 0.04, 600);
  }),
  castRoyal: fx((v, t) => [NOTE.C6, 1318.5, 1568].forEach((f, i) => v.bell(t + i * 0.05, f, 0.35, 0.14)), { send: 0.25, pitch: 0 }),
  castHonk: fx((v, t) => {
    // Scrimby: a New York cab horn, twice, impatient.
    for (const dt of [0, 0.16]) {
      v.tone(t + dt, 'sawtooth', 370, 370, 0.12, 0.07, 0.02, 1500);
      v.tone(t + dt, 'sawtooth', 466, 466, 0.12, 0.06, 0.02, 1500);
    }
  }, { gap: 0.1, pitch: 0 }),
  castCashier: fx((v, t) => {
    // Big Whale: the register drawer, and a coin or two for show.
    v.click(t, 0.3, 2400);
    v.bell(t + 0.04, 2650, 0.4, 0.14);
    v.bell(t + 0.12, 3100, 0.3, 0.07, COIN);
  }, { send: 0.2 }),
  castGrunt: voice((v, t) => v.vowel(t, 112, 88, 0.18, 0.75, [480, 1400], 0.01)),
  castFlick: fx((v, t) => {
    v.click(t, 0.25, 5500); // the lighter's click
    v.noise(t + 0.05, 'bandpass', 900, 400, 0.22, 0.14); // the flame
    v.noise(t + 0.05, 'lowpass', 300, 150, 0.2, 0.08); // and its low whump
  }),
  castFlourish: fx((v, t) => {
    v.noise(t, 'bandpass', 1000, 4200, 0.16, 0.55, 1.5); // a sweep of the blade
    v.fm(t + 0.12, 1500, 1500, 1.4, 1.2, 0.14, 0.12, 0.002);
  }),
  castAngelic: fx((v, t) => {
    for (const [f, vol] of [[660, 0.12], [990, 0.08], [1320, 0.06]] as const) v.tone(t, 'sine', f, f * 1.005, 0.5, vol, 0.06);
    v.noise(t, 'bandpass', 3000, 7000, 0.4, 0.05, 1.5, 0.1);
  }, { send: 0.4, pitch: 0 }),
  castJingle: fx((v, t) => {
    [2200, 2900, 2550, 3100].forEach((f, i) => v.bell(t + i * 0.04, f, 0.15, 0.1, COIN));
    v.tone(t, 'sawtooth', 420, 390, 0.12, 0.08, 0.005, 1500); // a little honk
  }),
  // ── The map events (render/events.ts).
  eventWarn: ui((v, t) => {
    // The watchman: two strikes on a cracked bell, then a low horn climbing a fourth. Something's coming.
    for (const dt of [0, 0.3]) {
      v.click(t + dt, 0.15, 1800);
      v.bell(t + dt, 392, 0.9, 0.22, [[1, 1], [2.1, 0.4], [2.9, 0.25], [4.4, 0.1]]);
    }
    v.noise(t + 0.6, 'bandpass', 700, 500, 0.1, 0.08, 1.5, 0.02);
    v.tone(t + 0.6, 'sawtooth', 146.8, 196, 0.9, 0.07, 0.1, 1600);
    v.tone(t + 0.6, 'triangle', 147, 196, 0.9, 0.14, 0.08);
  }, { send: 0.35, pitch: 0 }),
  eventStart: ui((v, t) => {
    // It's on: a drum, a brass stab a fifth up, and a cymbal.
    for (let i = 0; i < 3; i++) v.tone(t + i * 0.06, 'sine', 150, 55, 0.14, 0.3, 0.002);
    for (const f of [196, 293.66, 392]) {
      v.tone(t + 0.18, 'sawtooth', f * 0.996, f, 0.7, 0.045, 0.02, 2600);
      v.tone(t + 0.18, 'sawtooth', f * 1.004, f, 0.7, 0.045, 0.02, 2600);
    }
    v.tone(t + 0.18, 'sine', 98, 98, 0.7, 0.3, 0.01);
    v.noise(t + 0.18, 'highpass', 6000, 3000, 0.8, 0.07, 0.5, 0.01);
  }, { send: 0.3, pitch: 0 }),
  coatCreak: fx((v, t) => {
    // The whole stack leaning over: a long rising creak of wood and cloth, three little yelps inside it.
    v.fm(t, 90, 260, 1.01, 2.5, 0.9, 0.16, 0.05, 'sawtooth');
    v.noise(t, 'bandpass', 500, 1600, 0.9, 0.18, 4, 0.08);
    for (let i = 0; i < 3; i++) v.tone(t + 0.35 + i * 0.16, 'square', 420 + i * 90, 300 + i * 60, 0.09, 0.05, 0.003, 1800);
  }, { send: 0.25 }),
  coatCrash: fx((v, t) => {
    // Down it comes: a whump of cloth and a thump in the ground, dust after, and a muffled "oof".
    v.click(t, 0.3, 1600);
    v.tone(t, 'sine', 110, 36, 0.5, 0.85, 0.004);
    v.noise(t, 'lowpass', 1100, 140, 0.45, 0.6, 1, 0.005);
    v.noise(t + 0.05, 'bandpass', 420, 180, 0.25, 0.35, 1.2, 0.01); // the cloth
    v.noise(t + 0.25, 'highpass', 1800, 900, 1.0, 0.06, 0.6, 0.2); // the dust
    v.vowel(t + 0.3, 130, 95, 0.25, 0.5, [520, 1100], 0.02);
  }, { duck: 0.3, send: 0.3, gap: 0.3 }),
  cartBell: fx((v, t) => {
    // Ding-ding on the cart's bell, and the rattle of its load over the stones.
    v.bell(t, 2350, 0.45, 0.16, COIN);
    v.bell(t + 0.11, 2350, 0.5, 0.14, COIN);
    for (let i = 0; i < 4; i++) v.noise(t + i * 0.07 + Math.random() * 0.03, 'bandpass', 900 + Math.random() * 600, 400, 0.04, 0.1, 3);
  }, { gap: 0.5, send: 0.2 }),
};
