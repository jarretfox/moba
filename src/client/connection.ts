import type { ClientMessage, HostMessage } from '../shared/protocol';

export interface Connection {
  send(msg: ClientMessage): void;
  listen(handler: (msg: HostMessage) => void): void;
}

/** Link to a host running in a Web Worker in this tab: offline practice now, and the hosting player's own link in M2. */
export class LocalHostConnection implements Connection {
  private readonly worker = new Worker(new URL('../host/host.worker.ts', import.meta.url), { type: 'module' });

  send(msg: ClientMessage): void {
    this.worker.postMessage(msg);
  }

  listen(handler: (msg: HostMessage) => void): void {
    this.worker.onmessage = (e: MessageEvent<HostMessage>) => handler(e.data);
  }
}
