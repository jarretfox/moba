// Music and the sounds of the place, made on the fly with Web Audio like the sound effects: no files.
//
// The score is a slow dusk loop in D minor (pads, a soft bass, plucked notes wandering a pentatonic scale
// through an echo and a hall), with a fight layer of drums that swells in when you're trading blows with
// champions. Under it: wind everywhere, crickets and the odd owl in the jungle, water near the river.

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Seconds per step; 16 steps to a chord. */
const STEP = 0.25;
const CHORDS: { pad: number[]; bass: number }[] = [
  { pad: [50, 57, 60, 64], bass: 38 }, // Dm9
  { pad: [58, 62, 65, 69], bass: 34 }, // Bbmaj7
  { pad: [55, 62, 65, 69], bass: 43 }, // Gm9
  { pad: [57, 62, 64, 69], bass: 45 }, // Asus
];
const SCALE = [62, 65, 67, 69, 72, 74, 77, 79];
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
  private on: boolean;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly noise: AudioBuffer,
    on: boolean,
  ) {
    this.on = on;
    this.bus = ctx.createGain();
    this.bus.gain.value = on ? 0.7 : 0;
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
    this.bus.gain.setTargetAtTime(this.on ? 0.7 : 0, this.ctx.currentTime, 0.4);
    return this.on;
  }

  /** 0 when calm, 1 in a fight; the drums follow it. */
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
    const chord = CHORDS[Math.floor(step / 16) % CHORDS.length];
    if (inBar === 0) {
      for (const n of chord.pad) this.pad(midi(n), at, STEP * 16 + 0.6);
      this.bass(midi(chord.bass), at, STEP * 16);
    }
    // Plucks: sparse and wandering when calm, a running arpeggio in a fight.
    const fight = this.intensity;
    if (fight > 0.45 && step % 2 === 0) {
      const arp = [...chord.pad, ...chord.pad.map((n) => n + 12)];
      this.pluck(midi(arp[(step / 2) % arp.length] + 12), at, 0.05 * fight);
    } else if (step % 2 === 0 && Math.random() < 0.28) {
      this.pluck(midi(SCALE[Math.floor(Math.random() * SCALE.length)]), at, 0.07);
    }
    // Drums for the fight.
    if (fight > 0.05) {
      if (inBar % 4 === 0) this.kick(at, 0.5 * fight);
      if (inBar % 4 === 2 && fight > 0.5) this.kick(at, 0.25 * fight);
      if (step % 2 === 1) this.hat(at, 0.05 * fight);
      if ((inBar === 12 || inBar === 14) && fight > 0.7) this.tom(at, 0.3 * fight);
    }
  }

  private pad(f: number, at: number, dur: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(380, at);
    filter.frequency.linearRampToValueAtTime(950, at + dur * 0.5);
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
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(f).connect(g).connect(this.dry);
    src.start(at, Math.random() * 0.5);
    src.stop(at + 0.06);
  }
}

/** Wind, crickets and owls in the jungle, water by the river: louder where the camera is. */
export class Soundscape {
  private readonly windGain: GainNode;
  private readonly riverGain: GainNode;
  private readonly bus: GainNode;
  private jungle = 0;
  private river = 0;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
  ) {
    // Its own long stretch of noise, so the wind and water never audibly loop.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 5, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.bus = ctx.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(out);
    // Wind: noise through a band that slowly wanders, rising and falling.
    const wind = this.loop(noise);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 420;
    band.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    wind.connect(band).connect(this.windGain).connect(this.bus);
    this.lfo(0.06, 180, band.frequency);
    this.lfo(0.09, 0.025, this.windGain.gain);
    // River: low rushing water.
    const water = this.loop(noise);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 900;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 220;
    this.riverGain = ctx.createGain();
    this.riverGain.gain.value = 0;
    water.connect(low).connect(high).connect(this.riverGain).connect(this.bus);
    setInterval(() => this.tick(), 120);
  }

  /** How much of the view is jungle and river (0–1 each). */
  setPlace(jungle: number, river: number): void {
    this.jungle += (jungle - this.jungle) * 0.3;
    this.river += (river - this.river) * 0.3;
  }

  private tick(): void {
    if (this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // The river burbles: its level jitters.
    this.riverGain.gain.setTargetAtTime(this.river * (0.07 + Math.random() * 0.05), now, 0.08);
    if (Math.random() < this.jungle * 0.3) this.cricket(now + Math.random() * 0.1);
    if (Math.random() < this.jungle * 0.004) this.owl(now);
  }

  private cricket(at: number): void {
    const f = 4100 + Math.random() * 500;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.bus);
    for (let i = 0; i < 3; i++) {
      const t = at + i * 0.045;
      const o = this.ctx.createOscillator();
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.04);
    }
  }

  private owl(at: number): void {
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.4 - 0.7;
    pan.connect(this.bus);
    for (const [dt, f0, f1, dur] of [[0, 400, 370, 0.35], [0.5, 390, 340, 0.6]] as const) {
      const o = this.ctx.createOscillator();
      o.frequency.setValueAtTime(f0, at + dt);
      o.frequency.linearRampToValueAtTime(f1, at + dt + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, at + dt);
      g.gain.linearRampToValueAtTime(0.03, at + dt + 0.08);
      g.gain.linearRampToValueAtTime(0.0001, at + dt + dur);
      o.connect(g).connect(pan);
      o.start(at + dt);
      o.stop(at + dt + dur + 0.05);
    }
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
