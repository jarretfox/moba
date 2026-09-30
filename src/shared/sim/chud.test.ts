import { describe, expect, it } from 'vitest';
import { Marksman } from '../champions/marksman';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, lanePath, type Lane } from '../map/mapData';
import type { ChudType, GameEvent } from '../protocol';
import { Chud } from './chud';
import { spawnStructures } from './structure';
import { WaveSpawner, waveComposition } from './waves';
import { World } from './world';

// Top lane runs along y = 1100. Between x ≈ 5100 and 6900 no Shootie can reach.
const LANE_Y = 1100;

function run(world: World, seconds: number, eachTick?: (events: GameEvent[]) => void): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    world.step();
    const events = world.drainEvents();
    eachTick?.(events);
  }
}

function chudAt(world: World, team: PlayerTeam, type: ChudType, x: number, y = LANE_Y, lane: Lane = 'top'): Chud {
  const c = world.add(new Chud(world, team, type, lane, lanePath(world.map, team, lane)));
  c.pos = { x, y };
  return c;
}

function champAt(world: World, team: PlayerTeam, x: number, y = LANE_Y): Marksman {
  const c = world.add(new Marksman(world, team));
  c.pos = { x, y };
  return c;
}

const chuds = (world: World) => world.units().filter((u): u is Chud => u instanceof Chud && !u.dead);

describe('Chud waves', () => {
  it('sends 3 melee and 2 ranged down both lanes for both teams, with a siege Chud every third wave', () => {
    expect(waveComposition(1)).toEqual(['melee', 'melee', 'melee', 'ranged', 'ranged']);
    expect(waveComposition(3)).toEqual(['melee', 'melee', 'melee', 'siege', 'ranged', 'ranged']);

    const world = new World(MAP);
    world.addSystem(new WaveSpawner());
    run(world, 19.9);
    expect(chuds(world)).toHaveLength(0);

    run(world, 3.5); // first wave has finished crawling out
    expect(chuds(world)).toHaveLength(2 * 2 * 5);
    for (const team of [TEAM.blue, TEAM.red]) {
      for (const lane of ['top', 'bot'] as const) {
        expect(chuds(world).filter((c) => c.team === team && c.lane === lane)).toHaveLength(5);
      }
    }
  });

  it('marches its own lane from Da Base to the river', () => {
    const world = new World(MAP);
    spawnStructures(world);
    world.addSystem(new WaveSpawner([TEAM.blue], ['top']));

    // The route to the river is ~5900 units: about 18s at Chud speed after the 20s first wave.
    // Any later and the leader walks into red's outer Shootie at x ≈ 6950.
    run(world, 40);

    const wave = chuds(world);
    expect(wave).toHaveLength(5);
    expect(Math.max(...wave.map((c) => c.pos.x))).toBeGreaterThan(6000);
    for (const c of wave) expect(c.pos.y).toBeLessThan(1600); // up in the top lane, not wandering the jungle
  });
});

describe('Chud targeting', () => {
  it('fights enemy Chuds before a closer enemy champion', () => {
    const world = new World(MAP);
    const blue = chudAt(world, TEAM.blue, 'melee', 5600);
    chudAt(world, TEAM.red, 'melee', 6000);
    champAt(world, TEAM.red, 5750);

    run(world, 0.2);

    expect(blue.order).toMatchObject({ kind: 'attack' });
    expect(world.getUnit((blue.order as { targetId: number }).targetId)).toBeInstanceOf(Chud);
  });

  it('turns on an enemy champion who hurts one of its champions nearby', () => {
    const world = new World(MAP);
    const blue = chudAt(world, TEAM.blue, 'melee', 5600);
    chudAt(world, TEAM.red, 'melee', 6000);
    const redChamp = champAt(world, TEAM.red, 5900, LANE_Y + 200);
    const blueChamp = champAt(world, TEAM.blue, 5700, LANE_Y + 200);

    run(world, 0.2);
    world.damage(redChamp, blueChamp, 10, 'physical');
    world.step();

    expect(blue.order).toEqual({ kind: 'attack', targetId: redChamp.id });
  });

  it('leaves a Shootie to deal with enemy Chuds that show up', () => {
    const world = new World(MAP);
    const structures = spawnStructures(world);
    const redOuter = structures.find((s) => s.team === TEAM.red && s.role === 'outerShootie' && s.lane === 'top')!;
    const blue = chudAt(world, TEAM.blue, 'siege', redOuter.pos.x - 300);

    run(world, 0.2);
    expect(blue.order).toEqual({ kind: 'attack', targetId: redOuter.id });

    const red = chudAt(world, TEAM.red, 'melee', blue.pos.x + 150, LANE_Y + 150);
    run(world, 0.2);
    expect(blue.order).toEqual({ kind: 'attack', targetId: red.id });
  });

  it('keeps marching once there is nothing left to fight', () => {
    const world = new World(MAP);
    const blue = chudAt(world, TEAM.blue, 'melee', 5600);

    run(world, 1);

    expect(blue.order.kind).toBe('move');
    expect(blue.pos.x).toBeGreaterThan(5600);
  });
});

describe('Chuds and Shooties', () => {
  it('lose a fixed share of their health per Shootie shot: three for melee, two for ranged, eight for siege, fifteen for a Brute', () => {
    for (const [type, shots] of [['melee', 3], ['ranged', 2], ['siege', 8], ['brute', 15]] as const) {
      const world = new World(MAP);
      const structures = spawnStructures(world);
      const blueOuter = structures.find((s) => s.team === TEAM.blue && s.role === 'outerShootie' && s.lane === 'top')!;
      const red = chudAt(world, TEAM.red, type, blueOuter.pos.x + 400);
      let hits = 0;

      run(world, 21, (events) => {
        for (const ev of events) if (ev.e === 'dmg' && ev.target === red.id && ev.type === 'true') hits++;
      });

      expect(red.dead, type).toBe(true);
      expect(hits, type).toBe(shots);
    }
  });

  it('removes a dead Chud a moment after it dies', () => {
    const world = new World(MAP);
    const c = chudAt(world, TEAM.blue, 'melee', 5600);
    world.damage(null, c, 10_000, 'true');

    world.step();
    expect(world.getUnit(c.id)).toBeDefined();
    run(world, 1.1);
    expect(world.getUnit(c.id)).toBeUndefined();
  });
});

describe('a full match of Chud waves', () => {
  it('stays sane for five minutes: waves clash, nothing escapes the map, and ticks stay fast', () => {
    const world = new World(MAP);
    spawnStructures(world);
    world.addSystem(new WaveSpawner());
    let deaths = 0;
    let maxChuds = 0;
    let slowest = 0;

    const started = performance.now();
    for (let i = 0; i < 5 * 60 * TICK_RATE; i++) {
      const t0 = performance.now();
      world.step();
      slowest = Math.max(slowest, performance.now() - t0);
      for (const ev of world.drainEvents()) if (ev.e === 'death') deaths++;
      maxChuds = Math.max(maxChuds, chuds(world).length);
    }
    const avgMs = (performance.now() - started) / (5 * 60 * TICK_RATE);
    console.log(`5 min match: avg ${avgMs.toFixed(3)} ms/tick, slowest ${slowest.toFixed(1)} ms, peak ${maxChuds} Chuds, ${deaths} deaths`);

    for (const u of world.units()) {
      expect(Number.isFinite(u.pos.x) && Number.isFinite(u.pos.y)).toBe(true);
      expect(u.pos.x).toBeGreaterThanOrEqual(0);
      expect(u.pos.x).toBeLessThanOrEqual(MAP.width);
      expect(u.pos.y).toBeGreaterThanOrEqual(0);
      expect(u.pos.y).toBeLessThanOrEqual(MAP.height);
    }
    expect(deaths).toBeGreaterThan(50);
    expect(maxChuds).toBeLessThan(120);
    expect(avgMs).toBeLessThan(10); // a tick is 33 ms; the host has to leave room for everything else
  });
});
