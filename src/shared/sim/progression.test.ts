import { describe, expect, it } from 'vitest';
import { Bot } from '../bots/bot';
import { Barbarian } from '../champions/barbarian';
import type { Champion } from '../champions/champion';
import { Marksman } from '../champions/marksman';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, lanePath } from '../map/mapData';
import { Chud } from './chud';
import { applyCommand } from './commands';
import { CHUD_REWARD, PASSIVE_GOLD, STARTING_GOLD, killBounty, xpToNext } from './progression';
import { spawnStructures } from './structure';
import { World } from './world';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

function champ(world: World, team: PlayerTeam, x: number, y: number, kind: 'marksman' | 'barbarian' = 'marksman'): Champion {
  const c = world.add(kind === 'marksman' ? new Marksman(world, team) : new Barbarian(world, team));
  c.pos = { x, y };
  return c;
}

function chud(world: World, team: PlayerTeam, x: number, y: number): Chud {
  const c = world.add(new Chud(world, team, 'melee', 'top', lanePath(world.map, team, 'top')));
  c.pos = { x, y };
  return c;
}

const LANE = { x: 5600, y: 1100 };

describe('levels', () => {
  it('follow the experience curve and stop at 13', () => {
    const world = new World(MAP);
    const m = champ(world, TEAM.blue, 3300, 3500);
    m.gainXp(world, xpToNext(1) - 1);
    expect(m.level).toBe(1);
    m.gainXp(world, 1);
    expect(m.level).toBe(2);
    m.gainXp(world, 1e6);
    expect(m.level).toBe(13);
    expect(m.skillPoints).toBe(13);
  });

  it('raise stats and top up health by the new maximum', () => {
    const world = new World(MAP);
    const m = champ(world, TEAM.blue, 3300, 3500);
    world.step();
    const before = { maxHp: m.stats.maxHp, ad: m.stats.ad, hp: m.hp };
    m.gainXp(world, xpToNext(1));
    world.step();
    expect(m.stats.maxHp).toBeGreaterThan(before.maxHp);
    expect(m.stats.ad).toBeGreaterThan(before.ad);
    expect(m.hp).toBeCloseTo(before.hp + (m.stats.maxHp - before.maxHp), 0);
  });

  it('gate ability ranks like League: ultimate at 5/9/13, basics at 1/3/5/7', () => {
    const world = new World(MAP);
    const m = champ(world, TEAM.blue, 3300, 3500);
    expect(m.tryCast(world, 0, { x: 3600, y: 3500 })).toBe(false); // nothing learned yet
    expect(m.rankUp(3)).toBe(false);
    expect(m.rankUp(0)).toBe(true);
    expect(m.rankUp(0)).toBe(false); // out of points
    m.gainXp(world, xpToNext(1));
    expect(m.rankUp(0)).toBe(false); // rank 2 needs level 3
    expect(m.rankUp(1)).toBe(true);
    m.gainXp(world, xpToNext(2) + xpToNext(3) + xpToNext(4));
    expect(m.level).toBe(5);
    expect(m.rankUp(3)).toBe(true);
    expect(m.rankUp(3)).toBe(false); // rank 2 needs level 9
    expect(m.tryCast(world, 0, { x: 3600, y: 3500 })).toBe(true);
  });
});

describe('gold and experience', () => {
  it('pays the last hit only, but shares a Chud\'s experience with every enemy champion nearby', () => {
    const world = new World(MAP);
    const hitter = champ(world, TEAM.blue, LANE.x, LANE.y);
    const partner = champ(world, TEAM.blue, LANE.x - 200, LANE.y);
    const victim = chud(world, TEAM.red, LANE.x + 300, LANE.y);

    world.damage(hitter, victim, 1e6, 'true');

    expect(hitter.gold).toBe(STARTING_GOLD + CHUD_REWARD.melee.gold);
    expect(partner.gold).toBe(STARTING_GOLD);
    expect(hitter.xp).toBeCloseTo(CHUD_REWARD.melee.xp * 0.65);
    expect(partner.xp).toBeCloseTo(CHUD_REWARD.melee.xp * 0.65);
  });

  it('still gives experience when a Shootie or Chud gets the kill', () => {
    const world = new World(MAP);
    const solo = champ(world, TEAM.blue, LANE.x, LANE.y);
    const victim = chud(world, TEAM.red, LANE.x + 300, LANE.y);

    world.damage(null, victim, 1e6, 'true');

    expect(solo.gold).toBe(STARTING_GOLD);
    expect(solo.xp).toBe(CHUD_REWARD.melee.xp);
  });

  it('pays a bounty for champion kills, more for ending a streak, and splits assist gold', () => {
    const world = new World(MAP);
    const killer = champ(world, TEAM.blue, LANE.x, LANE.y);
    const helper = champ(world, TEAM.blue, LANE.x - 200, LANE.y);
    const victim = champ(world, TEAM.red, LANE.x + 300, LANE.y);
    victim.streak = 4;
    // On a spree: WANTED, with the gold on their head for everyone to see.
    expect(victim.snapshot(world).bty).toBe(killBounty(4));
    expect(killer.snapshot(world).bty).toBeUndefined();

    world.damage(helper, victim, 50, 'true');
    world.damage(killer, victim, 1e6, 'true');

    expect(killer.gold).toBe(STARTING_GOLD + killBounty(4));
    expect(killBounty(4)).toBeGreaterThan(killBounty(0));
    expect(helper.gold).toBe(STARTING_GOLD + 150);
    expect(killer.streak).toBe(1);
    expect(victim.streak).toBe(0);
    const feed = world.drainEvents().find((e) => e.e === 'kill');
    expect(feed).toMatchObject({ killer: killer.name, victim: victim.name, team: TEAM.blue, what: 'champion', streak: 1, shutdown: true, bounty: killBounty(4), ace: false, killerChamp: 'marksman', victimChamp: 'marksman' });
  });

  it('tells the announcer when a whole team is down', () => {
    const world = new World(MAP);
    const killer = champ(world, TEAM.blue, LANE.x, LANE.y);
    const first = champ(world, TEAM.red, LANE.x + 300, LANE.y);
    const last = champ(world, TEAM.red, LANE.x + 400, LANE.y);

    world.damage(killer, first, 1e6, 'true');
    expect(world.drainEvents().find((e) => e.e === 'kill')).toMatchObject({ victim: first.name, streak: 1, shutdown: false, ace: false });
    world.damage(killer, last, 1e6, 'true');
    expect(world.drainEvents().find((e) => e.e === 'kill')).toMatchObject({ victim: last.name, streak: 2, ace: true });
  });

  it('credits the kill to the last champion who hurt them when a Shootie finishes the job', () => {
    const world = new World(MAP);
    const chaser = champ(world, TEAM.blue, LANE.x, LANE.y);
    const victim = champ(world, TEAM.red, LANE.x + 300, LANE.y);

    world.damage(chaser, victim, 50, 'true');
    run(world, 2);
    world.damage(null, victim, 1e6, 'true');

    expect(chaser.gold).toBeGreaterThanOrEqual(STARTING_GOLD + killBounty(0));
  });

  it("names what got the kill in the feed when no champion did", () => {
    const world = new World(MAP);
    const structures = spawnStructures(world);
    const victim = champ(world, TEAM.red, LANE.x, LANE.y);
    const shootie = structures.find((s) => s.team === TEAM.blue && s.role === 'outerShootie')!;
    world.drainEvents();
    world.damage(shootie, victim, 1e6, 'true');
    expect(world.drainEvents().find((e) => e.e === 'kill')).toMatchObject({ killer: shootie.name, victim: victim.name, team: TEAM.blue });
  });

  it('trickles in passive gold after the first minute', () => {
    const world = new World(MAP);
    const m = champ(world, TEAM.blue, 3300, 3500);
    run(world, 59);
    expect(m.gold).toBe(STARTING_GOLD);
    run(world, 11);
    expect(m.gold).toBeCloseTo(STARTING_GOLD + 10 * PASSIVE_GOLD.perSecond, 0);
  });

  it('pays the whole team when a structure falls', () => {
    const world = new World(MAP);
    const structures = spawnStructures(world);
    const a = champ(world, TEAM.red, 9000, 3500);
    const b = champ(world, TEAM.red, 9100, 3500);
    const blueOuter = structures.find((s) => s.team === TEAM.blue && s.role === 'outerShootie')!;

    world.damage(a, blueOuter, 1e6, 'true');

    expect(a.gold).toBe(STARTING_GOLD + 125);
    expect(b.gold).toBe(STARTING_GOLD + 125);
  });
});

describe('bots and progression', () => {
  it('spend their skill points, taking the ultimate at level 5', () => {
    const world = new World(MAP);
    const barb = champ(world, TEAM.blue, 3300, 3500, 'barbarian');
    const bot = new Bot(barb, 'top', world);
    barb.gainXp(world, xpToNext(1) + xpToNext(2) + xpToNext(3) + xpToNext(4));
    for (let i = 0; i < 60; i++) {
      for (const c of bot.think(world)) applyCommand(world, barb, c);
      world.step();
    }
    expect(barb.level).toBe(5);
    expect(barb.skillPoints).toBe(0);
    expect(barb.abilities[3].rank).toBe(1);
    expect(barb.abilities.reduce((n, a) => n + a.rank, 0)).toBe(5);
  });
});
