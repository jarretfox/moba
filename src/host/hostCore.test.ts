import { describe, expect, it } from 'vitest';
import { TEAM } from '../shared/constants';
import type { HostMessage } from '../shared/protocol';
import { HostCore } from './hostCore';

function host() {
  const sent: HostMessage[] = [];
  const core = new HostCore((_conn, msg) => sent.push(msg));
  return { core, sent };
}

const champions = (core: HostCore) => core.world.units().filter((u) => u.kind === 'champion');

describe('HostCore', () => {
  it('fills both teams to three with bots in a bots match', () => {
    const { core } = host();
    core.receive('me', { t: 'join', name: 'Jo', champion: 'marksman', mode: 'bots' });

    const all = champions(core);
    expect(all.filter((c) => c.team === TEAM.blue)).toHaveLength(3);
    expect(all.filter((c) => c.team === TEAM.red)).toHaveLength(3);
    expect(core.bots).toHaveLength(5);
    expect(core.world.units().some((u) => u.kind === 'dummy')).toBe(false);
  });

  it('sets up the practice range, without bots, in practice mode', () => {
    const { core } = host();
    core.receive('me', { t: 'join', name: 'Jo', champion: 'barbarian', mode: 'practice' });

    expect(champions(core)).toHaveLength(1);
    expect(core.bots).toHaveLength(0);
    expect(core.world.units().some((u) => u.kind === 'dummy')).toBe(true);
  });

  it("doesn't start the clock until someone joins", () => {
    const { core, sent } = host();
    for (let i = 0; i < 30; i++) core.step();
    expect(core.world.tick).toBe(0);
    expect(sent).toHaveLength(0);

    core.receive('me', { t: 'join', name: 'Jo', champion: 'marksman' });
    for (let i = 0; i < 30; i++) core.step();
    expect(core.world.tick).toBe(30);
    expect(sent.filter((m) => m.t === 'snap')).toHaveLength(30);
  });

  it('ignores garbage commands', () => {
    const { core } = host();
    core.receive('me', { t: 'join', name: 'Jo', champion: 'marksman', mode: 'practice' });
    const me = champions(core)[0] as import('../shared/champions/champion').Champion;
    core.receive('me', { t: 'cmd', cmd: { k: 'move', x: NaN, y: 5 } });
    core.receive('me', { t: 'cmd', cmd: { k: 'cast', slot: 9 as never, x: 1, y: 1 } });
    core.receive('me', { t: 'cmd', cmd: { k: 'attack', target: 99999 } });
    core.step();
    expect(me.order.kind).toBe('idle');
    expect(me.path).toEqual([]);
    expect(me.abilities.every((a) => a.readyAt === 0)).toBe(true);
  });
});
