import { Bot, runBots } from '../shared/bots/bot';
import { addBots, laneForNewBot } from '../shared/bots/lineup';
import { Champion } from '../shared/champions/champion';
import { CHAMPION_INFO, createChampion } from '../shared/champions/registry';
import { SKIN_COUNT, type ChampionId } from '../shared/champions/types';
import { TEAM, type PlayerTeam } from '../shared/constants';
import { ARAM_REROLLS, DEFAULT_SETTINGS, FAST_RATES, LOCAL_CONN, TEAM_SIZE_OPTIONS, teamSizeOf, MAX_CHAT, NIGHT_CLOCK, START_GOLD_OPTIONS, type MatchSettings, type ClientMessage, type Command, type EntitySnap, type GameEvent, type HostMessage, type LobbyPlayer, type LobbyState, type MatchMode, type ScoreRow } from '../shared/protocol';
import { SnapshotEncoder } from '../shared/snapshotCodec';
import { WEATHER_CHANCES, pickWeather, rollClearing } from '../shared/weather';
import { isTitleId } from '../shared/titles';
import { applyCommand } from '../shared/sim/commands';
import { MapEvents } from '../shared/sim/events';
import { WardenLair } from '../shared/sim/warden';
import { scoreRows } from '../shared/sim/score';
import { WaveSpawner } from '../shared/sim/waves';
import { World } from '../shared/sim/world';
import { ARAM, freshMatch } from '../shared/sim/match';
import { isMapId } from '../shared/map/maps';
import { xpToNext } from '../shared/sim/progression';
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

/** ARAM starts everyone further along: experience up to `level` (skill points to spend come with it). */
function startAtLevel(world: World, champ: Champion, level: number): void {
  let xp = 0;
  for (let l = champ.level; l < level; l++) xp += xpToNext(l);
  champ.gainXp(world, xp / world.rates.xp);
}

/**
 * The authoritative game. Runs wherever the host is — a Web Worker in the hosting player's tab — and
 * talks to players only through messages. Every message may come from someone else's browser, so
 * nothing in one is trusted.
 */
export class HostCore {
  /** The match: a fresh one for every rematch. */
  world: World;
  readonly bots: Bot[] = [];
  private readonly lobby = new Map<string, LobbyPlayer>();
  private readonly players = new Map<string, Player>();
  private waves: WaveSpawner;
  /** The Warden (none on the ARAM map). */
  private lair: WardenLair | null;
  /** The match's map events (public for the dev hook that forces one). */
  events: MapEvents;
  private scores: ScoreRow[] | null = null;
  /** The snapshot with the winner has gone out: the match is over. */
  private finalSent = false;
  /** Who's asked for a rematch since the match ended. */
  private readonly rematchVotes = new Set<string>();
  private phase: LobbyState['phase'] = 'lobby';
  /** The host's choices for the match. */
  private settings: MatchSettings = { ...DEFAULT_SETTINGS };
  /** When each connection last chatted (seconds), for the rate limit. */
  private readonly chatTimes = new Map<string, number[]>();

  constructor(
    private readonly send: (connId: string, msg: HostMessage) => void,
    /** Wall-clock seconds (the match clock stands still in the lobby). */
    private readonly now: () => number = () => Date.now() / 1000,
  ) {
    ({ world: this.world, waves: this.waves, lair: this.lair, events: this.events } = freshMatch());
  }

  receive(connId: string, raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const msg = raw as ClientMessage;
    switch (msg.t) {
      case 'hello':
        return this.hello(connId, msg.name, msg.title);
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
      case 'settings':
        return this.changeSettings(connId, msg.settings);
      case 'rematch':
        return this.rematch(connId, msg.swap === true);
      case 'reroll':
        return this.reroll(connId);
    }
  }

  /**
   * After the match: asking for another. The host's ask starts it (swapping sides if they like); anyone
   * else's is counted, and everyone hears who wants one.
   */
  private rematch(connId: string, swap: boolean): void {
    const me = this.lobby.get(connId);
    if (!me || this.phase !== 'playing' || !this.world.winner) return;
    this.rematchVotes.add(connId);
    const humans = [...this.lobby.keys()];
    if (!me.host) {
      const votes = [...this.rematchVotes].map((id) => this.lobby.get(id)?.name ?? '?');
      for (const id of humans) this.send(id, { t: 'rematch', votes, of: humans.length });
      return;
    }
    // Back to the lobby with everyone's picks and the settings as they were; a fresh match waiting.
    ({ world: this.world, waves: this.waves, lair: this.lair, events: this.events } = freshMatch(this.settings.map));
    if (this.allRandom) for (const p of this.lobby.values()) this.rollFor(p, true);
    this.bots.length = 0;
    this.players.clear();
    this.scores = null;
    this.rematchVotes.clear();
    this.finalSent = false;
    this.phase = 'lobby';
    if (swap && me.host) for (const p of this.lobby.values()) p.team = p.team === TEAM.blue ? TEAM.red : TEAM.blue;
    this.broadcastLobby();
  }

  /** The host changing the match settings in the lobby; anything that isn't one of the choices is ignored. */
  private changeSettings(connId: string, raw: unknown): void {
    if (this.phase !== 'lobby' || !this.lobby.get(connId)?.host || !raw || typeof raw !== 'object') return;
    const s = raw as Partial<Record<keyof MatchSettings, unknown>>;
    const next = { ...this.settings };
    if (s.weather === 'random' || WEATHER_CHANCES.some(([w]) => w === s.weather)) next.weather = s.weather as MatchSettings['weather'];
    if (typeof s.night === 'boolean') next.night = s.night;
    if ((START_GOLD_OPTIONS as readonly unknown[]).includes(s.gold)) next.gold = s.gold as number;
    if (typeof s.fast === 'boolean') next.fast = s.fast;
    if (isMapId(s.map)) next.map = s.map;
    if ((TEAM_SIZE_OPTIONS as readonly unknown[]).includes(s.teamSize)) next.teamSize = s.teamSize as number;
    if (s.aramPick === 'random' || s.aramPick === 'pick') next.aramPick = s.aramPick;
    const wasRandom = this.allRandom;
    this.settings = next;
    // Into All Random: everyone gets a champion rolled for them (and a fresh set of rerolls).
    if (this.allRandom && !wasRandom) for (const p of this.lobby.values()) this.rollFor(p, true);
    this.broadcastLobby();
  }

  /** ARAM, All Random: champions are rolled, not picked. */
  private get allRandom(): boolean {
    return this.settings.map === 'aram' && this.settings.aramPick === 'random';
  }

  /** Rolls a random champion for a player, one nobody on their team has (and not the one they had). `fresh` resets their rerolls. */
  private rollFor(p: LobbyPlayer, fresh = false): void {
    const ids = (Object.keys(CHAMPION_INFO) as ChampionId[]).filter((id) => id !== p.champion && !this.takenBy(p.team, id, p.id));
    if (ids.length) p.champion = ids[Math.floor(Math.random() * ids.length)];
    p.skin = 0;
    if (fresh) p.rerolls = ARAM_REROLLS;
  }

  /** ARAM, All Random: swap your champion for another roll, while you have rerolls left. */
  private reroll(connId: string): void {
    const me = this.lobby.get(connId);
    if (!me || this.phase !== 'lobby' || !this.allRandom || (me.rerolls ?? 0) <= 0) return;
    me.rerolls = (me.rerolls ?? 0) - 1;
    this.rollFor(me);
    this.broadcastLobby();
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
      this.bots.push(new Bot(unit, laneForNewBot(this.bots, unit.team as PlayerTeam, this.world.map.aram), this.world));
    }
  }

  // ─── Lobby ────────────────────────────────────────────────────────────────

  private hello(connId: string, name: unknown, title?: unknown): void {
    if (this.lobby.has(connId)) return;
    if (this.phase !== 'lobby') return this.send(connId, { t: 'refused', reason: 'That match has already started.' });
    const team = this.humansOn(TEAM.blue) <= this.humansOn(TEAM.red) ? TEAM.blue : TEAM.red;
    if (this.humansOn(team) >= teamSizeOf(this.settings)) return this.send(connId, { t: 'refused', reason: 'That lobby is full.' });
    const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) : '';
    this.lobby.set(connId, { id: connId, name: clean || 'Player', team, champion: null, skin: 0, host: connId === LOCAL_CONN, ...(isTitleId(title) ? { title } : {}) });
    if (this.allRandom) this.rollFor(this.lobby.get(connId)!, true);
    this.broadcastLobby();
  }

  /** One of each champion per team: a pick a teammate already has is refused, and switching to a team that has yours clears it. */
  private pick(connId: string, team: unknown, champion: unknown, skin?: unknown): void {
    const me = this.lobby.get(connId);
    if (!me || this.phase !== 'lobby') return;
    if ((team === TEAM.blue || team === TEAM.red) && team !== me.team && this.humansOn(team) < teamSizeOf(this.settings)) {
      me.team = team;
      if (me.champion && this.takenBy(me.team, me.champion, connId)) {
        me.champion = null;
        if (this.allRandom) this.rollFor(me);
      }
    }
    // In All Random the champion is rolled, not picked (the look is still yours to choose).
    if (!this.allRandom && typeof champion === 'string' && Object.hasOwn(CHAMPION_INFO, champion) && !this.takenBy(me.team, champion as ChampionId, connId)) {
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
    const { settings } = this;
    // The map the host chose (a fresh match on it, if the waiting one is on the other map).
    const mapId = mode === 'practice' ? 'rift' : settings.map;
    if (this.world.map.id !== mapId) ({ world: this.world, waves: this.waves, lair: this.lair, events: this.events } = freshMatch(mapId));
    const aram = this.world.map.aram === true;
    const startGold = aram ? Math.max(settings.gold, ARAM.startGold) : settings.gold;
    const size = mode === 'practice' ? 3 : teamSizeOf(settings);
    // The Hollow's random weather is graveyard mist, or now and then a thunderstorm that doesn't let up.
    const weather = settings.weather !== 'random' ? settings.weather : aram ? (Math.random() < 0.75 ? 'mist' : 'storm') : pickWeather(Math.random);
    // Random rain may clear up partway through; rain the host asked for stays all match.
    const clears = settings.weather === 'random' && !aram ? rollClearing(weather, Math.random) : undefined;
    if (settings.fast) this.world.rates = aram ? { gold: this.world.rates.gold * 1.3, xp: this.world.rates.xp * 1.3, respawn: this.world.rates.respawn * 0.6 } : { ...FAST_RATES };

    for (const p of everyone) {
      const champ = this.world.add(createChampion(p.champion!, this.world, p.team));
      champ.name = p.name;
      champ.skin = p.skin;
      champ.gold = startGold;
      champ.title = p.title;
      if (aram) startAtLevel(this.world, champ, ARAM.startLevel);
      this.players.set(p.id, { unitId: champ.id, team: p.team, queue: [], encoder: new SnapshotEncoder(), remote: p.id !== LOCAL_CONN, pendingEv: [] });
      this.send(p.id, { t: 'welcome', unitId: champ.id, team: p.team, weather, map: mapId, ...(clears !== undefined ? { clears } : {}), ...(settings.night || aram ? { clock: NIGHT_CLOCK } : {}) });
    }
    if (mode === 'practice') {
      setupPracticeRange(this.world);
    } else {
      for (const team of [TEAM.blue, TEAM.red] as const) {
        const taken = everyone.filter((p) => p.team === team).map((p) => p.champion!);
        const bots = addBots(this.world, team, size - this.humansOn(team), taken, Math.random);
        for (const b of bots) {
          b.champion.skin = Math.floor(Math.random() * SKIN_COUNT); // bots dress up too
          b.champion.gold = startGold;
          if (aram) startAtLevel(this.world, b.champion, ARAM.startLevel);
        }
        this.bots.push(...bots);
      }
    }
    this.broadcastLobby();
  }

  private humansOn(team: PlayerTeam): number {
    return [...this.lobby.values()].filter((p) => p.team === team).length;
  }

  private broadcastLobby(): void {
    const lobby: LobbyState = { players: [...this.lobby.values()], phase: this.phase, settings: this.settings };
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
    // The clock runs once the match has started, and freezes on the final snapshot once a Da Base falls
    // (one last snapshot goes out with the winner, however the match was decided).
    if (this.phase !== 'playing' || this.finalSent) return;
    if (!this.world.winner) {
      for (const p of this.players.values()) {
        const unit = this.world.getUnit(p.unitId);
        if (unit instanceof Champion) for (const cmd of p.queue) applyCommand(this.world, unit, cmd, true);
        p.queue.length = 0;
      }
      runBots(this.world, this.bots);
      this.world.step();
    }
    this.finalSent = this.world.winner !== null;

    const ev = this.world.drainEvents();
    const sendRemote = this.world.tick % REMOTE_SEND_EVERY === 0 || this.world.winner !== null;
    const views = new Map<PlayerTeam, EntitySnap[]>();
    const warden = this.lair?.status(this.world);
    const event = this.events.status(this.world);
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
        event,
      });
      p.pendingEv = [];
      this.send(connId, { t: 'snap', snap });
    }
  }
}
