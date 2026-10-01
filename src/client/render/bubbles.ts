import { Container, Graphics, Text } from 'pixi.js';
import type { EntitySnap } from '../../shared/protocol';

// Speech bubbles over champions' heads: emotes and kill quips. One per champion (a new line replaces the
// last); they follow their speaker around and hide when the speaker can't be seen.

const FONT = "'Nunito', system-ui, sans-serif";
/** Seconds a bubble stays up. */
const LIFE = 2.8;

interface Bubble {
  box: Container;
  age: number;
}

export class Bubbles {
  readonly container = new Container();
  private readonly bubbles = new Map<number, Bubble>();

  say(id: number, text: string, color: number): void {
    this.bubbles.get(id)?.box.destroy({ children: true });
    const box = new Container();
    const label = new Text({ text, style: { fontFamily: FONT, fontSize: 17, fontWeight: '800', fill: 0x1a1408, wordWrap: true, wordWrapWidth: 220, align: 'center' } });
    label.anchor.set(0.5, 1);
    const w = label.width + 26;
    const h = label.height + 14;
    const g = new Graphics()
      .roundRect(-w / 2, -h - 12, w, h, 12)
      .fill(0xfdf6e3)
      .stroke({ width: 3, color })
      .poly([-9, -13, 9, -13, 0, 0])
      .fill(0xfdf6e3);
    g.moveTo(-9, -12).lineTo(0, 0).lineTo(9, -12).stroke({ width: 3, color });
    label.position.set(0, -19);
    box.addChild(g, label);
    this.container.addChild(box);
    this.bubbles.set(id, { box, age: 0 });
  }

  update(dt: number, ents: ReadonlyMap<number, EntitySnap>): void {
    for (const [id, b] of this.bubbles) {
      b.age += dt;
      const e = ents.get(id);
      if (b.age >= LIFE || !e || e.dead) {
        b.box.destroy({ children: true });
        this.bubbles.delete(id);
        continue;
      }
      // Pops in, floats a touch, fades out.
      const pop = Math.min(1, b.age / 0.12);
      b.box.scale.set(0.6 + 0.4 * pop + (pop < 1 ? 0 : Math.max(0, 0.08 - b.age * 0.3)));
      b.box.alpha = b.age > LIFE - 0.4 ? (LIFE - b.age) / 0.4 : 1;
      b.box.position.set(e.x, e.y - e.r - 48 - b.age * 4);
    }
  }
}
