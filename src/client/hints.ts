import { onSettings, settings } from './settings';
import { el } from './ui/dom';

// Tips for someone's first matches: one at a time, each shown once (remembered in the browser), each
// gone as soon as it's been followed. Settings can turn them off, or back on from the start.

export type HintId = 'shop' | 'move' | 'skill' | 'cast' | 'shootie' | 'recall' | 'scoreboard' | 'ping';

/** What the tips need to know about the match, gathered each frame. */
export interface HintContext {
  /** Match seconds. */
  time: number;
  inShop: boolean;
  gold: number;
  items: number;
  shopOpened: boolean;
  moved: boolean;
  /** Unspent skill points, abilities learned, and casts made so far. */
  points: number;
  learned: number;
  casts: number;
  /** Health as a share of max. */
  hp: number;
  dead: boolean;
  recalling: boolean;
  /** Close to an enemy Shootie with none of your Chuds near it. */
  shootieAlone: boolean;
}

interface Hint {
  id: HintId;
  /** Markup (written here, never from players). */
  text: string;
  when: (c: HintContext) => boolean;
  done: (c: HintContext) => boolean;
  /** Something on screen to make glow while it's up. */
  points?: string;
}

const HINTS: readonly Hint[] = [
  {
    id: 'shop',
    text: 'You start with gold. Press <kbd>P</kbd> to buy something from Old Wick before you head out.',
    when: (c) => c.inShop && c.items === 0 && c.gold >= 300 && !c.dead,
    done: (c) => c.shopOpened || c.items > 0,
    points: '.purse',
  },
  {
    id: 'move',
    text: '<kbd>Right-click</kbd> the ground to move. Right-click an enemy to attack it.',
    when: (c) => !c.moved && !c.dead,
    done: (c) => c.moved,
  },
  {
    id: 'skill',
    text: 'A skill point! Click a <b>+</b> over your abilities, or press <kbd>Shift</kbd> + <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd>.',
    when: (c) => c.points > 0,
    done: (c) => c.points === 0,
    points: '.slot .up',
  },
  {
    id: 'cast',
    text: 'Hold <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> or <kbd>R</kbd> to aim, and let go to cast.',
    when: (c) => c.learned > 0 && c.casts === 0 && !c.dead,
    done: (c) => c.casts > 0,
  },
  {
    id: 'shootie',
    text: 'Enemy Shooties hit hard. Let your Chuds walk in first and soak the shots.',
    when: (c) => c.shootieAlone && !c.dead,
    done: (c) => !c.shootieAlone,
  },
  {
    id: 'recall',
    text: 'Low on health? Press <kbd>B</kbd> to recall home and heal up.',
    when: (c) => c.hp < 0.35 && !c.dead && !c.inShop,
    done: (c) => c.recalling || c.dead || c.hp > 0.6,
  },
  {
    id: 'scoreboard',
    text: 'While you wait, hold <kbd>Tab</kbd> for the scoreboard, or press <kbd>Space</kbd> to watch a teammate.',
    when: (c) => c.dead,
    done: (c) => !c.dead,
  },
  {
    id: 'ping',
    text: 'Hold <kbd>Alt</kbd> or <kbd>G</kbd> and click to ping your team. Drag to pick which ping.',
    when: (c) => c.time > 150 && !c.dead,
    done: () => false,
  },
];

/** The first tip, in order, that hasn't been seen and fits the moment. */
export function nextHint(c: HintContext, seen: ReadonlySet<HintId>): HintId | null {
  return HINTS.find((h) => !seen.has(h.id) && h.when(c) && !h.done(c))?.id ?? null;
}

/** Whether a tip has been followed (or stopped mattering). */
export function hintDone(id: HintId, c: HintContext): boolean {
  return HINTS.find((h) => h.id === id)!.done(c);
}

const KEY = 'moba.tipsSeen';
/** Seconds a tip stays up at most, and the gap before the next one. */
const SHOW_FOR = 14;
const GAP = 4;

export class Tips {
  private readonly box: HTMLElement;
  private readonly text: HTMLElement;
  private seen: Set<HintId>;
  private current: { id: HintId; at: number } | null = null;
  private quietUntil = 0;
  private on = settings.tips;
  /** Called as a tip appears (for a soft chime). */
  onShow?: () => void;

  constructor(private readonly root: HTMLElement) {
    this.seen = load();
    this.box = el('div', 'tip');
    this.box.hidden = true;
    this.text = el('div', 'tip-text');
    const ok = el('button', 'tip-ok', 'Got it');
    ok.addEventListener('click', () => this.finish(performance.now() / 1000));
    this.box.append(el('span', 'tip-mark', '!'), this.text, ok);
    root.append(this.box);
    onSettings((s) => {
      // Switching tips back on starts them over.
      if (s.tips && !this.on) {
        this.seen = new Set();
        save(this.seen);
      }
      this.on = s.tips;
      if (!s.tips) this.finish(0);
    });
  }

  /** The match is over: put away whatever tip is up. */
  hide(): void {
    this.finish(Infinity);
  }

  update(c: HintContext, t: number): void {
    if (!this.on) return;
    if (this.current) {
      if (hintDone(this.current.id, c) || t - this.current.at > SHOW_FOR) this.finish(t);
      return;
    }
    if (t < this.quietUntil) return;
    const id = nextHint(c, this.seen);
    if (!id) return;
    this.current = { id, at: t };
    this.seen.add(id);
    save(this.seen);
    const hint = HINTS.find((h) => h.id === id)!;
    this.text.innerHTML = hint.text;
    this.box.hidden = false;
    this.box.animate([{ opacity: 0, transform: 'translate(-50%, 12px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 300, easing: 'ease-out' });
    if (hint.points) this.root.querySelectorAll(hint.points).forEach((e) => e.classList.add('tip-glow'));
    this.onShow?.();
  }

  private finish(t: number): void {
    if (!this.current) return;
    const hint = HINTS.find((h) => h.id === this.current!.id)!;
    if (hint.points) this.root.querySelectorAll(hint.points).forEach((e) => e.classList.remove('tip-glow'));
    this.current = null;
    this.box.hidden = true;
    this.quietUntil = t + GAP;
  }
}

function load(): Set<HintId> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(raw) ? (raw.filter((x) => typeof x === 'string') as HintId[]) : []);
  } catch {
    return new Set();
  }
}

function save(seen: Set<HintId>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // storage blocked: the tips just come back next visit
  }
}
