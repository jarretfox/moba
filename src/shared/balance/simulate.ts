import { runBots } from '../bots/bot';
import { addBots } from '../bots/lineup';
import { CHAMPION_INFO } from '../champions/registry';
import type { ChampionId } from '../champions/types';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import type { Lane } from '../map/mapData';
import { MAP } from '../map/mapData';
import type { ScoreRow } from '../protocol';
import { Fountain } from '../sim/fountain';
import { Jungle } from '../sim/jungle';
import { scoreRows } from '../sim/score';
import { spawnStructures } from '../sim/structure';
import { WardenLair } from '../sim/warden';
import { WaveSpawner } from '../sim/waves';
import { World } from '../sim/world';

// The balance simulator: bots-only matches with random lineups, boiled down to per-champion numbers.
// `npm run sim` runs it across all CPU cores (scripts/sim.mjs); this file is the part that's tested.

export interface MatchResult {
  seed: number;
  /** 0 if nobody won before the time limit. */
  winner: 0 | PlayerTeam;
  minutes: number;
  champions: (ScoreRow & { lane: Lane })[];
}

/** A small seeded random number generator, so a seed always replays the same match. */
export function seededRandom(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One full bots-only match. Odd seeds create red's bots first, so neither side is always first. */
export function simulateMatch(seed: number, maxMinutes = 45): MatchResult {
  const world = new World(MAP);
  spawnStructures(world);
  world.addSystem(new WaveSpawner());
  world.addSystem(new Fountain());
  world.addSystem(new Jungle(world));
  world.addSystem(new WardenLair());
  const random = seededRandom(seed);
  const order: PlayerTeam[] = seed % 2 ? [TEAM.red, TEAM.blue] : [TEAM.blue, TEAM.red];
  const bots = order.flatMap((team) => addBots(world, team, 3, [], random));
  const ticks = Math.round(maxMinutes * 60 * TICK_RATE);
  for (let i = 0; i < ticks && !world.winner; i++) {
    runBots(world, bots);
    world.step();
    world.drainEvents();
  }
  const lanes = new Map(bots.map((b) => [b.champion.id, b.lane]));
  return {
    seed,
    winner: world.winner ?? 0,
    minutes: Math.round((world.time / 60) * 10) / 10,
    champions: scoreRows(world).map((r) => ({ ...r, lane: lanes.get(r.id) ?? 'top' })),
  };
}

export interface ChampionSummary {
  champ: ChampionId;
  games: number;
  wins: number;
  winRate: number;
  /** 95% confidence interval for the win rate (Wilson score). */
  ci: [number, number];
  /** Per-game averages. */
  k: number;
  d: number;
  a: number;
  cs: number;
  dmg: number;
  taken: number;
  tdmg: number;
  gold: number;
  lv: number;
}

export interface Summary {
  games: number;
  finished: number;
  blueWins: number;
  redWins: number;
  minutes: { median: number; p10: number; p90: number };
  champions: ChampionSummary[];
}

/** 95% Wilson interval: honest about small samples, unlike plus-or-minus two standard errors. */
export function wilson(wins: number, games: number): [number, number] {
  if (games === 0) return [0, 1];
  const z = 1.96;
  const p = wins / games;
  const denom = 1 + (z * z) / games;
  const center = (p + (z * z) / (2 * games)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}

function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** Per-champion win rates and averages over finished matches, best win rate first. */
export function summarize(results: readonly MatchResult[]): Summary {
  const finished = results.filter((r) => r.winner !== 0);
  const minutes = finished.map((r) => r.minutes).sort((a, b) => a - b);
  const acc = new Map<ChampionId, { games: number; wins: number; sums: Record<'k' | 'd' | 'a' | 'cs' | 'dmg' | 'taken' | 'tdmg' | 'gold' | 'lv', number> }>();
  for (const match of finished) {
    for (const c of match.champions) {
      let e = acc.get(c.champ);
      if (!e) acc.set(c.champ, (e = { games: 0, wins: 0, sums: { k: 0, d: 0, a: 0, cs: 0, dmg: 0, taken: 0, tdmg: 0, gold: 0, lv: 0 } }));
      e.games++;
      if (c.team === match.winner) e.wins++;
      for (const key of Object.keys(e.sums) as (keyof typeof e.sums)[]) e.sums[key] += c[key];
    }
  }
  const champions = [...acc].map(([champ, e]) => {
    const avg = (key: keyof typeof e.sums) => e.sums[key] / e.games;
    return {
      champ,
      games: e.games,
      wins: e.wins,
      winRate: e.wins / e.games,
      ci: wilson(e.wins, e.games),
      k: avg('k'),
      d: avg('d'),
      a: avg('a'),
      cs: avg('cs'),
      dmg: avg('dmg'),
      taken: avg('taken'),
      tdmg: avg('tdmg'),
      gold: avg('gold'),
      lv: avg('lv'),
    };
  });
  champions.sort((a, b) => b.winRate - a.winRate);
  return {
    games: results.length,
    finished: finished.length,
    blueWins: finished.filter((r) => r.winner === TEAM.blue).length,
    redWins: finished.filter((r) => r.winner === TEAM.red).length,
    minutes: { median: percentile(minutes, 0.5), p10: percentile(minutes, 0.1), p90: percentile(minutes, 0.9) },
    champions,
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const k1 = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0));

/** The summary as a text table for the terminal. */
export function formatReport(s: Summary): string {
  const lines = [
    `${s.games} games (${s.finished} finished) · match length median ${s.minutes.median} min (10th–90th percentile ${s.minutes.p10}–${s.minutes.p90}) · Blue won ${s.blueWins}, Red ${s.redWins}`,
    '',
    `${'Champion'.padEnd(17)}${'Games'.padStart(6)}${'Win'.padStart(6)}  ${'95% range'.padEnd(10)}${'K/D/A'.padStart(15)}${'CS'.padStart(6)}${'Dmg'.padStart(8)}${'Taken'.padStart(8)}${'Towers'.padStart(8)}${'Gold'.padStart(8)}${'Lv'.padStart(6)}`,
  ];
  for (const c of s.champions) {
    const kda = `${c.k.toFixed(1)}/${c.d.toFixed(1)}/${c.a.toFixed(1)}`;
    lines.push(
      `${CHAMPION_INFO[c.champ].name.padEnd(17)}${String(c.games).padStart(6)}${pct(c.winRate).padStart(6)}  ${`${pct(c.ci[0])}–${pct(c.ci[1])}`.padEnd(10)}${kda.padStart(15)}${c.cs.toFixed(0).padStart(6)}${k1(c.dmg).padStart(8)}${k1(c.taken).padStart(8)}${k1(c.tdmg).padStart(8)}${k1(c.gold).padStart(8)}${c.lv.toFixed(1).padStart(6)}`,
    );
  }
  lines.push('', 'Bots, not people: a champion whose bot plays its kit badly looks weak here. Use it to spot outliers, then check them in real games.');
  return lines.join('\n');
}
