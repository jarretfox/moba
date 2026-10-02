import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../shared/constants';
import { LOCAL_CONN, type HostMessage, type MeSnap } from '../shared/protocol';
import { HostCore } from './hostCore';

describe('the last-hit drill in the Practice Range', () => {
  it('counts your last hits against the enemy Chuds that died near you', () => {
    let me: MeSnap | undefined;
    const core = new HostCore((to, msg: HostMessage) => {
      if (to === LOCAL_CONN && msg.t === 'snap' && msg.snap.me) me = msg.snap.me;
    });
    core.quickStart(LOCAL_CONN, 'Jo', 'marksman', 'practice');
    const champ = core.world.units().find((u) => u.kind === 'champion')!;
    // Stand where the top lane's waves meet, and do nothing: every Chud that dies there is a miss.
    for (let i = 0; i < 70 * TICK_RATE; i++) {
      champ.pos = { x: 6000, y: 1250 };
      core.step();
    }
    expect(me?.drill).toBeDefined();
    expect(me!.drill!.hits).toBe(0);
    expect(me!.drill!.missed).toBeGreaterThan(0);
  });

  it('only runs in the Practice Range', () => {
    let me: MeSnap | undefined;
    const core = new HostCore((to, msg: HostMessage) => {
      if (to === LOCAL_CONN && msg.t === 'snap' && msg.snap.me) me = msg.snap.me;
    });
    core.quickStart(LOCAL_CONN, 'Jo', 'marksman', 'bots');
    for (let i = 0; i < 10; i++) core.step();
    expect(me).toBeDefined();
    expect(me!.drill).toBeUndefined();
  });
});
