import { Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import type { MapData } from '../../shared/map/mapData';
import type { EntitySnap } from '../../shared/protocol';

// Dusk over the map. Each frame a small "light map" is drawn: the dim evening color everywhere, cloud
// shadows drifting over it, and soft pools of light around champions, Chuds, structures, glowing monsters,
// projectiles and spells. Laid over the world with multiply, it darkens what's far from any light and
// leaves lit things as they are. Spell glows draw above it, so magic shines in the dark.

export interface Light {
  x: number;
  y: number;
  r: number;
  color: number;
  /** How strongly it lights its center, 0–1. */
  alpha: number;
}

/** The evening: everything unlit is multiplied by this. */
const AMBIENT = 0x9ba4c0;
/** The light map is drawn at this share of screen resolution; it's all soft gradients anyway. */
const RESOLUTION = 0.5;

const WARM = 0xffe6c0;
const ALLY = 0xa9ccff;
const ENEMY = 0xffb0a8;

/** What projectile looks give off: [color, radius]. */
const PROJECTILE_LIGHT: Record<string, [number, number]> = {
  bolt: [0x7fe3ff, 220],
  longshot: [0xff8a3d, 460],
  arrowHeavy: [0xffd166, 160],
  scepter: [0xffd166, 160],
  levy: [0xffd166, 150],
  spore: [0x8fd14f, 150],
  junk_sludge: [0x8fd14f, 120],
  shootie: [0xffffff, 200],
};

/** Monsters that glow: [color, radius, strength]. */
const MONSTER_LIGHT: Partial<Record<string, [number, number, number]>> = {
  emberToad: [0xff8a3d, 340, 0.75],
  glowcap: [0x6fd6ff, 360, 0.75],
  warden: [0x7fe3ff, 560, 0.6],
};

/** A soft round light, white so it can be tinted. */
function lightTexture(): Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

interface Cloud {
  x: number;
  y: number;
  size: number;
  sprite: Sprite;
}

export class Lighting {
  /** Lay this over the world (multiply). */
  readonly sprite: Sprite;
  private rt: RenderTexture;
  private readonly scene = new Container();
  private readonly ambient = new Graphics();
  /** Gets the camera's transform, so lights and clouds sit on the map. */
  private readonly world = new Container();
  private readonly clouds: Cloud[] = [];
  private readonly lights = new Container();
  private readonly pool: Sprite[] = [];
  private readonly texture = lightTexture();
  private readonly fixed: Light[];

  constructor(private readonly map: MapData) {
    this.rt = RenderTexture.create({ width: 16, height: 16, resolution: RESOLUTION });
    this.sprite = new Sprite(this.rt);
    this.sprite.blendMode = 'multiply';
    this.sprite.eventMode = 'none';
    this.lights.blendMode = 'add';
    this.scene.addChild(this.ambient, this.world);
    // Big slow cloud shadows, scattered over the map.
    for (let i = 0; i < 7; i++) {
      const sprite = new Sprite(this.texture);
      sprite.anchor.set(0.5);
      sprite.tint = 0x1a2030;
      sprite.alpha = 0.32;
      const size = 1600 + ((i * 577) % 1400);
      this.clouds.push({ x: ((i * 3739) % 100) / 100 * map.width, y: ((i * 6151) % 100) / 100 * map.height, size, sprite });
      this.world.addChild(sprite);
    }
    this.world.addChild(this.lights);
    // Lights that never move: the bases glow, and so does the Warden's seal.
    this.fixed = [
      ...map.ground.flatMap((p) => (p.style === 'base' && p.shape.type === 'circle' ? [{ x: p.shape.x, y: p.shape.y, r: p.shape.r * 1.6, color: WARM, alpha: 0.55 }] : [])),
      { x: map.width / 2, y: map.height / 2, r: 700, color: 0x8fd14f, alpha: 0.3 },
    ];
  }

  /** Redraws the light map for this frame. `world` is the game's world layer (for the camera transform). */
  update(renderer: Renderer, world: Container, screenW: number, screenH: number, dt: number, ents: Iterable<EntitySnap>, myTeam: number, extra: readonly Light[]): void {
    if (this.rt.width !== screenW || this.rt.height !== screenH) {
      this.rt.resize(screenW, screenH);
      this.ambient.clear().rect(0, 0, screenW, screenH).fill(AMBIENT);
    }
    this.world.position.copyFrom(world.position);
    this.world.scale.copyFrom(world.scale);

    // Clouds drift with the wind and come back around the other side.
    for (const c of this.clouds) {
      c.x += 22 * dt;
      c.y += 7 * dt;
      if (c.x - c.size > this.map.width + 600) c.x = -c.size - 600;
      if (c.y - c.size > this.map.height + 600) c.y = -c.size - 600;
      c.sprite.position.set(c.x, c.y);
      c.sprite.scale.set((c.size * 2) / this.texture.width, (c.size * 1.3) / this.texture.height);
    }

    // Only lights near the screen matter.
    const zoom = world.scale.x || 1;
    const left = -world.position.x / zoom;
    const top = -world.position.y / zoom;
    const right = left + screenW / zoom;
    const bottom = top + screenH / zoom;
    let used = 0;
    const put = (l: Light) => {
      if (l.x + l.r < left || l.x - l.r > right || l.y + l.r < top || l.y - l.r > bottom) return;
      let s = this.pool[used];
      if (!s) {
        s = new Sprite(this.texture);
        s.anchor.set(0.5);
        this.pool.push(s);
        this.lights.addChild(s);
      }
      s.visible = true;
      s.position.set(l.x, l.y);
      s.scale.set((l.r * 2) / this.texture.width);
      s.tint = l.color;
      s.alpha = l.alpha;
      used++;
    };
    for (const l of this.fixed) put(l);
    for (const e of ents) {
      if (e.dead) continue;
      const side = e.tm === myTeam ? ALLY : ENEMY;
      switch (e.k) {
        case 'champion':
          put({ x: e.x, y: e.y, r: 420, color: WARM, alpha: 0.6 });
          break;
        case 'chud':
        case 'guard':
        case 'totem':
          put({ x: e.x, y: e.y, r: 170, color: WARM, alpha: 0.3 });
          break;
        case 'structure':
          put({ x: e.x, y: e.y, r: e.r * 3.4, color: side, alpha: 0.5 });
          break;
        case 'monster': {
          const m = MONSTER_LIGHT[e.mon ?? ''];
          put(m ? { x: e.x, y: e.y, r: m[1], color: m[0], alpha: m[2] } : { x: e.x, y: e.y, r: 160, color: WARM, alpha: 0.25 });
          break;
        }
        case 'projectile': {
          const p = PROJECTILE_LIGHT[e.vis ?? ''];
          if (p) put({ x: e.x, y: e.y, r: p[1], color: e.vis === 'shootie' ? side : p[0], alpha: 0.7 });
          break;
        }
        case 'pickup':
        case 'zone':
          put({ x: e.x, y: e.y, r: 140, color: 0xc9f59a, alpha: 0.35 });
          break;
      }
    }
    for (const l of extra) put(l);
    for (let i = used; i < this.pool.length; i++) this.pool[i].visible = false;

    renderer.render({ container: this.scene, target: this.rt, clear: true });
  }
}
