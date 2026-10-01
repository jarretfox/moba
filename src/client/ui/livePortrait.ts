import { Application } from 'pixi.js';
import type { ChampionId } from '../../shared/champions/types';
import { BUILDS } from '../render/builds';
import { palette } from '../render/champions';
import { Rig, type Expression } from '../render/rig';

// Your champion in the HUD's portrait, live: head and shoulders, breathing and blinking, glancing about,
// wincing when you're low, grinning after a kill or an ultimate, nodding off while you recall, X-ed out
// while you wait to respawn. A tiny renderer of its own.

export interface PortraitMood {
  /** Health left, 0–1. */
  health: number;
  dead: boolean;
  recalling: boolean;
}

const SIZE = 74;
const R = 40;

export class LivePortrait {
  readonly canvas = document.createElement('canvas');
  private readonly app = new Application();
  private started = false;
  private rig: Rig | null = null;
  private want: { id: ChampionId; skin: number } | null = null;
  private mood: PortraitMood = { health: 1, dead: false, recalling: false };
  private grin = 0;
  private clock = 0;

  constructor() {
    this.canvas.className = 'live';
    void this.app
      .init({ canvas: this.canvas, width: SIZE, height: SIZE, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true })
      .then(() => {
        this.started = true;
        this.app.ticker.add((t) => this.tick(t.deltaMS / 1000));
        if (this.want) this.show(this.want.id, this.want.skin);
      })
      .catch(() => undefined);
  }

  show(id: ChampionId, skin: number): void {
    this.want = { id, skin };
    if (!this.started) return;
    this.rig?.root.destroy({ children: true });
    const rig = new Rig(BUILDS[id], R, palette(id, skin));
    // Framed like the still portraits: head and shoulders, a little larger than life.
    const k = (SIZE * 0.86) / (rig.height * 0.62);
    rig.root.scale.set(k);
    rig.root.position.set(SIZE / 2 - SIZE * 0.06, 3 + rig.height * k);
    this.app.stage.addChild(rig.root);
    this.rig = rig;
  }

  set(mood: PortraitMood): void {
    this.mood = mood;
  }

  /** A grin: a kill, an ultimate. */
  smile(seconds = 1.6): void {
    this.grin = seconds;
  }

  private tick(dt: number): void {
    if (!this.rig) return;
    this.clock += dt;
    this.grin = Math.max(0, this.grin - dt);
    const { health, dead, recalling } = this.mood;
    // Low on health, the wince comes and goes.
    const wincing = health < 0.3 && Math.sin(this.clock * 3) > 0.2;
    const face: Expression = dead ? 'ko' : recalling ? 'sleep' : this.grin > 0 ? 'grin' : wincing ? 'hurt' : null;
    this.rig.update({
      dt,
      speed: 0,
      facing: 1,
      turn: 0,
      reach: 0,
      twist: 0,
      lunge: 0,
      grow: 0,
      stretch: 0,
      air: 0,
      look: dead ? 0.4 : recalling ? 0.3 : Math.sin(this.clock * 0.7) * 0.15,
      expression: face,
    });
  }
}
