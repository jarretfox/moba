import type { ChampionId } from '../shared/champions/types';
import type { EntityKind } from '../shared/protocol';

// The death recap: who hurt you, and with what, in the last moments before you went down.

export interface HitRecord {
  /** Seconds (local clock). */
  t: number;
  /** Who did it: an id where there was one, so two Chuds called "Chud" stay apart. */
  key: string;
  name: string;
  champ?: ChampionId;
  skin?: number;
  kind?: EntityKind;
  /** What with: an ability's name, "Basic attacks", "Shootie shots"... */
  label: string;
  amount: number;
}

export interface RecapEntry {
  name: string;
  champ?: ChampionId;
  skin?: number;
  kind?: EntityKind;
  total: number;
  parts: { label: string; amount: number }[];
}

/** Damage taken in the last \`window\` seconds before \`now\`, by who dealt it and how, biggest first. */
export function buildRecap(hits: readonly HitRecord[], now: number, window = 15, top = 4): RecapEntry[] {
  const bySource = new Map<string, RecapEntry & { labels: Map<string, number> }>();
  for (const h of hits) {
    if (now - h.t > window || h.t > now) continue;
    let e = bySource.get(h.key);
    if (!e) {
      e = { name: h.name, champ: h.champ, skin: h.skin, kind: h.kind, total: 0, parts: [], labels: new Map() };
      bySource.set(h.key, e);
    }
    e.total += h.amount;
    e.labels.set(h.label, (e.labels.get(h.label) ?? 0) + h.amount);
  }
  return [...bySource.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, top)
    .map(({ labels, ...e }) => ({ ...e, total: Math.round(e.total), parts: [...labels].map(([label, amount]) => ({ label, amount: Math.round(amount) })).sort((a, b) => b.amount - a.amount) }));
}

/**
 * Everything that hurt you lately, and what each attacker was last doing, so a hit can be put down to
 * "Cleave" rather than just "Bot Barbarian".
 */
export class DamageLog {
  private hits: HitRecord[] = [];
  private readonly casts = new Map<number, { label: string; t: number }>();
  private readonly attacks = new Map<number, number>();
  /** Who each key was the last time we could see them (an attacker can die, or step into the fog). */
  private readonly who = new Map<string, Pick<HitRecord, 'name' | 'champ' | 'skin' | 'kind'>>();

  noteCast(src: number, label: string, t: number): void {
    this.casts.set(src, { label, t });
  }

  noteAttack(src: number, t: number): void {
    this.attacks.set(src, t);
  }

  /** What a hit from `src` at `t` was most likely: their latest basic attack or ability, or something left behind. */
  labelFor(src: number, t: number): string {
    const cast = this.casts.get(src);
    const attack = this.attacks.get(src);
    const castRecent = cast !== undefined && t - cast.t <= 3;
    const attackRecent = attack !== undefined && t - attack <= 1.5;
    if (attackRecent && (!castRecent || attack >= cast.t)) return 'Basic attacks';
    if (castRecent) return cast.label;
    return 'Lingering effects';
  }

  add(hit: Omit<HitRecord, 'name'> & { name?: string }): void {
    const known = this.who.get(hit.key);
    const record: HitRecord = hit.name ? { ...hit, name: hit.name } : { ...hit, name: known?.name ?? 'Something unseen', champ: known?.champ, skin: known?.skin, kind: known?.kind };
    if (hit.name) this.who.set(hit.key, { name: hit.name, champ: hit.champ, skin: hit.skin, kind: hit.kind });
    this.hits = this.hits.filter((h) => record.t - h.t <= 30);
    this.hits.push(record);
  }

  recap(now: number): RecapEntry[] {
    return buildRecap(this.hits, now);
  }
}
