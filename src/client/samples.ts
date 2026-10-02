import type { ChampionId } from '../shared/champions/types';
import type { VoiceMoment } from './voices';

// Recorded sound, where there is some. Every sound in the game is synthesized (audio.ts, music.ts); this
// lets a recording stand in for any one of them, a few at a time, without touching the rest:
// - an effect (by its name in audio.ts), with any number of takes, so repeats never sound the same,
// - a champion's voice for each moment (taunts, laughs, kills, the ultimate...), a take per line,
// - the announcer's lines, by what it says.
// public/audio/index.json says what exists; nothing else is fetched. Anything missing plays as before.
// docs/art-bible.md has the specs for recording and naming them.

export interface AudioIndex {
  /**
   * Effects by sound name: the takes, how loud to play them (1 as recorded), and whether they play over
   * the synthesized sound (a recorded clank on top of its whoosh) rather than instead of it.
   */
  sounds: Record<string, { files: string[]; gain: number; over?: boolean }>;
  /** Champions' voices: each moment's takes, in the order of their lines (emotes.ts), so the words match the bubble. */
  voices: Partial<Record<ChampionId, Partial<Record<VoiceMoment, string[]>>>>;
  /** The announcer, by the line's text ("First blood!"). */
  announcer: Record<string, string>;
}

const MOMENTS: readonly VoiceMoment[] = ['taunt', 'laugh', 'cheer', 'line', 'kill', 'ult', 'hurt', 'death', 'grumble'];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFile = (v: unknown): v is string => typeof v === 'string' && /^[\w./-]+$/.test(v) && !v.includes('..');

/** Reads the index, keeping only entries that make sense (a typo in it shouldn't break the game). */
export function parseAudioIndex(raw: unknown): AudioIndex {
  const out: AudioIndex = { sounds: {}, voices: {}, announcer: {} };
  if (!isObj(raw)) return out;
  if (isObj(raw.sounds)) {
    for (const [name, s] of Object.entries(raw.sounds)) {
      const files = isObj(s) && Array.isArray(s.files) ? s.files.filter(isFile) : Array.isArray(s) ? s.filter(isFile) : [];
      const gain = isObj(s) && typeof s.gain === 'number' && s.gain > 0 && s.gain <= 4 ? s.gain : 1;
      if (files.length) out.sounds[name] = isObj(s) && s.over === true ? { files, gain, over: true } : { files, gain };
    }
  }
  if (isObj(raw.voices)) {
    for (const [champ, moments] of Object.entries(raw.voices)) {
      if (!isObj(moments)) continue;
      const lines: Partial<Record<VoiceMoment, string[]>> = {};
      for (const m of MOMENTS) {
        const files = Array.isArray(moments[m]) ? (moments[m] as unknown[]).filter(isFile) : [];
        if (files.length) lines[m] = files;
      }
      if (Object.keys(lines).length) out.voices[champ as ChampionId] = lines;
    }
  }
  if (isObj(raw.announcer)) for (const [text, file] of Object.entries(raw.announcer)) if (isFile(file)) out.announcer[text] = file;
  return out;
}

/** Which take to play next: any but the last one played (when there's a choice). */
export function nextTake(count: number, last: number, rand: () => number = Math.random): number {
  if (count <= 1) return 0;
  const i = Math.floor(rand() * (count - 1));
  return last >= 0 && i >= last ? i + 1 : i;
}

const ROOT = `${import.meta.env.BASE_URL}audio/`;

/** The recordings, decoded once the browser lets audio start. */
export class SampleBank {
  private index: AudioIndex = { sounds: {}, voices: {}, announcer: {} };
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly last = new Map<string, number>();
  private loading: Promise<void> | null = null;

  /** Fetches and decodes everything the index lists (a few files; it's done in the background). */
  load(ctx: BaseAudioContext): Promise<void> {
    this.loading ??= (async () => {
      try {
        const res = await fetch(`${ROOT}index.json`);
        if (!res.ok) return; // no recordings yet
        this.index = parseAudioIndex(await res.json());
      } catch {
        return;
      }
      const files = new Set<string>();
      for (const s of Object.values(this.index.sounds)) for (const f of s.files) files.add(f);
      for (const v of Object.values(this.index.voices)) for (const takes of Object.values(v ?? {})) for (const f of takes ?? []) files.add(f);
      for (const f of Object.values(this.index.announcer)) files.add(f);
      const jobs = [...files].map(async (file) => {
        const res = await fetch(`${ROOT}${file}`);
        if (!res.ok) throw new Error(`${file}: ${res.status}`);
        this.buffers.set(file, await ctx.decodeAudioData(await res.arrayBuffer()));
      });
      for (const r of await Promise.allSettled(jobs)) if (r.status === 'rejected') console.warn('Recording skipped:', r.reason);
    })();
    return this.loading;
  }

  /** A take of an effect, how loud to play it, and whether over the synth, if it's recorded. */
  sound(name: string): { buffer: AudioBuffer; gain: number; over: boolean } | null {
    const s = this.index.sounds[name];
    if (!s) return null;
    const takes = s.files.filter((f) => this.buffers.has(f));
    if (!takes.length) return null;
    const i = nextTake(takes.length, this.last.get(name) ?? -1);
    this.last.set(name, i);
    return { buffer: this.buffers.get(takes[i])!, gain: s.gain, over: s.over === true };
  }

  /** A champion's line for a moment: the `n`th, matching the words in their bubble (emotes.ts). */
  voice(champ: ChampionId, moment: VoiceMoment, n: number): AudioBuffer | null {
    const takes = this.index.voices[champ]?.[moment];
    if (!takes?.length) return null;
    return this.buffers.get(takes[Math.abs(Math.floor(n)) % takes.length]) ?? null;
  }

  /** The announcer saying `text`, if it's recorded. */
  announcer(text: string): AudioBuffer | null {
    const file = this.index.announcer[text];
    return file ? (this.buffers.get(file) ?? null) : null;
  }
}
