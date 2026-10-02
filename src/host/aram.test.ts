import { describe, expect, it } from 'vitest';
import { seededRandom } from '../shared/balance/simulate';
import { runBots } from '../shared/bots/bot';
import { addBots } from '../shared/bots/lineup';
import { Champion } from '../shared/champions/champion';
import { TEAM, TICK_RATE } from '../shared/constants';
import { ARAM_MAP } from '../shared/map/aramMap';
import { NavGrid } from '../shared/map/navGrid';
import { Pathfinder } from '../shared/map/pathfind';
import { applyCommand } from '../shared/sim/commands';
import { ARAM, freshMatch } from '../shared/sim/match';
import { RELIC, Relic } from '../shared/sim/relics';
import { ARAM_REROLLS, LOCAL_CONN, type HostMessage, type LobbyState } from '../shared/protocol';
import { HostCore } from './hostCore';

function host() {
  const sent: { to: string; msg: HostMessage }[] = [];
  const core = new HostCore((to, msg) => sent.push({ to, msg }));
  const lobby = (to: string): LobbyState => sent.filter((s) => s.to === to && s.msg.t === 'lobby').map((s) => (s.msg as { lobby: LobbyState }).lobby).at(-1)!;
  return { core, sent, lobby };
}

const champions = (core: HostCore) => core.world.units().filter((u): u is Champion => u instanceof Champion);

describe('the Howling Hollow (ARAM map)', () => {
  it('is one walkable lane from base to base, with five structures a side', () => {
    const grid = new NavGrid(ARAM_MAP);
    const path = new Pathfinder(grid).find(ARAM_MAP.spawns[1], ARAM_MAP.spawns[2]);
    expect(path.at(-1)).toEqual(ARAM_MAP.spawns[2]);
    for (const team of [1, 2] as const) expect(ARAM_MAP.structures.filter((s) => s.team === team)).toHaveLength(5);
    for (const p of ARAM_MAP.relics ?? []) expect(grid.isWalkableCell(grid.cellX(p.x), grid.cellY(p.y))).toBe(true);
  });

  it('has no jungle, crab or Warden, and grows pumpkins from a minute in that heal whoever eats them', () => {
    const { world } = freshMatch('aram');
    expect(world.units().some((u) => u.kind === 'monster')).toBe(false);
    const step = (s: number) => {
      for (let i = 0; i < Math.round(s * TICK_RATE); i++) world.step();
    };
    step(RELIC.firstAt - 1);
    expect(world.all().some((e) => e instanceof Relic)).toBe(false);
    step(1.5);
    const relics = world.all().filter((e) => e instanceof Relic);
    expect(relics).toHaveLength(ARAM_MAP.relics!.length);
    const [c] = addBots(world, TEAM.blue, 1);
    c.champion.hp = 200;
    c.champion.pos = { ...relics[0].pos };
    step(0.1);
    expect(c.champion.hp).toBeGreaterThan(200 + c.champion.stats.maxHp * RELIC.heal * 0.9);
    expect(world.all().filter((e) => e instanceof Relic)).toHaveLength(ARAM_MAP.relics!.length - 1);
    c.champion.pos = { x: 600, y: 1700 }; // off the spot, so the next one isn't eaten as it grows
    step(RELIC.respawn + 0.5);
    expect(world.all().filter((e) => e instanceof Relic)).toHaveLength(ARAM_MAP.relics!.length);
  });

  it("won't let anyone recall", () => {
    const { world } = freshMatch('aram');
    const [b] = addBots(world, TEAM.blue, 1);
    b.champion.pos = { x: 3000, y: 1700 };
    applyCommand(world, b.champion, { k: 'recall' });
    for (let i = 0; i < 5 * TICK_RATE; i++) world.step();
    expect(b.champion.pos.x).toBeGreaterThan(2500);
  });

  it('plays a bots-only 5v5 match to a finish', () => {
    // Seeded, like the balance simulator, so it's the same match every run (some random lineups run long).
    const dice = Math.random;
    Math.random = seededRandom(11);
    try {
      const { world } = freshMatch('aram');
      const random = seededRandom(5);
      const bots = [...addBots(world, TEAM.blue, 5, [], random), ...addBots(world, TEAM.red, 5, [], random)];
      expect(bots.every((b) => b.lane === 'mid')).toBe(true);
      for (let i = 0; i < 30 * 60 * TICK_RATE && !world.winner; i++) {
        runBots(world, bots);
        world.step();
        world.drainEvents();
      }
      expect(world.winner).not.toBeNull();
    } finally {
      Math.random = dice;
    }
  }, 60000);
});

describe('ARAM lobbies', () => {
  it('roll a champion for everyone in All Random, with rerolls, and refuse picks', () => {
    const { core, lobby } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Jo' });
    core.receive(LOCAL_CONN, { t: 'settings', settings: { map: 'aram', aramPick: 'random' } });
    const me = () => lobby(LOCAL_CONN).players[0];
    const first = me().champion;
    expect(first).not.toBeNull();
    expect(me().rerolls).toBe(ARAM_REROLLS);
    core.receive(LOCAL_CONN, { t: 'pick', champion: first === 'logan' ? 'paris' : 'logan' });
    expect(me().champion).toBe(first);
    core.receive(LOCAL_CONN, { t: 'reroll' });
    expect(me().champion).not.toBe(first);
    expect(me().rerolls).toBe(ARAM_REROLLS - 1);
    for (let i = 0; i < 5; i++) core.receive(LOCAL_CONN, { t: 'reroll' });
    expect(me().rerolls).toBe(0);
  });

  it('start on the ARAM map, five a side with bots, at level 3 with ARAM gold, and say so in the welcome', () => {
    const { core, sent } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Jo' });
    core.receive(LOCAL_CONN, { t: 'settings', settings: { map: 'aram', teamSize: 5, aramPick: 'pick' } });
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'havarti' });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    expect(core.world.map.id).toBe('aram');
    const all = champions(core);
    expect(all.filter((c) => c.team === TEAM.blue)).toHaveLength(5);
    expect(all.filter((c) => c.team === TEAM.red)).toHaveLength(5);
    expect(all.every((c) => c.level === ARAM.startLevel)).toBe(true);
    expect(all.every((c) => c.gold >= ARAM.startGold)).toBe(true);
    const welcome = sent.find((s) => s.msg.t === 'welcome')!.msg as Extract<HostMessage, { t: 'welcome' }>;
    expect(welcome.map).toBe('aram');
  });

  it("keep the Rift at three a side whatever the team size says", () => {
    const { core } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Jo' });
    core.receive(LOCAL_CONN, { t: 'settings', settings: { teamSize: 5 } });
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'havarti' });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    expect(core.world.map.id).toBe('rift');
    expect(champions(core)).toHaveLength(6);
  });
});
