import { INVENTORY_SLOTS, ITEMS, ITEM_IDS, conflicts, sellPrice, statLines, type ItemId, type ItemTier } from '../shared/items';
import type { MeSnap } from '../shared/protocol';
import { iconEl } from './render/icons';
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

/** Old Wick's face for the shop's header: a hood, darkness, two eyes. */
const WICK_FACE = `<svg viewBox="0 0 40 40" width="44" height="44" aria-hidden="true"><defs><radialGradient id="wick-bg" cx="70%" cy="70%" r="75%"><stop offset="0" stop-color="#a66bff" stop-opacity=".75"/><stop offset="1" stop-color="#140f1c"/></radialGradient></defs><circle cx="20" cy="20" r="19" fill="url(#wick-bg)" stroke="#0b0f14" stroke-width="2"/><path d="M7 36 C7 21 11 8 21 6 C31 5 34 17 34 36 Z" fill="#1f1828" stroke="#0b0f14" stroke-width="1.5"/><path d="M29 12 C33 18 33 26 31 32" stroke="#a66bff" stroke-width="1.5" fill="none" opacity=".7"/><ellipse cx="21" cy="21" rx="8" ry="9.5" fill="#050308"/><path d="M12 25 h18 v6 h-18z" fill="#6e2a36" stroke="#0b0f14" stroke-width="1"/><g class="wick-eyes"><ellipse cx="18" cy="19" rx="1.8" ry="1.5" fill="#eedcff"/><ellipse cx="24" cy="19" rx="1.8" ry="1.5" fill="#eedcff"/></g></svg>`;

/** Why the shop would refuse `id`, judged from this client's copy of the state (the host checks again). */
export function cantBuy(me: MeSnap, id: ItemId): string | null {
  if (!me.inShop) return 'Shop at your fountain';
  if (me.items.some((owned) => conflicts(owned, id))) return ITEMS[id].tier === 'boots' ? 'Already have boots' : 'Already owned';
  if (me.items.length >= INVENTORY_SLOTS) return 'Inventory full';
  if (me.gold < ITEMS[id].cost) return 'Not enough gold';
  return null;
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
  private lastKey = '';

  constructor(
    parent: HTMLElement,
    private readonly onBuy: (id: ItemId) => void,
    private readonly onSell: (slot: number) => void,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'shop';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="shop-head"><span class="wick-face">${WICK_FACE}</span><div class="shop-who"><span class="shop-title">${WICK_NAME}’s Wares</span><span class="wick-line"></span></div><span class="shop-gold"></span><button class="shop-close" title="Close (P)">×</button></div>
      <div class="shop-note"></div>
      <div class="shop-body">
        <div class="shop-items"></div>
        <div class="shop-side">
          <div class="shop-sub">Inventory</div>
          <div class="shop-inv"></div>
          <div class="shop-sub">Stats</div>
          <div class="shop-stats"></div>
        </div>
      </div>`;
    parent.appendChild(this.root);
    this.note = this.root.querySelector('.shop-note') as HTMLElement;
    this.goldEl = this.root.querySelector('.shop-gold') as HTMLElement;
    this.wickLine = this.root.querySelector('.wick-line') as HTMLElement;
    (this.root.querySelector('.shop-close') as HTMLElement).addEventListener('click', () => this.toggle(false));

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

  toggle(open = !this.open): void {
    this.root.hidden = !open;
    this.lastKey = ''; // redraw on open
  }

  update(me: MeSnap | undefined): void {
    if (!me || !this.open) return;
    const key = JSON.stringify([me.gold, me.items, me.inShop, me.stats]);
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.goldEl.textContent = `${me.gold}g`;
    this.note.textContent = me.inShop ? '' : 'Go back to your fountain to shop. You can also shop while dead.';
    for (const [id, card] of this.cards) {
      const reason = cantBuy(me, id);
      card.classList.toggle('blocked', reason !== null);
      card.title = reason ?? 'Click to buy';
    }
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
    top.append(glyph, name, cost);
    const stats = document.createElement('div');
    stats.className = 'card-stats';
    stats.textContent = statLines(it.stats).join(' · ');
    const flavor = document.createElement('div');
    flavor.className = 'card-flavor';
    flavor.textContent = it.flavor;
    el.append(top, stats, flavor);
    el.addEventListener('click', () => this.onBuy(id));
    this.cards.set(id, el);
    return el;
  }
}
