import { describe, expect, it } from 'vitest';
import { Champion } from '../shared/champions/champion';
import { TEAM } from '../shared/constants';
import { LOCAL_CONN, type HostMessage, type LobbyState } from '../shared/protocol';
import { HostCore } from './hostCore';

function host() {
  const sent: { to: string; msg: HostMessage }[] = [];
  const core = new HostCore((to, msg) => sent.push({ to, msg }));
  const lastLobby = (to: string): LobbyState | undefined =>
    sent.filter((s) => s.to === to && s.msg.t === 'lobby').map((s) => (s.msg as { lobby: LobbyState }).lobby).at(-1);
  return { core, sent, lastLobby };
}

const champions = (core: HostCore) => core.world.units().filter((u): u is Champion => u instanceof Champion);

describe('solo matches', () => {
  it('fill both teams to three with bots', () => {
    const { core } = host();
    core.quickStart(LOCAL_CONN, 'Jo', 'marksman', 'bots');

    const all = champions(core);
    expect(all.filter((c) => c.team === TEAM.blue)).toHaveLength(3);
    expect(all.filter((c) => c.team === TEAM.red)).toHaveLength(3);
    expect(core.bots).toHaveLength(5);
    expect(core.world.units().some((u) => u.kind === 'dummy')).toBe(false);
  });

  it('set up the practice range, without bots, in practice mode', () => {
    const { core } = host();
    core.quickStart(LOCAL_CONN, 'Jo', 'barbarian', 'practice');

    expect(champions(core)).toHaveLength(1);
    expect(core.bots).toHaveLength(0);
    expect(core.world.units().some((u) => u.kind === 'dummy')).toBe(true);
  });

  it("don't start the clock until the match starts", () => {
    const { core, sent } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Jo' });
    for (let i = 0; i < 30; i++) core.step();
    expect(core.world.tick).toBe(0);

    core.receive(LOCAL_CONN, { t: 'pick', champion: 'marksman' });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    for (let i = 0; i < 30; i++) core.step();
    expect(core.world.tick).toBe(30);
    expect(sent.filter((m) => m.msg.t === 'snap')).toHaveLength(30);
  });
});

describe('skins', () => {
  it('are remembered from the pick and worn by your champion for everyone to see', () => {
    const { core } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Jo' });
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'logan', skin: 2 });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'practice' });
    const [jo] = champions(core);
    expect(jo.skin).toBe(2);
    expect(jo.snapshot(core.world).skin).toBe(2);
  });

  it('ignore looks that don’t exist, and leave the classic look out of snapshots', () => {
    const { core } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Jo' });
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'kingrix', skin: 7 });
    core.receive(LOCAL_CONN, { t: 'pick', skin: 1.5 });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'practice' });
    const [jo] = champions(core);
    expect(jo.skin).toBe(0);
    expect('skin' in jo.snapshot(core.world)).toBe(false);
  });
});

describe('the lobby', () => {
  it('seats friends on alternating teams and tells everyone', () => {
    const { core, lastLobby } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Host' });
    core.receive('peer:a', { t: 'hello', name: 'Ann' });
    core.receive('peer:b', { t: 'hello', name: 'Bo' });

    const lobby = lastLobby('peer:a')!;
    expect(lobby.players.map((p) => [p.name, p.team, p.host])).toEqual([
      ['Host', TEAM.blue, true],
      ['Ann', TEAM.red, false],
      ['Bo', TEAM.blue, false],
    ]);
    expect(lastLobby(LOCAL_CONN)).toEqual(lobby);
  });

  it('lets players switch team while there is room, and pick champions', () => {
    const { core, lastLobby } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Host' });
    core.receive('peer:a', { t: 'hello', name: 'Ann' });
    core.receive('peer:a', { t: 'pick', team: TEAM.blue, champion: 'barbarian' });

    const ann = lastLobby('peer:a')!.players.find((p) => p.id === 'peer:a')!;
    expect(ann.team).toBe(TEAM.blue);
    expect(ann.champion).toBe('barbarian');
  });

  it('keeps champions one per team: no picking a teammate\'s, and switching to their team clears yours', () => {
    const { core, lastLobby } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Host' }); // blue
    core.receive('peer:a', { t: 'hello', name: 'Ann' }); // red
    core.receive('peer:b', { t: 'hello', name: 'Bo' }); // blue
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'logan' });
    core.receive('peer:b', { t: 'pick', champion: 'logan' });
    const pickOf = (id: string) => lastLobby(id)!.players.find((p) => p.id === id)!.champion;
    expect(pickOf('peer:b')).toBeNull();

    core.receive('peer:a', { t: 'pick', champion: 'logan' }); // the other team can have him
    expect(pickOf('peer:a')).toBe('logan');
    core.receive('peer:a', { t: 'pick', team: TEAM.blue });
    expect(pickOf('peer:a')).toBeNull();
  });

  it('fills the rest of each team with champions nobody on it has', () => {
    for (let i = 0; i < 5; i++) {
      const { core } = host();
      core.quickStart(LOCAL_CONN, 'Jo', 'marksman', 'bots');
      for (const team of [TEAM.blue, TEAM.red]) {
        const ids = champions(core).filter((c) => c.team === team).map((c) => c.info.id);
        expect(new Set(ids).size).toBe(3);
      }
    }
  });

  it('only lets the host start, and only once everyone has picked', () => {
    const { core } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Host' });
    core.receive('peer:a', { t: 'hello', name: 'Ann' });
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'marksman' });

    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    expect(champions(core)).toHaveLength(0); // Ann hasn't picked

    core.receive('peer:a', { t: 'pick', champion: 'barbarian' });
    core.receive('peer:a', { t: 'start', mode: 'bots' });
    expect(champions(core)).toHaveLength(0); // Ann isn't the host

    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    expect(champions(core)).toHaveLength(6);
    expect(core.bots).toHaveLength(4);
  });

  it('sends each player their own champion when the match starts', () => {
    const { core, sent } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Host' });
    core.receive('peer:a', { t: 'hello', name: 'Ann' });
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'marksman' });
    core.receive('peer:a', { t: 'pick', champion: 'barbarian' });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });

    const welcome = (to: string) => sent.find((s) => s.to === to && s.msg.t === 'welcome')!.msg as { unitId: number; team: number };
    const annChamp = core.world.getUnit(welcome('peer:a').unitId)!;
    expect(annChamp.name).toBe('Ann');
    expect(annChamp.team).toBe(TEAM.red);
    expect(welcome(LOCAL_CONN).unitId).not.toBe(welcome('peer:a').unitId);
  });

  it('turns people away when it is full or the match has started', () => {
    const { core, sent } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Host' });
    for (const id of ['a', 'b', 'c', 'd', 'e']) core.receive(`peer:${id}`, { t: 'hello', name: id });
    core.receive('peer:f', { t: 'hello', name: 'f' });
    expect(sent.find((s) => s.to === 'peer:f')?.msg).toEqual({ t: 'refused', reason: 'That lobby is full.' });

    const { core: started, sent: sent2 } = host();
    started.quickStart(LOCAL_CONN, 'Host', 'marksman', 'bots');
    started.receive('peer:late', { t: 'hello', name: 'Late' });
    expect(sent2.find((s) => s.to === 'peer:late')?.msg.t).toBe('refused');
  });

  it('forgets people who leave the lobby', () => {
    const { core, lastLobby } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Host' });
    core.receive('peer:a', { t: 'hello', name: 'Ann' });
    core.dropped('peer:a');
    expect(lastLobby(LOCAL_CONN)!.players.map((p) => p.name)).toEqual(['Host']);
  });

  it('hands a champion to a bot when its player drops mid-match', () => {
    const { core } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Host' });
    core.receive('peer:a', { t: 'hello', name: 'Ann' });
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'marksman' });
    core.receive('peer:a', { t: 'pick', champion: 'barbarian' });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    const botsBefore = core.bots.length;

    core.dropped('peer:a');

    expect(core.bots).toHaveLength(botsBefore + 1);
    expect(core.bots.at(-1)!.champion.name).toBe('Ann (bot)');
  });

  it('ignores garbage', () => {
    const { core } = host();
    core.receive(LOCAL_CONN, null);
    core.receive(LOCAL_CONN, 'hello');
    core.receive(LOCAL_CONN, { t: 'hello', name: { evil: true } });
    core.receive(LOCAL_CONN, { t: 'pick', team: 7, champion: '__proto__' });
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'toString' });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    expect(champions(core)).toHaveLength(0); // no real champion picked yet, so no match
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'marksman' });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    const me = champions(core).find((c) => c.name === 'Player')!;

    core.receive(LOCAL_CONN, { t: 'cmd', cmd: { k: 'move', x: NaN, y: 5 } });
    core.receive(LOCAL_CONN, { t: 'cmd', cmd: { k: 'cast', slot: 9 as never, x: 1, y: 1 } });
    core.receive(LOCAL_CONN, { t: 'cmd', cmd: { k: 'attack', target: 99999 } });
    core.receive(LOCAL_CONN, { t: 'cmd', cmd: null as never });
    core.step();

    expect(me.team).toBe(TEAM.blue);
    expect(me.order.kind).toBe('idle');
    expect(me.abilities.every((a) => a.readyAt === 0)).toBe(true);
  });
});
