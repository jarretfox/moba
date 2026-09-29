// The host runs off the main thread: rendering hitches can't stall the game, and it keeps
// ticking when the host player's tab is in the background.
import { DT } from '../shared/constants';
import type { ClientMessage, HostMessage } from '../shared/protocol';
import { HostCore } from './hostCore';

const scope = self as unknown as {
  postMessage(msg: HostMessage): void;
  onmessage: ((e: MessageEvent<ClientMessage>) => void) | null;
};

// M0 has a single local player. In M2 the main thread relays remote peers here, tagged by connection id.
const LOCAL = 'local';
const core = new HostCore((_connId, msg) => scope.postMessage(msg));
scope.onmessage = (e) => core.receive(LOCAL, e.data);

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
