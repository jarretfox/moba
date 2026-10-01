import type { PlayerTeam, Team } from '../constants';
import type { MapData, StructureRole } from '../map/mapData';
import type { NavGrid } from '../map/navGrid';
import { shapeContains } from '../map/shapes';
import { dist, type Vec2 } from '../math';
import type { GameEvent } from '../protocol';
import type { Entity } from './entity';
import { sightOf } from './sight';
import { Unit } from './unit';
import type { World } from './world';

/** How close an enemy has to get to spot the Dark Dabber in his Hotbox smoke. */
export const HAZE_REVEAL = 300;

export interface VisionSource {
  x: number;
  y: number;
  sight: number;
}

/** Vision cells are coarser than nav cells: walls are thick, and this keeps fog cheap enough for 10 updates a second. */
const VISION_CELL = 100;
/** Recompute fog every this many ticks (10 times a second). */
const RECOMPUTE_TICKS = 3;

/**
 * The static half of fog of war: which cells block sight (walls) and which brush patch, if any, each
 * cell is in. Pure geometry, shared by the host (to decide what to send) and clients (to draw fog).
 */
export class VisionGrid {
  readonly cellSize = VISION_CELL;
  readonly cols: number;
  readonly rows: number;
  /** 1 where terrain blocks sight. */
  readonly opaque: Uint8Array;
  /** Brush patch id per cell (0 = none). */
  readonly brush: Uint16Array;

  constructor(map: MapData, nav: NavGrid) {
    this.cols = Math.ceil(map.width / VISION_CELL);
    this.rows = Math.ceil(map.height / VISION_CELL);
    this.opaque = new Uint8Array(this.cols * this.rows);
    this.brush = new Uint16Array(this.cols * this.rows);
    for (let cy = 0; cy < this.rows; cy++) {
      for (let cx = 0; cx < this.cols; cx++) {
        const x = (cx + 0.5) * VISION_CELL;
        const y = (cy + 0.5) * VISION_CELL;
        const i = cy * this.cols + cx;
        const nx = nav.cellX(x);
        const ny = nav.cellY(y);
        this.opaque[i] = nx < nav.cols && ny < nav.rows && nav.open[ny * nav.cols + nx] ? 0 : 1;
        const patch = map.brush.findIndex((s) => shapeContains(s, x, y));
        this.brush[i] = patch + 1;
      }
    }
  }

  cellOf(p: Vec2): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(p.x / VISION_CELL)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(p.y / VISION_CELL)));
    return cy * this.cols + cx;
  }

  brushAt(p: Vec2): number {
    return this.brush[this.cellOf(p)];
  }

  /**
   * Marks in `out` every cell some source can see: within its sight radius, with no wall in between,
   * and not inside a brush patch unless the source is standing in that same patch.
   */
  compute(sources: readonly VisionSource[], out: Uint8Array): void {
    out.fill(0);
    const { cols, rows } = this;
    for (const s of sources) {
      const home = this.cellOf(s);
      const sx = home % cols;
      const sy = (home - sx) / cols;
      const ownBrush = this.brush[home];
      const reach = s.sight / VISION_CELL;
      const r = Math.ceil(reach);
      for (let cy = Math.max(0, sy - r); cy <= Math.min(rows - 1, sy + r); cy++) {
        for (let cx = Math.max(0, sx - r); cx <= Math.min(cols - 1, sx + r); cx++) {
          const i = cy * cols + cx;
          if (out[i]) continue;
          if ((cx - sx) ** 2 + (cy - sy) ** 2 > reach * reach) continue;
          const b = this.brush[i];
          if (b && b !== ownBrush) continue;
          if (this.lineOfSight(sx, sy, cx, cy)) out[i] = 1;
        }
      }
    }
  }

  /** No wall cell strictly between two cells. */
  lineOfSight(sx: number, sy: number, tx: number, ty: number): boolean {
    const dx = tx - sx;
    const dy = ty - sy;
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
    for (let k = 1; k < steps; k++) {
      const cx = Math.round(sx + (dx * k) / steps);
      const cy = Math.round(sy + (dy * k) / steps);
      if ((cx !== tx || cy !== ty) && this.opaque[cy * this.cols + cx]) return false;
    }
    return true;
  }
}

/**
 * Fog of war for a match: what each team can currently see. The host only tells a team about what it
 * can see, and Chuds, Shooties and bots only react to what their team can see.
 */
export class Vision {
  readonly grid: VisionGrid;
  private readonly visible: Record<PlayerTeam, Uint8Array>;
  private readonly sources: Record<PlayerTeam, VisionSource[]> = { 1: [], 2: [] };
  private computedTick = -Infinity;

  constructor(private readonly world: World) {
    this.grid = new VisionGrid(world.map, world.grid);
    const n = this.grid.cols * this.grid.rows;
    this.visible = { 1: new Uint8Array(n), 2: new Uint8Array(n) };
  }

  update(force = false): void {
    const world = this.world;
    if (!force && world.tick - this.computedTick < RECOMPUTE_TICKS) return;
    this.computedTick = world.tick;
    for (const team of [1, 2] as const) {
      const sources: VisionSource[] = [];
      for (const u of world.units()) {
        if (u.team !== team || u.dead) continue;
        const sight = sightOf(u.kind, (u as { role?: StructureRole }).role);
        if (sight > 0) sources.push({ x: u.pos.x, y: u.pos.y, sight });
      }
      this.sources[team] = sources;
      this.grid.compute(sources, this.visible[team]);
    }
  }

  /** Can `team` see this entity right now? */
  canSee(team: Team, e: Entity): boolean {
    if (team === 0 || e.team === team) return true;
    if (e.kind === 'structure') return true; // like League's turrets, always on the map
    if (e.kind === 'trap') return false; // hidden from the other side
    if (e instanceof Unit && e.has('decreed')) return true; // Royal Decree: revealed to everyone, wherever they are
    if (e instanceof Unit && e.isConcealed()) return false;
    // Dark Dabber's Hotbox: in the smoke he's only spotted up close, by champions and structures.
    if (e instanceof Unit && e.has('hazed') && !e.has('bleed') && !this.spotsUpClose(team, e)) return false;
    if (this.computedTick === -Infinity) this.update(true);
    if (this.visible[team][this.grid.cellOf(e.pos)]) return true;
    // Attacking or casting from brush gives your position away for a moment.
    return e instanceof Unit && e.revealedUntil > this.world.time && this.inSightIgnoringBrush(team, e.pos);
  }

  /** A champion or structure of `team` close enough to make out someone hiding in smoke. */
  private spotsUpClose(team: Team, e: Unit): boolean {
    return this.world.units().some((u) => u.team === team && !u.dead && (u.kind === 'champion' || u.kind === 'structure') && dist(u.pos, e.pos) <= HAZE_REVEAL + u.radius + e.radius);
  }

  /** Whether an event concerns something `team` can see, so it may be told about it. */
  canSeeEvent(team: PlayerTeam, ev: GameEvent): boolean {
    const byId = (id: number) => {
      const u = this.world.getUnit(id);
      return u !== undefined && this.canSee(team, u);
    };
    switch (ev.e) {
      case 'dmg':
      case 'heal':
        return byId(ev.target);
      case 'attack':
      case 'cast':
        return byId(ev.src);
      case 'death':
      case 'level':
      case 'gold':
        return byId(ev.id);
      case 'kill':
        return true; // the kill feed is announced to everyone
      case 'ping':
        return ev.team === team;
      case 'emote':
        return byId(ev.id);
      case 'fx':
        return ev.team === team || this.visible[team][this.grid.cellOf(ev)] === 1;
    }
  }

  private inSightIgnoringBrush(team: PlayerTeam, p: Vec2): boolean {
    const target = this.grid.cellOf(p);
    const tx = target % this.grid.cols;
    const ty = (target - tx) / this.grid.cols;
    return this.sources[team].some((s) => {
      if (dist(s, p) > s.sight) return false;
      const home = this.grid.cellOf(s);
      const sx = home % this.grid.cols;
      return this.grid.lineOfSight(sx, (home - sx) / this.grid.cols, tx, ty);
    });
  }
}
