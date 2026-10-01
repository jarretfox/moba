import { Bot, runBots } from '../shared/bots/bot';
import { TEAM_SIZE, addBots, laneForNewBot } from '../shared/bots/lineup';
import { Champion } from '../shared/champions/champion';
import { CHAMPION_INFO, createChampion } from '../shared/champions/registry';
import { SKIN_COUNT, type ChampionId } from '../shared/champions/types';
import { TEAM, type PlayerTeam } from '../shared/constants';
import { MAP } from '../shared/map/mapData';
import { LOCAL_CONN, MAX_CHAT, type ClientMessage, type Command, type EntitySnap, type GameEvent, type HostMessage, type LobbyPlayer, type LobbyState, type MatchMode, type ScoreRow } from '../shared/protocol';
import { SnapshotEncoder } from '../shared/snapshotCodec';
import { pickWeather } from '../shared/weather';
import { applyCommand } from '../shared/sim/commands';
import { Fountain } from '../shared/sim/fountain';
import { Jungle } from '../shared/sim/jungle';
import { WardenLair } from '../shared/sim/warden';
import { scoreRows } from '../shared/sim/score';
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
/** Refresh the scoreboard this often (ticks). */
const SCORES_EVERY = 60;

/** Cap on commands buffered per player per tick, so one client can't flood the host. */
const MAX_QUEUED = 32;
const MAX_NAME = 16;
/** At most this many chat lines per player in any CHAT_WINDOW seconds. */
export const CHAT_LIMIT = 5;
const CHAT_WINDOW = 6;

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
  private readonly lair = this.world.addSystem(new WardenLair());
  private scores: ScoreRow[] | null = null;
  private phase: LobbyState['phase'] = 'lobby';
  /** When each connection last chatted (seconds), for the rate limit. */
  private readonly chatTimes = new Map<string, number[]>();

  constructor(
    private readonly send: (connId: string, msg: HostMessage) => void,
    /** Wall-clock seconds (the match clock stands still in the lobby). */
    private readonly now: () => number = () => Date.now() / 1000,
  ) {
    spawnStructures(this.world);
    this.world.addSystem(new Fountain());
    this.world.addSystem(new Jungle(this.world));
  }

  receive(connId: string, raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as ClientMessage;
    switch (msg.t) {
      case 'hello':
        return this.hello(connId, msg.name);
      case 'pick':
        return this.pick(connId, msg.team, msg.champion, msg.skin);
      case 'start':
        return this.start(connId, msg.mode);
      case 'cmd': {
        const p = this.players.get(connId);
        if (p && p.queue.length < MAX_QUEUED && msg.cmd && typeof msg.cmd === 'object') p.queue.push(msg.cmd);
        return;
      }
      case 'chat':
        return this.chat(connId, msg.text, msg.all);
    }
  }

  /** A chat line: to the sender's team, or (`all`) to everyone. Cleaned up, cut short, and rate limited. */
  private chat(connId: string, text: unknown, all: unknown): void {
    const me = this.lobby.get(connId);
    if (!me || typeof text !== 'string') return;
    const clean = text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT);
    if (!clean) return;
    const now = this.now();
    const recent = (this.chatTimes.get(connId) ?? []).filter((t) => now - t < CHAT_WINDOW);
    if (recent.length >= CHAT_LIMIT) return;
    this.chatTimes.set(connId, [...recent, now]);
    const teamOf = (id: string) => this.players.get(id)?.team ?? this.lobby.get(id)?.team;
    const team = teamOf(connId)!;
    const unit = this.players.has(connId) ? this.world.getUnit(this.players.get(connId)!.unitId) : undefined;
    const msg: HostMessage = { t: 'chat', from: me.name, team, all: all === true, text: clean, ...(unit instanceof Champion ? { champ: unit.info.id } : {}) };
    for (const id of this.lobby.keys()) if (msg.all || teamOf(id) === team) this.send(id, msg);
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
    this.lobby.set(connId, { id: connId, name: clean || 'Player', team, champion: null, skin: 0, host: connId === LOCAL_CONN });
    this.broadcastLobby();
  }

  /** One of each champion per team: a pick a teammate already has is refused, and switching to a team that has yours clears it. */
  private pick(connId: string, team: unknown, champion: unknown, skin?: unknown): void {
    const me = this.lobby.get(connId);
    if (!me || this.phase !== 'lobby') return;
    if ((team === TEAM.blue || team === TEAM.red) && team !== me.team && this.humansOn(team) < TEAM_SIZE) {
      me.team = team;
      if (me.champion && this.takenBy(me.team, me.champion, connId)) me.champion = null;
    }
    if (typeof champion === 'string' && Object.hasOwn(CHAMPION_INFO, champion) && !this.takenBy(me.team, champion as ChampionId, connId)) {
      me.champion = champion as ChampionId;
    }
    if (typeof skin === 'number' && Number.isInteger(skin) && skin >= 0 && skin < SKIN_COUNT) me.skin = skin;
    this.broadcastLobby();
  }

  /** Whether someone else on `team` already plays `champion`. */
  private takenBy(team: PlayerTeam, champion: ChampionId, except: string): boolean {
    return [...this.lobby.values()].some((p) => p.id !== except && p.team === team && p.champion === champion);
  }

  private start(connId: string, mode: unknown): void {
    if (this.phase !== 'lobby' || !this.lobby.get(connId)?.host) return;
    const everyone = [...this.lobby.values()];
    if (everyone.some((p) => !p.champion)) return;
    this.phase = 'playing';
    const weather = pickWeather(Math.random);

    for (const p of everyone) {
      const champ = this.world.add(createChampion(p.champion!, this.world, p.team));
      champ.name = p.name;
      champ.skin = p.skin;
      this.players.set(p.id, { unitId: champ.id, team: p.team, queue: [], encoder: new SnapshotEncoder(), remote: p.id !== LOCAL_CONN, pendingEv: [] });
      this.send(p.id, { t: 'welcome', unitId: champ.id, team: p.team, weather });
    }
    if (mode === 'practice') {
      setupPracticeRange(this.world);
    } else {
      for (const team of [TEAM.blue, TEAM.red] as const) {
        const taken = everyone.filter((p) => p.team === team).map((p) => p.champion!);
        const bots = addBots(this.world, team, TEAM_SIZE - this.humansOn(team), taken, Math.random);
        for (const b of bots) b.champion.skin = Math.floor(Math.random() * SKIN_COUNT); // bots dress up too
        this.bots.push(...bots);
      }
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
    runBots(this.world, this.bots);

    this.world.step();

    const ev = this.world.drainEvents();
    const sendRemote = this.world.tick % REMOTE_SEND_EVERY === 0 || this.world.winner !== null;
    const views = new Map<PlayerTeam, EntitySnap[]>();
    const warden = this.lair.status(this.world);
    // The scoreboard only needs to move every couple of seconds; the codec sends it only when it changes.
    if (this.world.tick % SCORES_EVERY === 0 || this.world.winner !== null || !this.scores) this.scores = scoreRows(this.world);
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
        warden,
        scores: this.scores,
      });
      p.pendingEv = [];
      this.send(connId, { t: 'snap', snap });
    }
  }
}
