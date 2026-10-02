import { describe, expect, it } from 'vitest';
import { LOCAL_CONN, type HostMessage } from '../shared/protocol';
import type { SnapshotDelta } from '../shared/snapshotCodec';
import { HostCore } from './hostCore';

function host() {
  const sent: { to: string; msg: HostMessage }[] = [];
  const core = new HostCore((to, msg) => sent.push({ to, msg }));
  const snaps = (to: string): SnapshotDelta[] => sent.filter((s) => s.to === to && s.msg.t === 'snap').map((s) => (s.msg as { snap: SnapshotDelta }).snap);
  return { core, sent, snaps };
}

describe('the host and the map events', () => {
  it('rolls two events for every match, and a fresh pair for a rematch', () => {
    const { core } = host();
    expect(core.events.plan).toHaveLength(2);
    const before = core.events;
    core.quickStart(LOCAL_CONN, 'Jo', 'marksman', 'bots');
    core.step();
    core.world.declareWinner(1);
    core.receive(LOCAL_CONN, { t: 'rematch' });
    expect(core.events).not.toBe(before);
    expect(core.events.plan).toHaveLength(2);
  });

  it('sends everyone the event status in the snapshot, only when it changes', () => {
    const { core, snaps } = host();
    core.receive(LOCAL_CONN, { t: 'hello', name: 'Jo' });
    core.receive('peer:a', { t: 'hello', name: 'Al' });
    core.receive(LOCAL_CONN, { t: 'pick', champion: 'marksman' });
    core.receive('peer:a', { t: 'pick', champion: 'logan' });
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    core.step();
    expect(snaps(LOCAL_CONN).at(-1)!.event).toBeUndefined();
    core.events.force(core.world, 'capture', 0, () => 0);
    core.step();
    core.step();
    const mine = snaps(LOCAL_CONN);
    const live = mine.find((s) => s.event);
    expect(live?.event).toMatchObject({ kind: 'capture', phase: 'live', name: 'The Royal Tax Stall' });
    expect(snaps('peer:a').find((s) => s.event)?.event?.kind).toBe('capture');
    // Nothing changed in the next tick: nothing sent.
    const n = mine.length;
    core.step();
    expect('event' in snaps(LOCAL_CONN)[n]).toBe(false);
    // The announcement reached both sides.
    const evts = (to: string) => snaps(to).flatMap((s) => s.ev ?? []).filter((e) => e.e === 'evt');
    expect(evts(LOCAL_CONN).some((e) => e.e === 'evt' && e.k === 'start')).toBe(true);
    expect(evts('peer:a').some((e) => e.e === 'evt' && e.k === 'start')).toBe(true);
  });
});
