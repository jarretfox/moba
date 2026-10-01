import { INVENTORY_SLOTS, ITEMS, conflicts, partsUsed, priceFor, sellPrice, type ItemId } from '../items';

export interface Purchase {
  item: ItemId;
  /** Inventory slots to sell first, highest index first so the others don't shift. */
  sell: number[];
  /** Gold needed after the refunds. */
  net: number;
}

/**
 * The next step along a bot's build: the first item it doesn't own and hasn't moved past, plus what to
 * sell to make room (boots it's replacing, then the cheapest earlier item, basics before anything else).
 * Parts of the item it already owns aren't sold: they go into it (see RECIPES). Null when the build is
 * done or nothing can be sold to fit the next item.
 */
export function nextPurchase(build: readonly ItemId[], items: readonly ItemId[]): Purchase | null {
  const movedPast = (i: number) => build.slice(i + 1).some((later) => items.includes(later));
  const index = build.findIndex((id, i) => !items.includes(id) && !movedPast(i));
  if (index < 0) return null;
  const item = build[index];

  const used = partsUsed(items, item);
  const sell = items.map((owned, slot) => (!used.includes(slot) && conflicts(owned, item) ? slot : -1)).filter((slot) => slot >= 0);
  if (items.length - used.length - sell.length >= INVENTORY_SLOTS) {
    const earlier = (owned: ItemId) => {
      const at = build.indexOf(owned);
      return at < 0 || at < index;
    };
    const spare = items
      .map((owned, slot) => ({ owned, slot }))
      .filter(({ owned, slot }) => !sell.includes(slot) && !used.includes(slot) && earlier(owned) && ITEMS[owned].tier !== 'boots')
      .sort((a, b) => Number(ITEMS[b.owned].tier === 'basic') - Number(ITEMS[a.owned].tier === 'basic') || ITEMS[a.owned].cost - ITEMS[b.owned].cost)[0];
    if (!spare) return null;
    sell.push(spare.slot);
  }
  sell.sort((a, b) => b - a);
  const refund = sell.reduce((sum, slot) => sum + sellPrice(items[slot]), 0);
  return { item, sell, net: priceFor(items, item) - refund };
}
