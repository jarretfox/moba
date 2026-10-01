// ─── Tuning: the shop ─────────────────────────────────────────────────────────

export const INVENTORY_SLOTS = 4;
/** Share of an item's price you get back for selling it. */
export const SELL_BACK = 0.7;

/** Everything an item can add. Attack speed is a bonus percentage of base; haste shortens cooldowns (100 haste = half). */
export interface ItemStats {
  ad?: number;
  ap?: number;
  maxHp?: number;
  maxMana?: number;
  hpRegen?: number;
  armor?: number;
  mr?: number;
  /** 0.12 = +12% attack speed. */
  attackSpeedPct?: number;
  moveSpeed?: number;
  haste?: number;
  /** Share of basic-attack damage healed back. */
  lifesteal?: number;
}

export type ItemTier = 'basic' | 'boots' | 'core';

export interface ItemInfo {
  id: ItemId;
  name: string;
  icon: string;
  cost: number;
  tier: ItemTier;
  stats: ItemStats;
  flavor: string;
}

export type ItemId =
  | 'shiv'
  | 'quickstring'
  | 'loaf'
  | 'leather'
  | 'bark'
  | 'sagestone'
  | 'treads'
  | 'striders'
  | 'fang'
  | 'drum'
  | 'longbow'
  | 'reaver'
  | 'link'
  | 'plate'
  | 'aegis'
  | 'lantern'
  | 'staff';

const item = (id: ItemId, name: string, cost: number, tier: ItemTier, stats: ItemStats, flavor: string): ItemInfo => ({ id, name, icon: ICONS[id], cost, tier, stats, flavor });

const ICONS: Record<ItemId, string> = {
  shiv: '🗡️',
  quickstring: '🧵',
  loaf: '🍞',
  leather: '🧥',
  bark: '🌳',
  sagestone: '🔮',
  treads: '🥾',
  striders: '👟',
  fang: '🦷',
  drum: '🥁',
  longbow: '🏹',
  reaver: '⚔️',
  link: '⛓️',
  plate: '🛡️',
  aegis: '💠',
  lantern: '🏮',
  staff: '🌿',
};

export const ITEMS: Record<ItemId, ItemInfo> = {
  shiv: item('shiv', 'Rusty Shiv', 350, 'basic', { ad: 10 }, "Every Chud's first weapon. Most never find a second."),
  quickstring: item('quickstring', 'Quickstring', 300, 'basic', { attackSpeedPct: 0.12 }, 'Tighter string, faster shots.'),
  loaf: item('loaf', 'Hearty Loaf', 400, 'basic', { maxHp: 150 }, 'Baked in the royal kitchens. Nobody knows who keeps leaving them here.'),
  leather: item('leather', 'Chud Leather', 300, 'basic', { armor: 15 }, 'Tough, smelly, and surprisingly effective.'),
  bark: item('bark', 'Oakbark Cloak', 400, 'basic', { mr: 20 }, 'Stripped from an Oakner. It still shrugs off spells.'),
  sagestone: item('sagestone', 'Sagestone', 435, 'basic', { ap: 20 }, 'A pebble that hums when magic is near.'),
  treads: item('treads', 'Tunnel Treads', 300, 'boots', { moveSpeed: 25 }, 'Willmore swears by them. HunnaG swears at them.'),
  striders: item('striders', 'Swiftstriders', 1100, 'boots', { moveSpeed: 45, attackSpeedPct: 0.2 }, 'For people who shoot while running. Or run while shooting.'),
  fang: item('fang', 'Vampiric Fang', 1000, 'core', { ad: 15, lifesteal: 0.1 }, 'Your attacks heal you for a share of the damage.'),
  drum: item('drum', 'War Drum', 1100, 'core', { maxHp: 250, haste: 15 }, 'Beat it before a fight. Beat it after, if you won.'),
  longbow: item('longbow', 'Pride Longbow', 2600, 'core', { ad: 30, attackSpeedPct: 0.35, moveSpeed: 10 }, "Strung with a lion's mane. Logan would like it back."),
  reaver: item('reaver', 'Bloodreaver', 3000, 'core', { ad: 55, lifesteal: 0.15 }, 'Heavy, hungry, and never quite clean.'),
  link: item('link', "Warden's Link", 2800, 'core', { ad: 40, maxHp: 300, haste: 20 }, "One link of the Warden's chain. It rattles when the Warden stirs."),
  plate: item('plate', 'Royal Plate', 2400, 'core', { armor: 60, maxHp: 300 }, 'Forged for King Rix. He had it let out twice.'),
  aegis: item('aegis', 'Deepstone Aegis', 2400, 'core', { mr: 55, maxHp: 300, hpRegen: 2 }, 'Cut from the Deep, where spells go quiet.'),
  lantern: item('lantern', 'Glowworm Lantern', 2700, 'core', { ap: 75, maxMana: 300, haste: 20 }, "HunnaG's own design. Please return it lit."),
  staff: item('staff', 'Rotroot Staff', 2700, 'core', { ap: 90, maxHp: 200 }, 'Grown in the Deep from a single cursed seed. Still growing.'),
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export const isItemId = (v: unknown): v is ItemId => typeof v === 'string' && Object.hasOwn(ITEMS, v);

/**
 * What the bigger items are built from. Owning the parts makes the item cheaper by what they cost, and
 * they're used up when you buy it (freeing their slots); the rest of the price pays for the recipe. Parts
 * can have parts of their own: a Bloodreaver can be built up from two Rusty Shivs.
 */
export const RECIPES: Partial<Record<ItemId, readonly ItemId[]>> = {
  striders: ['treads', 'quickstring'],
  fang: ['shiv'],
  drum: ['loaf'],
  longbow: ['quickstring', 'shiv'],
  reaver: ['fang', 'shiv'],
  link: ['drum', 'shiv'],
  plate: ['leather', 'loaf'],
  aegis: ['bark', 'loaf'],
  lantern: ['sagestone', 'sagestone'],
  staff: ['sagestone', 'loaf'],
};

/** An item you can use, on a cooldown: D and F use the first two in your inventory. */
export interface ItemActive {
  name: string;
  description: string;
  cooldown: number;
  /** 'point' ones go where the cursor is (in range); 'self' ones go off around you. */
  targeting: 'self' | 'point';
  range?: number;
}

// ─── Tuning: item actives ─────────────────────────────────────────────────────

/** The Glowworm Lantern's light: how far it sees, how far it can be thrown, and how long it lasts. */
export const LANTERN_LIGHT = { radius: 550, range: 1400, duration: 6 };
/** The Aegis's ward: a shield of this much plus a share of each one's max health, on allies this close. */
export const AEGIS_WARD = { shield: 120, maxHpShare: 0.1, duration: 3, radius: 600 };
/** The War Drum's beat: this much faster, for this long, for allies this close. */
export const DRUM_BEAT = { speed: 0.3, duration: 3, radius: 700 };

export const ACTIVES: Partial<Record<ItemId, ItemActive>> = {
  lantern: {
    name: 'Light the Way',
    description: `Throw light on a spot: you see everything within ${LANTERN_LIGHT.radius} of it, brush and all, for ${LANTERN_LIGHT.duration}s.`,
    cooldown: 60,
    targeting: 'point',
    range: LANTERN_LIGHT.range,
  },
  aegis: {
    name: 'Deepstone Ward',
    description: `You and allies close by get a shield of ${AEGIS_WARD.shield} + ${AEGIS_WARD.maxHpShare * 100}% of max health for ${AEGIS_WARD.duration}s.`,
    cooldown: 75,
    targeting: 'self',
  },
  drum: {
    name: 'War Beat',
    description: `You and allies close by run ${DRUM_BEAT.speed * 100}% faster for ${DRUM_BEAT.duration}s.`,
    cooldown: 45,
    targeting: 'self',
  },
};

/** The keys for item actives: the first item in the inventory with one is D, the second F. */
export const ACTIVE_KEYS = ['D', 'F'] as const;

/** The inventory slots whose items have actives, in order (at most one per key). */
export function activeSlots(items: readonly (ItemId | undefined)[]): number[] {
  return items
    .map((id, slot) => (id && ACTIVES[id] ? slot : -1))
    .filter((slot) => slot >= 0)
    .slice(0, ACTIVE_KEYS.length);
}

/** The items `id` goes into. */
export function buildsInto(id: ItemId): ItemId[] {
  return ITEM_IDS.filter((other) => RECIPES[other]?.includes(id));
}

/** Which inventory slots buying `id` would use up: its parts you own, and the parts of the parts you don't. */
export function partsUsed(items: readonly ItemId[], id: ItemId): number[] {
  const free = items.map((_, slot) => slot);
  const used: number[] = [];
  const take = (want: ItemId) => {
    for (const part of RECIPES[want] ?? []) {
      const at = free.findIndex((slot) => items[slot] === part);
      if (at >= 0) used.push(...free.splice(at, 1));
      else take(part);
    }
  };
  take(id);
  return used;
}

/** What `id` costs you, given what you own: its price, less the parts you already have. */
export function priceFor(items: readonly ItemId[], id: ItemId): number {
  return ITEMS[id].cost - partsUsed(items, id).reduce((sum, slot) => sum + ITEMS[items[slot]].cost, 0);
}

/** The inventory after buying `id`: its parts gone, the item added. */
export function afterBuying(items: readonly ItemId[], id: ItemId): ItemId[] {
  const used = partsUsed(items, id);
  return [...items.filter((_, slot) => !used.includes(slot)), id];
}

/** Why the shop would refuse `id`, or null if it wouldn't. The host decides; clients use it to grey things out. */
export function whyNot(items: readonly ItemId[], gold: number, inShop: boolean, id: ItemId): string | null {
  if (!inShop) return 'Shop at your fountain';
  const used = partsUsed(items, id);
  const kept = items.filter((_, slot) => !used.includes(slot));
  if (kept.some((owned) => conflicts(owned, id))) return ITEMS[id].tier === 'boots' ? 'Already have boots' : 'Already owned';
  if (kept.length >= INVENTORY_SLOTS) return 'Inventory full';
  if (gold < priceFor(items, id)) return 'Not enough gold';
  return null;
}

/** Whether owning `a` rules out buying `b`: only one pair of boots, and one of each core item. */
export function conflicts(a: ItemId, b: ItemId): boolean {
  const A = ITEMS[a];
  const B = ITEMS[b];
  if (A.tier === 'boots' && B.tier === 'boots') return true;
  return A.tier === 'core' && a === b;
}

export const sellPrice = (id: ItemId): number => Math.round(ITEMS[id].cost * SELL_BACK);

/** The summed stats of a set of items. */
export function sumItemStats(items: readonly ItemId[]): Required<ItemStats> {
  const total: Required<ItemStats> = { ad: 0, ap: 0, maxHp: 0, maxMana: 0, hpRegen: 0, armor: 0, mr: 0, attackSpeedPct: 0, moveSpeed: 0, haste: 0, lifesteal: 0 };
  for (const id of items) {
    for (const [k, v] of Object.entries(ITEMS[id].stats) as [keyof ItemStats, number][]) total[k] += v;
  }
  return total;
}

const STAT_LABELS: Record<keyof ItemStats, [string, (v: number) => string]> = {
  ad: ['attack damage', String],
  ap: ['ability power', String],
  maxHp: ['health', String],
  maxMana: ['mana', String],
  hpRegen: ['health regen', (v) => `${v}/s`],
  armor: ['armor', String],
  mr: ['magic resist', String],
  attackSpeedPct: ['attack speed', (v) => `${Math.round(v * 100)}%`],
  moveSpeed: ['move speed', String],
  haste: ['ability haste', String],
  lifesteal: ['lifesteal', (v) => `${Math.round(v * 100)}%`],
};

/** "+10 attack damage", one line per stat, for tooltips. */
export function statLines(stats: ItemStats): string[] {
  return (Object.entries(stats) as [keyof ItemStats, number][]).map(([k, v]) => `+${STAT_LABELS[k][1](v)} ${STAT_LABELS[k][0]}`);
}

/** How much shorter cooldowns get: 100 haste halves them. */
export const hasteMultiplier = (haste: number): number => 100 / (100 + haste);
