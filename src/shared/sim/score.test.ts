import { describe, expect, it } from 'vitest';
import { KingRix, RoyalGuard } from '../champions/kingrix';
import { Marksman } from '../champions/marksman';
import { learnAll } from '../champions/testing';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, lanePath } from '../map/mapData';
import { add } from '../math';
import { Chud } from './chud';
import { FIRST_CAMP_SPAWN, Jungle } from './jungle';
import { STARTING_GOLD } from './progression';
import { scoreRows } from './score';
import { spawnStructures } from './structure';
import { World } from './world';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

const LANE = { x: 5000, y: 1100 };

function setup() {
  const world = new World(MAP);
  const blue = world.add(new Marksman(world, TEAM.blue));
  blue.pos = { ...LANE };
  const red = world.add(new Marksman(world, TEAM.red));
  red.pos = add(LANE, { x: 300, y: 0 });
  return { world, blue, red };
}

function chudAt(world: World, team: PlayerTeam, x: number, y: number): Chud {
  const c = world.add(new Chud(world, team, 'melee', 'top', lanePath(world.map, team, 'top')));
  c.pos = { x, y };
  return c;
}

describe('match stats', () => {
  it('count kills, deaths and assists', () => {
    const { world, blue, red } = setup();
    const helper = world.add(new Marksman(world, TEAM.blue));
    helper.pos = add(LANE, { x: -100, y: 0 });
    world.damage(helper, red, 50, 'true');
    world.damage(blue, red, 1e6, 'true');
    expect(blue.score).toMatchObject({ kills: 1, deaths: 0, assists: 0 });
    expect(helper.score).toMatchObject({ kills: 0, assists: 1 });
    expect(red.score.deaths).toBe(1);
  });

  it('count last hits on Chuds and monsters as CS, and nothing else', () => {
    const { world, blue } = setup();
    world.damage(blue, chudAt(world, TEAM.red, LANE.x + 200, LANE.y), 1e6, 'true');
    world.damage(null, chudAt(world, TEAM.red, LANE.x + 200, LANE.y), 1e6, 'true'); // someone else's last hit
    const jungle = world.addSystem(new Jungle(world));
    run(world, FIRST_CAMP_SPAWN + 0.1);
    world.damage(blue, jungle.camps[0].members[0], 1e6, 'true');
    expect(blue.score.cs).toBe(2);
  });

  it('add up damage dealt to champions and structures, and damage taken, after armor', () => {
    const { world, blue, red } = setup();
    const structures = spawnStructures(world);
    const dealt = world.damage(blue, red, 100, 'physical');
    expect(blue.score.damageToChampions).toBeCloseTo(dealt);
    expect(red.score.damageTaken).toBeCloseTo(dealt);
    const tower = structures.find((s) => s.team === TEAM.red && s.role === 'outerShootie')!;
    const hit = world.damage(blue, tower, 100, 'physical');
    expect(blue.score.damageToStructures).toBeCloseTo(hit);
    expect(blue.score.damageToChampions).toBeCloseTo(dealt);
  });

  it("put King Rix's guards' damage on his line", () => {
    const { world, red } = setup();
    const rix = learnAll(world.add(new KingRix(world, TEAM.blue)));
    rix.pos = { ...LANE };
    world.step();
    rix.tryCast(world, 1, rix.pos);
    run(world, 0.3);
    const guard = world.units().find((u): u is RoyalGuard => u instanceof RoyalGuard)!;
    const dealt = world.damage(guard, red, 100, 'physical');
    expect(rix.score.damageToChampions).toBeCloseTo(dealt);
  });

  it('total the gold earned, passive income included, but not selling', () => {
    const { world, blue } = setup();
    blue.pos = { ...world.map.spawns[TEAM.blue] };
    run(world, 70); // 10s of passive gold
    world.damage(blue, chudAt(world, TEAM.red, blue.pos.x + 200, blue.pos.y), 1e6, 'true');
    blue.buy(world, 'shiv');
    blue.sell(world, 0);
    expect(blue.score.goldEarned).toBeCloseTo(blue.gold - STARTING_GOLD + 350 - 245, 0); // buying and selling cost 105 net
    expect(blue.score.goldEarned).toBeGreaterThan(21 + 19);
  });

  it('lay out every champion for the scoreboard, blue first', () => {
    const { world, blue, red } = setup();
    world.damage(blue, red, 1e6, 'true');
    const rows = scoreRows(world);
    expect(rows.map((r) => r.team)).toEqual([TEAM.blue, TEAM.red]);
    expect(rows[0]).toMatchObject({ id: blue.id, champ: 'marksman', k: 1, d: 0, a: 0, lv: blue.level });
    expect(rows[1]).toMatchObject({ id: red.id, d: 1 });
  });
});
