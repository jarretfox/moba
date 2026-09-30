// The host runs off the main thread: rendering hitches can't stall the game, and it keeps
// ticking when the hosting player's tab is in the background.
import { DT } from '../shared/constants';
import type { HostMessage } from '../shared/protocol';
import { HostCore } from './hostCore';

/** Main thread → worker: a message from a player, or word that their connection dropped. */
export type ToHost = { conn: string; msg: unknown } | { conn: string; dropped: true };
/** Worker → main thread: a message for one player. */
export interface FromHost {
  conn: string;
  msg: HostMessage;
}

const scope = self as unknown as {
  postMessage(msg: FromHost): void;
  onmessage: ((e: MessageEvent<ToHost>) => void) | null;
};

const core = new HostCore((conn, msg) => scope.postMessage({ conn, msg }));
scope.onmessage = (e) => {
  const m = e.data;
  if ('dropped' in m) core.dropped(m.conn);
  else core.receive(m.conn, m.msg);
};

// Fixed timestep: tick exactly TICK_RATE times per second on average, whatever the timer jitter.
const MAX_CATCH_UP = 5;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += (now - last) / 1000;
  last = now;
  let n = 0;
  while (acc >= DT && n < MAX_CATCH_UP) {
    core.step();
    acc -= DT;
    n++;
  }
  if (n === MAX_CATCH_UP) acc = 0; // hopelessly behind: drop the time rather than spiral
}, 4);
