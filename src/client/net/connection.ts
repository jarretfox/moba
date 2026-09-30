import type { ClientMessage, HostMessage } from '../../shared/protocol';

/** A player's link to the host, wherever the host is. */
export interface Connection {
  send(msg: ClientMessage): void;
  listen(handler: (msg: HostMessage) => void): void;
  /** Called once if the link to the host is lost. */
  onClose(handler: (reason: string) => void): void;
  /** Seconds behind the host to render. Network links need more slack for jitter. */
  readonly interpDelay: number;
}
