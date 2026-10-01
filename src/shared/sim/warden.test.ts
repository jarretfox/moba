import { describe, expect, it } from 'vitest';
import type { Champion } from '../champions/champion';
import { Marksman } from '../champions/marksman';
import { TEAM, TICK_RATE, type PlayerTeam } from '../constants';
import { MAP } from '../map/mapData';
import { add, dist } from '../math';
import { Chud } from './chud';
import { STARTING_GOLD } from './progression';
import { GRUDGE, UNCHAINED, WARDEN, WardenLair } from './warden';
import { WaveSpawner } from './waves';
import { World, mitigate } from './world';

function run(world: World, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * TICK_RATE); i++) world.step();
}

const PIT = { x: MAP.width / 2, y: MAP.height / 2 };

/** A world at 8:00 with the Warden awake. */
function awake() {
  const world = new World(MAP);
  const lair = world.addSystem(new WardenLair());
  run(world, WARDEN.spawnAt + 0.1);
  return { world, lair, warden: lair.warden! };
}

function champ(world: World, team: PlayerTeam, offset: { x: number; y: number }, as?: string): Champion {
  const c = world.add(new Marksman(world, team));
  c.pos = add(PIT, offset);
  if (as) Object.defineProperty(c, 'info', { value: { ...c.info, id: as } });
  return c;
}

describe('the Warden', () => {
  it('wakes at 8:00 in the middle of its pit, and returns 6 minutes after it falls', () => {
    const world = new World(MAP);
    const lair = world.addSystem(new WardenLair());
    run(world, WARDEN.spawnAt - 1);
    expect(lair.warden).toBeNull();
    expect(lair.status(world)).toEqual({ alive: false, wakesIn: 1 });
    run(world, 1.1);
    expect(lair.warden).not.toBeNull();
    expect(lair.warden!.pos).toEqual(PIT);
    expect(lair.status(world).alive).toBe(true);

    lair.warden!.die(world, null);
    run(world, WARDEN.respawn - 1);
    expect(lair.warden).toBeNull();
    run(world, 1.1);
    expect(lair.warden?.dead).toBe(false);
  });

  it('leaves passers-by alone, and fights whoever hits it', () => {
    const { world, warden } = awake();
    const m = champ(world, TEAM.blue, { x: -250, y: 0 });
    run(world, 3);
    expect(m.hp).toBe(m.stats.maxHp);

    world.damage(m, warden, 50, 'physical');
    run(world, 3);
    expect(m.hp).toBeLessThan(m.stats.maxHp);
  });

  it('only fights inside its pit, and heals once left alone', () => {
    const { world, warden } = awake();
    const sniper = champ(world, TEAM.blue, { x: -(WARDEN.pitRadius + 200), y: 0 });
    world.damage(sniper, warden, 1000, 'true');
    run(world, WARDEN.slam.every); // long enough for a slam, if it were after the sniper
    expect(sniper.hp).toBe(sniper.stats.maxHp);
    run(world, WARDEN.calmAfter + 15);
    expect(warden.hp).toBeCloseTo(warden.stats.maxHp);
  });

  it('telegraphs its chain slam: stay in the circle and you get hit and stunned, step out and you don\'t', () => {
    const { world, warden } = awake();
    const stays = champ(world, TEAM.blue, { x: -400, y: 0 });
    const leaves = champ(world, TEAM.blue, { x: -400, y: 100 });
    world.damage(stays, warden, 10, 'physical');
    world.damage(leaves, warden, 10, 'physical');
    world.drainEvents();

    let mark: { x: number; y: number; r?: number } | undefined;
    for (let i = 0; i < WARDEN.slam.every * TICK_RATE && !mark; i++) {
      world.step();
      mark = world.drainEvents().find((e) => e.e === 'fx' && e.fx === 'wardenMark') as typeof mark;
    }
    expect(mark).toBeDefined();
    // Whoever the mark landed on: move the other one well clear, and keep this one in it.
    const [inside, outside] = dist(stays.pos, mark!) < dist(leaves.pos, mark!) ? [stays, leaves] : [leaves, stays];
    outside.pos = add(mark!, { x: 0, y: -(mark!.r! + 200) });
    inside.pos = { x: mark!.x, y: mark!.y };
    inside.hp = outside.hp = 5000;
    run(world, WARDEN.slam.telegraph + 0.05);
    expect(inside.hp).toBeLessThan(5000);
    expect(inside.has('stun')).toBe(true);
    expect(outside.has('stun')).toBe(false);
  });

  it('holds a grudge against Willmore and HunnaG: goes for them first, unprovoked, and hits them harder', () => {
    const { world, warden } = awake();
    const bystander = champ(world, TEAM.blue, { x: -200, y: 0 });
    const willmore = champ(world, TEAM.red, { x: 250, y: 0 }, 'willmore');
    world.damage(bystander, warden, 10, 'physical'); // the bystander starts it...
    run(world, 0.5);
    expect(warden.order).toEqual({ kind: 'attack', targetId: willmore.id }); // ...but Willmore gets the chains

    willmore.hp = 1e6;
    world.drainEvents();
    run(world, 3);
    const hit = world.drainEvents().find((e) => e.e === 'dmg' && e.src === warden.id && e.target === willmore.id && e.type === 'physical');
    expect(hit && 'amount' in hit ? hit.amount : 0).toBeCloseTo(mitigate(warden.stats.ad * (1 + GRUDGE.damageBonus), willmore.stats.armor), -1);
  });
});

describe('killing the Warden', () => {
  function slay(as?: string) {
    const { world, lair, warden } = awake();
    const waves = world.addSystem(new WaveSpawner());
    waves.nextWaveAt = world.time + 5; // start the clock now rather than replaying every wave since 0:20
    const killer = champ(world, TEAM.blue, { x: -250, y: 0 }, as);
    const teammate = champ(world, TEAM.blue, { x: -3000, y: 0 });
    const enemy = champ(world, TEAM.red, { x: 3000, y: 0 });
    for (const c of [killer, teammate, enemy]) c.gold = STARTING_GOLD;
    world.drainEvents();
    world.damage(killer, warden, 1e6, 'true');
    return { world, lair, waves, killer, teammate, enemy, warden };
  }

  it('pays the whole team and puts it in the kill feed', () => {
    const { world, killer, teammate, enemy } = slay();
    expect(killer.gold).toBe(STARTING_GOLD + WARDEN.reward.gold);
    expect(teammate.gold).toBe(STARTING_GOLD + WARDEN.reward.gold);
    expect(enemy.gold).toBe(STARTING_GOLD);
    expect(world.drainEvents().find((e) => e.e === 'kill')).toMatchObject({ killer: killer.name, victim: 'The Warden', team: TEAM.blue });
  });

  it('Unchains the team: its waves come out stronger for 90 seconds', () => {
    const { world, lair, waves } = slay();
    expect(lair.status(world).unchained).toEqual([{ team: TEAM.blue, left: UNCHAINED.duration, uprising: false }]);
    run(world, waves.secondsUntilNextWave(world) + 3);
    const fresh = world.units().filter((u): u is Chud => u instanceof Chud && u.chudType === 'melee');
    const blue = fresh.find((c) => c.team === TEAM.blue)!;
    const red = fresh.find((c) => c.team === TEAM.red)!;
    expect(blue.stats.maxHp).toBeCloseTo(red.stats.maxHp * (1 + UNCHAINED.hpBonus));
    expect(blue.stats.ad).toBeCloseTo(red.stats.ad * (1 + UNCHAINED.adBonus));
    expect(blue.has('unchained')).toBe(true);
    expect(world.units().some((u) => u instanceof Chud && u.chudType === 'brute')).toBe(false);

    run(world, UNCHAINED.duration);
    expect(lair.status(world).unchained).toBeUndefined();
  });

  it('becomes an Uprising if Willmore or HunnaG lands the blow: every wave brings a Brute', () => {
    const { world, lair, waves } = slay('hunnag');
    expect(lair.status(world).unchained?.[0].uprising).toBe(true);
    run(world, waves.secondsUntilNextWave(world) + 3);
    const brutes = world.units().filter((u): u is Chud => u instanceof Chud && u.chudType === 'brute');
    expect(brutes.map((b) => b.team)).toEqual([TEAM.blue, TEAM.blue]); // one per lane
  });

  it("isn't worth anything to Chuds, who ignore it", () => {
    const { world, warden } = awake();
    const chud = world.add(new Chud(world, TEAM.red, 'melee', 'top', [add(PIT, { x: 200, y: 0 }), add(PIT, { x: 250, y: 0 })]));
    chud.pos = add(PIT, { x: 200, y: 0 });
    world.drainEvents();
    run(world, 2);
    expect(world.drainEvents().filter((e) => e.e === 'dmg' && e.target === warden.id)).toEqual([]);
  });
});
