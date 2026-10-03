import Peer, { type DataConnection } from 'peerjs';
import type { ClientMessage, HostMessage } from '../../shared/protocol';
import type { Connection } from './connection';
import type { HostWorker } from './hostWorker';

// Players find each other through PeerJS's free public signaling server; after that, game traffic
// flows directly between browsers over WebRTC (or through PeerJS's relay when a network blocks that).
// Two channels per friend: a reliable, ordered one for everything (the lobby, commands, chat), and an
// unordered one for the snapshots and their acks. On an ordered channel one lost packet holds up every
// snapshot behind it until it's resent (the game freezes, then jumps); unordered, the next one just comes
// through, and the snapshots are deltas from what the friend has confirmed (shared/snapshotCodec.ts), so
// a late or missing one costs nothing.

/** Prefix for lobby peer ids, so our codes don't collide with other PeerJS apps. */
const PEER_PREFIX = 'chudmoba-';
/** No 0/O, 1/I/L: codes get read out loud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const CONNECT_TIMEOUT_MS = 15000;
/**
 * WebRTC doesn't reliably report a peer whose tab closed, so both ends ping each other and treat
 * this much silence as a disconnect. Background tabs still run timers about once a second.
 */
const HEARTBEAT_MS = 1000;
const HEARTBEAT_TIMEOUT_MS = 6000;
/** The label of a friend's second, unordered channel: snapshots one way, acks the other. */
const SNAP_LABEL = 'snap';

export const normalizeCode = (code: string) => code.trim().toUpperCase();

const isPing = (data: unknown) => !!data && typeof data === 'object' && (data as { t?: unknown }).t === 'ping';

function makeCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

const peerIdFor = (code: string) => PEER_PREFIX + normalizeCode(code).toLowerCase();

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    peer.once('open', () => resolve(peer));
    peer.once('error', (err) => {
      peer.destroy();
      reject(err);
    });
  });
}

/** The hosting side: registers a lobby code and relays friends' messages to and from the host worker. */
export class PeerHost {
  private peer: Peer | null = null;
  /** Each friend's unordered snapshot channel, by their peer id, once it's open. */
  private readonly snaps = new Map<string, DataConnection>();

  constructor(private readonly host: HostWorker) {}

  /** Claims a fresh lobby code on the signaling server. Resolves with the code to share. */
  async open(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = makeCode();
      try {
        this.peer = await openPeer(peerIdFor(code));
      } catch (err) {
        if ((err as { type?: string }).type === 'unavailable-id') continue; // someone has that code; roll again
        throw new Error(`Couldn't reach the matchmaking server (${(err as { type?: string }).type ?? 'unknown error'}).`);
      }
      this.peer.on('connection', (conn) => this.accept(conn));
      // Losing the signaling server only stops new friends joining; connected ones keep playing.
      this.peer.on('disconnected', () => this.peer?.reconnect());
      // Closing the tab ends the match for everyone; tell them straight away rather than letting them time out.
      addEventListener('pagehide', () => this.peer?.destroy());
      return code;
    }
    throw new Error("Couldn't get a free lobby code. Try again.");
  }

  private accept(conn: DataConnection): void {
    if (conn.label === SNAP_LABEL) return this.acceptSnaps(conn);
    // Prefixed so a remote peer can never pose as the host's own local connection.
    const id = `peer:${conn.peer}`;
    let open = false;
    let lastHeard = performance.now();
    let beat: ReturnType<typeof setInterval> | undefined;
    const drop = () => {
      if (!open) return;
      open = false;
      clearInterval(beat);
      this.host.drop(id);
      conn.close();
      this.snaps.get(conn.peer)?.close();
      this.snaps.delete(conn.peer);
    };
    conn.on('open', () => {
      open = true;
      // Snapshots on their unordered channel when it's up; everything else (and snapshots until then) here.
      this.host.route(id, (msg) => {
        const snaps = this.snaps.get(conn.peer);
        if (msg.t === 'snap' && snaps?.open) void snaps.send(msg);
        else void conn.send(msg);
      });
      conn.on('data', (data) => {
        lastHeard = performance.now();
        if (!isPing(data)) this.host.send(id, data);
      });
      beat = setInterval(() => {
        if (performance.now() - lastHeard > HEARTBEAT_TIMEOUT_MS) return drop();
        void conn.send({ t: 'ping' } satisfies HostMessage);
      }, HEARTBEAT_MS);
    });
    conn.on('close', drop);
    conn.on('error', drop);
  }

  /** A friend's second channel: their acks come in on it, their snapshots go out on it. Losing it only means falling back to the first. */
  private acceptSnaps(conn: DataConnection): void {
    conn.on('open', () => {
      this.snaps.set(conn.peer, conn);
      conn.on('data', (data) => {
        if (!isPing(data)) this.host.send(`peer:${conn.peer}`, data);
      });
    });
    const forget = () => {
      if (this.snaps.get(conn.peer) === conn) this.snaps.delete(conn.peer);
    };
    conn.on('close', forget);
    conn.on('error', forget);
  }
}

/** A friend's link to someone else's lobby. */
export class PeerLink implements Connection {
  // Updates arrive 15 times a second over the network, so render a couple of intervals behind.
  readonly interpDelay = 0.15;
  private handler: ((msg: HostMessage) => void) | null = null;
  private closeHandler: ((reason: string) => void) | null = null;
  private closed = false;
  private lastHeard = performance.now();
  private readonly beat: ReturnType<typeof setInterval>;
  /** The unordered channel for snapshots and acks (see the top of the file), once it's open. */
  private snaps: DataConnection | null = null;

  private constructor(
    private readonly peer: Peer,
    private readonly conn: DataConnection,
    code: string,
  ) {
    const heard = (data: unknown) => {
      this.lastHeard = performance.now();
      if (!isPing(data)) this.handler?.(data as HostMessage);
    };
    conn.on('data', heard);
    // The second channel: if it never opens, everything just keeps coming over the first.
    const snaps = peer.connect(peerIdFor(code), { reliable: false, label: SNAP_LABEL });
    snaps.once('open', () => {
      if (this.closed) return snaps.close();
      this.snaps = snaps;
      snaps.on('data', heard);
    });
    const lostSnaps = () => {
      if (this.snaps === snaps) this.snaps = null;
    };
    snaps.on('close', lostSnaps);
    snaps.on('error', lostSnaps);
    conn.on('close', () => this.lost('The host left the game.'));
    conn.on('error', () => this.lost('Lost the connection to the host.'));
    this.beat = setInterval(() => {
      if (performance.now() - this.lastHeard > HEARTBEAT_TIMEOUT_MS) return this.lost('The host stopped responding.');
      this.send({ t: 'ping' });
    }, HEARTBEAT_MS);
    // Leaving on purpose: tell the host now so a bot takes over straight away.
    addEventListener('pagehide', () => this.lost('You left.'));
  }

  static connect(code: string): Promise<PeerLink> {
    return new Promise((resolve, reject) => {
      const fail = (reason: string, peer?: Peer) => {
        peer?.destroy();
        reject(new Error(reason));
      };
      const timer = setTimeout(() => fail('Timed out reaching that lobby.'), CONNECT_TIMEOUT_MS);
      openPeer()
        .then((peer) => {
          peer.once('error', (err) => {
            clearTimeout(timer);
            fail(err.type === 'peer-unavailable' ? `There's no lobby with code ${normalizeCode(code)}.` : `Couldn't connect (${err.type}).`, peer);
          });
          const conn = peer.connect(peerIdFor(code), { reliable: true });
          conn.once('open', () => {
            clearTimeout(timer);
            resolve(new PeerLink(peer, conn, code));
          });
        })
        .catch((err) => {
          clearTimeout(timer);
          fail(`Couldn't reach the matchmaking server (${err.type ?? 'unknown error'}).`);
        });
    });
  }

  send(msg: ClientMessage): void {
    // Acks go with the snapshots, on the unordered channel; everything else in order.
    if (msg.t === 'ack' && this.snaps?.open) void this.snaps.send(msg);
    else if (this.conn.open) void this.conn.send(msg);
  }

  listen(handler: (msg: HostMessage) => void): void {
    this.handler = handler;
  }

  onClose(handler: (reason: string) => void): void {
    this.closeHandler = handler;
  }

  private lost(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.beat);
    this.snaps?.close();
    this.conn.close();
    this.peer.destroy();
    this.closeHandler?.(reason);
  }
}
