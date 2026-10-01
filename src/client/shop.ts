import { PROFILES } from '../shared/bots/profiles';
import type { ChampionId } from '../shared/champions/types';
import { INVENTORY_SLOTS, ITEMS, ITEM_IDS, RECIPES, buildsInto, priceFor, sellPrice, statLines, whyNot, type ItemId, type ItemTier } from '../shared/items';
import type { MeSnap } from '../shared/protocol';
import { CHAMPION_INFO } from '../shared/champions/registry';
import { iconEl } from './render/icons';
import { el } from './ui/dom';
import { WICK_NAME } from './wick';

const TIERS: [ItemTier, string][] = [
  ['basic', 'Basics'],
  ['boots', 'Boots (one pair)'],
  ['core', 'Core'],
];

const STAT_ROWS: [keyof MeSnap['stats'], string, (v: number) => string][] = [
  ['ad', 'Attack damage', String],
  ['ap', 'Ability power', String],
  ['armor', 'Armor', String],
  ['mr', 'Magic resist', String],
  ['as', 'Attack speed', (v) => v.toFixed(2)],
  ['ms', 'Move speed', String],
  ['haste', 'Ability haste', String],
  ['ls', 'Lifesteal', (v) => `${v}%`],
];

/** What changed in an inventory: items that turned up (bought) and items that went (sold), with their slots. */
export function itemChanges(before: readonly ItemId[], after: readonly ItemId[]): { bought: { id: ItemId; slot: number }[]; sold: { id: ItemId; slot: number }[] } {
  const left = [...before];
  const bought: { id: ItemId; slot: number }[] = [];
  after.forEach((id, slot) => {
    const at = left.indexOf(id);
    if (at >= 0) left.splice(at, 1);
    else bought.push({ id, slot });
  });
  const sold = left.map((id) => ({ id, slot: before.lastIndexOf(id) }));
  return { bought, sold };
}

/** The stats that went up, as lines like "+25 Attack damage" (health too, when `hp` is given). */
export function statGains(before: MeSnap['stats'], after: MeSnap['stats'], hp?: [number, number]): { key: string; text: string }[] {
  const out: { key: string; text: string }[] = [];
  if (hp && hp[1] > hp[0]) out.push({ key: 'hp', text: `+${Math.round(hp[1] - hp[0])} Health` });
  for (const [key, label, fmt] of STAT_ROWS) {
    const d = after[key] - before[key];
    if (d > 0.001) out.push({ key, text: `+${fmt(Math.round(d * 100) / 100)} ${label}` });
  }
  return out;
}

const FOLD_KEY = 'moba.recFolded';

/** Old Wick's face for the shop's header: a hood, darkness, two eyes. */
const WICK_FACE = `<svg viewBox="0 0 40 40" width="44" height="44" aria-hidden="true"><defs><radialGradient id="wick-bg" cx="70%" cy="70%" r="75%"><stop offset="0" stop-color="#a66bff" stop-opacity=".75"/><stop offset="1" stop-color="#140f1c"/></radialGradient></defs><circle cx="20" cy="20" r="19" fill="url(#wick-bg)" stroke="#0b0f14" stroke-width="2"/><path d="M7 36 C7 21 11 8 21 6 C31 5 34 17 34 36 Z" fill="#1f1828" stroke="#0b0f14" stroke-width="1.5"/><path d="M29 12 C33 18 33 26 31 32" stroke="#a66bff" stroke-width="1.5" fill="none" opacity=".7"/><ellipse cx="21" cy="21" rx="8" ry="9.5" fill="#050308"/><path d="M12 25 h18 v6 h-18z" fill="#6e2a36" stroke="#0b0f14" stroke-width="1"/><g class="wick-eyes"><ellipse cx="18" cy="19" rx="1.8" ry="1.5" fill="#eedcff"/><ellipse cx="24" cy="19" rx="1.8" ry="1.5" fill="#eedcff"/></g></svg>`;

/** Why the shop would refuse `id`, judged from this client's copy of the state (the host checks again). */
export function cantBuy(me: MeSnap, id: ItemId): string | null {
  return whyNot(me.items, me.gold, me.inShop, id);
}

/** Whether `part` goes into `item`, however deep down. */
function inside(item: ItemId, part: ItemId): boolean {
  return (RECIPES[item] ?? []).some((p) => p === part || inside(p, part));
}

export interface Suggestions {
  /** The build in order, and whether each step is done (owned, or built into something owned). */
  steps: { id: ItemId; done: boolean }[];
  /** What to buy next: the next step if you can afford it, otherwise the best part of it you can. */
  next: ItemId | null;
  /** The step `next` is working toward (itself, or the item it's a part of). */
  toward: ItemId | null;
}

/** Old Wick's advice for a champion: their build, what's done, and what to buy now. */
export function suggest(build: readonly ItemId[], items: readonly ItemId[], gold: number): Suggestions {
  const has = (id: ItemId) => items.includes(id) || items.some((owned) => inside(owned, id));
  const steps = build.map((id) => ({ id, done: has(id) }));
  const toward = steps.find((s) => !s.done)?.id ?? null;
  if (!toward) return { steps, next: null, toward: null };
  if (gold >= priceFor(items, toward)) return { steps, next: toward, toward };
  // Can't afford it yet: the dearest part of it (or of its parts) that you're missing and can afford.
  const free = [...items];
  const missing: ItemId[] = [];
  const need = (id: ItemId) => {
    for (const p of RECIPES[id] ?? []) {
      const at = free.indexOf(p);
      if (at >= 0) free.splice(at, 1);
      else {
        missing.push(p);
        need(p);
      }
    }
  };
  need(toward);
  const next = missing.filter((p) => gold >= priceFor(items, p)).sort((a, b) => ITEMS[b].cost - ITEMS[a].cost)[0] ?? toward;
  return { steps, next, toward };
}

/** The item shop, opened with P or the gold button. Buying and selling send commands; the host decides. */
export class ShopPanel {
  readonly root: HTMLElement;
  private readonly cards = new Map<ItemId, HTMLElement>();
  private readonly invSlots: HTMLElement[] = [];
  private readonly stats = new Map<string, HTMLElement>();
  private readonly note: HTMLElement;
  private readonly goldEl: HTMLElement;
  private readonly wickLine: HTMLElement;
  private readonly costs = new Map<ItemId, HTMLElement>();
  private readonly advice: HTMLElement;
  private readonly undoButton: HTMLButtonElement;
  private champ: ChampionId | null = null;
  /** The recommended build folded down to its header. */
  private folded = (() => {
    try {
      return localStorage.getItem(FOLD_KEY) === '1';
    } catch {
      return false;
    }
  })();
  private lastKey = '';

  constructor(
    parent: HTMLElement,
    private readonly onBuy: (id: ItemId) => void,
    private readonly onSell: (slot: number) => void,
    private readonly onUndo: () => void = () => undefined,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'shop';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="shop-head"><span class="wick-face">${WICK_FACE}</span><div class="shop-who"><span class="shop-title">${WICK_NAME}’s Wares</span><span class="wick-line"></span></div><span class="shop-gold"></span><button class="shop-close" title="Close (P)">×</button></div>
      <div class="shop-note"></div>
      <div class="shop-advice"></div>
      <div class="shop-body">
        <div class="shop-items"></div>
        <div class="shop-side">
          <div class="shop-sub">Inventory</div>
          <div class="shop-inv"></div>
          <button class="shop-undo" title="Take back your last purchase or sale (while you're still here)">↶ Undo</button>
          <div class="shop-sub">Stats</div>
          <div class="shop-stats"></div>
        </div>
      </div>`;
    parent.appendChild(this.root);
    this.note = this.root.querySelector('.shop-note') as HTMLElement;
    this.goldEl = this.root.querySelector('.shop-gold') as HTMLElement;
    this.wickLine = this.root.querySelector('.wick-line') as HTMLElement;
    (this.root.querySelector('.shop-close') as HTMLElement).addEventListener('click', () => this.toggle(false));
    this.advice = this.root.querySelector('.shop-advice') as HTMLElement;
    this.undoButton = this.root.querySelector('.shop-undo') as HTMLButtonElement;
    this.undoButton.addEventListener('click', () => this.onUndo());

    const list = this.root.querySelector('.shop-items') as HTMLElement;
    for (const [tier, label] of TIERS) {
      const head = document.createElement('div');
      head.className = 'shop-sub';
      head.textContent = label;
      const grid = document.createElement('div');
      grid.className = 'shop-grid';
      for (const id of ITEM_IDS.filter((i) => ITEMS[i].tier === tier)) grid.appendChild(this.card(id));
      list.append(head, grid);
    }

    const inv = this.root.querySelector('.shop-inv') as HTMLElement;
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-row';
      inv.appendChild(slot);
      this.invSlots.push(slot);
    }

    const stats = this.root.querySelector('.shop-stats') as HTMLElement;
    for (const [key, label] of STAT_ROWS) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      const name = document.createElement('span');
      name.textContent = label;
      const value = document.createElement('b');
      row.append(name, value);
      stats.appendChild(row);
      this.stats.set(key, value);
    }
  }

  /** Old Wick's latest words, under the shop's name. */
  say(line: string): void {
    this.wickLine.textContent = `“${line}”`;
    this.wickLine.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
  }

  /** Where an item's card is on screen, while the shop is open (for the icon flying to your inventory). */
  cardRect(id: ItemId): DOMRect | null {
    return this.open ? (this.cards.get(id)?.getBoundingClientRect() ?? null) : null;
  }

  /** The stat rows a purchase just raised flash green. */
  flashStats(keys: readonly string[]): void {
    for (const key of keys) {
      const row = this.stats.get(key)?.parentElement;
      row?.animate([{ background: 'rgba(74, 222, 128, 0.45)', color: '#bbf7d0' }, { background: 'transparent' }], { duration: 1200, easing: 'ease-out' });
    }
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  /** Whose build Wick suggests. */
  setChampion(id: ChampionId): void {
    this.champ = id;
    this.lastKey = '';
    this.markGrid();
  }

  toggle(open = !this.open): void {
    this.root.hidden = !open;
    this.lastKey = ''; // redraw on open
  }

  update(me: MeSnap | undefined): void {
    if (!me || !this.open) return;
    const key = JSON.stringify([me.gold, me.items, me.inShop, me.stats, me.undo]);
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.goldEl.textContent = `${me.gold}g`;
    this.note.textContent = me.inShop ? '' : 'Go back to your fountain to shop. You can also shop while dead.';
    for (const [id, card] of this.cards) {
      const reason = cantBuy(me, id);
      card.classList.toggle('blocked', reason !== null);
      card.title = reason ?? 'Click to buy';
      // Cheaper by the parts you already have: the full price struck through beside yours.
      const price = priceFor(me.items, id);
      const cost = this.costs.get(id)!;
      cost.replaceChildren();
      if (price < ITEMS[id].cost) {
        const full = document.createElement('s');
        full.textContent = String(ITEMS[id].cost);
        cost.append(full, ` ${price}`);
      } else cost.textContent = String(price);
      card.classList.toggle('discounted', price < ITEMS[id].cost);
    }
    this.undoButton.disabled = !me.undo;
    this.drawAdvice(me);
    this.invSlots.forEach((row, i) => {
      const id = me.items[i];
      row.replaceChildren();
      if (!id) {
        row.className = 'inv-row empty';
        row.textContent = 'Empty';
        return;
      }
      row.className = `inv-row tier-${ITEMS[id].tier}`;
      const name = document.createElement('span');
      name.textContent = ITEMS[id].name;
      const sell = document.createElement('button');
      sell.textContent = `Sell ${sellPrice(id)}g`;
      sell.disabled = !me.inShop;
      sell.addEventListener('click', () => this.onSell(i));
      row.append(name, sell);
    });
    for (const [key, , fmt] of STAT_ROWS) this.stats.get(key)!.textContent = fmt(me.stats[key]);
  }

  /**
   * The recommended build, laid out plainly: how far along you are, every step in order (ticked when you
   * have it, the next one picked out, each with what it costs you now), and a "Next up" box saying exactly
   * what to buy: the whole item if you can afford it, or else a part of it, with the parts you already
   * own ticked off.
   */
  private drawAdvice(me: MeSnap): void {
    this.advice.replaceChildren();
    if (!this.champ) return;
    const build = PROFILES[this.champ].build;
    const { steps, next, toward } = suggest(build, me.items, me.gold);
    const done = steps.filter((s) => s.done).length;

    const head = el('div', 'rec-head');
    // Folds down to just this line, for anyone who'd rather browse (remembered).
    const fold = el('button', 'rec-fold', this.folded ? 'Show ▾' : 'Hide ▴');
    fold.addEventListener('click', () => {
      this.folded = !this.folded;
      try {
        localStorage.setItem(FOLD_KEY, this.folded ? '1' : '0');
      } catch {
        // storage blocked: it just won't be remembered
      }
      this.lastKey = '';
      this.update(me);
    });
    this.advice.classList.toggle('folded', this.folded);
    head.append(el('span', 'rec-title', `Recommended build for ${CHAMPION_INFO[this.champ].name}`), el('span', 'rec-count', `${done} of ${steps.length} done`), fold);
    const bar = el('div', 'rec-bar');
    const fill = el('div', 'rec-fill');
    fill.style.width = `${(done / steps.length) * 100}%`;
    bar.append(fill);

    const path = el('div', 'rec-path');
    steps.forEach((step, i) => {
      if (i) path.append(el('span', 'rec-arrow', '›'));
      const it = ITEMS[step.id];
      const card = el('button', `rec-step${step.done ? ' done' : ''}${step.id === toward ? ' next' : ''}`);
      card.append(
        el('span', 'rec-num', step.done ? '✓' : String(i + 1)),
        iconEl(it.icon, 'ico rec-ico'),
        el('span', 'rec-name', it.name),
        el('span', 'rec-price', step.done ? 'Got it' : `${priceFor(me.items, step.id)}g`),
      );
      card.title = step.done ? `${it.name}: you have it` : `${it.name}: ${statLines(it.stats).join(', ')}`;
      card.addEventListener('click', () => this.onBuy(step.id));
      path.append(card);
    });

    const box = el('div', 'rec-next');
    if (!toward || !next) {
      box.append(el('div', 'rec-complete', 'Build complete. Spend anything spare on whatever takes your fancy.'));
      this.advice.append(head, bar, path, box);
      return;
    }
    const it = ITEMS[toward];
    const price = priceFor(me.items, toward);
    const short = Math.max(0, price - me.gold);
    const info = el('div', 'rec-info');
    info.append(el('div', 'rec-label', 'Next up'), el('div', 'rec-item', it.name), el('div', 'rec-stats', statLines(it.stats).join(' · ')));
    // What it's made of: the parts you have ticked, the rest with what they cost.
    const parts = RECIPES[toward];
    if (parts) {
      const free = [...me.items];
      const row = el('div', 'rec-parts');
      row.append(el('span', 'rec-parts-label', 'Made from'));
      for (const p of parts) {
        const at = free.indexOf(p);
        const owned = at >= 0;
        if (owned) free.splice(at, 1);
        const chip = el('span', `rec-part${owned ? ' owned' : ''}`);
        chip.append(iconEl(ITEMS[p].icon, 'ico rec-part-ico'), `${ITEMS[p].name} ${owned ? '✓' : `· ${priceFor(me.items, p)}g`}`);
        row.append(chip);
      }
      info.append(row);
    }
    const actions = el('div', 'rec-actions');
    const buyWhole = el('button', 'rec-buy', `Buy ${it.name} · ${price}g`);
    const why = cantBuy(me, toward);
    buyWhole.disabled = why !== null;
    buyWhole.title = why ?? 'Next in your build';
    buyWhole.addEventListener('click', () => this.onBuy(toward));
    actions.append(buyWhole);
    if (next !== toward) {
      const part = el('button', 'rec-buy part', `Or start with ${ITEMS[next].name} · ${priceFor(me.items, next)}g`);
      part.disabled = cantBuy(me, next) !== null;
      part.title = cantBuy(me, next) ?? `A part of ${it.name}: buy it now, the rest later`;
      part.addEventListener('click', () => this.onBuy(next));
      actions.append(part);
    }
    if (short > 0) actions.append(el('div', 'rec-short', `${short}g more for the whole thing`));
    else if (!me.inShop) actions.append(el('div', 'rec-short', 'Affordable: head home to buy it'));
    box.append(iconEl(it.icon, 'ico rec-big-ico'), info, actions);
    this.advice.append(head, bar, path, box);
  }

  /** Recommended items in the grid get their step number in the corner. */
  private markGrid(): void {
    const build = this.champ ? PROFILES[this.champ].build : [];
    for (const [id, card] of this.cards) {
      const at = build.indexOf(id);
      card.classList.toggle('recommended', at >= 0);
      card.dataset.step = at >= 0 ? String(at + 1) : '';
    }
  }

  private card(id: ItemId): HTMLElement {
    const it = ITEMS[id];
    const el = document.createElement('button');
    el.className = `shop-card tier-${it.tier}`;
    const top = document.createElement('div');
    top.className = 'card-top';
    const glyph = document.createElement('span');
    glyph.className = 'glyph';
    glyph.append(iconEl(it.icon));
    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = it.name;
    const cost = document.createElement('span');
    cost.className = 'card-cost';
    cost.textContent = String(it.cost);
    this.costs.set(id, cost);
    top.append(glyph, name, cost);
    const stats = document.createElement('div');
    stats.className = 'card-stats';
    stats.textContent = statLines(it.stats).join(' · ');
    const flavor = document.createElement('div');
    flavor.className = 'card-flavor';
    flavor.textContent = it.flavor;
    el.append(top, stats);
    // What it's made from, or what it goes into.
    const from = RECIPES[id];
    const into = buildsInto(id);
    if (from || into.length) {
      const path = document.createElement('div');
      path.className = 'card-path';
      path.append(from ? 'From ' : 'Into ');
      for (const part of from ?? into) {
        const chip = document.createElement('span');
        chip.className = 'path-chip';
        chip.title = ITEMS[part].name;
        chip.append(iconEl(ITEMS[part].icon));
        path.append(chip);
      }
      el.append(path);
    }
    el.append(flavor);
    el.addEventListener('click', () => this.onBuy(id));
    this.cards.set(id, el);
    return el;
  }
}
