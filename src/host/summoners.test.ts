import { describe, expect, it } from 'vitest';
import { Champion } from '../shared/champions/champion';
import { LOCAL_CONN, type HostMessage, type LobbyState } from '../shared/protocol';
import { HostCore } from './hostCore';

function lobby() {
  const sent: { to: string; msg: HostMessage }[] = [];
  const core = new HostCore((to, msg) => sent.push({ to, msg }));
  const last = (): LobbyState => sent.filter((s) => s.msg.t === 'lobby').map((s) => (s.msg as { lobby: LobbyState }).lobby).at(-1)!;
  core.receive(LOCAL_CONN, { t: 'hello', name: 'Host' });
  core.receive('peer:a', { t: 'hello', name: 'A' });
  return { core, last };
}

const champions = (core: HostCore) => core.world.units().filter((u): u is Champion => u instanceof Champion);

describe('summoner spells in the lobby', () => {
  it('start as Flash and Heal, change with a pick (any time), and everyone sees them', () => {
    const { core, last } = lobby();
    expect(last().players.map((p) => p.spells)).toEqual([['flash', 'heal'], ['flash', 'heal']]);
    core.receive('peer:a', { t: 'pick', spells: ['smite', 'ignite'] });
    expect(last().players.find((p) => p.id === 'peer:a')!.spells).toEqual(['smite', 'ignite']);
    // Nonsense is fixed up, not taken.
    core.receive('peer:a', { t: 'pick', spells: ['ignite', 'ignite', 'flash'] as never });
    expect(last().players.find((p) => p.id === 'peer:a')!.spells).toEqual(['ignite', 'flash']);
  });

  it('give way to allowed ones when the host switches to ARAM', () => {
    const { core, last } = lobby();
    core.receive(LOCAL_CONN, { t: 'pick', spells: ['smite', 'exhaust'] });
    core.receive(LOCAL_CONN, { t: 'settings', settings: { map: 'aram' } });
    expect(last().players.find((p) => p.id === LOCAL_CONN)!.spells).toEqual(['exhaust', 'flash']);
  });

  it('go with each player into the match, and bots get theirs by job', () => {
    const { core } = lobby();
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'logan', spells: ['teleport', 'ghost'] });
    core.receive('peer:a', { t: 'pick', champion: 'havarti' });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    const all = champions(core);
    expect(all.find((c) => c.info.id === 'logan')!.summoners).toEqual(['teleport', 'ghost']);
    expect(all.find((c) => c.info.id === 'havarti')!.summoners).toEqual(['flash', 'heal']);
    expect(all.every((c) => c.summoners[0] !== c.summoners[1])).toBe(true);
    // Bots: every one has two, and Flash.
    expect(all.filter((c) => c.name.startsWith('Bot ')).every((c) => c.summoners[0] === 'flash')).toBe(true);
  });
});
