import { INVENTORY_SLOTS, ITEMS, ITEM_IDS, conflicts, sellPrice, statLines, type ItemId, type ItemTier } from '../shared/items';
import type { MeSnap } from '../shared/protocol';

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

/** Short label for an item's slot, since there's no item art yet: "Rusty Shiv" → "RS". */
export const itemGlyph = (id: ItemId): string =>
  ITEMS[id].name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 2)
    .toUpperCase();

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
      <div class="shop-head"><span class="shop-title">Shop</span><span class="shop-gold"></span><button class="shop-close" title="Close (P)">×</button></div>
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
    glyph.textContent = itemGlyph(id);
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
