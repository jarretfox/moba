import { Bot } from '../shared/bots/bot';
import { TEAM_SIZE, addBots, laneForNewBot } from '../shared/bots/lineup';
import { Champion } from '../shared/champions/champion';
import { CHAMPION_INFO, createChampion } from '../shared/champions/registry';
import type { ChampionId } from '../shared/champions/types';
import { TEAM, type PlayerTeam } from '../shared/constants';
import { MAP } from '../shared/map/mapData';
import { LOCAL_CONN, type ClientMessage, type Command, type EntitySnap, type GameEvent, type HostMessage, type LobbyPlayer, type LobbyState, type MatchMode } from '../shared/protocol';
import { SnapshotEncoder } from '../shared/snapshotCodec';
import { applyCommand } from '../shared/sim/commands';
import { Fountain } from '../shared/sim/fountain';
import { spawnStructures } from '../shared/sim/structure';
import { WaveSpawner } from '../shared/sim/waves';
import { World } from '../shared/sim/world';
import { setupPracticeRange } from './practice';

interface Player {
  unitId: number;
  team: PlayerTeam;
  queue: Command[];
  encoder: SnapshotEncoder;
  /** Friends over the network get updates at a lower rate than the host's own client. */
  remote: boolean;
  /** Events since this player's last update. */
  pendingEv: GameEvent[];
}

/** Remote players get an update every this many ticks (15 a second); events in between are batched, never dropped. */
const REMOTE_SEND_EVERY = 2;

/** Cap on commands buffered per player per tick, so one client can't flood the host. */
const MAX_QUEUED = 32;
const MAX_NAME = 16;

/**
 * The authoritative game. Runs wherever the host is — a Web Worker in the hosting player's tab — and
 * talks to players only through messages. Every message may come from someone else's browser, so
 * nothing in one is trusted.
 */
export class HostCore {
  readonly world = new World(MAP);
  readonly bots: Bot[] = [];
  private readonly lobby = new Map<string, LobbyPlayer>();
  private readonly players = new Map<string, Player>();
  private readonly waves = this.world.addSystem(new WaveSpawner());
  private phase: LobbyState['phase'] = 'lobby';

  constructor(private readonly send: (connId: string, msg: HostMessage) => void) {
    spawnStructures(this.world);
    this.world.addSystem(new Fountain());
  }

  receive(connId: string, raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as ClientMessage;
    switch (msg.t) {
      case 'hello':
        return this.hello(connId, msg.name);
      case 'pick':
        return this.pick(connId, msg.team, msg.champion);
      case 'start':
        return this.start(connId, msg.mode);
      case 'cmd': {
        const p = this.players.get(connId);
        if (p && p.queue.length < MAX_QUEUED && msg.cmd && typeof msg.cmd === 'object') p.queue.push(msg.cmd);
        return;
      }
    }
  }

  /** A connection went away: leave the lobby, or hand their champion to a bot mid-match. */
  dropped(connId: string): void {
    if (this.phase === 'lobby') {
      if (this.lobby.delete(connId)) this.broadcastLobby();
      return;
    }
    const p = this.players.get(connId);
    this.players.delete(connId);
    this.lobby.delete(connId);
    const unit = p && this.world.getUnit(p.unitId);
    if (unit instanceof Champion) {
      unit.name = `${unit.name} (bot)`;
      this.bots.push(new Bot(unit, laneForNewBot(this.bots, unit.team as PlayerTeam), this.world));
    }
  }

  // ─── Lobby ────────────────────────────────────────────────────────────────

  private hello(connId: string, name: unknown): void {
    if (this.lobby.has(connId)) return;
    if (this.phase !== 'lobby') return this.send(connId, { t: 'refused', reason: 'That match has already started.' });
    const team = this.humansOn(TEAM.blue) <= this.humansOn(TEAM.red) ? TEAM.blue : TEAM.red;
    if (this.humansOn(team) >= TEAM_SIZE) return this.send(connId, { t: 'refused', reason: 'That lobby is full.' });
    const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
    this.lobby.set(connId, { id: connId, name: clean || 'Player', team, champion: null, host: connId === LOCAL_CONN });
    this.broadcastLobby();
  }

  private pick(connId: string, team: unknown, champion: unknown): void {
    const me = this.lobby.get(connId);
    if (!me || this.phase !== 'lobby') return;
    if ((team === TEAM.blue || team === TEAM.red) && team !== me.team && this.humansOn(team) < TEAM_SIZE) me.team = team;
    if (typeof champion === 'string' && Object.hasOwn(CHAMPION_INFO, champion)) me.champion = champion as ChampionId;
    this.broadcastLobby();
  }

  private start(connId: string, mode: unknown): void {
    if (this.phase !== 'lobby' || !this.lobby.get(connId)?.host) return;
    const everyone = [...this.lobby.values()];
    if (everyone.some((p) => !p.champion)) return;
    this.phase = 'playing';

    for (const p of everyone) {
      const champ = this.world.add(createChampion(p.champion!, this.world, p.team));
      champ.name = p.name;
      this.players.set(p.id, { unitId: champ.id, team: p.team, queue: [], encoder: new SnapshotEncoder(), remote: p.id !== LOCAL_CONN, pendingEv: [] });
      this.send(p.id, { t: 'welcome', unitId: champ.id, team: p.team });
    }
    if (mode === 'practice') {
      setupPracticeRange(this.world);
    } else {
      for (const team of [TEAM.blue, TEAM.red] as const) this.bots.push(...addBots(this.world, team, TEAM_SIZE - this.humansOn(team)));
    }
    this.broadcastLobby();
  }

  private humansOn(team: PlayerTeam): number {
    return [...this.lobby.values()].filter((p) => p.team === team).length;
  }

  private broadcastLobby(): void {
    const lobby: LobbyState = { players: [...this.lobby.values()], phase: this.phase };
    for (const id of this.lobby.keys()) this.send(id, { t: 'lobby', lobby, you: id });
  }

  /** Solo shortcut and test helper: say hello, pick, and start in one go. */
  quickStart(connId: string, name: string, champion: ChampionId, mode: MatchMode): void {
    this.receive(connId, { t: 'hello', name });
    this.receive(connId, { t: 'pick', champion });
    this.receive(connId, { t: 'start', mode });
  }

  // ─── Match ────────────────────────────────────────────────────────────────

  step(): void {
    // The clock runs once the match has started, and freezes on the final snapshot once a Da Base falls.
    if (this.phase !== 'playing' || this.world.winner) return;
    for (const p of this.players.values()) {
      const unit = this.world.getUnit(p.unitId);
      if (unit instanceof Champion) for (const cmd of p.queue) applyCommand(this.world, unit, cmd);
      p.queue.length = 0;
    }
    for (const bot of this.bots) for (const cmd of bot.think(this.world)) applyCommand(this.world, bot.champion, cmd);

    this.world.step();

    const ev = this.world.drainEvents();
    const sendRemote = this.world.tick % REMOTE_SEND_EVERY === 0 || this.world.winner !== null;
    const views = new Map<PlayerTeam, EntitySnap[]>();
    for (const [connId, p] of this.players) {
      for (const e of ev) if (this.world.vision.canSeeEvent(p.team, e)) p.pendingEv.push(e);
      if (p.remote && !sendRemote) continue;
      if (!views.has(p.team)) views.set(p.team, this.world.visibleTo(p.team));
      const me = this.world.getUnit(p.unitId);
      const snap = p.encoder.encode({
        tick: this.world.tick,
        time: this.world.time,
        ents: views.get(p.team)!,
        ev: p.pendingEv,
        me: me instanceof Champion ? me.meSnapshot(this.world) : undefined,
        nextWave: Math.ceil(this.waves.secondsUntilNextWave(this.world)),
        winner: this.world.winner ?? undefined,
      });
      p.pendingEv = [];
      this.send(connId, { t: 'snap', snap });
    }
  }
}
