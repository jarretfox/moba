import { describe, expect, it } from 'vitest';
import { Barbarian } from '../champions/barbarian';
import type { Champion } from '../champions/champion';
import { Marksman } from '../champions/marksman';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, lanePath } from '../map/mapData';
import { dist } from '../math';
import { Chud } from '../sim/chud';
import { applyCommand } from '../sim/commands';
import { Fountain } from '../sim/fountain';
import { Structure, spawnStructures } from '../sim/structure';
import { WaveSpawner } from '../sim/waves';
import { World } from '../sim/world';
import { Bot } from './bot';
import { addBots } from './lineup';
import { progressAlong } from './lanes';

function match(opts: { waves?: boolean } = {}) {
  const world = new World(MAP);
  const structures = spawnStructures(world);
  if (opts.waves) world.addSystem(new WaveSpawner());
  world.addSystem(new Fountain());
  return { world, structures };
}

function run(world: World, bots: Bot[], seconds: number, eachTick?: () => void): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    for (const b of bots) for (const c of b.think(world)) applyCommand(world, b.champion, c);
    world.step();
    world.drainEvents();
    eachTick?.();
  }
}

function champ(world: World, kind: 'marksman' | 'barbarian', team: PlayerTeam, x: number, y: number): Champion {
  const c = world.add(kind === 'marksman' ? new Marksman(world, team) : new Barbarian(world, team));
  c.pos = { x, y };
  return c;
}

function chudAt(world: World, team: PlayerTeam, x: number, y: number): Chud {
  const c = world.add(new Chud(world, team, 'melee', 'top', lanePath(world.map, team, 'top')));
  c.pos = { x, y };
  return c;
}

describe('bots in lane', () => {
  it('walk to their lane and stay behind the front of their own wave', () => {
    const { world } = match({ waves: true });
    const [bot] = addBots(world, TEAM.blue, 1); // blue top
    const route = lanePath(world.map, TEAM.blue, 'top');
    let checks = 0;
    let aheadOfWave = 0;

    run(world, [bot], 45, () => {
      if (world.time < 30 || world.tick % 15 !== 0) return;
      const wave = world.units().filter((u) => u instanceof Chud && u.team === TEAM.blue && u.lane === 'top' && !u.dead);
      if (!wave.length) return;
      checks++;
      const front = Math.max(...wave.map((c) => progressAlong(route, c.pos)));
      if (progressAlong(route, bot.champion.pos) > front + 50) aheadOfWave++;
    });

    expect(bot.champion.pos.y).toBeLessThan(1600); // up in the top lane
    expect(checks).toBeGreaterThan(10);
    expect(aheadOfWave).toBe(0);
  });

  it('last-hit enemy Chuds', () => {
    const { world } = match({ waves: true });
    const [bot] = addBots(world, TEAM.blue, 1);
    let lastHits = 0;

    for (let i = 0; i < 90 * TICK_RATE; i++) {
      for (const c of bot.think(world)) applyCommand(world, bot.champion, c);
      world.step();
      const events = world.drainEvents();
      for (const ev of events) {
        if (ev.e !== 'dmg' || ev.src !== bot.champion.id) continue;
        const target = world.getUnit(ev.target);
        if (target instanceof Chud && target.dead) lastHits++;
      }
    }

    expect(lastHits).toBeGreaterThanOrEqual(3);
  });

  it('go for the Chud they can finish over one they can merely hit', () => {
    const { world } = match();
    const [, bot] = addBots(world, TEAM.blue, 2); // a Marksman
    bot.champion.pos = { x: 5400, y: 1100 };
    const stay = (c: Chud) => (c.addStatus(world, 'root', 60), c);
    stay(chudAt(world, TEAM.blue, 5300, 1100)); // our wave is here
    const healthy = stay(chudAt(world, TEAM.red, 6000, 1100)); // in reach
    const dying = stay(chudAt(world, TEAM.red, 6250, 1100)); // a step further
    dying.hp = 30;

    run(world, [bot], 0.3);

    expect(bot.champion.order).toEqual({ kind: 'attack', targetId: dying.id });
    expect(healthy.hp).toBe(healthy.stats.maxHp);
  });

  it("won't walk under an enemy Shootie with no Chuds to tank it, even for a kill", () => {
    const { world, structures } = match();
    const [bot] = addBots(world, TEAM.blue, 1); // a melee Barbarian
    const redOuter = structures.find((s) => s.team === TEAM.red && s.role === 'outerShootie' && s.lane === 'top')!;
    // Just outside the Shootie's actual range (650 + its radius + ours ≈ 758)...
    bot.champion.pos = { x: redOuter.pos.x - 850, y: 1100 };
    // ...with bait a last-hit step away: a nearly dead Chud pinned under the Shootie.
    const bait = chudAt(world, TEAM.red, redOuter.pos.x - 400, 1100);
    bait.addStatus(world, 'root', 60);
    bait.hp = 20;
    let shotAt = 0;

    run(world, [bot], 10, () => {
      if (redOuter.order.kind === 'attack' && redOuter.order.targetId === bot.champion.id) shotAt++;
    });

    expect(shotAt).toBe(0);
    expect(bait.dead).toBe(false);
  });
});

describe('bots and champions', () => {
  it('fight a weaker enemy champion, abilities and all', () => {
    const { world } = match();
    const [bot] = addBots(world, TEAM.blue, 1); // a Barbarian
    bot.champion.pos = { x: 5400, y: 1100 };
    const foe = champ(world, 'marksman', TEAM.red, 5850, 1100);
    foe.hp = foe.stats.maxHp * 0.3;
    const cooldownsBefore = bot.champion.abilities.map((a) => a.readyAt);

    run(world, [bot], 4);

    expect(foe.dead || foe.hp < foe.stats.maxHp * 0.3).toBe(true);
    expect(bot.champion.abilities.some((a, i) => a.readyAt > cooldownsBefore[i])).toBe(true);
  });

  it('back off from a healthier enemy champion when hurt', () => {
    const { world } = match();
    const [, bot] = addBots(world, TEAM.blue, 2); // a Marksman
    bot.champion.pos = { x: 5400, y: 1100 };
    bot.champion.hp = bot.champion.stats.maxHp * 0.3;
    const foe = champ(world, 'barbarian', TEAM.red, 5800, 1100);
    const start = { ...bot.champion.pos };

    run(world, [bot], 2);

    expect(dist(bot.champion.pos, foe.pos)).toBeGreaterThan(dist(start, foe.pos));
  });

  it('go home to heal when low, and come back', () => {
    const { world } = match();
    const [bot] = addBots(world, TEAM.blue, 1);
    bot.champion.pos = { x: 5000, y: 1100 };
    bot.champion.hp = bot.champion.stats.maxHp * 0.2;
    let wasHome = false;

    run(world, [bot], 40, () => {
      if (dist(bot.champion.pos, world.map.spawns[TEAM.blue]) < 100) wasHome = true;
    });

    expect(wasHome).toBe(true);
    expect(bot.champion.hp).toBeGreaterThan(bot.champion.stats.maxHp * 0.85);
    expect(dist(bot.champion.pos, world.map.spawns[TEAM.blue])).toBeGreaterThan(1000); // back out toward lane
  });
});

describe('a bots-only match', () => {
  it('plays out to a winner, and stays fast and sane doing it', () => {
    const { world } = match({ waves: true });
    const bots = [...addBots(world, TEAM.blue, 3), ...addBots(world, TEAM.red, 3)];
    const fallen: string[] = [];
    let slowest = 0;
    const started = performance.now();

    for (let i = 0; i < 40 * 60 * TICK_RATE && !world.winner; i++) {
      for (const b of bots) for (const c of b.think(world)) applyCommand(world, b.champion, c);
      const t0 = performance.now();
      world.step();
      slowest = Math.max(slowest, performance.now() - t0);
      for (const ev of world.drainEvents()) {
        const u = ev.e === 'death' ? world.getUnit(ev.id) : undefined;
        if (u instanceof Structure) fallen.push(u.role);
      }
    }
    const avgMs = (performance.now() - started) / world.tick;
    console.log(`bot match: winner ${world.winner} at ${(world.time / 60).toFixed(1)} min, ${fallen.length} structures fell, avg ${avgMs.toFixed(2)} ms/tick (incl. bots), slowest sim tick ${slowest.toFixed(1)} ms`);

    expect(world.winner).not.toBeNull();
    for (const u of world.units()) expect(world.grid.nearestWalkable(u.pos)).not.toBeNull();
    expect(avgMs).toBeLessThan(5);
  }, 120_000);
});
