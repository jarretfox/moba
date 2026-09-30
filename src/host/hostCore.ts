import { Champion } from '../shared/champions/champion';
import { createChampion } from '../shared/champions/registry';
import { TEAM, type PlayerTeam } from '../shared/constants';
import { MAP } from '../shared/map/mapData';
import { clamp, type Vec2 } from '../shared/math';
import type { ClientMessage, Command, HostMessage } from '../shared/protocol';
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
  private readonly players = new Map<string, Player>();

  private readonly waves = this.world.addSystem(new WaveSpawner());

  constructor(private readonly send: (connId: string, msg: HostMessage) => void) {
    spawnStructures(this.world);
    setupPracticeRange(this.world);
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
        return;
      }
      case 'cmd': {
        const p = this.players.get(connId);
        if (p && p.queue.length < MAX_QUEUED) p.queue.push(msg.cmd);
        return;
      }
    }
  }

  step(): void {
    for (const p of this.players.values()) {
      const unit = this.world.getUnit(p.unitId);
      if (unit instanceof Champion) for (const cmd of p.queue) this.apply(unit, cmd);
      p.queue.length = 0;
    }

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
        },
      });
    }
  }

  /** From M2 on, commands arrive from other people's browsers, so nothing in them is trusted. */
  private apply(unit: Champion, cmd: Command): void {
    if (unit.dead) return;
    const world = this.world;
    switch (cmd.k) {
      case 'move': {
        const p = toPoint(cmd.x, cmd.y);
        if (p) unit.commandMove(world, p);
        return;
      }
      case 'attack': {
        const target = world.getUnit(cmd.target);
        if (target && target.team !== unit.team && target.isTargetable()) unit.commandAttack(target);
        return;
      }
      case 'stop':
        unit.commandStop();
        return;
      case 'cast': {
        const p = toPoint(cmd.x, cmd.y);
        if (p && (cmd.slot === 0 || cmd.slot === 1 || cmd.slot === 2 || cmd.slot === 3)) unit.tryCast(world, cmd.slot, p);
        return;
      }
    }
  }
}

function toPoint(x: unknown, y: unknown): Vec2 | null {
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp(x, 0, MAP.width), y: clamp(y, 0, MAP.height) };
}
