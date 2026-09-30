import { Container, Graphics, Text } from 'pixi.js';
import type { DamageType } from '../../shared/protocol';

interface Effect {
  obj: Container;
  age: number;
  life: number;
  /** t runs 0→1 over the effect's life. */
  tick(t: number): void;
}

const DAMAGE_COLORS: Record<DamageType, number> = {
  physical: 0xff9b3d,
  magic: 0xb57bff,
  true: 0xffffff,
};

/** Short-lived cosmetic effects. Nothing here feeds back into the game. */
export class FxLayer {
  readonly container = new Container();
  private effects: Effect[] = [];

  update(dt: number): void {
    for (const e of this.effects) {
      e.age += dt;
      e.tick(Math.min(1, e.age / e.life));
    }
    const done = this.effects.filter((e) => e.age >= e.life);
    if (!done.length) return;
    for (const e of done) e.obj.destroy();
    this.effects = this.effects.filter((e) => e.age < e.life);
  }

  damageNumber(x: number, y: number, amount: number, type: DamageType): void {
    const txt = new Text({
      text: String(amount),
      style: { fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: 22, fill: DAMAGE_COLORS[type], stroke: { color: 0x000000, width: 4 } },
    });
    txt.anchor.set(0.5);
    const drift = (Math.random() - 0.5) * 36;
    this.add(txt, 0.9, (t) => {
      txt.position.set(x + drift * t, y - 30 - t * 55);
      txt.scale.set(t < 0.12 ? 0.7 + t * 2.5 : 1);
      txt.alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
    });
  }

  clickMarker(x: number, y: number, attack: boolean): void {
    const g = new Graphics();
    const color = attack ? 0xff5a5f : 0x7cf29a;
    this.add(g, 0.35, (t) => {
      g.clear().circle(x, y, 8 + 26 * (1 - t)).stroke({ width: 3, color, alpha: 1 - t });
    });
  }

  /** Telegraph for a delayed shot: a line that tightens and brightens as it's about to fire. */
  aimLine(x: number, y: number, x2: number, y2: number, dur: number, friendly: boolean): void {
    const g = new Graphics();
    const color = friendly ? 0x7cc4ff : 0xff5a5f;
    this.add(g, dur, (t) => {
      g.clear()
        .moveTo(x, y)
        .lineTo(x2, y2)
        .stroke({ width: 26 * (1 - t) + 4, color, alpha: 0.12 + 0.35 * t });
    });
  }

  burst(x: number, y: number, color: number): void {
    const g = new Graphics();
    this.add(g, 0.4, (t) => {
      g.clear().circle(x, y, 20 + 70 * t).stroke({ width: 6 * (1 - t) + 1, color, alpha: 1 - t });
    });
  }

  streak(x: number, y: number, x2: number, y2: number): void {
    const g = new Graphics();
    this.add(g, 0.3, (t) => {
      g.clear().moveTo(x, y).lineTo(x2, y2).stroke({ width: 30 * (1 - t), color: 0xffffff, alpha: 0.25 * (1 - t) });
    });
  }

  healNumber(x: number, y: number, amount: number): void {
    const txt = new Text({
      text: `+${amount}`,
      style: { fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: 20, fill: 0x4ade80, stroke: { color: 0x000000, width: 4 } },
    });
    txt.anchor.set(0.5);
    this.add(txt, 0.9, (t) => {
      txt.position.set(x, y - 20 - t * 45);
      txt.alpha = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
    });
  }

  /** Gold you just earned, floating off whatever paid it. */
  goldNumber(x: number, y: number, amount: number): void {
    const txt = new Text({
      text: `+${amount}g`,
      style: { fontFamily: 'system-ui, sans-serif', fontWeight: '800', fontSize: 18, fill: 0xffd166, stroke: { color: 0x000000, width: 4 } },
    });
    txt.anchor.set(0.5);
    this.add(txt, 1.1, (t) => {
      txt.position.set(x, y - 10 - t * 40);
      txt.alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    });
  }

  /** A golden ring and a "LEVEL n" banner over your champion. */
  levelUp(x: number, y: number, r: number, level: number): void {
    this.shockwave(x, y, r * 3, 0xffd166, 0.6);
    const txt = new Text({
      text: `LEVEL ${level}`,
      style: { fontFamily: 'system-ui, sans-serif', fontWeight: '900', fontSize: 22, fill: 0xffe29a, stroke: { color: 0x000000, width: 5 }, letterSpacing: 2 },
    });
    txt.anchor.set(0.5);
    this.add(txt, 1.4, (t) => {
      txt.position.set(x, y - r - 40 - t * 30);
      txt.scale.set(t < 0.15 ? 0.6 + (t / 0.15) * 0.4 : 1);
      txt.alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
    });
  }

  /** A wedge that flashes and fades: Cleave. (x2, y2) is the tip of the swing; spread is in degrees. */
  wedge(x: number, y: number, x2: number, y2: number, spreadDeg: number, color: number): void {
    const g = new Graphics();
    const a = Math.atan2(y2 - y, x2 - x);
    const range = Math.hypot(x2 - x, y2 - y);
    const half = ((spreadDeg / 2) * Math.PI) / 180;
    this.add(g, 0.25, (t) => {
      g.clear()
        .moveTo(x, y)
        .arc(x, y, range * (0.7 + 0.3 * t), a - half, a + half)
        .closePath()
        .fill({ color, alpha: 0.45 * (1 - t) });
    });
  }

  /** A ring that sweeps out to `radius`: War Cry, landings. */
  shockwave(x: number, y: number, radius: number, color: number, life = 0.4): void {
    const g = new Graphics();
    this.add(g, life, (t) => {
      g.clear()
        .circle(x, y, radius * (0.3 + 0.7 * t))
        .fill({ color, alpha: 0.12 * (1 - t) })
        .stroke({ width: 8 * (1 - t) + 2, color, alpha: 1 - t });
    });
  }

  death(x: number, y: number, r: number): void {
    const g = new Graphics();
    this.add(g, 0.6, (t) => {
      g.clear().circle(x, y, r + 50 * t).fill({ color: 0xffffff, alpha: 0.25 * (1 - t) });
    });
  }

  private add(obj: Container, life: number, tick: (t: number) => void): void {
    tick(0);
    this.container.addChild(obj);
    this.effects.push({ obj, age: 0, life, tick });
  }
}
