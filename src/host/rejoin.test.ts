import { describe, expect, it } from 'vitest';
import { LOCAL_CONN, type HostMessage } from '../shared/protocol';
import { HostCore } from './hostCore';

type Welcome = Extract<HostMessage, { t: 'welcome' }>;

function match() {
  const sent: { to: string; msg: HostMessage }[] = [];
  const core = new HostCore((to, msg) => sent.push({ to, msg }));
  core.receive(LOCAL_CONN, { t: 'hello', name: 'Host' });
  core.receive('peer:a', { t: 'hello', name: 'Friend' });
  core.receive(LOCAL_CONN, { t: 'pick', champion: 'logan' });
  core.receive('peer:a', { t: 'pick', champion: 'kingrix' });
  core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
  const welcome = (to: string) => sent.filter((s) => s.to === to && s.msg.t === 'welcome').map((s) => s.msg as Welcome).at(-1);
  return { core, sent, welcome };
}

describe('getting back into a match after a dropped connection', () => {
  it('gives friends (not the host) a token, and a bot plays their champion while they are gone', () => {
    const { core, welcome } = match();
    expect(welcome(LOCAL_CONN)?.rejoin).toBeUndefined();
    const token = welcome('peer:a')!.rejoin!;
    expect(token).toBeTruthy();
    const unitId = welcome('peer:a')!.unitId;
    core.dropped('peer:a');
    expect(core.bots.some((b) => b.champion.id === unitId)).toBe(true);
    expect(core.world.getUnit(unitId)!.name).toBe('Friend (bot)');
  });

  it('hands the champion back to whoever says hello with the token', () => {
    const { core, welcome } = match();
    const { rejoin: token, unitId } = welcome('peer:a')!;
    core.dropped('peer:a');
    core.receive('peer:b', { t: 'hello', name: 'Friend', rejoin: token });
    const back = welcome('peer:b')!;
    expect(back).toMatchObject({ unitId, back: true });
    expect(back.rejoin).toBeTruthy();
    expect(back.rejoin).not.toBe(token); // a fresh one each time
    expect(core.bots.some((b) => b.champion.id === unitId)).toBe(false);
    expect(core.world.getUnit(unitId)!.name).toBe('Friend');
    // Their orders count again.
    const before = { ...core.world.getUnit(unitId)!.pos };
    core.receive('peer:b', { t: 'cmd', cmd: { k: 'move', x: before.x + 400, y: before.y } });
    for (let i = 0; i < 30; i++) core.step();
    expect(core.world.getUnit(unitId)!.pos.x).toBeGreaterThan(before.x + 50);
  });

  it('takes over from a connection the host hasn’t noticed is gone, and refuses a wrong token', () => {
    const { core, sent, welcome } = match();
    const { rejoin: token, unitId } = welcome('peer:a')!;
    core.receive('peer:c', { t: 'hello', name: 'Stranger', rejoin: 'not-a-token' });
    expect(sent.filter((s) => s.to === 'peer:c').map((s) => s.msg.t)).toContain('refused');
    core.receive('peer:b', { t: 'hello', name: 'Friend', rejoin: token });
    expect(welcome('peer:b')?.unitId).toBe(unitId);
    // The old connection's orders don't move them any more.
    sent.length = 0;
    for (let i = 0; i < 4; i++) core.step();
    expect(sent.some((s) => s.to === 'peer:a' && s.msg.t === 'snap')).toBe(false);
  });
});
