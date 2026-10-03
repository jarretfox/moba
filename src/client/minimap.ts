import { TEAM, type Team } from '../shared/constants';
import type { MapData } from '../shared/map/mapData';
import type { Shape } from '../shared/map/shapes';
import type { Vec2 } from '../shared/math';
import type { EntitySnap, EventKind, PingKind } from '../shared/protocol';
import { PINGS } from './pings';
import { portraitOf } from './render/champions';
import { PALETTE } from './render/views';

// The whole map in the corner: terrain, your fog of war, structures, camps, Chuds, champion portraits,
// pings and the box your camera sees. Click it to look somewhere, right-click to walk there.

export interface MinimapPing {
  x: number;
  y: number;
  kind: PingKind;
  /** Seconds since it was pinged. */
  age: number;
}

/** The map event's marker (render/events.ts sets it): where, what, how far along, and whose color. */
export interface MinimapEvent {
  x: number;
  y: number;
  kind: EventKind;
  phase: 'soon' | 'live' | 'done';
  color: number;
}

export interface MinimapView {
  ents: Iterable<EntitySnap>;
  myTeam: Team;
  myId: number;
  /** The camera's view, in world units. */
  view: { x: number; y: number; w: number; h: number };
  /** Draws the fog of war scaled into the given size. */
  drawFog: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  pings: readonly MinimapPing[];
}

/** Width on screen, in CSS pixels; the height follows the map's shape. */
const WIDTH = 260;
const ALLY = '#3d8bfd';
const enemyCss = () => `#${PALETTE.enemy.toString(16).padStart(6, '0')}`;
const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export class Minimap {
  readonly root = document.createElement('div');
  /** Left mouse held on the map: look there (null when let go). */
  onPeek: (p: Vec2 | null) => void = () => {};
  /** Right-click on the map: walk there. */
  onMove: (p: Vec2) => void = () => {};
  /** Left mouse down: return true if that started a ping instead of a look. */
  onPingStart: (e: PointerEvent, p: Vec2) => boolean = () => false;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly w = WIDTH;
  private readonly h: number;
  private readonly dpr = Math.min(window.devicePixelRatio || 1, 2);
  private terrain: HTMLCanvasElement | null = null;
  private readonly faces = new Map<string, HTMLImageElement>();
  private peeking = false;
  /** Where on the map the pointer is, while it's over the minimap (a summoner spell can be aimed there). */
  hoverAt: Vec2 | null = null;
  /** The map event to mark, while there is one. */
  event: MinimapEvent | null = null;
  private clock = 0;

  constructor(parent: HTMLElement, private readonly map: MapData) {
    this.h = Math.round((WIDTH * map.height) / map.width);
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx = this.canvas.getContext('2d')!;
    this.root.className = 'minimap';
    this.root.hidden = true;
    this.root.append(this.canvas);
    parent.append(this.root);

    this.canvas.addEventListener('pointerdown', (e) => {
      const p = this.toWorld(e);
      if (e.button === 2) return this.onMove(p);
      if (e.button !== 0 || this.onPingStart(e, p)) return;
      this.peeking = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.onPeek(p);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      this.hoverAt = this.toWorld(e);
      if (this.peeking) this.onPeek(this.hoverAt);
    });
    this.canvas.addEventListener('pointerleave', () => (this.hoverAt = null));
    const stop = () => {
      if (!this.peeking) return;
      this.peeking = false;
      this.onPeek(null);
    };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
  }

  /** Paints the terrain once per side (your base is blue). */
  setTeam(team: Team): void {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d')!;
    const s = (this.w * this.dpr) / this.map.width;
    g.fillStyle = '#0d130d';
    g.fillRect(0, 0, c.width, c.height);
    const paint = (shape: Shape, color: string) => fillShape(g, shape, s, color);
    const ground = this.map.ground;
    for (const p of ground) if (p.style === 'jungle') paint(p.shape, '#2c4524');
    for (const p of ground) if (p.style === 'lane') paint(p.shape, '#7a6648');
    for (const p of ground) if (p.style === 'river') paint(p.shape, '#2c6a86');
    for (const p of ground) {
      if (p.style !== 'base') continue;
      const center = p.shape.type === 'circle' ? p.shape.x : p.shape.type === 'rect' ? p.shape.x + p.shape.w / 2 : p.shape.ax;
      const blueSide = center < this.map.width / 2;
      paint(p.shape, blueSide === (team === TEAM.blue) ? '#2a4c7e' : '#6e2c2c');
    }
    for (const b of this.map.brush) paint(b, '#1f3519');
    for (const b of this.map.blockers) paint(b, '#46493f');
    this.terrain = c;
  }

  draw(v: MinimapView): void {
    const g = this.ctx;
    const s = this.w / this.map.width;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    if (this.terrain) g.drawImage(this.terrain, 0, 0, this.w, this.h);
    v.drawFog(g, this.w, this.h);

    const ents = [...v.ents].filter((e) => e.k !== 'projectile' && e.k !== 'trap' && e.k !== 'zone' && e.k !== 'pickup' && e.k !== 'ward');
    const enemy = enemyCss();
    const side = (e: EntitySnap) => (e.tm === v.myTeam ? ALLY : enemy);
    for (const e of ents) {
      if (e.dead || e.k !== 'chud') continue;
      dot(g, e.x * s, e.y * s, 1.8, side(e));
    }
    for (const e of ents) {
      const x = e.x * s;
      const y = e.y * s;
      if (e.k === 'structure') {
        const color = e.dead ? '#3b3f46' : side(e);
        if (e.role === 'daBase') hexagon(g, x, y, 7, color);
        else if (e.role === 'oakner') dot(g, x, y, 4, color, '#0b0f0b');
        else square(g, x, y, 6, color);
      } else if (e.k === 'monster' && !e.dead) {
        if (e.mon === 'warden') dot(g, x, y, 6, '#7fe3ff', '#0b0f0b');
        else if (e.mon === 'crab') dot(g, x, y, 3.5, '#ff8a3d', '#0b0f0b');
        else if (e.mon === 'coat') dot(g, x, y, 6, '#c9a86a', '#0b0f0b');
        else dot(g, x, y, 3, '#e8c46a', '#0b0f0b');
      }
    }
    // The map event: a diamond at its site, pulsing rings while it's on the way, in whoever's winning's color.
    const ev = this.event;
    if (ev) {
      this.clock += 1 / 20;
      const x = ev.x * s;
      const y = ev.y * s;
      const color = css(ev.color);
      if (ev.phase !== 'done') {
        for (const k of [0, 0.5]) {
          const t = (this.clock * (ev.phase === 'soon' ? 1 : 0.5) + k) % 1;
          g.beginPath();
          g.arc(x, y, 6 + t * 14, 0, Math.PI * 2);
          g.strokeStyle = color;
          g.lineWidth = 2;
          g.globalAlpha = 1 - t;
          g.stroke();
        }
        g.globalAlpha = 1;
      }
      g.beginPath();
      g.moveTo(x, y - 8);
      g.lineTo(x + 7, y);
      g.lineTo(x, y + 8);
      g.lineTo(x - 7, y);
      g.closePath();
      g.fillStyle = color;
      g.fill();
      g.strokeStyle = '#0b0f0b';
      g.lineWidth = 1.5;
      g.stroke();
      g.fillStyle = '#0b0f0b';
      g.font = '900 9px Nunito, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ev.kind === 'boss' ? '!' : ev.kind === 'escort' ? '→' : '$', x, y + 0.5);
    }
    // Champions on top, you last.
    const champs = ents.filter((e) => e.k === 'champion' && !e.dead).sort((a) => (a.id === v.myId ? 1 : -1));
    for (const e of champs) this.face(g, e, e.x * s, e.y * s, e.id === v.myId ? '#ffd166' : side(e));

    for (const p of v.pings) {
      const info = PINGS[p.kind];
      const x = p.x * s;
      const y = p.y * s;
      const fade = Math.max(0, 1 - p.age / 3);
      g.globalAlpha = fade;
      for (const k of [0, 0.5]) {
        const t = (p.age * 1.5 + k) % 1;
        g.beginPath();
        g.arc(x, y, 4 + t * 14, 0, Math.PI * 2);
        g.strokeStyle = css(info.color);
        g.lineWidth = 2;
        g.globalAlpha = fade * (1 - t);
        g.stroke();
      }
      g.globalAlpha = fade;
      dot(g, x, y, 6, css(info.color), '#000');
      g.fillStyle = '#000';
      g.font = '900 9px Nunito, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(info.glyph, x, y + 0.5);
      g.globalAlpha = 1;
    }

    // What the camera sees.
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1.5;
    g.strokeRect(v.view.x * s, v.view.y * s, v.view.w * s, v.view.h * s);
  }

  /** A champion's portrait in a ring of their side's color. */
  private face(g: CanvasRenderingContext2D, e: EntitySnap, x: number, y: number, ring: string): void {
    const r = 8;
    const key = `${e.champ}:${e.skin ?? 0}`;
    let img = this.faces.get(key);
    const url = e.champ ? portraitOf(e.champ, e.skin ?? 0) : undefined;
    if (!img && url) {
      img = new Image();
      img.src = url;
      this.faces.set(key, img);
    }
    g.save();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.clip();
    if (img?.complete) g.drawImage(img, x - r * 1.25, y - r * 1.25, r * 2.5, r * 2.5);
    else {
      g.fillStyle = ring;
      g.fill();
    }
    g.restore();
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.strokeStyle = ring;
    g.lineWidth = 2.5;
    g.stroke();
  }

  private toWorld(e: PointerEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(this.map.width, ((e.clientX - rect.left) / rect.width) * this.map.width)),
      y: Math.max(0, Math.min(this.map.height, ((e.clientY - rect.top) / rect.height) * this.map.height)),
    };
  }
}

function fillShape(g: CanvasRenderingContext2D, shape: Shape, s: number, color: string): void {
  g.fillStyle = color;
  g.strokeStyle = color;
  switch (shape.type) {
    case 'circle':
      g.beginPath();
      g.arc(shape.x * s, shape.y * s, shape.r * s, 0, Math.PI * 2);
      g.fill();
      return;
    case 'rect':
      g.fillRect(shape.x * s, shape.y * s, shape.w * s, shape.h * s);
      return;
    case 'capsule':
      g.beginPath();
      g.lineCap = 'round';
      g.lineWidth = shape.r * 2 * s;
      g.moveTo(shape.ax * s, shape.ay * s);
      g.lineTo(shape.bx * s, shape.by * s);
      g.stroke();
      return;
  }
}

function dot(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, edge?: string): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
  if (edge) {
    g.strokeStyle = edge;
    g.lineWidth = 1.2;
    g.stroke();
  }
}

function square(g: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string): void {
  g.fillStyle = '#0b0f0b';
  g.fillRect(x - size / 2 - 1, y - size / 2 - 1, size + 2, size + 2);
  g.fillStyle = fill;
  g.fillRect(x - size / 2, y - size / 2, size, size);
}

function hexagon(g: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string): void {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = '#0b0f0b';
  g.lineWidth = 1.5;
  g.stroke();
}
