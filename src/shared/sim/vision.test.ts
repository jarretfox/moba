import { describe, expect, it } from 'vitest';
import type { Champion } from '../champions/champion';
import { Marksman } from '../champions/marksman';
import { learnAll } from '../champions/testing';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, lanePath } from '../map/mapData';
import { Chud } from './chud';
import { spawnStructures } from './structure';
import { World } from './world';

// Open jungle north of the wall chunk (x 3300–4300, y 2450–2800); a brush patch sits at (3150, 2150).
const ROW = 2200;
const BRUSH = { x: 3150, y: 2150 };

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

function champ(world: World, team: PlayerTeam, x: number, y: number): Champion {
  const c = learnAll(world.add(new Marksman(world, team)));
  c.pos = { x, y };
  return c;
}

const sees = (world: World, team: PlayerTeam, id: number) => world.visibleTo(team).some((e) => e.id === id);

describe('fog of war', () => {
  it('shows enemies only within sight', () => {
    const world = new World(MAP);
    champ(world, TEAM.blue, 3000, ROW);
    const red = champ(world, TEAM.red, 4600, ROW); // 1600 away; champions see 1100

    world.step();
    expect(sees(world, TEAM.blue, red.id)).toBe(false);

    red.pos = { x: 3900, y: ROW };
    run(world, 0.2);
    expect(sees(world, TEAM.blue, red.id)).toBe(true);
  });

  it("doesn't see through walls", () => {
    const world = new World(MAP);
    champ(world, TEAM.blue, 3800, 2300);
    const red = champ(world, TEAM.red, 3800, 2950); // 650 away, but the wall chunk is in between

    run(world, 0.2);
    expect(sees(world, TEAM.blue, red.id)).toBe(false);
  });

  it('hides whoever is in brush, except from someone in the same patch', () => {
    const world = new World(MAP);
    const blue = champ(world, TEAM.blue, 3150, 2450); // 300 away, outside the brush
    const red = champ(world, TEAM.red, BRUSH.x + 70, BRUSH.y);

    run(world, 0.2);
    expect(sees(world, TEAM.blue, red.id)).toBe(false);
    expect(sees(world, TEAM.red, blue.id)).toBe(true); // brush doesn't stop you seeing out

    blue.pos = { x: BRUSH.x - 70, y: BRUSH.y };
    run(world, 0.2);
    expect(sees(world, TEAM.blue, red.id)).toBe(true);
  });

  it('gives away an attacker in brush for a moment', () => {
    const world = new World(MAP);
    const blue = champ(world, TEAM.blue, 3150, 2450);
    const red = champ(world, TEAM.red, BRUSH.x, BRUSH.y);
    run(world, 0.2);

    red.commandAttack(blue);
    run(world, 0.5); // wind-up done, the arrow is out
    expect(sees(world, TEAM.blue, red.id)).toBe(true);

    red.commandStop();
    run(world, 1.5);
    expect(sees(world, TEAM.blue, red.id)).toBe(false);
  });

  it('always shows structures, and never shows the enemy their traps', () => {
    const world = new World(MAP);
    const structures = spawnStructures(world);
    const red = champ(world, TEAM.red, 3900, ROW);
    champ(world, TEAM.blue, 3700, ROW);
    red.tryCast(world, 1, { x: 3800, y: ROW }); // Snare Trap
    run(world, 0.5);

    const blueView = world.visibleTo(TEAM.blue);
    for (const s of structures) expect(blueView.some((e) => e.id === s.id)).toBe(true);
    expect(blueView.some((e) => e.k === 'trap')).toBe(false);
    expect(world.visibleTo(TEAM.red).some((e) => e.k === 'trap')).toBe(true);
  });
});

describe('fighting in the fog', () => {
  it('makes Chuds go for the champion they can see, not the closer one hiding in brush', () => {
    const world = new World(MAP);
    const hidden = champ(world, TEAM.blue, BRUSH.x, BRUSH.y);
    const chud = world.add(new Chud(world, TEAM.red, 'melee', 'top', lanePath(world.map, TEAM.red, 'top')));
    chud.pos = { x: BRUSH.x, y: BRUSH.y + 260 };
    const visible = champ(world, TEAM.blue, BRUSH.x + 450, BRUSH.y + 260);

    run(world, 2);
    expect(chud.order).toEqual({ kind: 'attack', targetId: visible.id });
    expect(visible.hp).toBeLessThan(visible.stats.maxHp);
    expect(hidden.hp).toBe(hidden.stats.maxHp);
  });

  it('drops an attack on a target that slips into brush', () => {
    const world = new World(MAP);
    const blue = champ(world, TEAM.blue, 3150, 2600);
    const red = champ(world, TEAM.red, 3150, 2350);
    run(world, 0.2);
    blue.commandAttack(red);
    run(world, 0.2);
    expect(blue.order.kind).toBe('attack');

    red.pos = { x: BRUSH.x, y: BRUSH.y };
    red.revealedUntil = -Infinity;
    run(world, 0.2);
    expect(blue.order.kind).toBe('idle');
  });

  it('only tells a team about events it can see', () => {
    const world = new World(MAP);
    champ(world, TEAM.blue, 3000, ROW);
    const redNear = champ(world, TEAM.red, 3500, ROW);
    const redFar = champ(world, TEAM.red, 5500, 4800);
    run(world, 0.2);

    world.damage(null, redNear, 5, 'true');
    world.damage(null, redFar, 5, 'true');
    world.emit({ e: 'fx', fx: 'aimLine', x: redFar.pos.x, y: redFar.pos.y, team: TEAM.red });
    const told = world.drainEvents().filter((ev) => world.vision.canSeeEvent(TEAM.blue, ev));

    expect(told.some((ev) => ev.e === 'dmg' && ev.target === redNear.id)).toBe(true);
    expect(told.some((ev) => ev.e === 'dmg' && ev.target === redFar.id)).toBe(false);
    expect(told.some((ev) => ev.e === 'fx')).toBe(false);
  });
});
