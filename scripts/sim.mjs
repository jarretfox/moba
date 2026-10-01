// Balance simulator runner: `npm run sim -- --games 120 --seed 1 --workers 8 --json out.json`
// Runs bots-only matches with random lineups across worker threads, then prints per-champion numbers.
// The simulation itself is TypeScript in src/shared/balance/simulate.ts, bundled to .sim/ by `npm run sim`.
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const sim = await import('../.sim/simulate.js');

if (!isMainThread) {
  for (const seed of workerData.seeds) parentPort.postMessage(sim.simulateMatch(seed, workerData.maxMinutes));
} else {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .join(' ')
      .split('--')
      .filter(Boolean)
      .map((a) => a.trim().split(/\s+/)),
  );
  const games = Number(args.games ?? 60);
  const firstSeed = Number(args.seed ?? 1);
  const maxMinutes = Number(args.minutes ?? 45);
  const workers = Math.max(1, Math.min(games, Number(args.workers ?? availableParallelism() - 1)));

  const seeds = Array.from({ length: games }, (_, i) => firstSeed + i);
  const results = [];
  const started = Date.now();
  process.stdout.write(`Simulating ${games} bots-only matches on ${workers} threads (seeds ${firstSeed}–${firstSeed + games - 1})…\n`);
  await Promise.all(
    Array.from({ length: workers }, (_, w) => {
      const mine = seeds.filter((_, i) => i % workers === w);
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), { workerData: { seeds: mine, maxMinutes } });
        worker.on('message', (r) => {
          results.push(r);
          process.stdout.write(`\r${results.length}/${games} done`);
        });
        worker.on('error', reject);
        worker.on('exit', resolve);
      });
    }),
  );
  results.sort((a, b) => a.seed - b.seed);
  process.stdout.write(`\r${games}/${games} done in ${((Date.now() - started) / 1000).toFixed(0)}s\n\n`);
  console.log(sim.formatReport(sim.summarize(results)));
  if (args.json) {
    writeFileSync(args.json, JSON.stringify({ results, summary: sim.summarize(results) }, null, 2));
    console.log(`\nAll match results written to ${args.json}`);
  }
}
