import { onSettings, settings } from './settings';

// The announcer's voice: the browser's own speech, pitched low and taken slow, saying the big moments out
// loud (First blood! Objective destroyed! Shutdown!). Lines queue so they never talk over each other;
// a busy fight drops the small ones and stale ones are skipped. A cinematic hit plays under the big ones
// (the game does that: see Game.announceKill).

/** How much a line matters: a busy queue drops the lowest first, and a top one cuts in. */
export type Weight = 1 | 2 | 3;

interface Line {
  text: string;
  weight: Weight;
  at: number;
}

/** A line not spoken within this many seconds of its moment is old news. */
const STALE = 4;
/** At most this many lines waiting. */
const QUEUE = 2;

/**
 * The voice to use, from what the browser has: a British man if there is one (it's Blokes, after all),
 * otherwise any English man's voice we know by name, otherwise any English voice.
 */
export function pickVoice(voices: readonly Pick<SpeechSynthesisVoice, 'name' | 'lang'>[]): number {
  const english = voices.map((v, i) => ({ v, i })).filter(({ v }) => v.lang.toLowerCase().startsWith('en'));
  const male = /\b(male|david|mark|george|ryan|guy|daniel|james|thomas|oliver|arthur|alex|fred|christopher|eric|brian|liam)\b/i;
  const score = (v: Pick<SpeechSynthesisVoice, 'name' | 'lang'>) =>
    (male.test(v.name) && !/female/i.test(v.name) ? 4 : 0) + (v.lang.toLowerCase() === 'en-gb' ? 2 : 0) + (/natural|online|google/i.test(v.name) ? 1 : 0);
  let best = -1;
  let bestScore = -1;
  for (const { v, i } of english) {
    const s = score(v);
    if (s > bestScore) {
      best = i;
      bestScore = s;
    }
  }
  return best;
}

export class Announcer {
  private readonly queue: Line[] = [];
  private speaking = false;
  private voice: SpeechSynthesisVoice | null = null;
  private readonly synth: SpeechSynthesis | null = typeof speechSynthesis === 'undefined' ? null : speechSynthesis;

  constructor(private readonly muted: () => boolean) {
    const synth = this.synth;
    if (!synth) return;
    const choose = () => {
      const voices = synth.getVoices();
      const i = pickVoice(voices);
      this.voice = i >= 0 ? voices[i] : null;
    };
    choose();
    synth.addEventListener?.('voiceschanged', choose);
    onSettings((s) => {
      if (!s.announcer) this.hush();
    });
  }

  private get volume(): number {
    return settings.announcer && !this.muted() ? Math.min(1, settings.master * (0.4 + 0.8 * settings.effects)) : 0;
  }

  /** Says a line when it's its turn. A weight-3 line cuts in over whatever's being said. */
  say(text: string, weight: Weight = 1): void {
    if (!this.synth || this.volume <= 0) return;
    const now = performance.now() / 1000;
    if (this.queue.some((l) => l.text === text)) return;
    if (weight === 3 && this.speaking) {
      this.queue.length = 0;
      this.synth.cancel();
      this.speaking = false;
    }
    this.queue.push({ text, weight, at: now });
    // Too many waiting: drop the least important (the oldest of those).
    while (this.queue.length > QUEUE) {
      let worst = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].weight < this.queue[worst].weight) worst = i;
      this.queue.splice(worst, 1);
    }
    this.next();
  }

  /** Stops talking and forgets what was waiting (the match is over, or the voice was switched off). */
  hush(): void {
    this.queue.length = 0;
    this.synth?.cancel();
    this.speaking = false;
  }

  private next(): void {
    const synth = this.synth;
    if (!synth || this.speaking) return;
    const now = performance.now() / 1000;
    let line: Line | undefined;
    while ((line = this.queue.shift()) && now - line.at > STALE) line = undefined;
    if (!line) return;
    const u = new SpeechSynthesisUtterance(line.text);
    if (this.voice) u.voice = this.voice;
    u.lang = this.voice?.lang ?? 'en-GB';
    // Deep and deliberate, bigger lines a touch slower and lower still.
    u.pitch = line.weight === 3 ? 0.55 : 0.68;
    u.rate = line.weight === 3 ? 0.86 : 0.95;
    u.volume = this.volume;
    const done = () => {
      this.speaking = false;
      this.next();
    };
    u.onend = done;
    u.onerror = done;
    this.speaking = true;
    synth.speak(u);
    // Some browsers never fire onend for a cancelled or blocked line: don't wait forever.
    setTimeout(() => {
      if (this.speaking && !synth.speaking) done();
    }, 4000);
  }
}
