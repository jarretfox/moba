import { describe, expect, it } from 'vitest';
import { Champion } from '../shared/champions/champion';
import { TEAM, TICK_RATE } from '../shared/constants';
import { DRAFT_TURN, LOCAL_CONN, type HostMessage, type LobbyState } from '../shared/protocol';
import { HostCore } from './hostCore';

function lobby4() {
  const sent: { to: string; msg: HostMessage }[] = [];
  const core = new HostCore((to, msg) => sent.push({ to, msg }));
  const last = (): LobbyState => sent.filter((s) => s.msg.t === 'lobby').map((s) => (s.msg as { lobby: LobbyState }).lobby).at(-1)!;
  core.receive(LOCAL_CONN, { t: 'hello', name: 'Host' }); // blue
  core.receive('peer:a', { t: 'hello', name: 'A' }); // red
  core.receive('peer:b', { t: 'hello', name: 'B' }); // blue
  core.receive('peer:c', { t: 'hello', name: 'C' }); // red
  core.receive(LOCAL_CONN, { t: 'settings', settings: { draft: true } });
  return { core, sent, last };
}

describe('a draft', () => {
  it('bans in turn, then picks in a snake, and the match waits for it', () => {
    const { core, last } = lobby4();
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'logan' });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    expect(core.world.units().some((u) => u instanceof Champion)).toBe(false); // no draft yet: no match
    core.receive(LOCAL_CONN, { t: 'draft' });
    let d = last().draft!;
    expect(d.phase).toBe('ban');
    expect(d.order).toEqual([LOCAL_CONN, 'peer:a', 'peer:b', 'peer:c']);
    expect(last().players.every((p) => p.champion === null)).toBe(true); // picks start over
    // Out of turn: nothing. On turn: banned for everyone.
    core.receive('peer:a', { t: 'ban', champion: 'paris' });
    expect(last().draft!.bans).toEqual([]);
    for (const [who, champ] of [[LOCAL_CONN, 'paris'], ['peer:a', 'logan'], ['peer:b', 'havarti'], ['peer:c', 'dabber']] as const) core.receive(who, { t: 'ban', champion: champ });
    d = last().draft!;
    expect(d.bans).toEqual(['paris', 'logan', 'havarti', 'dabber']);
    expect(d.phase).toBe('pick');
    expect(d.order).toEqual([LOCAL_CONN, 'peer:a', 'peer:c', 'peer:b']); // blue, red, red, blue
    // A banned champion can't be picked, nor one already picked by the other side.
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'logan' });
    expect(last().draft!.turn).toBe(0);
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'kingrix' });
    core.receive('peer:a', { t: 'pick', champion: 'kingrix' });
    expect(last().draft!.turn).toBe(1);
    core.receive('peer:a', { t: 'pick', champion: 'willmore' });
    core.receive('peer:c', { t: 'pick', champion: 'hunnag' });
    core.receive('peer:b', { t: 'pick', champion: 'marksman' });
    expect(last().draft!.phase).toBe('done');
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    const champs = core.world.units().filter((u): u is Champion => u instanceof Champion);
    expect(champs).toHaveLength(6);
    // Bots never field a banned champion.
    expect(champs.some((c) => ['paris', 'logan', 'havarti', 'dabber'].includes(c.info.id))).toBe(false);
    expect(champs.filter((c) => c.team === TEAM.blue).map((c) => c.info.id)).toEqual(expect.arrayContaining(['kingrix', 'marksman']));
  });

  it('passes a ban that runs out of time, picks for a player who runs out, and turns away latecomers', () => {
    const { core, sent, last } = lobby4();
    core.receive(LOCAL_CONN, { t: 'draft' });
    for (let i = 0; i < (DRAFT_TURN + 0.5) * TICK_RATE; i++) core.step();
    expect(last().draft!.turn).toBe(1);
    expect(last().draft!.bans).toEqual([]);
    for (let t = 1; t < 4; t++) for (let i = 0; i < (DRAFT_TURN + 0.5) * TICK_RATE; i++) core.step();
    expect(last().draft!.phase).toBe('pick');
    for (let i = 0; i < (DRAFT_TURN + 0.5) * TICK_RATE; i++) core.step();
    expect(last().players.find((p) => p.id === LOCAL_CONN)!.champion).not.toBeNull();
    core.receive('peer:z', { t: 'hello', name: 'Late' });
    expect(sent.some((s) => s.to === 'peer:z' && s.msg.t === 'refused')).toBe(true);
  });
});
