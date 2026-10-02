import { describe, expect, it } from 'vitest';
import { Barbarian } from '../champions/barbarian';
import type { Champion } from '../champions/champion';
import { Marksman } from '../champions/marksman';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP } from '../map/mapData';
import { dist } from '../math';
import { Fountain } from '../sim/fountain';
import { Jungle } from '../sim/jungle';
import { LineProjectile } from '../sim/projectile';
import { Structure, spawnStructures } from '../sim/structure';
import { Warden } from '../sim/warden';
import { World } from '../sim/world';
import { Bot, DODGE_CHANCE, runBots } from './bot';
import { addBots } from './lineup';

function world() {
  const w = new World(MAP);
  spawnStructures(w);
  w.addSystem(new Fountain());
  return w;
}

function run(w: World, bots: Bot[], seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) {
    runBots(w, bots);
    w.step();
    w.drainEvents();
  }
}

function champ(w: World, kind: 'marksman' | 'barbarian', team: PlayerTeam, x: number, y: number): Champion {
  const c = w.add(kind === 'marksman' ? new Marksman(w, team) : new Barbarian(w, team));
  c.pos = { x, y };
  return c;
}

describe('a jungler', () => {
  it('is the third bot of an all-bot team, and clears its side’s camps', () => {
    const w = world();
    const jungle = w.addSystem(new Jungle(w));
    const bots = addBots(w, TEAM.blue, 3);
    expect(bots.map((b) => b.jungler)).toEqual([false, false, true]);
    expect(addBots(w, TEAM.red, 2).some((b) => b.jungler)).toBe(false); // people on the team: nobody's made to jungle
    const j = bots[2];
    for (const b of bots) b.champion.level = 4;
    // Up to the first camps' spawn, then let it loose near them.
    while (w.time < 76) w.step();
    const ours = jungle.camps.filter((c) => c.spot.side === TEAM.blue);
    j.champion.pos = { ...ours[0].spot.pos, x: ours[0].spot.pos.x - 300 };
    run(w, [j], 40);
    expect(ours.some((c) => !c.alive())).toBe(true);
    expect(j.champion.score.cs).toBeGreaterThan(0);
  });
});

describe('dodging', () => {
  it('sees about half the skillshots coming and steps out of their way', () => {
    let dodged = 0;
    const tries = 40;
    for (let i = 0; i < tries; i++) {
      const w = world();
      const me = champ(w, 'barbarian', TEAM.blue, 4000, 2900);
      const foe = champ(w, 'marksman', TEAM.red, 4900, 2900);
      const bot = new Bot(me, 'top', w);
      for (let k = 0; k < 9; k++) w.step(); // past the bot's first moment to think
      for (let k = 0; k < i; k++) w.newId(); // a different shot each try
      w.add(new LineProjectile(w, foe, { from: { x: 4900, y: 2900 }, dir: { x: -1, y: 0 }, speed: 1500, range: 1200, width: 60, vis: 'arrow', pierce: false, onHit: () => {} }));
      const cmds = bot.think(w);
      const move = cmds.find((c) => c.k === 'move');
      // A step to the side, not off toward the lane.
      if (move && move.k === 'move' && Math.abs(move.x - 4000) < 20 && Math.abs(Math.abs(move.y - 2900) - 190) < 20) dodged++;
    }
    expect(dodged / tries).toBeGreaterThan(DODGE_CHANCE - 0.25);
    expect(dodged / tries).toBeLessThan(DODGE_CHANCE + 0.25);
  }, 30000);

  it('only worries about shots that would hit', () => {
    const w = world();
    const foe = champ(w, 'marksman', TEAM.red, 4900, 2900);
    const shot = w.add(new LineProjectile(w, foe, { from: { x: 4900, y: 2900 }, dir: { x: -1, y: 0 }, speed: 1000, range: 1000, width: 60, vis: 'arrow', pierce: false, onHit: () => {} }));
    expect(shot.threatTo({ x: 4400, y: 2900 }, 40, 1)).toBeCloseTo(0.5);
    expect(shot.threatTo({ x: 4400, y: 3100 }, 40, 1)).toBeNull(); // off to the side
    expect(shot.threatTo({ x: 5200, y: 2900 }, 40, 1)).toBeNull(); // behind it
    expect(shot.threatTo({ x: 3500, y: 2900 }, 40, 1)).toBeNull(); // past its range
  });
});

describe('defending and the Warden', () => {
  it('come to the help of a structure under attack', () => {
    const w = world();
    const tower = w.units().find((u): u is Structure => u instanceof Structure && u.team === TEAM.blue && u.role === 'outerShootie' && u.lane === 'top')!;
    const raider = champ(w, 'barbarian', TEAM.red, tower.pos.x + 300, tower.pos.y);
    void raider;
    const me = champ(w, 'marksman', TEAM.blue, tower.pos.x - 2200, tower.pos.y);
    const bot = new Bot(me, 'top', w);
    w.vision.update();
    const before = dist(me.pos, tower.pos);
    run(w, [bot], 3);
    expect(dist(me.pos, tower.pos)).toBeLessThan(before - 600);
  });

  it('call the Warden when they have the numbers, and leave it alone when they don’t', () => {
    const w = world();
    const warden = w.add(new Warden(w, { x: MAP.width / 2, y: MAP.height / 2 }));
    const mine = [champ(w, 'barbarian', TEAM.blue, 3300, 3500), champ(w, 'marksman', TEAM.blue, 3300, 3400)];
    const theirs = [champ(w, 'barbarian', TEAM.red, 9000, 1100), champ(w, 'marksman', TEAM.red, 9000, 1200)];
    for (const c of [...mine, ...theirs]) c.level = 10;
    w.step();
    for (const c of [...mine, ...theirs]) c.hp = c.stats.maxHp; // grown, and healthy
    const bots = mine.map((c) => new Bot(c, 'top', w));
    const calls = () => {
      for (let i = 0; i < 9; i++) w.step();
      // An attack once they can see it; until then (it's out in the dark), a walk to it.
      return bots.flatMap((b) => b.think(w)).filter((c) => (c.k === 'attack' && c.target === warden.id) || (c.k === 'move' && Math.hypot(c.x - warden.pos.x, c.y - warden.pos.y) < 50)).length;
    };
    // Even numbers: no.
    expect(calls()).toBe(0);
    // One of theirs down: go.
    theirs[1].die(w, null);
    expect(calls()).toBeGreaterThan(0);
  });
});
