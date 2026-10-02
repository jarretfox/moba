// Music and the sounds of the place, made on the fly with Web Audio like the sound effects: no files.
//
// The score is a slow dusk loop in D minor (pads with a shimmer over them, a soft bass, plucked notes
// wandering a pentatonic scale through an echo and a hall, and now and then a little flute phrase), with a
// fight layer of drums and a pulsing bass that swells in when you're trading blows with champions. It
// settles as night comes on, and steps back for the victory or defeat stinger.
//
// On the Howling Hollow it turns haunted: the same engine in E harmonic minor (Em, C, Am, B7), a music box
// for the plucks, and a wavering theremin where the flute would play.
//
// Under it, the soundscape: wind everywhere (gusting in a storm or an autumn blow, hushed in the snow,
// damp and muffled in the mist), rain pattering, water rushing and burbling by the river, crickets and the
// odd owl in the jungle once dusk falls, the Warden's pit droning, and the faint hum of the crystals on
// the structures.

import type { Weather } from '../shared/weather';

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Seconds per step; 16 steps to a chord. */
const STEP = 0.25;
/** The music's level at full volume: kept well under the effects, so it never drowns them out. */
const MUSIC_GAIN = 0.46;
/** In a big fight the harmony turns to a darker, driving progression: Dm, Bb, F, C. */
const FIGHT_CHORDS: { pad: number[]; bass: number }[] = [
  { pad: [50, 57, 62, 65], bass: 38 },
  { pad: [53, 58, 62, 65], bass: 34 },
  { pad: [53, 57, 60, 65], bass: 41 },
  { pad: [52, 55, 60, 64], bass: 36 },
];
/** Vowel formants for the choir ("ah"). */
const CHOIR_FORMANTS: readonly (readonly [number, number])[] = [[730, 1], [1090, 0.5], [2440, 0.18]];
const CHORDS: { pad: number[]; bass: number }[] = [
  { pad: [50, 57, 60, 64], bass: 38 }, // Dm9
  { pad: [58, 62, 65, 69], bass: 34 }, // Bbmaj7
  { pad: [55, 62, 65, 69], bass: 43 }, // Gm9
  { pad: [57, 62, 64, 69], bass: 45 }, // Asus
];
const SCALE = [62, 65, 67, 69, 72, 74, 77, 79];
/** The Howling Hollow: Em, C, Am, B7, and in a fight Em, C, D#dim, B. */
const HOLLOW_CHORDS: { pad: number[]; bass: number }[] = [
  { pad: [52, 59, 64, 67], bass: 40 },
  { pad: [52, 60, 64, 67], bass: 36 },
  { pad: [57, 60, 64, 69], bass: 45 },
  { pad: [54, 59, 63, 69], bass: 47 },
];
const HOLLOW_FIGHT: { pad: number[]; bass: number }[] = [
  { pad: [52, 59, 64, 67], bass: 40 },
  { pad: [48, 55, 60, 64], bass: 36 },
  { pad: [51, 57, 60, 66], bass: 39 },
  { pad: [47, 54, 59, 63], bass: 35 },
];
/** E harmonic minor. */
const HOLLOW_SCALE = [64, 66, 67, 71, 72, 75, 76, 79];
/** Little flute phrases for the calm stretches: [degree of SCALE, step it starts on, steps it lasts]. */
const MOTIFS: readonly (readonly [number, number, number])[][] = [
  [[4, 0, 3], [3, 3, 3], [2, 6, 6], [4, 12, 4]],
  [[2, 0, 2], [3, 2, 2], [4, 4, 4], [6, 8, 8]],
  [[6, 0, 3], [4, 3, 3], [3, 6, 2], [2, 8, 8]],
  [[4, 0, 2], [6, 2, 2], [7, 4, 6], [6, 10, 6]],
];
/** How far ahead notes are scheduled; generous so a busy or backgrounded tab doesn't leave gaps. */
const AHEAD = 1.2;

function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}

export class Music {
  private readonly bus: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly echo: GainNode;
  private step = 0;
  private nextAt = 0;
  private intensity = 0;
  private targetIntensity = 0;
  private chord = CHORDS[0];
  private night = 0;
  /** The Howling Hollow's spooky score. */
  private haunted = false;
  private on: boolean;
  /** The music volume setting, 0–1. */
  private level = 1;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly noise: AudioBuffer,
    on: boolean,
  ) {
    this.on = on;
    this.bus = ctx.createGain();
    this.bus.gain.value = on ? MUSIC_GAIN * this.level : 0;
    this.bus.connect(out);
    this.dry = ctx.createGain();
    this.dry.connect(this.bus);
    // A big soft hall...
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 3);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.9;
    this.wet.connect(reverb).connect(this.bus);
    // ...and an echo for the plucks, darkening as it repeats.
    this.echo = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    this.echo.connect(delay).connect(tone).connect(feedback).connect(delay);
    tone.connect(this.wet);
    tone.connect(this.dry);
    this.nextAt = ctx.currentTime + 0.2;
    setInterval(() => this.schedule(), 250);
  }

  toggle(): boolean {
    this.on = !this.on;
    this.applyVolume();
    return this.on;
  }

  setLevel(v: number): void {
    this.level = v;
    this.applyVolume();
  }

  /** Steps back for a stinger (the victory or defeat jingle), and comes back up `seconds` later. */
  hush(seconds: number): void {
    if (!this.on) return;
    const g = this.bus.gain;
    const now = this.ctx.currentTime;
    const full = MUSIC_GAIN * this.level;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(full * 0.12, now, 0.25);
    g.setTargetAtTime(full, now + seconds, 1.5);
  }

  /** How far into the night it is, 0–1: the pads darken, the shimmer rises and the plucks thin out. */
  setNight(k: number): void {
    this.night = Math.max(0, Math.min(1, k));
  }

  /** The Howling Hollow: from the next bar, the haunted score. */
  setHaunted(on: boolean): void {
    this.haunted = on;
  }

  private applyVolume(): void {
    const g = this.bus.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(this.on ? MUSIC_GAIN * this.level : 0, this.ctx.currentTime, 0.2);
  }

  /** 0 when calm, about 0.5 in a skirmish, 1 in a full teamfight: the drums, brass, strings and choir follow it. */
  setIntensity(v: number): void {
    this.targetIntensity = Math.max(0, Math.min(1, v));
  }

  private schedule(): void {
    if (this.ctx.state !== 'running') return;
    // Don't try to catch up on time lost while the tab slept.
    if (this.nextAt < this.ctx.currentTime) this.nextAt = this.ctx.currentTime + 0.05;
    while (this.nextAt < this.ctx.currentTime + AHEAD) {
      // Swell in quickly, fade out slowly.
      const rate = this.targetIntensity > this.intensity ? 0.08 : 0.012;
      this.intensity += (this.targetIntensity - this.intensity) * rate;
      this.playStep(this.step, this.nextAt);
      this.step++;
      this.nextAt += STEP;
    }
  }

  private playStep(step: number, at: number): void {
    const inBar = step % 16;
    const fight = this.intensity;
    // How far into an all-out teamfight we are: the epic layer.
    const epic = Math.max(0, Math.min(1, (fight - 0.6) / 0.4));
    const bar = Math.floor(step / 16);
    // The chord is chosen at the top of each bar and held through it, even if the fight changes mid-bar.
    const chords = this.haunted ? (epic > 0.3 ? HOLLOW_FIGHT : HOLLOW_CHORDS) : epic > 0.3 ? FIGHT_CHORDS : CHORDS;
    if (inBar === 0) this.chord = chords[bar % chords.length];
    const chord = this.chord;
    if (inBar === 0) {
      for (const n of chord.pad) this.pad(midi(n), at, STEP * 16 + 0.6);
      this.shimmer(chord.pad.slice(2).map((n) => midi(n + 12)), at, STEP * 16 + 0.6);
      this.bass(midi(chord.bass), at, STEP * 16);
      // Every few chords, when it's calm, a little phrase on the flute; between them, now and then, a harp rolls a chord.
      if (step % 64 === 0 && fight < 0.25 && Math.random() < 0.6) {
        if (this.haunted) this.theremin(at);
        else this.phrase(at);
      } else if (step % 32 === 16 && fight < 0.25 && Math.random() < 0.5) this.harp(chord.pad, at);
      // At night, far off, a low horn calls now and then.
      if (step % 128 === 64 && this.night > 0.5 && fight < 0.25) this.horn(midi(chord.bass + 12), at, 3.5, 0.025 * this.night);
      if (epic > 0) {
        this.choir(chord.pad.map((n) => midi(n)), at, STEP * 16 + 0.4, 0.016 * epic);
        this.brass(chord.pad.map((n) => midi(n - 12)), at, 0.9, 0.05 * epic);
      }
    }
    if (epic > 0.4) {
      // Brass stabs on the off-beats, and a cymbal swell into each new chord.
      if (inBar === 6 || inBar === 10) this.brass(chord.pad.map((n) => midi(n - 12)), at, 0.32, 0.035 * epic);
      if (inBar === 12) this.swell(at, STEP * 4, 0.05 * epic);
      // Taiko: big low drums in a driving pattern.
      if ([0, 3, 6, 8, 11, 12, 14].includes(inBar)) this.taiko(at, (inBar % 4 === 0 ? 0.55 : 0.32) * epic);
    }
    if (fight > 0.5) {
      // Strings: a running staccato figure on the chord, every step once it's a real teamfight.
      const figure = [chord.pad[0], chord.pad[2], chord.pad[3], chord.pad[2]];
      if (epic > 0.2 || step % 2 === 0) this.stab(midi(figure[step % 4] + 12), at, 0.022 * fight);
    }
    // Plucks: sparse and wandering when calm (sparser still at night), a running arpeggio in a fight.
    const pluck = (f: number, when: number, vol: number) => (this.haunted ? this.musicBox(f * 2, when, vol * 0.8) : this.pluck(f, when, vol));
    if (fight > 0.45 && step % 2 === 0) {
      const arp = [...chord.pad, ...chord.pad.map((n) => n + 12)];
      pluck(midi(arp[(step / 2) % arp.length] + 12), at, 0.05 * fight);
    } else if (step % 2 === 0 && Math.random() < 0.28 * (1 - 0.4 * this.night)) {
      const scale = this.haunted ? HOLLOW_SCALE : SCALE;
      pluck(midi(scale[Math.floor(Math.random() * scale.length)]), at, 0.07);
    }
    // Drums and a pulsing bass for the fight.
    if (fight > 0.05) {
      if (inBar % 4 === 0) this.kick(at, 0.5 * fight);
      if (inBar % 4 === 2 && fight > 0.5) this.kick(at, 0.25 * fight);
      if (step % 2 === 1) this.hat(at, 0.05 * fight);
      if ((inBar === 12 || inBar === 14) && fight > 0.7) this.tom(at, 0.3 * fight);
      if (fight > 0.35 && step % 2 === 0) this.pulse(midi(chord.bass + 12), at, 0.06 * fight);
      if (fight > 0.6 && (inBar === 4 || inBar === 12)) this.ride(at, 0.035 * fight);
    }
  }

  /** A rolled chord on the harp (a music box on the Hollow): the chord's notes plucked upward one after another. */
  private harp(notes: number[], at: number): void {
    [...notes, notes[0] + 12, notes[1] + 12].forEach((n, i) => (this.haunted ? this.musicBox(midi(n + 24), at + i * 0.14, 0.035) : this.pluck(midi(n + 12), at + i * 0.09, 0.045)));
  }

  /** A music box tine: a pure tone with a glassy partial over it, ringing out, slightly out of tune. */
  private musicBox(f: number, at: number, vol: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
    g.connect(this.dry);
    g.connect(this.wet);
    g.connect(this.echo);
    for (const [mult, level, detune] of [[1, 1, -4], [4.07, 0.22, 0], [2, 0.12, 6]] as const) {
      const o = this.ctx.createOscillator();
      o.frequency.value = f * mult;
      o.detune.value = detune;
      const lv = this.ctx.createGain();
      lv.gain.value = level;
      o.connect(lv).connect(g);
      o.start(at);
      o.stop(at + 1.65);
    }
  }

  /** A theremin line: one wavering voice sliding between notes of the Hollow's scale, swelling and fading. */
  private theremin(at: number): void {
    const notes = Array.from({ length: 4 }, () => HOLLOW_SCALE[Math.floor(Math.random() * HOLLOW_SCALE.length)] + 12);
    const each = STEP * 4;
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(midi(notes[0]), at);
    notes.forEach((n, i) => {
      if (i) o.frequency.linearRampToValueAtTime(midi(n), at + i * each + 0.3);
      o.frequency.setValueAtTime(midi(n), at + i * each + 0.3);
    });
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 6;
    const depth = this.ctx.createGain();
    depth.gain.value = 9;
    vib.connect(depth).connect(o.detune);
    const g = this.ctx.createGain();
    const end = at + notes.length * each;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.03, at + 0.6);
    g.gain.setValueAtTime(0.03, end - 0.8);
    g.gain.linearRampToValueAtTime(0.0001, end);
    o.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    o.start(at);
    vib.start(at);
    o.stop(end + 0.05);
    vib.stop(end + 0.05);
  }

  /** A soft, far-off horn: a long triangle note with a slow swell. */
  private horn(f: number, at: number, dur: number, vol: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    o.connect(filter).connect(g);
    g.connect(this.wet);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** A choir holding the chord on "ah": stacked saws through the vowel's formants, swelling in slowly. */
  private choir(freqs: number[], at: number, dur: number, vol: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 1.4);
    g.gain.setValueAtTime(vol, at + dur - 1.2);
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    g.connect(this.dry);
    g.connect(this.wet);
    const voices = this.ctx.createGain();
    for (const [hz, level] of CHOIR_FORMANTS) {
      const band = this.ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = hz;
      band.Q.value = 6;
      const lv = this.ctx.createGain();
      lv.gain.value = level;
      voices.connect(band).connect(lv).connect(g);
    }
    for (const f of freqs) {
      for (const cents of [-9, 0, 9]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents;
        o.connect(voices);
        o.start(at);
        o.stop(at + dur + 0.05);
      }
    }
  }

  /** A brass chord: bright saws with a quick bite, the filter opening on the attack and closing as it fades. */
  private brass(freqs: number[], at: number, dur: number, vol: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, at);
    filter.frequency.linearRampToValueAtTime(2400, at + 0.06);
    filter.frequency.exponentialRampToValueAtTime(700, at + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    filter.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    for (const f of freqs) {
      for (const cents of [-6, 6]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = cents;
        o.connect(filter);
        o.start(at);
        o.stop(at + dur + 0.05);
      }
    }
  }

  /** A short bowed string note, staccato. */
  private stab(f: number, at: number, vol: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    filter.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    for (const cents of [-5, 5]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(filter);
      o.start(at);
      o.stop(at + 0.22);
    }
  }

  /** A taiko: a deep drum with a slap of skin on top, ringing in the hall. */
  private taiko(at: number, vol: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(95, at);
    o.frequency.exponentialRampToValueAtTime(48, at + 0.35);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    o.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    o.start(at);
    o.stop(at + 0.65);
    const slap = this.ctx.createBufferSource();
    slap.buffer = this.noise;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900;
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(vol * 0.5, at);
    sg.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
    slap.connect(band).connect(sg).connect(this.dry);
    slap.start(at, Math.random() * 0.5);
    slap.stop(at + 0.1);
  }

  /** A cymbal swelling up into the next beat. */
  private swell(at: number, dur: number, vol: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.setValueAtTime(3000, at);
    f.frequency.linearRampToValueAtTime(7000, at + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.15);
    src.connect(f).connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.2);
  }

  private pad(f: number, at: number, dur: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    // The pad opens up through each chord; less so at night.
    filter.frequency.setValueAtTime(380, at);
    filter.frequency.linearRampToValueAtTime(950 - 350 * this.night, at + dur * 0.5);
    filter.frequency.linearRampToValueAtTime(420, at + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.028, at + 1.6);
    g.gain.setValueAtTime(0.028, at + dur - 1.6);
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    filter.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    for (const cents of [-7, 7]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(filter);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
  }

  /** A faint, slowly trembling sheen an octave over the pad; it comes forward at night. */
  private shimmer(freqs: number[], at: number, dur: number): void {
    const g = this.ctx.createGain();
    const vol = 0.007 + 0.009 * this.night;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 2);
    g.gain.setValueAtTime(vol, at + dur - 1.5);
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    g.connect(this.wet);
    const trem = this.ctx.createGain();
    trem.gain.value = 0.7;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.9 + Math.random() * 0.4;
    const depth = this.ctx.createGain();
    depth.gain.value = 0.3;
    lfo.connect(depth).connect(trem.gain);
    trem.connect(g);
    lfo.start(at);
    lfo.stop(at + dur + 0.05);
    for (const f of freqs) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(trem);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
  }

  private bass(f: number, at: number, dur: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.12, at + 0.8);
    g.gain.setValueAtTime(0.12, at + dur - 1);
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.dry);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** A short bass note on the beat, under the drums. */
  private pulse(f: number, at: number, vol: number): void {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    o.connect(g).connect(this.dry);
    o.start(at);
    o.stop(at + 0.22);
  }

  private pluck(f: number, at: number, vol: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);
    g.connect(this.dry);
    g.connect(this.wet);
    g.connect(this.echo);
    for (const [type, mult, level] of [['triangle', 1, 1], ['sine', 2, 0.35]] as const) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const lv = this.ctx.createGain();
      lv.gain.value = level;
      o.connect(lv).connect(g);
      o.start(at);
      o.stop(at + 1.15);
    }
  }

  /** One of the little phrases, on the flute. */
  private phrase(at: number): void {
    const motif = MOTIFS[Math.floor(Math.random() * MOTIFS.length)];
    for (const [degree, start, len] of motif) this.flute(midi(SCALE[degree] + 12), at + start * STEP, len * STEP, 0.03);
  }

  /** A breathy flute: a sine with a touch of its harmonics, vibrato, and a whisper of air. */
  private flute(f: number, at: number, dur: number, vol: number): void {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.08);
    g.gain.setValueAtTime(vol, at + Math.max(0.1, dur - 0.15));
    g.gain.linearRampToValueAtTime(0.0001, at + dur);
    g.connect(this.dry);
    g.connect(this.wet);
    g.connect(this.echo);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.5;
    const depth = this.ctx.createGain();
    depth.gain.value = 7; // cents
    vib.connect(depth);
    for (const [mult, level] of [[1, 1], [2, 0.25], [3, 0.08]] as const) {
      const o = this.ctx.createOscillator();
      o.frequency.value = f * mult;
      depth.connect(o.detune);
      const lv = this.ctx.createGain();
      lv.gain.value = level;
      o.connect(lv).connect(g);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
    vib.start(at);
    vib.stop(at + dur + 0.05);
    const air = this.ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = f;
    band.Q.value = 12;
    const lv = this.ctx.createGain();
    lv.gain.value = 0.25;
    air.connect(band).connect(lv).connect(g);
    air.start(at, Math.random() * 0.5);
    air.stop(at + dur + 0.05);
  }

  private kick(at: number, vol: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(130, at);
    o.frequency.exponentialRampToValueAtTime(42, at + 0.22);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    o.connect(g).connect(this.dry);
    o.start(at);
    o.stop(at + 0.4);
  }

  private tom(at: number, vol: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(190, at);
    o.frequency.exponentialRampToValueAtTime(90, at + 0.3);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    o.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    o.start(at);
    o.stop(at + 0.45);
  }

  private hat(at: number, vol: number): void {
    this.cymbal(at, vol, 7000, 0.05);
  }

  /** A longer, lower splash than the hat. */
  private ride(at: number, vol: number): void {
    this.cymbal(at, vol, 5000, 0.3);
  }

  private cymbal(at: number, vol: number, hz: number, dur: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hz;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.dry);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.01);
  }
}

/** The wind's level on an ordinary evening. */
const WIND = 0.03;

/**
 * Wind, rain, water, crickets and owls, the pit and the crystals: louder where the camera is, and
 * changing with the weather and the hour. `out` is the ambience bus; `wet` a send into the shared hall.
 */
export class Soundscape {
  /** Everything passes through this: wide open normally, closed in by mist and snow. */
  private readonly muffle: BiquadFilterNode;
  private readonly windBand: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly leafGain: GainNode;
  private readonly riverGain: GainNode;
  private readonly burbleGain: GainNode;
  private readonly rainGain: GainNode;
  private readonly rumbleGain: GainNode;
  private readonly pitGain: GainNode;
  private readonly humGain: GainNode;
  /** Its own long stretch of noise, so the wind and water never audibly loop. */
  private readonly noise: AudioBuffer;
  private weather: Weather | null = null;
  private windK = 1;
  private rain = 0;
  private night = 0;
  private jungle = 0;
  private river = 0;
  private pit = 0;
  private hum = 0;
  /** The gust blowing now, and the one it's building to. */
  private gust = 0;
  private gustTarget = 0;
  private rustleAt = 0;
  private rumbleAt = 0;
  /** The Howling Hollow: wolves howling far off, crows, and the wind moaning through the graves. */
  private haunted = false;
  private howlAt = 0;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly wet: AudioNode,
  ) {
    const noise = (this.noise = ctx.createBuffer(1, ctx.sampleRate * 5, ctx.sampleRate));
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 18000;
    this.muffle.Q.value = 0.4;
    this.muffle.connect(out);
    const level = (v: number, from: AudioNode) => {
      const g = ctx.createGain();
      g.gain.value = v;
      from.connect(g).connect(this.muffle);
      return g;
    };
    const filter = (type: BiquadFilterType, hz: number, q: number, from: AudioNode) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = hz;
      f.Q.value = q;
      from.connect(f);
      return f;
    };
    // Wind: noise through a band that slowly wanders; its level gusts (see tick).
    this.windBand = filter('bandpass', 420, 0.6, this.loop(noise));
    this.windGain = level(WIND, this.windBand);
    this.lfo(0.06, 180, this.windBand.frequency);
    // Leaves: a higher rustle that the autumn gusts tear through.
    this.leafGain = level(0, filter('bandpass', 2600, 0.8, this.loop(noise)));
    // River: low rushing water, and a burble over it whose pitch wobbles.
    this.riverGain = level(0, filter('highpass', 220, 1, filter('lowpass', 900, 1, this.loop(noise))));
    const burble = filter('bandpass', 700, 2.5, this.loop(noise));
    this.lfo(0.8, 220, burble.frequency);
    this.burbleGain = level(0, burble);
    // Rain: a soft hiss (the pattering is added drop by drop in tick).
    this.rainGain = level(0, filter('bandpass', 3200, 0.4, this.loop(noise)));
    // A storm's low, uneasy rumble under everything, swelling and sinking (the tremolo is its own stage, so
    // it stays silent when the level is 0).
    const rumbleTrem = ctx.createGain();
    rumbleTrem.gain.value = 0.65;
    this.lfo(0.11, 0.35, rumbleTrem.gain);
    filter('lowpass', 120, 0.7, this.loop(noise)).connect(rumbleTrem);
    this.rumbleGain = level(0, rumbleTrem);
    // The Warden's pit: two low tones beating against each other, and a growl under them.
    const drone = ctx.createGain();
    for (const [hz, type, v] of [[52, 'sine', 1], [55.3, 'sine', 0.8], [104, 'sawtooth', 0.3]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = v;
      o.connect(g).connect(drone);
      o.start();
    }
    this.pitGain = level(0, filter('lowpass', 160, 1, drone));
    // The crystals on the structures: a faint hum, trembling slowly.
    const crystal = ctx.createGain();
    for (const [hz, v] of [[196, 1], [294, 0.5], [392.5, 0.3]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = v;
      o.connect(g).connect(crystal);
      o.start();
    }
    const trem = ctx.createGain();
    trem.gain.value = 0.75;
    this.lfo(0.4, 0.25, trem.gain);
    crystal.connect(trem);
    this.humGain = level(0, trem);
    setInterval(() => this.tick(), 120);
  }

  /** The weather (null for clear) and how hard its wind blows (1 = an ordinary evening). */
  setWeather(kind: Weather | null, windK: number): void {
    this.weather = kind;
    this.windK = windK;
    this.rain = kind === 'storm' ? 1 : kind === 'rain' ? 0.6 : 0;
    const now = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(this.rain * 0.03, now, 1);
    this.rumbleGain.gain.setTargetAtTime(kind === 'storm' ? 0.035 : 0, now, 2);
    // Mist muffles everything; snow takes the edge off.
    this.muffle.frequency.setTargetAtTime(kind === 'mist' ? 1400 : kind === 'snow' ? 3500 : 18000, now, 1.5);
    // The wind sits lower in the snow, higher in an autumn blow.
    this.windBand.frequency.setTargetAtTime(kind === 'snow' ? 260 : kind === 'autumn' ? 520 : 420, now, 1.5);
  }

  /** How far into the night it is, 0–1: the crickets and owls come up, the wind drops. */
  setNight(k: number): void {
    this.night = Math.max(0, Math.min(1, k));
  }

  setHaunted(on: boolean): void {
    this.haunted = on;
    this.howlAt = this.ctx.currentTime + 6;
  }

  /** How much of the view is jungle, river, the Warden's pit and structures (0–1 each). */
  setPlace(jungle: number, river: number, pit: number, hum: number): void {
    this.jungle += (jungle - this.jungle) * 0.3;
    this.river += (river - this.river) * 0.3;
    this.pit += (pit - this.pit) * 0.3;
    this.hum += (hum - this.hum) * 0.3;
  }

  private tick(): void {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const w = this.weather;
    const storm = w === 'storm';
    const autumn = w === 'autumn';
    const cold = w === 'snow';
    // The wind comes in gusts: now and then it picks a new strength to build to, harder and more often
    // in a storm or an autumn blow. It drops a little at night, and in the snow and the mist.
    if (Math.random() < 0.06) this.gustTarget = Math.random() < (storm ? 0.5 : autumn ? 0.4 : 0.15) ? 0.6 + Math.random() * 0.4 : 0;
    this.gust += (this.gustTarget - this.gust) * 0.12;
    const still = cold || w === 'mist' ? 0.7 : 1;
    const wind = WIND * this.windK * (1 + this.gust * (storm ? 1 : 0.6)) * (1 - 0.25 * this.night) * still;
    this.windGain.gain.setTargetAtTime(Math.min(0.3, wind), now, 0.3);
    // Autumn: the gusts tear through the leaves.
    this.leafGain.gain.setTargetAtTime(autumn ? 0.03 * this.gust * this.windK : 0, now, 0.25);
    if (autumn && this.gust > 0.45 && now > this.rustleAt) {
      this.rustle(now);
      this.rustleAt = now + 0.35 + Math.random() * 0.5;
    }
    // The river rushes and burbles, its levels never quite steady, with the odd plip.
    const riverK = w === 'mist' ? 0.7 : 1;
    this.riverGain.gain.setTargetAtTime(this.river * riverK * (0.045 + Math.random() * 0.025), now, 0.08);
    this.burbleGain.gain.setTargetAtTime(this.river * riverK * (0.02 + Math.random() * 0.02), now, 0.1);
    if (Math.random() < this.river * 0.15) this.plip(now + Math.random() * 0.1);
    // Rain pattering nearby; a storm rumbles in the distance between the bolts; mist drips.
    if (this.rain > 0 && Math.random() < this.rain * 0.4) this.patter(now + Math.random() * 0.12);
    if (storm && Math.random() < 0.006 && now > this.rumbleAt) {
      this.rumble(now);
      this.rumbleAt = now + 8;
    }
    if (w === 'mist' && Math.random() < 0.04) this.drip(now);
    // Life in the jungle: crickets from dusk, owls in the dark. Not in the cold, and hardly in the rain.
    const life = this.jungle * (cold ? 0 : 1) * (1 - this.rain * 0.7);
    if (Math.random() < life * (0.05 + 0.18 * this.night)) this.cricket(now + Math.random() * 0.1);
    if (Math.random() < life * 0.003 * (0.2 + this.night)) this.owl(now);
    // The Hollow: a wolf now and then, far off; crows bickering; the wind moaning through the graves.
    if (this.haunted) {
      if (now > this.howlAt && Math.random() < 0.02) {
        this.howl(now);
        this.howlAt = now + 14 + Math.random() * 16;
      }
      if (Math.random() < 0.006) this.caw(now);
      if (Math.random() < 0.004) this.moan(now);
    }
    // The pit: the drone, and its chains stirring.
    this.pitGain.gain.setTargetAtTime(this.pit * 0.09, now, 0.4);
    if (Math.random() < this.pit * 0.03) this.clink(now);
    this.humGain.gain.setTargetAtTime(this.hum * 0.022, now, 0.5);
  }

  private cricket(at: number): void {
    const f = 4100 + Math.random() * 500;
    const spot = this.spot(Math.random() * 1.6 - 0.8, 0.1);
    for (let i = 0; i < 3; i++) {
      const t = at + i * 0.045;
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(spot);
      o.start(t);
      o.stop(t + 0.04);
    }
  }

  private owl(at: number): void {
    const spot = this.spot(Math.random() * 1.4 - 0.7, 0.5);
    for (const [dt, f0, f1, dur] of [[0, 400, 370, 0.35], [0.5, 390, 340, 0.6]] as const) {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(f0, at + dt);
      o.frequency.linearRampToValueAtTime(f1, at + dt + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, at + dt);
      g.gain.linearRampToValueAtTime(0.03, at + dt + 0.08);
      g.gain.linearRampToValueAtTime(0.0001, at + dt + dur);
      o.connect(g).connect(spot);
      o.start(at + dt);
      o.stop(at + dt + dur + 0.05);
    }
  }

  /** A wolf howling a long way off: a rising "ooo" that holds, wavers and falls away, sometimes answered. */
  private howl(at: number, answer = true): void {
    const spot = this.spot(Math.random() * 1.6 - 0.8, 0.9);
    const base = 300 + Math.random() * 80;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, at);
    o.frequency.linearRampToValueAtTime(base * 1.7, at + 0.7);
    o.frequency.setValueAtTime(base * 1.7, at + 1.6);
    o.frequency.linearRampToValueAtTime(base * 1.2, at + 2.6);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5;
    const depth = this.ctx.createGain();
    depth.gain.value = 18;
    vib.connect(depth).connect(o.detune);
    const vowel = this.ctx.createBiquadFilter();
    vowel.type = 'bandpass';
    vowel.frequency.value = 650;
    vowel.Q.value = 3;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.03, at + 0.6);
    g.gain.setValueAtTime(0.03, at + 1.8);
    g.gain.linearRampToValueAtTime(0.0001, at + 2.7);
    o.connect(vowel).connect(g).connect(spot);
    o.start(at);
    vib.start(at);
    o.stop(at + 2.8);
    vib.stop(at + 2.8);
    if (answer && Math.random() < 0.5) this.howl(at + 2.2 + Math.random(), false);
  }

  /** A crow: two or three harsh caws. */
  private caw(at: number): void {
    const pan = Math.random() * 1.6 - 0.8;
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const t = at + i * (0.28 + Math.random() * 0.08);
      this.burst(t, 'bandpass', 1200 + Math.random() * 300, 0.18, 0.025, 4, pan, 0.4, 0.01);
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(620, t);
      o.frequency.exponentialRampToValueAtTime(470, t + 0.16);
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1300;
      f.Q.value = 2;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
      o.connect(f).connect(g).connect(this.spot(pan, 0.4));
      o.start(t);
      o.stop(t + 0.18);
    }
  }

  /** The wind moaning through the gravestones: a hollow whistle that swells and sinks. */
  private moan(at: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 12;
    f.frequency.setValueAtTime(320, at);
    f.frequency.linearRampToValueAtTime(560, at + 1.6);
    f.frequency.linearRampToValueAtTime(300, at + 3.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.09, at + 1.4);
    g.gain.linearRampToValueAtTime(0.0001, at + 3.5);
    src.connect(f).connect(g).connect(this.spot(Math.random() * 1.2 - 0.6, 0.6));
    src.start(at, Math.random() * 3);
    src.stop(at + 3.6);
  }

  /** A drop into the river. */
  private plip(at: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(600 + Math.random() * 500, at);
    o.frequency.exponentialRampToValueAtTime(1400 + Math.random() * 800, at + 0.05);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.012 * this.river, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    o.connect(g).connect(this.spot(Math.random() * 1.2 - 0.6, 0.2));
    o.start(at);
    o.stop(at + 0.07);
  }

  /** A raindrop landing near you: a soft pat. */
  private patter(at: number): void {
    this.burst(at, 'lowpass', 1800 + Math.random() * 2500, 0.03 + Math.random() * 0.03, 0.012 + Math.random() * 0.012, 1, Math.random() * 1.6 - 0.8, 0);
  }

  /** Water dripping off the leaves in the mist, with the room on it. */
  private drip(at: number): void {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(1800 + Math.random() * 1200, at);
    o.frequency.exponentialRampToValueAtTime(900, at + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.02, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    o.connect(g).connect(this.spot(Math.random() * 1.4 - 0.7, 0.8));
    o.start(at);
    o.stop(at + 0.1);
  }

  /** A gust through dry leaves. */
  private rustle(at: number): void {
    this.burst(at, 'bandpass', 2000 + Math.random() * 2500, 0.4 + Math.random() * 0.5, 0.03 * this.windK, 1.2, Math.random() * 1.4 - 0.7, 0.15, 0.12);
  }

  /** Thunder a long way off. */
  private rumble(at: number): void {
    this.burst(at, 'lowpass', 150 + Math.random() * 100, 2.5 + Math.random() * 1.5, 0.08, 0.8, Math.random() * 1.2 - 0.6, 0.3, 0.6);
  }

  /** A chain shifting in the pit. */
  private clink(at: number): void {
    const spot = this.spot(Math.random() * 0.8 - 0.4, 0.5);
    for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
      const t = at + i * (0.05 + Math.random() * 0.04);
      const o = this.ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 2400 + Math.random() * 1800;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.01 * this.pit, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g).connect(spot);
      o.start(t);
      o.stop(t + 0.07);
    }
  }

  /** A puff of filtered noise somewhere in the stereo field. */
  private burst(at: number, type: BiquadFilterType, hz: number, dur: number, vol: number, q: number, pan: number, wet: number, attack = 0.003): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.spot(pan, wet));
    src.start(at, Math.random() * 3);
    src.stop(at + dur + 0.02);
  }

  /** A panner into the ambience, with `wet` of it into the hall. */
  private spot(pan: number, wet: number): AudioNode {
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.muffle);
    if (wet > 0) {
      const s = this.ctx.createGain();
      s.gain.value = wet;
      p.connect(s).connect(this.wet);
    }
    return p;
  }

  private loop(noise: AudioBuffer): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.start(0, Math.random());
    return src;
  }

  private lfo(hz: number, depth: number, param: AudioParam): void {
    const o = this.ctx.createOscillator();
    o.frequency.value = hz;
    const g = this.ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(param);
    o.start();
  }
}
