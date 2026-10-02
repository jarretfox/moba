// Ability and item descriptions, worked out for you: in every "40/65/90/115" the number for your rank is
// picked out, and where it scales ("(+50% AD)") the total it comes to right now follows it.

export interface LiveStats {
  ad: number;
  ap: number;
  /** Bonus AD (from items and buffs). */
  bad: number;
  /** Bonus health. */
  bhp: number;
  /** Maximum health. */
  mhp: number;
}

export interface Piece {
  text: string;
  /** `rank`: your rank's number in a list; `total`: what it comes to with your stats. */
  kind?: 'rank' | 'total';
}

const STAT: Record<string, keyof LiveStats> = {
  AD: 'ad',
  AP: 'ap',
  'bonus AD': 'bad',
  'max health': 'mhp',
  'bonus health': 'bhp',
  'of your bonus health': 'bhp',
};

const SCALE = '(AD|AP|bonus AD|max health|bonus health|of your bonus health)';
// A number or a list of them per rank, then optionally what it scales with: "40/65/90/115 (+50% AD, +30% AP)".
const PATTERN = new RegExp(`(\\d+(?:\\.\\d+)?%?(?:/\\d+(?:\\.\\d+)?%?)*)( \\(\\+(\\d+)% ${SCALE}(?:, \\+(\\d+)% ${SCALE})?\\))?`, 'g');

/** `rank` 0 (not learned) reads as rank 1. */
export function liveDescription(text: string, rank: number, stats: LiveStats): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const [whole, list, ratios, r1, s1, r2, s2] = m;
    const values = list.split('/');
    if (values.length < 2 && !ratios) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const at = Math.max(0, Math.min(values.length - 1, rank - 1));
    if (values.length > 1) {
      values.forEach((v, i) => {
        if (i) out.push({ text: '/' });
        out.push(i === at ? { text: v, kind: 'rank' } : { text: v });
      });
    } else out.push({ text: values[0] });
    if (ratios) {
      out.push({ text: ratios });
      if (!values[at].endsWith('%')) {
        const total = parseFloat(values[at]) + (Number(r1) / 100) * stats[STAT[s1]] + (r2 ? (Number(r2) / 100) * stats[STAT[s2]] : 0);
        out.push({ text: ` = ${Math.round(total)}`, kind: 'total' });
      }
    }
    last = m.index + whole.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
