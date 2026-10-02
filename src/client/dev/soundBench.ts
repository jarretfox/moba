import { Mp3Encoder } from '@breezystack/lamejs';
import type { Sound, SoundName } from '../audio';
import { ATTACK_SOUND, CAST_SOUND, FX_SOUNDS } from '../sfx';

// Dev only: the sound bench. Builds the game's recorded sounds from sound-design/recipe.json (which source
// files make each sound; see docs/art-bible.md). Every take is mastered the same way (mono, the silence
// trimmed, faded, normalized), encoded to a small MP3 that every browser plays, and saved under
// public/audio/sfx/. Then each sound's level is matched to the synthesized sound it stands in for (or
// plays over), measured through the game's own mix, and public/audio/index.json is written.
// In a dev build's console: `bench.build()` (it runs in the background; `bench.status` says how far), or
// `bench.build(['fx:splashZone', ...])` to remake only those and keep the rest.

export interface RecipeEntry {
  /** Source files, under incoming/: a take each. */
  from: string[];
  /** Play over the synthesized sound rather than instead of it. */
  over?: boolean;
  /** Its level in dB against the synthesized sound it stands for (0: as loud). */
  level?: number;
  /** Longest a take may run, seconds. */
  max?: number;
  /** Other keys played at the same moment, a layer each. */
  with?: string[];
}

const RATE = 44100;
/** Takes are mastered to peak here, unless that would make their loudest tenth of a second louder than LOUD. */
const PEAK = 0.891; // −1 dBFS
const LOUD = 0.25; // −12 dBFS RMS

/**
 * Masters one take: mixed to mono, the silence before it trimmed (to 3 ms before it starts) and after it
 * (to 30 ms after it dies away), no longer than `max` seconds (faded out if cut), a 2 ms fade in, and
 * normalized.
 */
export function masterTake(channels: readonly Float32Array[], rate: number, max = 2): Float32Array {
  const n = channels[0].length;
  const mono = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) mono[i] += ch[i] / channels.length;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(mono[i]));
  if (peak <= 0) return new Float32Array(0);
  let start = 0;
  while (start < n && Math.abs(mono[start]) < peak * 0.02) start++;
  let end = n - 1;
  while (end > start && Math.abs(mono[end]) < peak * 0.003) end--;
  start = Math.max(0, start - Math.round(rate * 0.003));
  end = Math.min(n, end + 1 + Math.round(rate * 0.03));
  const limit = start + Math.round(max * rate);
  const cut = end > limit;
  const out = mono.slice(start, Math.min(end, limit));
  const fadeIn = Math.min(out.length, Math.round(rate * 0.002));
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  const fadeOut = Math.min(out.length, Math.round(rate * (cut ? 0.08 : 0.01)));
  for (let i = 0; i < fadeOut; i++) out[out.length - 1 - i] *= i / fadeOut;
  // Normalize: to peak, but no hotter than LOUD over its loudest tenth of a second.
  const win = Math.max(1, Math.round(rate * 0.1));
  let acc = 0;
  let loudest = 0;
  for (let i = 0; i < out.length; i++) {
    acc += out[i] * out[i];
    if (i >= win) acc -= out[i - win] * out[i - win];
    loudest = Math.max(loudest, acc / Math.min(win, i + 1));
  }
  let gain = PEAK / peak;
  const rms = Math.sqrt(loudest);
  if (rms * gain > LOUD) gain = LOUD / rms;
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  return out;
}

/** Mono 44.1 kHz MP3 at `kbps`. */
export function encodeMp3(pcm: Float32Array, kbps = 96): Uint8Array {
  const enc = new Mp3Encoder(1, RATE, kbps);
  const ints = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) ints[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767)));
  const parts: Uint8Array[] = [];
  for (let i = 0; i < ints.length; i += 1152) parts.push(enc.encodeBuffer(ints.subarray(i, i + 1152)));
  parts.push(enc.flush());
  const total = parts.reduce((s, p) => s + p.length, 0);
  const mp3 = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    mp3.set(p, at);
    at += p.length;
  }
  return mp3;
}

/** The synthesized sound a key stands in for (a layer, its parent's), to match levels against. */
export function synthFor(key: string): SoundName | null {
  const base = key.split('+')[0];
  if (base.startsWith('hit:')) return 'hit';
  if (base.startsWith('cast:')) return CAST_SOUND[base.split(':')[1] as keyof typeof CAST_SOUND] ?? null;
  if (base.startsWith('fx:')) return FX_SOUNDS[base.slice(3) as keyof typeof FX_SOUNDS]?.[0] ?? null;
  return (Object.values(ATTACK_SOUND) as string[]).includes(base) ? (base as SoundName) : null;
}

/** The file name a key's take is saved as: "fx:steamBurst+hiss", take 2 → "fx-steamBurst-hiss-2.mp3". */
export const takeFile = (key: string, n: number) => `${key.replace(/[:+]/g, '-')}-${n}.mp3`;

const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/');

async function save(path: string, body: BodyInit): Promise<void> {
  const res = await fetch(`__save?path=${encodeURIComponent(path)}`, { method: 'POST', body });
  if (!res.ok) throw new Error(`saving ${path}: ${res.status}`);
}

interface Status {
  phase: string;
  done: number;
  of: number;
  errors: string[];
  report?: Record<string, { synth: number; rec: number; gain: number }>;
}

export function makeBench(sound: Sound) {
  const status: Status = { phase: 'idle', done: 0, of: 0, errors: [] };
  // The Sound's insides, for measuring through exactly the path the game plays them on.
  const s = sound as unknown as {
    ensure(): AudioContext;
    master: GainNode;
    samples: { sound: (k: string) => unknown };
    play(name: SoundName, gain?: number): void;
  };

  async function level(play: () => void, ctx: AudioContext, an: AnalyserNode): Promise<number> {
    const buf = new Float32Array(an.fftSize);
    await new Promise((r) => setTimeout(r, 350));
    play();
    let best = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 1100) {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      best = Math.max(best, sum / buf.length);
      await new Promise((r) => setTimeout(r, 6));
    }
    void ctx;
    return 10 * Math.log10(best + 1e-12);
  }

  async function build(only?: readonly string[], recipeUrl = '/sound-design/recipe.json'): Promise<void> {
    const recipe = (await (await fetch(`${recipeUrl}?t=${Date.now()}`)).json()) as Record<string, RecipeEntry>;
    const ctx = s.ensure();
    await ctx.resume();
    const keys = Object.keys(recipe).filter((k) => !only || only.includes(k));
    status.phase = 'mastering';
    status.of = keys.length;
    status.done = 0;
    const takes = new Map<string, { files: string[]; first: AudioBuffer }>();
    const sources: Record<string, string> = {};
    for (const key of keys) {
      const entry = recipe[key];
      const files: string[] = [];
      let first: AudioBuffer | null = null;
      for (const [i, src] of entry.from.entries()) {
        try {
          const raw = await ctx.decodeAudioData(await (await fetch(`/incoming/${enc(src)}`)).arrayBuffer());
          const pcm = masterTake(Array.from({ length: raw.numberOfChannels }, (_, c) => raw.getChannelData(c)), raw.sampleRate, entry.max ?? 2);
          const resampled = raw.sampleRate === RATE ? pcm : await resample(pcm, raw.sampleRate);
          const mp3 = encodeMp3(resampled);
          const file = `sfx/${takeFile(key, i + 1)}`;
          await save(`public/audio/${file}`, new Blob([mp3 as BlobPart], { type: 'audio/mpeg' }));
          files.push(file);
          sources[file] = src;
          first ??= await ctx.decodeAudioData(mp3.slice().buffer);
        } catch (e) {
          status.errors.push(`${key} ${src}: ${(e as Error).message}`);
        }
      }
      if (first) takes.set(key, { files, first });
      status.done++;
    }

    // Levels: each sound against its synthesized one, through the game's mix.
    status.phase = 'matching levels';
    status.done = 0;
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    s.master.connect(an);
    const real = s.samples.sound;
    const synthLevel = new Map<string, number>();
    const report: Status['report'] = {};
    const index: Record<string, { files: string[]; gain: number; over?: boolean; with?: string[] }> = {};
    try {
      for (const key of keys) {
        const t = takes.get(key);
        const synth = synthFor(key);
        status.done++;
        if (!t || !synth) {
          if (t) status.errors.push(`${key}: no synthesized sound to match against`);
          continue;
        }
        s.samples.sound = () => null;
        if (!synthLevel.has(synth)) synthLevel.set(synth, await level(() => s.play(synth, 1), ctx, an));
        s.samples.sound = () => ({ buffer: t.first, gain: 1, over: false, with: [] });
        const rec = await level(() => s.play(synth, 1), ctx, an);
        const target = synthLevel.get(synth)! + (recipe[key].level ?? 0);
        const gain = Math.max(0.02, Math.min(4, 10 ** ((target - rec) / 20)));
        report[key] = { synth: +synthLevel.get(synth)!.toFixed(1), rec: +rec.toFixed(1), gain: +gain.toFixed(3) };
        index[key] = { files: t.files, gain: +gain.toFixed(3), ...(recipe[key].over ? { over: true } : {}), ...(recipe[key].with ? { with: recipe[key].with } : {}) };
      }
    } finally {
      s.samples.sound = real;
      s.master.disconnect(an);
    }
    const fresh = (url: string) => fetch(`${url}?t=${Date.now()}`).then((r) => r.json()).catch(() => ({}));
    const old = (await fresh('/audio/index.json')) as { sounds?: typeof index; voices?: unknown; announcer?: unknown };
    const oldSources = (await fresh('/audio/sources.json')) as Record<string, string>;
    // Remaking some: everything else stays as it was (anything dropped from the recipe goes).
    const sounds = only ? { ...Object.fromEntries(Object.entries(old.sounds ?? {}).filter(([k]) => k in recipe)), ...index } : index;
    const allSources = only ? { ...oldSources, ...sources } : sources;
    await save('public/audio/index.json', JSON.stringify({ sounds, voices: old.voices ?? {}, announcer: old.announcer ?? {} }, null, 2) + '\n');
    await save('public/audio/sources.json', JSON.stringify(allSources, null, 1) + '\n');
    status.report = report;
    status.phase = 'done';
  }

  /** Resamples mono PCM to 44.1 kHz. */
  async function resample(pcm: Float32Array, from: number): Promise<Float32Array> {
    const off = new OfflineAudioContext(1, Math.ceil((pcm.length * RATE) / from), RATE);
    const b = off.createBuffer(1, pcm.length, from);
    b.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    const src = off.createBufferSource();
    src.buffer = b;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0);
  }

  return {
    status,
    build: (only?: readonly string[]) => {
      status.errors = [];
      build(only).catch((e) => {
        status.phase = 'failed';
        status.errors.push(String(e));
      });
      return 'started';
    },
  };
}
