import { buildFor } from '../render/costumes';
import { Application, Graphics } from 'pixi.js';
import type { ChampionId } from '../../shared/champions/types';
import { FIDGETS, castAnim, sample, type Anim } from '../render/animation';
import { palette } from '../render/champions';
import { Rig } from '../render/rig';

// The champion you're looking at in champion select, standing in the showcase as themselves: breathing,
// blinking, fidgeting now and then, spinning round into a new look when you pick one, and striking their
// ultimate's pose with a grin when you lock them in. A little renderer of its own, just for this.

const TAU = Math.PI * 2;
/** A spin, for showing off a new look. */
const TWIRL: Anim = { dur: 0.55, twist: [[0, 0], [1, TAU]], grow: [[0, 0], [0.5, 0.06], [1, 0]] };

export class ChampionStage {
  readonly canvas = document.createElement('canvas');
  private readonly app = new Application();
  private readonly shadow = new Graphics();
  private rig: Rig | null = null;
  private champ: ChampionId | null = null;
  private skin = 0;
  private started = false;
  private anim: { a: Anim; t: number } | null = null;
  private idle = 0;
  private nextFidget = 2.5;
  private fidgets = 0;
  private grin = 0;

  constructor(private readonly size = 200) {
    this.canvas.className = 'showcase-figure';
    void this.app
      .init({ canvas: this.canvas, width: size, height: size, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true })
      .then(() => {
        this.started = true;
        this.shadow.ellipse(size / 2, size - 20, 46, 12).fill({ color: 0x000000, alpha: 0.35 });
        this.app.stage.addChild(this.shadow);
        this.app.ticker.add((t) => this.tick(t.deltaMS / 1000));
        if (this.champ) this.build();
      })
      .catch(() => undefined);
  }

  /** Puts a champion on the stage in a look; `flourish` spins them round into it. */
  show(id: ChampionId, skin: number, flourish = false): void {
    if (id === this.champ && skin === this.skin && this.rig) return;
    const fresh = id !== this.champ;
    this.champ = id;
    this.skin = skin;
    this.build();
    this.anim = flourish ? { a: TWIRL, t: 0 } : null;
    if (fresh) {
      this.idle = 0;
      this.nextFidget = 2 + Math.random() * 2;
      this.grin = 0;
    }
  }

  /** Locked in: their ultimate's pose, and a grin. */
  cheer(): void {
    if (!this.champ) return;
    this.anim = { a: castAnim(this.champ, 3), t: 0 };
    this.grin = 1.6;
  }

  destroy(): void {
    if (this.started) this.app.destroy({ removeView: true }, { children: true });
    this.started = false;
  }

  private build(): void {
    if (!this.started || !this.champ) return;
    this.rig?.root.destroy({ children: true });
    // Drawn big, so it's crisp; scaled to stand in the ring.
    const rig = new Rig(buildFor(this.champ, this.skin), 60, palette(this.champ, this.skin));
    const k = (this.size * 0.72) / rig.height;
    rig.root.scale.set(k);
    rig.root.position.set(this.size / 2 - 6, this.size - 20);
    this.app.stage.addChild(rig.root);
    this.rig = rig;
    this.pose(0);
  }

  private tick(dt: number): void {
    if (!this.rig || !this.champ) return;
    this.grin = Math.max(0, this.grin - dt);
    if (!this.anim) {
      this.idle += dt;
      if (this.idle > this.nextFidget) {
        const list = FIDGETS[this.champ];
        this.anim = { a: list[this.fidgets++ % list.length], t: 0 };
        this.idle = 0;
        this.nextFidget = 3 + Math.random() * 3;
      }
    }
    this.pose(dt);
  }

  private pose(dt: number): void {
    const rig = this.rig!;
    let a: Anim | null = null;
    let t = 0;
    if (this.anim) {
      this.anim.t += dt / this.anim.a.dur;
      if (this.anim.t >= 1) this.anim = null;
      else ({ a, t } = this.anim);
    }
    rig.update({
      dt,
      speed: 0,
      facing: 1,
      turn: sample(a?.turn, t),
      reach: sample(a?.reach, t),
      twist: sample(a?.twist, t),
      lunge: sample(a?.lunge, t),
      grow: sample(a?.grow, t),
      stretch: sample(a?.stretch, t),
      air: 0,
      expression: this.grin > 0 ? 'grin' : null,
    });
  }
}
