import { Container, Graphics, Text } from 'pixi.js';
import { UNIT_BUILDS, unitPalette } from './builds';
import { inkLine, inked } from './organic';
import { Rig } from './rig';
import { PALETTE } from './views';

// While the Warden is awake, a little Warden hangs off the top of the screen on his chain, where the game
// meets the browser: swinging, kicking his boots, rattling the chain and taunting you. Click him and he
// laughs. When he's slain the chain snaps and he drops out of sight; a warning before he wakes, he peeks
// in from above.

/** How tall he hangs on screen (pixels). */
const R = 30;
/** Where his chain is fixed, as a share of the screen's width (left of the clock, clear of the scoreboard). */
const ANCHOR_X = 0.2;

const TAUNTS = [
  'Come down to the pit, bloke.',
  'I can see you up there.',
  'The cage is open. Walk in.',
  'Bring friends. Bring all of them.',
  "I've had worse prisoners.",
  'Rattle rattle.',
  'Tick tock. Still here.',
  'Your Chuds would make fine prisoners.',
  'Is that the best your lot have got?',
  'I hold the keys to this whole map.',
  'Willmore... I remember you.',
  "The Deep can't hide you, HunnaG.",
];
const POKED = ['Oi! Hands off.', 'Ha! Do that in the pit.', 'Poke me again. I dare you.', 'HAHAHA.'];
const PEEK = ['Not long now...', 'Is it time yet?', "I'm nearly awake..."];

type State = 'gone' | 'peek' | 'awake' | 'falling';

export class WardenDangle {
  /** In screen space, over the game picture. */
  readonly container = new Container();
  private readonly chain = new Graphics();
  private readonly clamp = new Graphics();
  private readonly body = new Container();
  /** A soft pale glow behind him, so the dark iron reads against the trees. */
  private readonly halo = new Graphics();
  private bubbleW = 0;
  private readonly rig = new Rig(UNIT_BUILDS['monster:warden'], R, unitPalette(PALETTE.neutral));
  private readonly bubble = new Container();
  private readonly bubbleG = new Graphics();
  private readonly bubbleText = new Text({ text: '', style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 14, fill: 0x1a1414, wordWrap: true, wordWrapWidth: 170, align: 'center' } });
  private state: State = 'gone';
  private clock = 0;
  /** How far down he's let himself, 0 (out of sight above) to 1. */
  private drop = 0;
  /** The swing: angle and speed of the pendulum. */
  private angle = 0;
  private spin = 0;
  private fallY = 0;
  private fallV = 0;
  private sayUntil = 0;
  private nextTaunt = 6;
  private laugh = 0;
  private kick = 0;

  constructor() {
    for (let i = 0; i < 6; i++) {
      const k = 1 - i * 0.14;
      this.halo.ellipse(0, -this.rig.height * 0.5, R * 1.6 * k, this.rig.height * 0.8 * k).fill({ color: 0xdfe8ff, alpha: 0.045 });
    }
    this.body.addChild(this.halo, this.rig.root);
    this.bubbleText.anchor.set(0.5);
    this.bubble.addChild(this.bubbleG, this.bubbleText);
    this.bubble.visible = false;
    this.container.addChild(this.chain, this.clamp, this.body, this.bubble);
    this.container.visible = false;
    // Click him: he laughs and has a go at you.
    this.body.eventMode = 'static';
    this.body.cursor = 'pointer';
    this.body.on('pointerdown', () => {
      if (this.state !== 'awake') return;
      this.laugh = 1.2;
      this.spin += 1.6;
      this.say(POKED[Math.floor(Math.random() * POKED.length)]);
    });
  }

  /** `alive`: he's awake in his pit; `wakesIn`: seconds until he wakes, if known. */
  update(dt: number, screenW: number, alive: boolean, wakesIn: number | undefined): void {
    this.clock += dt;
    const was = this.state;
    if (alive) this.state = 'awake';
    else if (was === 'awake') {
      // He's been slain: the chain snaps and down he goes.
      this.state = 'falling';
      this.fallY = 0;
      this.fallV = -160;
      this.say('NOOOO—');
    } else if (was !== 'falling') this.state = wakesIn !== undefined && wakesIn <= 20 ? 'peek' : 'gone';
    if (this.state === 'peek' && was !== 'peek') this.say(PEEK[Math.floor(Math.random() * PEEK.length)]);
    if (this.state === 'awake' && was !== 'awake') {
      this.say("I'M AWAKE. Come and get me.");
      this.spin += 2;
      this.nextTaunt = this.clock + 9;
    }

    const target = this.state === 'awake' ? 1 : this.state === 'peek' ? 0.32 : 0;
    // Lowering: quick with a bounce on the chain; pulling back up: slower.
    this.drop += (target - this.drop) * Math.min(1, dt * (target > this.drop ? 3.5 : 1.5));
    if (this.state === 'falling') {
      this.fallV += 1400 * dt;
      this.fallY += this.fallV * dt;
      if (this.fallY > 900) {
        this.state = 'gone';
        this.drop = 0;
      }
    }
    this.container.visible = this.state !== 'gone' || this.drop > 0.02;
    if (!this.container.visible) return;

    // The pendulum: a slow lazy swing he keeps going, a kick of his boots now and then.
    const gust = Math.sin(this.clock * 0.7) * 0.05;
    this.spin += (-this.angle * 6 + gust * 4) * dt;
    this.spin *= 1 - dt * 0.35;
    this.angle += this.spin * dt;
    this.kick = Math.max(0, this.kick - dt * 2);
    if (this.state === 'awake' && Math.random() < dt * 0.15) {
      this.kick = 1;
      this.spin += (Math.random() < 0.5 ? -1 : 1) * 0.5;
    }
    if (this.state === 'awake' && this.clock >= this.nextTaunt) {
      this.say(TAUNTS[Math.floor(Math.random() * TAUNTS.length)]);
      this.nextTaunt = this.clock + 11 + Math.random() * 9;
    }
    this.laugh = Math.max(0, this.laugh - dt);

    const ax = Math.round(screenW * ANCHOR_X);
    const len = 70 + 40 * this.drop;
    const snapped = this.state === 'falling';
    // Where he hangs: the end of the chain, swung by the angle; pulled up out of sight when not dropped.
    const hide = (1 - this.drop) * (len + this.rig.height + 30);
    const hx = ax + Math.sin(this.angle) * len;
    const hy = Math.cos(this.angle) * len - hide + (snapped ? this.fallY : 0);
    this.body.position.set(hx, hy + this.rig.height);
    this.body.rotation = this.angle * 0.6 + (snapped ? this.fallY * 0.004 : 0);
    // Both arms straight up to the chain (an arm's angle points along the screen: −π/2 is straight up).
    const hanging = { armF: [-1.62, 0.12] as const, armB: [-1.5, 0.18] as const, look: this.laugh > 0 ? -0.3 : 0.25, weight: 1 };
    this.rig.update({
      dt,
      speed: this.kick > 0 ? 160 : 0,
      facing: this.spin > 0.2 ? 1 : this.spin < -0.2 ? -1 : Math.sin(this.clock * 0.3) > 0 ? 1 : -1,
      turn: 0,
      reach: 0,
      twist: 0,
      lunge: 0,
      grow: this.laugh > 0 ? Math.sin(this.clock * 30) * 0.03 : 0,
      stretch: 0.04,
      air: 0.12,
      vx: this.spin * 60,
      expression: this.laugh > 0 || this.state === 'peek' ? 'grin' : snapped ? 'hurt' : null,
      posture: hanging,
    });

    // The chain from the top edge to his fists, and the iron clamp biting the edge of the screen.
    const c = this.chain.clear();
    const top = -6;
    const endX = hx;
    const endY = snapped ? Math.min(len * 0.6, len) - hide : hy + 6;
    const links = 9;
    for (let i = 0; i < links; i++) {
      const t = (i + 0.5) / links;
      const x = ax + (endX - ax) * t;
      const y = top + (endY - top) * t;
      if (snapped && t > 0.6) break;
      c.ellipse(x, y, i % 2 ? 3 : 5, i % 2 ? 6 : 4).stroke({ width: 3, color: 0x8a9099 }).stroke({ width: 1, color: 0x2c3038 });
    }
    const k = this.clamp.clear();
    inked(k, [ax - 22, -4, ax + 22, -4, ax + 16, 12, ax + 6, 16, ax - 6, 16, ax - 16, 12], 0x4a4f58, 2.5, 0x14161a);
    for (const x of [-12, 12]) k.circle(ax + x, 5, 2.5).fill(0x9aa1ab);
    inkLine(k, ax - 18, 2, ax + 18, 2, 1.5, { color: 0x14161a, alpha: 0.6 }, 0);

    // His speech bubble, beside him on the side with more room.
    const now = this.clock;
    this.bubble.visible = now < this.sayUntil;
    if (this.bubble.visible) {
      // Off to his right, its tail pointing back at him.
      const bx = hx + R * 1.4 + 16 + this.bubbleW / 2;
      const by = Math.max(30, hy + this.rig.height * 0.35);
      this.bubble.position.set(bx, by);
      this.bubble.alpha = Math.min(1, (this.sayUntil - now) * 3);
    }
  }

  /** Puts a line in his bubble for a few seconds. */
  private say(line: string): void {
    this.bubbleText.text = line;
    const w = Math.min(190, this.bubbleText.width + 20);
    this.bubbleW = w;
    const h = this.bubbleText.height + 14;
    this.bubbleG
      .clear()
      .roundRect(-w / 2, -h / 2, w, h, 10)
      .fill(0xfff6e0)
      .stroke({ width: 2.5, color: 0x1a1414 })
      .poly([-w / 2 + 6, 2, -w / 2 - 16, 10, -w / 2 + 8, 10])
      .fill(0xfff6e0)
      .stroke({ width: 2.5, color: 0x1a1414 });
    this.sayUntil = this.clock + 3.6;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
