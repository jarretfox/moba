import { Graphics } from 'pixi.js';
import type { MapData } from '../../shared/map/mapData';
import { shapeContains } from '../../shared/map/shapes';

// Life in the background: fireflies drifting over the jungle, glints on the river, and rot spores rising
// from the Warden's seal. Pure decoration; one Graphics redrawn each frame.

type Kind = 'firefly' | 'glint' | 'spore';

interface Mote {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  phase: number;
}

const COUNTS: Record<Kind, number> = { firefly: 90, glint: 70, spore: 24 };

export class Ambience {
  readonly container = new Graphics();
  private readonly motes: Mote[] = [];

  constructor(private readonly map: MapData) {
    for (const kind of Object.keys(COUNTS) as Kind[]) {
      for (let i = 0; i < COUNTS[kind]; i++) {
        const m = this.spawn(kind);
        m.age = Math.random() * m.life; // start mid-life so they don't all blink in together
        this.motes.push(m);
      }
    }
  }

  update(dt: number): void {
    const g = this.container.clear();
    for (let i = 0; i < this.motes.length; i++) {
      let m = this.motes[i];
      m.age += dt;
      if (m.age >= m.life) m = this.motes[i] = this.spawn(m.kind);
      m.phase += dt;
      m.x += (m.vx + Math.sin(m.phase * 1.3) * 12) * dt;
      m.y += (m.vy + Math.cos(m.phase * 0.9) * 10) * dt;
      const t = m.age / m.life;
      const fade = Math.sin(t * Math.PI); // in and out over its life
      switch (m.kind) {
        case 'firefly': {
          const a = fade * (0.55 + 0.45 * Math.sin(m.phase * 6));
          g.circle(m.x, m.y, 7).fill({ color: 0xd9f27a, alpha: a * 0.18 });
          g.circle(m.x, m.y, 2.2).fill({ color: 0xf2ffb0, alpha: a });
          break;
        }
        case 'glint':
          g.moveTo(m.x - 9, m.y).lineTo(m.x + 9, m.y).stroke({ width: 2, color: 0xe6fbff, alpha: fade * 0.6 });
          break;
        case 'spore':
          g.circle(m.x, m.y, 3.5).fill({ color: 0xa6e86b, alpha: fade * 0.5 });
          break;
      }
    }
  }

  private spawn(kind: Kind): Mote {
    const map = this.map;
    for (let tries = 0; tries < 40; tries++) {
      let x: number;
      let y: number;
      if (kind === 'spore') {
        const a = Math.random() * Math.PI * 2;
        const d = Math.random() * 420;
        x = map.width / 2 + Math.cos(a) * d;
        y = map.height / 2 + Math.sin(a) * d;
      } else {
        x = Math.random() * map.width;
        y = Math.random() * map.height;
        const style = kind === 'glint' ? 'river' : 'jungle';
        if (!map.ground.some((p) => p.style === style && shapeContains(p.shape, x, y))) continue;
      }
      const life = kind === 'glint' ? 0.8 + Math.random() * 0.8 : 4 + Math.random() * 5;
      const drift = kind === 'spore' ? { vx: 0, vy: -18 } : kind === 'glint' ? { vx: 6, vy: 0 } : { vx: 0, vy: 0 };
      return { kind, x, y, ...drift, age: 0, life, phase: Math.random() * 10 };
    }
    return { kind, x: -9999, y: -9999, vx: 0, vy: 0, age: 0, life: 1, phase: 0 };
  }
}
