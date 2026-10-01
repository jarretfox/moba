import type { ScoreRow } from '../shared/protocol';

// The end screen's extras: a handful of awards (some earned, some a roast), and a graph of which team was
// ahead on gold as the match went.

/** Things the scoreboard doesn't count, gathered from the kill feed as the match goes. */
export interface MatchTally {
  /** Warden takedowns, by champion name. */
  warden: Record<string, number>;
  /** Deaths with no champion to blame (a Chud, a Shootie), by the name of who died. */
  executed: Record<string, number>;
}

export interface Award {
  title: string;
  /** What earned it, e.g. "14 kills". */
  detail: string;
  row: ScoreRow;
}

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

/** Each award: who it goes to (the most of something, past a bar worth mentioning) and how to say why. */
const AWARDS: { title: string; value: (r: ScoreRow, t: MatchTally) => number; min: number; detail: (v: number) => string }[] = [
  { title: 'Warden Thief', value: (r, t) => t.warden[r.name] ?? 0, min: 1, detail: (v) => (v > 1 ? `Took the Warden ${v} times` : 'Took down the Warden') },
  { title: 'Shootie Slayer', value: (r) => r.tdmg, min: 1000, detail: (v) => `${k(v)} damage to structures` },
  { title: 'Chud Muncher', value: (r) => r.cs, min: 20, detail: (v) => `${v} Chuds and monsters` },
  { title: 'Bloodthirsty', value: (r) => r.k, min: 3, detail: (v) => `${v} kills` },
  { title: 'Outplayed by a Chud', value: (r, t) => t.executed[r.name] ?? 0, min: 1, detail: (v) => (v > 1 ? `Killed by Chuds and Shooties ${v} times` : 'Killed by a Chud or a Shootie') },
  { title: 'Team Player', value: (r) => r.a, min: 4, detail: (v) => `${v} assists` },
  { title: 'Brick Wall', value: (r) => r.taken, min: 3000, detail: (v) => `${k(v)} damage soaked up` },
  { title: 'Respawn Regular', value: (r) => r.d, min: 4, detail: (v) => `${v} deaths` },
  { title: 'Big Spender', value: (r) => r.gold, min: 3000, detail: (v) => `${k(v)} gold earned` },
];

/**
 * Up to `max` awards, in the order above. Each goes to whoever has the most (the first listed on a tie),
 * if it clears the bar. Spread them around: everyone gets one before anyone gets two.
 */
export function pickAwards(rows: readonly ScoreRow[], tally: MatchTally, max = 5): Award[] {
  const winners = AWARDS.flatMap((a) => {
    let best: ScoreRow | undefined;
    let bestValue = -Infinity;
    for (const r of rows) {
      const v = a.value(r, tally);
      if (v > bestValue) [best, bestValue] = [r, v];
    }
    return best && bestValue >= a.min ? [{ title: a.title, detail: a.detail(bestValue), row: best }] : [];
  });
  const out: Award[] = [];
  const count = new Map<number, number>();
  for (const cap of [1, 2]) {
    for (const w of winners) {
      if (out.length >= max) break;
      if (out.includes(w) || (count.get(w.row.id) ?? 0) >= cap) continue;
      out.push(w);
      count.set(w.row.id, (count.get(w.row.id) ?? 0) + 1);
    }
  }
  return out.sort((a, b) => winners.indexOf(a) - winners.indexOf(b));
}

/** One reading of the gold race: match seconds, and your team's gold minus theirs. */
export interface GoldSample {
  t: number;
  lead: number;
}

/**
 * The gold lead over the match as an SVG: above the middle line (blue) your team was ahead, below it
 * (red) theirs. Only numbers go into it, so it's safe to put in as markup.
 */
export function goldGraph(samples: readonly GoldSample[], width = 360, height = 120): string {
  if (samples.length < 2) return '';
  const end = samples[samples.length - 1].t || 1;
  const most = Math.max(500, ...samples.map((s) => Math.abs(s.lead)));
  const mid = height / 2;
  const x = (t: number) => ((t / end) * width).toFixed(1);
  const y = (lead: number) => (mid - (lead / most) * (mid - 8)).toFixed(1);
  const line = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t)} ${y(s.lead)}`).join(' ');
  const area = `${line} L${x(end)} ${mid} L${x(samples[0].t)} ${mid} Z`;
  const peak = samples.reduce((a, b) => (b.lead > a.lead ? b : a));
  const low = samples.reduce((a, b) => (b.lead < a.lead ? b : a));
  const ticks = Array.from({ length: Math.floor(end / 300) }, (_, i) => (i + 1) * 300)
    .map((t) => `<line x1="${x(t)}" y1="${height - 4}" x2="${x(t)}" y2="${height}" class="gold-tick"/><text x="${x(t)}" y="${height + 11}" class="gold-min">${t / 60}m</text>`)
    .join('');
  const label = (s: GoldSample, above: boolean) =>
    s.lead === 0 ? '' : `<text x="${Math.min(width - 4, Math.max(4, Number(x(s.t))))}" y="${Number(y(s.lead)) + (above ? -5 : 14)}" class="gold-peak ${above ? 'ours' : 'theirs'}">${s.lead > 0 ? '+' : '−'}${k(Math.abs(s.lead))}</text>`;
  return `<svg class="gold-graph" viewBox="0 -14 ${width} ${height + 28}" width="${width}" height="${height + 28}" role="img" aria-label="Gold lead over the match">
<defs><clipPath id="gold-up"><rect x="0" y="-14" width="${width}" height="${mid + 14}"/></clipPath><clipPath id="gold-down"><rect x="0" y="${mid}" width="${width}" height="${mid + 14}"/></clipPath></defs>
<path d="${area}" class="gold-area ours" clip-path="url(#gold-up)"/><path d="${area}" class="gold-area theirs" clip-path="url(#gold-down)"/>
<line x1="0" y1="${mid}" x2="${width}" y2="${mid}" class="gold-zero"/>
<path d="${line}" class="gold-line"/>${ticks}${peak.lead > 0 ? label(peak, true) : ''}${low.lead < 0 ? label(low, false) : ''}
</svg>`;
}
