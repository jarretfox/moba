import { Graphics } from 'pixi.js';
import type { MapData } from '../../shared/map/mapData';
import { shapeContains } from '../../shared/map/shapes';
import type { EntitySnap } from '../../shared/protocol';
import { propSpots } from './props';
import { hollowPerches } from './hollow';

// Life on the map: flocks of birds roosting at the edges of the woods that take off when a fight breaks
// out nearby (or someone walks right under them), bats flitting round the lanterns at night, and frogs
// at the river's edge that hop away when anyone gets close. On the Howling Hollow: crows on the gravestones
// that scatter cawing when someone comes by, bats streaming across the sky now and then, and little ghosts
// drifting over the graveyard plaza. Pure decoration.

interface Bird {
  dx: number;
  dy: number;
  phase: number;
}

interface Flock {
  roost: number;
  x: number;
  y: number;
  /** Flying: heading for another roost. */
  flying: boolean;
  tx: number;
  ty: number;
  birds: Bird[];
  /** Seconds before they'd move on by themselves. */
  restless: number;
}

interface Frog {
  home: { x: number; y: number };
  /** Toward the water. */
  dir: { x: number; y: number };
  hop: number;
  gone: number;
}

interface Crow {
  /** Which gravestone it's on (in hollowPerches). */
  perch: number;
  /** Flying off: how far into it (0–1), and which way. */
  flight: number;
  dir: number;
  /** Seconds before it settles on a gravestone again. */
  away: number;
  phase: number;
}

interface Ghost {
  cx: number;
  cy: number;
  phase: number;
  speed: number;
}

interface Bat {
  lantern: number;
  phase: number;
  speed: number;
  radius: number;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INK = 0x14161a;

export class Critters {
  readonly container = new Graphics();
  private readonly roosts: { x: number; y: number }[] = [];
  private readonly flocks: Flock[] = [];
  private readonly frogs: Frog[] = [];
  private readonly bats: Bat[] = [];
  private readonly lanterns: { x: number; y: number }[];
  private clock = 0;
  private night = 0;
  /** The Howling Hollow's own: crows, a stream of bats now and then, ghosts. */
  private readonly haunted: boolean;
  private readonly crows: Crow[] = [];
  private readonly ghosts: Ghost[] = [];
  /** A stream of bats crossing the view: where it started, its heading, and how long ago. */
  private swarm: { x: number; y: number; dx: number; dy: number; age: number } | null = null;
  private swarmIn = 8;

  constructor(private readonly map: MapData) {
    const random = rng(777);
    this.haunted = map.theme === 'halloween';
    if (this.haunted) {
      for (let i = 0; i < 14; i++) this.crows.push({ perch: i * 7, flight: -1, dir: 1, away: 0, phase: random() * 10 });
      for (let i = 0; i < 3; i++) this.ghosts.push({ cx: map.width / 2 + (i - 1) * 260, cy: map.height / 2 + (i % 2 ? -1 : 1) * 160, phase: random() * 10, speed: 0.25 + random() * 0.2 });
    }
    const onGround = (x: number, y: number) => map.ground.some((p) => shapeContains(p.shape, x, y));
    // Roosts: in the trees just off the paths, where you can see the birds leave.
    for (let i = 0; i < 6000 && this.roosts.length < 14; i++) {
      const x = 200 + random() * (map.width - 400);
      const y = 200 + random() * (map.height - 400);
      if (onGround(x, y) || map.blockers.some((b) => shapeContains(b, x, y))) continue;
      const nearPath = [[160, 0], [-160, 0], [0, 160], [0, -160]].some(([dx, dy]) => onGround(x + dx, y + dy));
      if (!nearPath || this.roosts.some((r) => Math.hypot(r.x - x, r.y - y) < 900)) continue;
      this.roosts.push({ x, y });
    }
    for (let i = 0; i < Math.min(8, this.roosts.length); i++) {
      const r = this.roosts[i * 2 % this.roosts.length];
      const birds = Array.from({ length: 5 + Math.floor(random() * 4) }, () => ({ dx: (random() - 0.5) * 80, dy: (random() - 0.5) * 60, phase: random() * 10 }));
      this.flocks.push({ roost: i * 2 % this.roosts.length, x: r.x, y: r.y, flying: false, tx: r.x, ty: r.y, birds, restless: 30 + random() * 60 });
    }
    // Frogs: right at the river's edge, facing the water.
    const inRiver = (x: number, y: number) => map.ground.some((p) => p.style === 'river' && shapeContains(p.shape, x, y));
    for (let i = 0; i < 20000 && this.frogs.length < 10; i++) {
      const x = random() * map.width;
      const y = random() * map.height;
      if (inRiver(x, y) || !onGround(x, y)) continue;
      const water = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => inRiver(x + dx * 50, y + dy * 50));
      if (!water || this.frogs.some((f) => Math.hypot(f.home.x - x, f.home.y - y) < 500)) continue;
      this.frogs.push({ home: { x, y }, dir: { x: water[0], y: water[1] }, hop: -1, gone: 0 });
    }
    // Bats: a few round some of the lanterns.
    this.lanterns = propSpots(map).lanterns;
    for (let i = 0; i < Math.min(10, this.lanterns.length); i++) {
      this.bats.push({ lantern: (i * 3) % this.lanterns.length, phase: random() * 10, speed: 2 + random() * 1.5, radius: 50 + random() * 60 });
    }
  }

  setNight(k: number): void {
    this.night = k;
  }

  /** Something loud happened here: nearby birds take off. */
  alarm(x: number, y: number): void {
    for (const f of this.flocks) if (!f.flying && Math.hypot(f.x - x, f.y - y) < 750) this.takeOff(f, x, y);
  }

  /** The Howling Hollow: crows on the graves, bats streaming over, ghosts drifting round the plaza. */
  private hollowLife(g: Graphics, dt: number, walkers: EntitySnap[], view: { x: number; y: number; w: number; h: number }, onScreen: (x: number, y: number, pad?: number) => boolean): void {
    const perches = hollowPerches(this.map);
    if (perches.length) {
      for (const c of this.crows) {
        // Spread along the graves (the perch numbers are fractions of the way along the list).
        const p = perches[Math.floor(((c.perch % 97) / 97) * perches.length)];
        if (c.away > 0) {
          c.away -= dt;
          if (c.away <= 0) c.perch = (c.perch + 5 + Math.floor(Math.random() * 20)) % 97;
          continue;
        }
        if (c.flight < 0 && walkers.some((w) => Math.hypot(w.x - p.x, w.y - p.y) < 220)) {
          c.flight = 0;
          c.dir = Math.random() < 0.5 ? -1 : 1;
        }
        let x = p.x;
        let y = p.y;
        let flap = 0;
        if (c.flight >= 0) {
          c.flight += dt / 1.6;
          x += c.dir * 500 * c.flight;
          y -= 420 * c.flight * c.flight + 30 * c.flight;
          flap = Math.sin(this.clock * 26 + c.phase) * 7;
          if (c.flight >= 1) {
            c.flight = -1;
            c.away = 15 + Math.random() * 25;
            continue;
          }
        }
        if (!onScreen(x, y)) continue;
        if (c.flight >= 0) {
          g.moveTo(x - 18, y + flap).lineTo(x, y).lineTo(x + 18, y + flap).stroke({ width: 5, color: 0x0e0c12, join: 'round', cap: 'round' });
        } else {
          // Perched: a hunched black body, a beak, a glint of an eye; a hop and a head-turn now and then.
          const hop = Math.max(0, Math.sin(this.clock * 0.9 + c.phase) - 0.96) * 60;
          const look = Math.sin(this.clock * 0.6 + c.phase * 3) > 0 ? 1 : -1;
          const s = 1.6;
          const yy = y - hop;
          g.ellipse(x, yy, 9 * s, 7 * s).fill(0x0e0c12).stroke({ width: 1.5, color: 0x3a3448, alpha: 0.8 });
          g.circle(x + look * 7 * s, yy - 7 * s, 5 * s).fill(0x0e0c12);
          g.poly([x + look * 10 * s, yy - 8 * s, x + look * 17 * s, yy - 6 * s, x + look * 10 * s, yy - 4 * s]).fill(0x5a5048);
          g.circle(x + look * 8 * s, yy - 8.5 * s, 1.6).fill(0xffe08a);
          g.poly([x - look * 7 * s, yy - 2 * s, x - look * 15 * s, yy + 2 * s, x - look * 7 * s, yy + 3 * s]).fill(0x0e0c12);
        }
      }
    }
    // Now and then a stream of bats pours across the sky.
    this.swarmIn -= dt;
    if (!this.swarm && this.swarmIn <= 0) {
      const left = Math.random() < 0.5;
      this.swarm = { x: view.x + (left ? -1 : 1) * (view.w / 2 + 150), y: view.y - view.h * (0.1 + Math.random() * 0.3), dx: left ? 1 : -1, dy: 0.15 + Math.random() * 0.2, age: 0 };
      this.swarmIn = 18 + Math.random() * 20;
    }
    if (this.swarm) {
      const s = this.swarm;
      s.age += dt;
      const travel = 650 * s.age;
      for (let i = 0; i < 9; i++) {
        const lag = i * 55;
        const x = s.x + s.dx * (travel - lag) + Math.sin(this.clock * 3 + i) * 20;
        const y = s.y + s.dy * (travel - lag) + Math.cos(this.clock * 4 + i * 2) * 26 + (i % 3) * 22;
        const flap = Math.sin(this.clock * 30 + i) * 5;
        g.moveTo(x - 15, y + flap).lineTo(x - 6, y - 3).lineTo(x, y + 3).lineTo(x + 6, y - 3).lineTo(x + 15, y + flap);
        g.stroke({ width: 3.5, color: 0x1a1222, join: 'round', cap: 'round' });
      }
      if (travel > view.w + 900) this.swarm = null;
    }
    // Ghosts: little sheets drifting in slow loops round the plaza, fading in and out.
    for (const gh of this.ghosts) {
      const t = this.clock * gh.speed + gh.phase;
      const x = gh.cx + Math.sin(t) * 260;
      const y = gh.cy + Math.sin(t * 1.7) * 120 - 50;
      if (!onScreen(x, y)) continue;
      const a = 0.4 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.8));
      const bob = Math.sin(this.clock * 2.4 + gh.phase) * 5;
      const lean = Math.cos(t) * 0.25;
      const body: number[] = [];
      for (let k = 0; k <= 10; k++) {
        const ang = Math.PI + (k / 10) * Math.PI;
        body.push(x + Math.cos(ang) * 24, y + bob - 14 + Math.sin(ang) * 24);
      }
      for (let k = 0; k <= 4; k++) body.push(x + 24 - k * 12 + lean * 14, y + bob + 20 + (k % 2 ? -7 : 3));
      g.poly(body).fill({ color: 0xe8f4ff, alpha: a }).stroke({ width: 1.5, color: 0xb8d8ff, alpha: a * 0.8 });
      g.ellipse(x - 7, y + bob - 16, 3.2, 4.5).fill({ color: 0x1a1a2a, alpha: Math.min(1, a * 1.5) });
      g.ellipse(x + 7, y + bob - 16, 3.2, 4.5).fill({ color: 0x1a1a2a, alpha: Math.min(1, a * 1.5) });
      g.ellipse(x, y + bob - 6, 3, 4).fill({ color: 0x1a1a2a, alpha: a });
    }
  }

  private takeOff(f: Flock, fromX: number, fromY: number): void {
    // Away from the trouble, to the roost furthest from it among a few.
    let best = f.roost;
    let bestD = -1;
    for (let i = 0; i < this.roosts.length; i++) {
      if (i === f.roost || this.flocks.some((o) => o !== f && o.roost === i)) continue;
      const d = Math.hypot(this.roosts[i].x - fromX, this.roosts[i].y - fromY) - Math.hypot(this.roosts[i].x - f.x, this.roosts[i].y - f.y) * 0.5;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    f.roost = best;
    f.tx = this.roosts[best].x;
    f.ty = this.roosts[best].y;
    f.flying = true;
  }

  update(dt: number, ents: Iterable<EntitySnap>, view: { x: number; y: number; w: number; h: number }): void {
    this.clock += dt;
    const g = this.container.clear();
    const walkers = [...ents].filter((e) => !e.dead && (e.k === 'champion' || e.k === 'chud' || e.k === 'monster'));
    const onScreen = (x: number, y: number, pad = 300) => Math.abs(x - view.x) < view.w / 2 + pad && Math.abs(y - view.y) < view.h / 2 + pad;

    for (const f of this.flocks) {
      if (!f.flying) {
        f.restless -= dt;
        // Someone walking right under them, or they've just had enough of this tree.
        const close = walkers.find((w) => Math.hypot(w.x - f.x, w.y - f.y) < 260);
        if (close) this.takeOff(f, close.x, close.y);
        else if (f.restless <= 0) {
          f.restless = 40 + Math.random() * 60;
          this.takeOff(f, f.x, f.y);
        }
        continue; // perched up in the canopy, out of sight
      }
      const dx = f.tx - f.x;
      const dy = f.ty - f.y;
      const d = Math.hypot(dx, dy);
      if (d < 20) {
        f.flying = false;
        continue;
      }
      const speed = 420;
      f.x += (dx / d) * Math.min(d, speed * dt);
      f.y += (dy / d) * Math.min(d, speed * dt);
      if (!onScreen(f.x, f.y)) continue;
      // Climbing out of the trees and settling back down: further apart and higher up mid-flight.
      const lift = Math.min(1, d / 400);
      for (const b of f.birds) {
        const x = f.x + b.dx * (1 + lift * 0.6) + Math.sin(this.clock * 2 + b.phase) * 8;
        const y = f.y + b.dy * (1 + lift * 0.6) + Math.cos(this.clock * 1.7 + b.phase) * 6;
        const flap = Math.sin(this.clock * 18 + b.phase) * 6;
        // A shadow on the ground below, further off the higher they are.
        g.moveTo(x - 10 + 40 * lift, y + flap + 60 * lift).lineTo(x + 40 * lift, y + 60 * lift).lineTo(x + 10 + 40 * lift, y + flap + 60 * lift);
        g.stroke({ width: 3, color: 0x000000, alpha: 0.2, join: 'round' });
        // Dark wings with a pale edge, so they show against the trees and the night.
        g.moveTo(x - 11, y + flap).lineTo(x, y).lineTo(x + 11, y + flap).stroke({ width: 5, color: 0xc8beb0, alpha: 0.55, join: 'round', cap: 'round' });
        g.moveTo(x - 11, y + flap).lineTo(x, y).lineTo(x + 11, y + flap).stroke({ width: 3, color: INK, join: 'round', cap: 'round' });
      }
    }

    // Frogs: sit by the water; hop in when anything comes near, and come back later.
    for (const fr of this.frogs) {
      if (fr.gone > 0) {
        fr.gone -= dt;
        continue;
      }
      if (fr.hop < 0 && walkers.some((w) => Math.hypot(w.x - fr.home.x, w.y - fr.home.y) < 220)) fr.hop = 0;
      let x = fr.home.x;
      let y = fr.home.y;
      let size = 1;
      if (fr.hop >= 0) {
        fr.hop += dt / 0.45;
        x += fr.dir.x * 90 * fr.hop;
        y += fr.dir.y * 90 * fr.hop - Math.sin(Math.min(1, fr.hop) * Math.PI) * 30;
        size = 1 + Math.sin(Math.min(1, fr.hop) * Math.PI) * 0.4;
        if (fr.hop >= 1) {
          // Splash: gone under for a while.
          fr.hop = -1;
          fr.gone = 12 + Math.random() * 10;
          continue;
        }
      }
      if (!onScreen(x, y)) continue;
      g.ellipse(fr.home.x + fr.dir.x * 90 * Math.max(0, fr.hop), fr.home.y + fr.dir.y * 90 * Math.max(0, fr.hop) + 4, 8, 4).fill({ color: 0x000000, alpha: 0.2 });
      g.ellipse(x, y, 8 * size, 6 * size).fill(0x5a8a3a).stroke({ width: 1.5, color: INK });
      g.circle(x - 3 * size + fr.dir.x * 4, y - 4 * size + fr.dir.y * 3, 2 * size).fill(0xe8f0c0);
      g.circle(x + 3 * size + fr.dir.x * 4, y - 4 * size + fr.dir.y * 3, 2 * size).fill(0xe8f0c0);
    }

    if (this.haunted) this.hollowLife(g, dt, walkers, view, onScreen);

    // Bats: out at night, flitting round the lanterns.
    if (this.night > 0.35) {
      const alpha = Math.min(1, (this.night - 0.35) * 3);
      for (const b of this.bats) {
        const l = this.lanterns[b.lantern];
        if (!l || !onScreen(l.x, l.y)) continue;
        const t = this.clock * b.speed + b.phase;
        const x = l.x + Math.cos(t) * b.radius + Math.sin(t * 2.7) * 18;
        const y = l.y - 60 + Math.sin(t * 1.3) * b.radius * 0.6 + Math.cos(t * 3.1) * 12;
        const flap = Math.sin(this.clock * 32 + b.phase) * 4;
        g.moveTo(x - 9, y + flap).lineTo(x - 4, y - 2).lineTo(x, y + 2).lineTo(x + 4, y - 2).lineTo(x + 9, y + flap);
        g.stroke({ width: 2.5, color: 0x241a2e, alpha, join: 'round', cap: 'round' });
      }
    }
  }
}
