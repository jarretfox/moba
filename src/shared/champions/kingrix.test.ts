import { describe, expect, it } from 'vitest';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP, lanePath } from '../map/mapData';
import { add, dist } from '../math';
import { Chud } from '../sim/chud';
import { STARTING_GOLD, killBounty } from '../sim/progression';
import { Structure, spawnStructures } from '../sim/structure';
import { World } from '../sim/world';
import { KNEEL, KingRix, ROYAL_DECREE, ROYAL_TAX, RoyalGuard } from './kingrix';
import { Logan } from './logan';
import { Marksman } from './marksman';
import { learnAll } from './testing';
import { Willmore } from './willmore';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

const LANE = { x: 5000, y: 1100 };

function setup() {
  const world = new World(MAP);
  const rix = learnAll(world.add(new KingRix(world, TEAM.blue)));
  rix.pos = { ...LANE };
  const foe = learnAll(world.add(new Marksman(world, TEAM.red)));
  foe.pos = { x: LANE.x + 250, y: LANE.y };
  world.step();
  return { world, rix, foe };
}

function chudAt(world: World, team: PlayerTeam, x: number, y: number): Chud {
  const c = world.add(new Chud(world, team, 'melee', 'top', lanePath(world.map, team, 'top')));
  c.pos = { x, y };
  return c;
}

const guards = (world: World) => world.units().filter((u): u is RoyalGuard => u instanceof RoyalGuard && !u.dead);

describe('Royal Tax', () => {
  it('makes allied Chuds near him hit harder', () => {
    const { world, rix } = setup();
    const near = chudAt(world, TEAM.blue, rix.pos.x + 300, rix.pos.y);
    const far = chudAt(world, TEAM.blue, rix.pos.x - 2000, rix.pos.y);
    run(world, 0.1);
    expect(near.stats.ad).toBeCloseTo(far.stats.ad * (1 + ROYAL_TAX.chudDamage));
    expect(near.snapshot(world).st).toContain('royal');
    expect(far.snapshot(world).st ?? []).not.toContain('royal');
  });

  it("takes a cut of nearby allies' last hits", () => {
    const { world, rix } = setup();
    const ally = world.add(new Marksman(world, TEAM.blue));
    ally.pos = add(rix.pos, { x: -200, y: 0 });
    const victim = chudAt(world, TEAM.red, rix.pos.x + 300, rix.pos.y);
    const gold = rix.gold;
    world.damage(ally, victim, 1e6, 'true');
    expect(rix.gold).toBe(gold + ROYAL_TAX.gold);

    const distant = chudAt(world, TEAM.red, rix.pos.x + 3000, rix.pos.y);
    world.damage(ally, distant, 1e6, 'true');
    expect(rix.gold).toBe(gold + ROYAL_TAX.gold);
  });
});

describe('Levy', () => {
  it('pays extra and refunds its mana when it kills', () => {
    const { world, rix, foe } = setup();
    foe.pos = { x: 9000, y: 1100 };
    const victim = chudAt(world, TEAM.red, rix.pos.x + 400, rix.pos.y);
    victim.hp = 5;
    rix.mana = 100;
    const gold = rix.gold;
    rix.tryCast(world, 0, victim.pos);
    run(world, 0.6);
    expect(victim.dead).toBe(true);
    expect(rix.gold).toBeGreaterThan(gold + 21); // more than the plain last-hit gold
    expect(rix.mana).toBeGreaterThan(100);
  });
});

describe('Call the Guard', () => {
  it('summons two guards that hit what he hits, and go when their time is up', () => {
    const { world, rix, foe } = setup();
    rix.tryCast(world, 1, rix.pos);
    run(world, 0.3);
    expect(guards(world)).toHaveLength(2);
    expect(guards(world).every((g) => g.fearsLions)).toBe(true);

    foe.stats.armor = 0;
    const before = foe.hp;
    rix.commandAttack(foe);
    run(world, 2.5);
    expect(guards(world).every((g) => dist(g.pos, foe.pos) < 200)).toBe(true);
    expect(before - foe.hp).toBeGreaterThan(rix.stats.ad * 2);

    run(world, 6);
    expect(guards(world)).toHaveLength(0);
  });

  it('stick by him when he walks off', () => {
    const { world, rix, foe } = setup();
    foe.pos = { x: 9000, y: 1100 };
    rix.tryCast(world, 1, rix.pos);
    run(world, 0.3);
    rix.commandMove(world, add(rix.pos, { x: -900, y: 0 }));
    run(world, 4);
    expect(guards(world).every((g) => dist(g.pos, rix.pos) < 400)).toBe(true);
  });
});

describe('KNEEL!', () => {
  it('stuns the enemies in front of him', () => {
    const { world, rix, foe } = setup();
    const before = foe.hp;
    rix.tryCast(world, 2, foe.pos);
    run(world, 0.3);
    expect(foe.has('stun')).toBe(true);
    expect(foe.hp).toBeLessThan(before);
  });

  it('only half-works on Logan, who roars right back (A Lion Kneels to No One)', () => {
    const { world, rix, foe } = setup();
    foe.pos = { x: 9000, y: 1100 };
    const logan = learnAll(world.add(new Logan(world, TEAM.red)));
    logan.pos = add(rix.pos, { x: 200, y: 0 });
    rix.tryCast(world, 2, logan.pos);
    run(world, 0.3);
    expect(logan.has('stun')).toBe(true);
    expect(rix.has('fear')).toBe(true);
    run(world, KNEEL.stun[0] * KNEEL.loganShare);
    expect(logan.has('stun')).toBe(false);
  });
});

describe('Royal Decree', () => {
  it('needs a visible enemy champion near where he aims', () => {
    const { world, rix, foe } = setup();
    expect(rix.tryCast(world, 3, add(foe.pos, { x: 0, y: 1000 }))).toBe(false);
    expect(rix.abilities[3].readyAt).toBe(0);
  });

  it('reveals them to everyone, even burrowed, and they take more damage', () => {
    const { world, rix, foe } = setup();
    foe.pos = { x: 9000, y: 1100 };
    const mole = learnAll(world.add(new Willmore(world, TEAM.red)));
    mole.pos = add(rix.pos, { x: 300, y: 0 });
    world.step();
    expect(rix.tryCast(world, 3, mole.pos)).toBe(true);
    mole.tryCast(world, 1, mole.pos); // burrow
    rix.pos = { x: 1000, y: 3500 }; // walk far away too
    world.vision.update(true);
    expect(world.vision.canSee(TEAM.blue, mole)).toBe(true);

    const plain = setup();
    const a = plain.world.damage(null, plain.foe, 100, 'true');
    const b = world.damage(null, mole, 100, 'true');
    expect(b).toBeCloseTo(a * (1 + ROYAL_DECREE.damageTaken));
  });

  it('pays his whole team if they die marked, whoever gets the kill', () => {
    const { world, rix, foe } = setup();
    const ally = world.add(new Marksman(world, TEAM.blue));
    ally.pos = { x: 1000, y: 3500 };
    ally.gold = STARTING_GOLD;
    rix.tryCast(world, 3, foe.pos);
    run(world, 2);
    world.damage(null, foe, 1e6, 'true');
    run(world, 0.1);
    expect(ally.gold).toBeCloseTo(STARTING_GOLD + ROYAL_DECREE.teamGold[0], 0);
  });

  it('pays nothing once the mark has worn off', () => {
    const { world, rix, foe } = setup();
    const ally = world.add(new Marksman(world, TEAM.blue));
    ally.pos = { x: 1000, y: 3500 };
    rix.tryCast(world, 3, foe.pos);
    run(world, ROYAL_DECREE.duration + 0.5);
    ally.gold = STARTING_GOLD;
    world.damage(null, foe, 1e6, 'true');
    run(world, 0.1);
    expect(ally.gold).toBe(STARTING_GOLD);
  });
});

describe('Two Crowns', () => {
  function rivals() {
    const world = new World(MAP);
    const structures = spawnStructures(world);
    const rix = world.add(new KingRix(world, TEAM.blue));
    rix.pos = { ...LANE };
    const logan = world.add(new Logan(world, TEAM.red));
    logan.pos = add(LANE, { x: 200, y: 0 });
    world.step();
    return { world, rix, logan, structures };
  }

  it('Logan takes the crown, and double the bounty', () => {
    const { world, rix, logan } = rivals();
    world.damage(logan, rix, 1e6, 'true');
    expect(logan.gold).toBe(STARTING_GOLD + 2 * killBounty(0));
    expect(logan.snapshot(world).badge).toBe('👑');
  });

  it('King Rix hangs a lion banner over his Da Base, and takes double the bounty', () => {
    const { world, rix, logan, structures } = rivals();
    world.damage(rix, logan, 1e6, 'true');
    expect(rix.gold).toBe(STARTING_GOLD + 2 * killBounty(0));
    const base = structures.find((s): s is Structure => s.role === 'daBase' && s.team === TEAM.blue)!;
    expect(base.snapshot(world).badge).toBe('🦁');
  });

  it("is only a rivalry across teams, and only between those two", () => {
    const { world, rix } = rivals();
    const marksman = world.add(new Marksman(world, TEAM.red));
    marksman.pos = add(LANE, { x: -200, y: 0 });
    world.damage(marksman, rix, 1e6, 'true');
    expect(marksman.gold).toBe(STARTING_GOLD + killBounty(0));
  });
});
