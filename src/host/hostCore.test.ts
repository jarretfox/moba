import { describe, expect, it } from 'vitest';
import { Champion } from '../shared/champions/champion';
import { TEAM } from '../shared/constants';
import { DEFAULT_SETTINGS, FAST_RATES, LOCAL_CONN, NIGHT_CLOCK, type HostMessage, type LobbyState } from '../shared/protocol';
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

describe('chat', () => {
  const chats = (sent: { to: string; msg: HostMessage }[], to: string) => sent.filter((s) => s.to === to && s.msg.t === 'chat').map((s) => s.msg as Extract<HostMessage, { t: 'chat' }>);

  it('sends team chat to your team only, and all chat to everyone, from your name', () => {
    const { core, sent } = host();
    for (const [id, name] of [[LOCAL_CONN, 'Jo'], ['peer:a', 'Al'], ['peer:b', 'Bea']] as const) core.receive(id, { t: 'hello', name });
    // Jo and Bea on blue, Al on red.
    core.receive('peer:a', { t: 'pick', team: TEAM.red });
    core.receive('peer:b', { t: 'pick', team: TEAM.blue });
    core.receive(LOCAL_CONN, { t: 'chat', text: '  gank   top? ', all: false });
    expect(chats(sent, 'peer:b').map((c) => [c.from, c.text, c.all])).toEqual([['Jo', 'gank top?', false]]);
    expect(chats(sent, LOCAL_CONN)).toHaveLength(1); // you see your own line
    expect(chats(sent, 'peer:a')).toHaveLength(0);
    core.receive('peer:a', { t: 'chat', text: 'gl hf', all: true });
    expect(chats(sent, LOCAL_CONN).at(-1)).toMatchObject({ from: 'Al', text: 'gl hf', all: true, team: TEAM.red });
    expect(chats(sent, 'peer:b').at(-1)?.text).toBe('gl hf');
  });

  it('names your champion once the match is on, and keeps lines short, clean and not too many', () => {
    let clock = 0;
    const sent: { to: string; msg: HostMessage }[] = [];
    const core = new HostCore((to, msg) => sent.push({ to, msg }), () => clock);
    core.quickStart(LOCAL_CONN, 'Jo', 'logan', 'practice');
    core.receive(LOCAL_CONN, { t: 'chat', text: 'x'.repeat(500), all: true });
    const first = chats(sent, LOCAL_CONN)[0];
    expect(first.champ).toBe('logan');
    expect(first.text.length).toBe(140);
    for (const text of ['', '   ', 42, null]) core.receive(LOCAL_CONN, { t: 'chat', text, all: true } as never);
    expect(chats(sent, LOCAL_CONN)).toHaveLength(1);
    for (let i = 0; i < 10; i++) core.receive(LOCAL_CONN, { t: 'chat', text: `spam ${i}`, all: true });
    expect(chats(sent, LOCAL_CONN)).toHaveLength(5);
    clock = 10;
    core.receive(LOCAL_CONN, { t: 'chat', text: 'later', all: true });
    expect(chats(sent, LOCAL_CONN).at(-1)?.text).toBe('later');
  });
});

describe('match settings', () => {
  it("are the host's to change, are shown to everyone, and ignore anything that isn't a choice", () => {
    const { core, lastLobby } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Jo' });
    core.receive('peer:a', { t: 'hello', name: 'Al' });
    expect(lastLobby('peer:a')?.settings).toEqual(DEFAULT_SETTINGS);
    core.receive(LOCAL_CONN, { t: 'settings', settings: { weather: 'snow', night: true, gold: 1500, fast: true } });
    expect(lastLobby('peer:a')?.settings).toEqual({ weather: 'snow', night: true, gold: 1500, fast: true });
    // Not the host: nothing.
    core.receive('peer:a', { t: 'settings', settings: { weather: 'rain' } });
    expect(lastLobby('peer:a')?.settings.weather).toBe('snow');
    // Nonsense: nothing.
    core.receive(LOCAL_CONN, { t: 'settings', settings: { weather: 'lava', gold: 99999, night: 'yes', fast: 1 } as never });
    expect(lastLobby(LOCAL_CONN)?.settings).toEqual({ weather: 'snow', night: true, gold: 1500, fast: true });
  });

  it('start the match with them: the weather, the clock at night, everyone\'s gold, the pace', () => {
    const { core, sent } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Jo' });
    core.receive(LOCAL_CONN, { t: 'settings', settings: { weather: 'autumn', night: true, gold: 3000, fast: true } });
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'logan' });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    const welcome = sent.find((s) => s.msg.t === 'welcome')!.msg as Extract<HostMessage, { t: 'welcome' }>;
    expect(welcome.weather).toBe('autumn');
    expect(welcome.clock).toBe(NIGHT_CLOCK);
    expect(champions(core).every((c) => c.gold === 3000)).toBe(true);
    expect(core.world.rates).toEqual(FAST_RATES);
    const jo = champions(core).find((c) => c.name === 'Jo')!;
    jo.gainGold(core.world, 100);
    expect(jo.gold).toBe(3000 + 100 * FAST_RATES.gold);
  });
});

describe('rematch', () => {
  /** Jo (host) and Al, a match played to the end. */
  function finished() {
    const h = host();
    h.core.receive(LOCAL_CONN, { t: 'hello', name: 'Jo' });
    h.core.receive('peer:a', { t: 'hello', name: 'Al' });
    h.core.receive(LOCAL_CONN, { t: 'pick', champion: 'logan', skin: 1 });
    h.core.receive('peer:a', { t: 'pick', champion: 'kingrix' });
    h.core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    for (let i = 0; i < 10; i++) h.core.step();
    return h;
  }

  it("only comes up once the match is over, and the host's ask starts it: back to the lobby, picks kept, a fresh match", () => {
    const { core, lastLobby } = finished();
    const before = core.world;
    core.receive(LOCAL_CONN, { t: 'rematch' });
    expect(core.world).toBe(before); // not over yet
    core.world.declareWinner(TEAM.blue);
    core.receive(LOCAL_CONN, { t: 'rematch' });
    expect(core.world).not.toBe(before);
    expect(core.world.tick).toBe(0);
    expect(core.bots).toHaveLength(0);
    const lobby = lastLobby('peer:a')!;
    expect(lobby.phase).toBe('lobby');
    expect(lobby.players.map((p) => [p.name, p.champion, p.skin])).toEqual([['Jo', 'logan', 1], ['Al', 'kingrix', 0]]);
    // And it plays again.
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    expect(champions(core)).toHaveLength(6);
  });

  it("counts everyone's asks for all to see, and lets only the host swap the sides", () => {
    const { core, sent, lastLobby } = finished();
    const teamOf = (name: string) => lastLobby(LOCAL_CONN)!.players.find((p) => p.name === name)!.team;
    const jo = teamOf('Jo');
    const al = teamOf('Al');
    core.world.declareWinner(TEAM.red);
    // Al asks (and asks to swap, which isn't his to ask): everyone hears it.
    core.receive('peer:a', { t: 'rematch', swap: true });
    const votes = sent.filter((s) => s.msg.t === 'rematch').map((s) => s.msg as Extract<HostMessage, { t: 'rematch' }>);
    expect(votes.at(-1)).toEqual({ t: 'rematch', votes: ['Al'], of: 2 });
    expect(lastLobby(LOCAL_CONN)!.phase).toBe('playing');
    // Jo, the host, asks to swap.
    core.receive(LOCAL_CONN, { t: 'rematch', swap: true });
    expect(lastLobby(LOCAL_CONN)!.phase).toBe('lobby');
    expect([teamOf('Jo'), teamOf('Al')]).toEqual([jo === TEAM.blue ? TEAM.red : TEAM.blue, al === TEAM.blue ? TEAM.red : TEAM.blue]);
  });
});

describe('the end of a match', () => {
  it('sends one last snapshot with the winner, then stands still', () => {
    const { core, sent } = host();
    core.quickStart(LOCAL_CONN, 'Jo', 'logan', 'bots');
    core.step();
    core.world.declareWinner(TEAM.red);
    const before = sent.length;
    const tick = core.world.tick;
    core.step();
    core.step();
    const snaps = sent.slice(before).filter((s) => s.msg.t === 'snap');
    expect(snaps).toHaveLength(1);
    expect(core.world.tick).toBe(tick);
  });
});
