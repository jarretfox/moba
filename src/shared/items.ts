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
  | 'lantern';

const item = (id: ItemId, name: string, cost: number, tier: ItemTier, stats: ItemStats, flavor: string): ItemInfo => ({ id, name, cost, tier, stats, flavor });

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
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export const isItemId = (v: unknown): v is ItemId => typeof v === 'string' && Object.hasOwn(ITEMS, v);

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
