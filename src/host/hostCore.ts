import type { Bot } from '../shared/bots/bot';
import { TEAM_SIZE, addBots } from '../shared/bots/lineup';
import { Champion } from '../shared/champions/champion';
import { createChampion } from '../shared/champions/registry';
import { TEAM, type PlayerTeam } from '../shared/constants';
import { MAP } from '../shared/map/mapData';
import type { ClientMessage, Command, HostMessage, MatchMode } from '../shared/protocol';
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
}

/** Cap on commands buffered per player per tick, so one client can't flood the host. */
const MAX_QUEUED = 32;

/**
 * The authoritative game. Runs wherever the host is — today a Web Worker in this tab — and
 * talks to players only through messages, so remote players (M2) plug in without changes here.
 */
export class HostCore {
  readonly world = new World(MAP);
  readonly bots: Bot[] = [];
  private readonly players = new Map<string, Player>();
  private readonly waves = this.world.addSystem(new WaveSpawner());
  private mode: MatchMode | null = null;

  constructor(private readonly send: (connId: string, msg: HostMessage) => void) {
    spawnStructures(this.world);
    this.world.addSystem(new Fountain());
  }

  receive(connId: string, msg: ClientMessage): void {
    switch (msg.t) {
      case 'join': {
        if (this.players.has(connId)) return;
        const team = TEAM.blue;
        const champ = createChampion(msg.champion, this.world, team);
        champ.name = String(msg.name).slice(0, 16) || 'Player';
        this.world.add(champ);
        this.players.set(connId, { unitId: champ.id, team, queue: [] });
        this.send(connId, { t: 'welcome', unitId: champ.id, team });
        if (!this.mode) this.setUp(msg.mode === 'practice' ? 'practice' : 'bots');
        return;
      }
      case 'cmd': {
        const p = this.players.get(connId);
        if (p && p.queue.length < MAX_QUEUED) p.queue.push(msg.cmd);
        return;
      }
    }
  }

  /** The first player to join picks the mode. M2's lobby will fill slots with friends before bots. */
  private setUp(mode: MatchMode): void {
    this.mode = mode;
    if (mode === 'practice') {
      setupPracticeRange(this.world);
      return;
    }
    const humansOn = (team: PlayerTeam) => [...this.players.values()].filter((p) => p.team === team).length;
    for (const team of [TEAM.blue, TEAM.red] as const) this.bots.push(...addBots(this.world, team, TEAM_SIZE - humansOn(team)));
  }

  step(): void {
    // The match clock starts when the first player is in, and freezes on the final snapshot once a Da Base falls.
    if (this.players.size === 0 || this.world.winner) return;
    for (const p of this.players.values()) {
      const unit = this.world.getUnit(p.unitId);
      if (unit instanceof Champion) for (const cmd of p.queue) applyCommand(this.world, unit, cmd);
      p.queue.length = 0;
    }
    for (const bot of this.bots) for (const cmd of bot.think(this.world)) applyCommand(this.world, bot.champion, cmd);

    this.world.step();

    const ev = this.world.drainEvents();
    for (const [connId, p] of this.players) {
      const me = this.world.getUnit(p.unitId);
      this.send(connId, {
        t: 'snap',
        snap: {
          tick: this.world.tick,
          time: this.world.time,
          ents: this.world.visibleTo(p.team),
          ev,
          me: me instanceof Champion ? me.meSnapshot(this.world) : undefined,
          nextWave: Math.ceil(this.waves.secondsUntilNextWave(this.world)),
          winner: this.world.winner ?? undefined,
        },
      });
    }
  }
}
