import type { FromHost, ToHost } from '../../host/host.worker';
import { LOCAL_CONN, type ClientMessage, type HostMessage } from '../../shared/protocol';
import type { Connection } from './connection';

/**
 * The host running in a Web Worker in this tab. Routes each player's messages in and out: the local
 * player directly, remote players via PeerHost.
 */
export class HostWorker {
  private readonly worker = new Worker(new URL('../../host/host.worker.ts', import.meta.url), { type: 'module' });
  private readonly routes = new Map<string, (msg: HostMessage) => void>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<FromHost>) => this.routes.get(e.data.conn)?.(e.data.msg);
  }

  route(conn: string, handler: (msg: HostMessage) => void): void {
    this.routes.set(conn, handler);
  }

  send(conn: string, msg: unknown): void {
    this.worker.postMessage({ conn, msg } satisfies ToHost);
  }

  drop(conn: string): void {
    this.routes.delete(conn);
    this.worker.postMessage({ conn, dropped: true } satisfies ToHost);
  }

  /** The hosting player's own connection. */
  localLink(): Connection {
    return {
      interpDelay: 0.067,
      send: (msg: ClientMessage) => this.send(LOCAL_CONN, msg),
      listen: (handler) => this.route(LOCAL_CONN, handler),
      onClose: () => {}, // the host is this tab; it can't leave without us
    };
  }
}
