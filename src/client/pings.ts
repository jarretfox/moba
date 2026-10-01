import type { PingKind } from '../shared/protocol';

// Pings: hold Alt (or G) and click to mark a spot for your team. Drag before letting go to pick which
// kind from a little wheel: up for danger, right for on my way, down for enemy missing, left for help.

export const PINGS: Record<PingKind, { label: string; glyph: string; color: number }> = {
  look: { label: 'Look here', glyph: '◎', color: 0xffd166 },
  danger: { label: 'Danger!', glyph: '!', color: 0xff5a5f },
  omw: { label: 'On my way', glyph: '»', color: 0x5aa9ff },
  missing: { label: 'Enemy missing', glyph: '?', color: 0xffb03a },
  assist: { label: 'Need help', glyph: '+', color: 0x7cf29a },
};

/** Screen pixels the mouse has to move before a drag picks a direction on the wheel. */
const DEAD_ZONE = 22;

/** Which ping a drag from where the button went down picks: no real drag is "look here". */
export function pingFromDrag(dx: number, dy: number): PingKind {
  if (Math.hypot(dx, dy) < DEAD_ZONE) return 'look';
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'omw' : 'assist';
  return dy < 0 ? 'danger' : 'missing';
}

const SPOTS: [PingKind, number, number][] = [
  ['danger', 0, -1],
  ['omw', 1, 0],
  ['missing', 0, 1],
  ['assist', -1, 0],
  ['look', 0, 0],
];

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** The wheel that shows while you hold the button down, with the current pick lit up. */
export class PingWheel {
  private readonly el = document.createElement('div');
  private readonly items = new Map<PingKind, HTMLElement>();
  private origin: { x: number; y: number } | null = null;

  constructor(parent: HTMLElement) {
    this.el.className = 'ping-wheel';
    this.el.hidden = true;
    for (const [kind, dx, dy] of SPOTS) {
      const item = document.createElement('div');
      item.className = 'ping-item';
      item.style.setProperty('--c', css(PINGS[kind].color));
      item.style.transform = `translate(calc(-50% + ${dx * 88}px), calc(-50% + ${dy * 52}px))`;
      const glyph = document.createElement('b');
      glyph.textContent = PINGS[kind].glyph;
      const label = document.createElement('span');
      label.textContent = PINGS[kind].label;
      item.append(glyph, label);
      this.el.append(item);
      this.items.set(kind, item);
    }
    parent.append(this.el);
  }

  get open(): boolean {
    return this.origin !== null;
  }

  start(x: number, y: number): void {
    this.origin = { x, y };
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.hidden = false;
    this.move(x, y);
  }

  move(x: number, y: number): void {
    if (!this.origin) return;
    const pick = pingFromDrag(x - this.origin.x, y - this.origin.y);
    for (const [kind, item] of this.items) item.classList.toggle('on', kind === pick);
  }

  /** Closes the wheel and says what was picked (null if it wasn't open). */
  finish(x: number, y: number): PingKind | null {
    if (!this.origin) return null;
    const kind = pingFromDrag(x - this.origin.x, y - this.origin.y);
    this.origin = null;
    this.el.hidden = true;
    return kind;
  }
}
