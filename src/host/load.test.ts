import { describe, expect, it } from 'vitest';
import { Bot } from '../shared/bots/bot';
import { Champion } from '../shared/champions/champion';
import { CHAMPION_INFO } from '../shared/champions/registry';
import type { ChampionId } from '../shared/champions/types';
import { TICK_RATE } from '../shared/constants';
import { LOCAL_CONN, type HostMessage } from '../shared/protocol';
import { HostCore } from './hostCore';

// A full lobby on one host's browser: the host and nine friends, 5v5 on the Howling Hollow (the busiest
// match there is), for a few minutes of play. What does it cost the host each tick, and how much does each
// friend get sent? Over budget means a laggy host or a choked connection on game night.

/** Seconds of play measured. */
const MINUTES = 4;

describe('a full 5v5 lobby on one host', () => {
  it('stays within budget for the host and for each friend', () => {
    const sent = new Map<string, { bytes: number; snaps: number; biggest: number }>();
    const core = new HostCore((to, msg: HostMessage) => {
      if (to === LOCAL_CONN || msg.t !== 'snap') return;
      const n = JSON.stringify(msg).length;
      const s = sent.get(to) ?? { bytes: 0, snaps: 0, biggest: 0 };
      s.bytes += n;
      s.snaps++;
      s.biggest = Math.max(s.biggest, n);
      sent.set(to, s);
    });
    const ids = Object.keys(CHAMPION_INFO) as ChampionId[];
    const conns = [LOCAL_CONN, ...Array.from({ length: 9 }, (_, i) => `peer:${i}`)];
    conns.forEach((c, i) => core.receive(c, { t: 'hello', name: `P${i}` }));
    core.receive(LOCAL_CONN, { t: 'settings', settings: { map: 'aram', teamSize: 5, aramPick: 'pick' } });
    conns.forEach((c, i) => core.receive(c, { t: 'pick', champion: ids[i % 5 + (i >= 5 ? 5 : 0)] }));
    core.receive(LOCAL_CONN, { t: 'start', mode: 'bots' });
    expect(core.world.map.id).toBe('aram');
    // Everyone stays connected, but bots play every champion, so the fights, waves and pumpkins look
    // like a real match.
    for (const u of core.world.units()) {
      if (u instanceof Champion && !core.bots.some((b) => b.champion === u)) core.bots.push(new Bot(u, 'mid', core.world));
    }
    expect(core.bots).toHaveLength(10);

    const ticks = MINUTES * 60 * TICK_RATE;
    const t0 = performance.now();
    let worst = 0;
    for (let i = 0; i < ticks && !core.world.winner; i++) {
      const s = performance.now();
      core.step();
      worst = Math.max(worst, performance.now() - s);
    }
    const perTick = (performance.now() - t0) / ticks;
    const friends = [...sent.values()];
    const perFriend = friends.reduce((a, s) => a + s.bytes, 0) / friends.length / (MINUTES * 60);
    const biggest = Math.max(...friends.map((s) => s.biggest));
    console.log(`host ${perTick.toFixed(2)}ms/tick (worst ${worst.toFixed(1)}ms); each friend ${(perFriend / 1024).toFixed(1)} KB/s, biggest update ${(biggest / 1024).toFixed(1)} KB`);
    // A tick comes every 33ms and shares the hosting tab with drawing the game: leave plenty of room.
    expect(perTick).toBeLessThan(8);
    // A friend on a modest connection: comfortably under 100 KB/s (800 kbit/s) each.
    expect(perFriend).toBeLessThan(100 * 1024);
  }, 180000);
});
