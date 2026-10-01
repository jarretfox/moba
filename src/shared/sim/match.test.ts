import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, type Lane, type StructureRole } from '../map/mapData';
import { Chud } from './chud';
import { spawnStructures } from './structure';
import { WaveSpawner, waveComposition } from './waves';
import { World } from './world';

function setup() {
  const world = new World(MAP);
  const structures = spawnStructures(world);
  const waves = world.addSystem(new WaveSpawner());
  const find = (team: PlayerTeam, role: StructureRole, lane: Lane | null = null) =>
    structures.find((s) => s.team === team && s.role === role && s.lane === lane)!;
  return { world, waves, find };
}

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

const newChuds = (world: World, before: Set<number>) =>
  world.units().filter((u): u is Chud => u instanceof Chud && !before.has(u.id));

describe('Chud Brutes', () => {
  it('lead the wave only when asked for', () => {
    expect(waveComposition(1, true)).toEqual(['brute', 'melee', 'melee', 'melee', 'ranged', 'ranged']);
    expect(waveComposition(1)).not.toContain('brute');
  });

  it('march with your waves in a lane while the enemy Oakner there is down, and stop once it regrows', () => {
    const { world, find } = setup();
    find(TEAM.red, 'oakner', 'top').die(world, null);

    run(world, 23.5); // first wave out
    const firstWave = newChuds(world, new Set());
    const brutes = firstWave.filter((c) => c.chudType === 'brute');
    expect(brutes).toHaveLength(1);
    expect(brutes[0].team).toBe(TEAM.blue);
    expect(brutes[0].lane).toBe('top');

    // The Oakner regrows at 4:00; the 4:20 wave comes without a Brute.
    run(world, 259 - world.time);
    const before = new Set(world.units().map((u) => u.id));
    run(world, 4);
    const lastWave = newChuds(world, before);
    expect(lastWave.length).toBeGreaterThan(0);
    expect(lastWave.filter((c) => c.chudType === 'brute')).toHaveLength(0);
  }, 30_000); // simulates over four minutes of waves
});

describe('winning', () => {
  it('goes to the other team when a Da Base falls, and the waves stop', () => {
    const { world, waves, find } = setup();
    expect(world.winner).toBeNull();

    find(TEAM.red, 'daBase').die(world, null);
    expect(world.winner).toBe(TEAM.blue);

    const chudsBefore = world.units().filter((u) => u instanceof Chud).length;
    run(world, waves.secondsUntilNextWave(world) + 5);
    expect(world.units().filter((u) => u instanceof Chud).length).toBe(chudsBefore);
  });

  it("keeps the first result if the other Da Base falls in the same moment", () => {
    const { world, find } = setup();
    find(TEAM.blue, 'daBase').die(world, null);
    find(TEAM.red, 'daBase').die(world, null);
    expect(world.winner).toBe(TEAM.red);
  });
});
