// ─── Tuning: the shop ─────────────────────────────────────────────────────────

export const INVENTORY_SLOTS = 6;
/** Share of an item's price you get back for selling it. */
export const SELL_BACK = 0.7;

/** Everything an item can add. Attack speed is a bonus percentage of base; haste shortens cooldowns (100 haste = half). */
export interface ItemStats {
  ad?: number;
  ap?: number;
  maxHp?: number;
  maxMana?: number;
  hpRegen?: number;
  /** Mana back per second. */
  manaRegen?: number;
  armor?: number;
  mr?: number;
  /** 0.12 = +12% attack speed. */
  attackSpeedPct?: number;
  moveSpeed?: number;
  haste?: number;
  /** Share of basic-attack damage healed back. */
  lifesteal?: number;
}

/**
 * Like League: basics are the cheap parts; epics are built from basics; legendaries (`core`) are the
 * finished items, built from epics and basics, most with a unique passive, one of each at most. Boots:
 * one pair, upgraded.
 */
export type ItemTier = 'basic' | 'boots' | 'epic' | 'core';

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
  // Basics
  | 'shiv'
  | 'quickstring'
  | 'loaf'
  | 'leather'
  | 'bark'
  | 'sagestone'
  | 'crystal'
  | 'tonic'
  // Boots
  | 'treads'
  | 'striders'
  | 'ironshod'
  | 'waders'
  | 'clogs'
  // Epics
  | 'fang'
  | 'drum'
  | 'mallet'
  | 'kris'
  | 'vest'
  | 'mantle'
  | 'tome'
  | 'charm'
  | 'ham'
  | 'whetstone'
  // Legendaries
  | 'longbow'
  | 'reaver'
  | 'link'
  | 'trident'
  | 'fork'
  | 'stormstring'
  | 'lantern'
  | 'staff'
  | 'witchfire'
  | 'hat'
  | 'hourglass'
  | 'plate'
  | 'aegis'
  | 'oath'
  | 'mossheart'
  | 'hamhock';

const item = (id: ItemId, name: string, cost: number, tier: ItemTier, stats: ItemStats, flavor: string): ItemInfo => ({ id, name, icon: ICONS[id], cost, tier, stats, flavor });

const ICONS: Record<ItemId, string> = {
  shiv: '🗡️',
  quickstring: '🧵',
  loaf: '🍞',
  leather: '🧥',
  bark: '🌳',
  sagestone: '🔮',
  crystal: '💎',
  tonic: '🍶',
  treads: '🥾',
  striders: '👟',
  ironshod: '👢',
  waders: '🧦',
  clogs: '🥿',
  fang: '🦷',
  drum: '🥁',
  mallet: '🔨',
  kris: '🦴',
  vest: '🦺',
  mantle: '🧣',
  tome: '📗',
  charm: '🧿',
  ham: '🍖',
  whetstone: '🧱',
  longbow: '🏹',
  reaver: '⚔️',
  link: '⛓️',
  trident: '🔱',
  fork: '🍴',
  stormstring: '⚡',
  lantern: '🏮',
  staff: '🌿',
  witchfire: '🕯️',
  hat: '👒',
  hourglass: '⌛',
  plate: '🛡️',
  aegis: '💠',
  oath: '⚜️',
  mossheart: '💚',
  hamhock: '🥩',
};

export const ITEMS: Record<ItemId, ItemInfo> = {
  // ── Basics
  shiv: item('shiv', 'Rusty Shiv', 350, 'basic', { ad: 10 }, "Every Chud's first weapon. Most never find a second."),
  quickstring: item('quickstring', 'Quickstring', 300, 'basic', { attackSpeedPct: 0.12 }, 'Tighter string, faster shots.'),
  loaf: item('loaf', 'Hearty Loaf', 400, 'basic', { maxHp: 150 }, 'Baked in the royal kitchens. Nobody knows who keeps leaving them here.'),
  leather: item('leather', 'Chud Leather', 300, 'basic', { armor: 15 }, 'Tough, smelly, and surprisingly effective.'),
  bark: item('bark', 'Oakbark Cloak', 400, 'basic', { mr: 20 }, 'Stripped from an Oakner. It still shrugs off spells.'),
  sagestone: item('sagestone', 'Sagestone', 435, 'basic', { ap: 20 }, 'A pebble that hums when magic is near.'),
  crystal: item('crystal', 'Deep Crystal', 350, 'basic', { maxMana: 250 }, 'Mined in the Deep, where the light still remembers the sun.'),
  tonic: item('tonic', 'Spore Tonic', 250, 'basic', { manaRegen: 3 }, "HunnaG brews it. She won't say from what."),
  // ── Boots
  treads: item('treads', 'Tunnel Treads', 300, 'boots', { moveSpeed: 25 }, 'Willmore swears by them. HunnaG swears at them.'),
  striders: item('striders', 'Swiftstriders', 1100, 'boots', { moveSpeed: 45, attackSpeedPct: 0.2 }, 'For people who shoot while running. Or run while shooting.'),
  ironshod: item('ironshod', 'Ironshod Boots', 1100, 'boots', { moveSpeed: 45, armor: 20 }, 'Hobnailed for the Royal Guard. They clank, but they hold.'),
  waders: item('waders', 'Sewer Waders', 1100, 'boots', { moveSpeed: 45, mr: 25 }, 'Waterproof to the hip. Nothing gets in: not the Deep, not a stun.'),
  clogs: item('clogs', 'Quickthought Clogs', 950, 'boots', { moveSpeed: 45, haste: 20 }, 'Carved for Master Paris. He thinks faster in them; so does everyone.'),
  // ── Epics
  fang: item('fang', 'Vampiric Fang', 1000, 'epic', { ad: 15, lifesteal: 0.1 }, 'Your attacks heal you for a share of the damage.'),
  drum: item('drum', 'War Drum', 1100, 'epic', { maxHp: 250, haste: 15 }, 'Beat it before a fight. Beat it after, if you won.'),
  mallet: item('mallet', 'Chud Mallet', 875, 'epic', { ad: 25 }, 'For tenderising. Anything.'),
  kris: item('kris', 'Rat-Bone Kris', 1000, 'epic', { ad: 15, attackSpeedPct: 0.2 }, 'Whittled from a Rat King. Still quick.'),
  vest: item('vest', 'Ironbark Vest', 900, 'epic', { armor: 35 }, 'Splinters for anyone who hits it.'),
  mantle: item('mantle', 'Mossy Mantle', 950, 'epic', { mr: 25, maxHp: 200 }, 'Spells sink into the moss and never come out.'),
  tome: item('tome', 'Hexed Tome', 900, 'epic', { ap: 40 }, 'Half the pages bite.'),
  charm: item('charm', 'Glowworm Charm', 900, 'epic', { ap: 25, maxMana: 250, haste: 10 }, 'A jar of glowworms on a string. They like you.'),
  ham: item('ham', "Giant's Ham", 900, 'epic', { maxHp: 350 }, 'Off something enormous. Best not to ask.'),
  whetstone: item('whetstone', 'Whetstone', 750, 'epic', { maxMana: 150, haste: 5 }, 'Cast a spell, then strike while the edge still sings.'),
  // ── Legendaries
  longbow: item('longbow', 'Pride Longbow', 2700, 'core', { ad: 25, attackSpeedPct: 0.35, moveSpeed: 10 }, "Strung with a lion's mane. Logan would like it back."),
  reaver: item('reaver', 'Bloodreaver', 3000, 'core', { ad: 55, lifesteal: 0.15 }, 'Heavy, hungry, and never quite clean.'),
  link: item('link', "Warden's Link", 2800, 'core', { ad: 40, maxHp: 300, haste: 20 }, "One link of the Warden's chain. It rattles when the Warden stirs."),
  trident: item('trident', 'Trident of the Deep', 3200, 'core', { ad: 30, attackSpeedPct: 0.3, maxHp: 250, haste: 20 }, 'Three prongs: one for each thing it does.'),
  fork: item('fork', 'Rotten Fork', 2600, 'core', { ad: 30, attackSpeedPct: 0.25 }, 'It was a nice fork once. Wounds from it never quite heal.'),
  stormstring: item('stormstring', 'Stormstring', 2800, 'core', { ad: 15, attackSpeedPct: 0.4, moveSpeed: 10 }, 'Strung in a thunderstorm. It remembers.'),
  lantern: item('lantern', 'Glowworm Lantern', 2700, 'core', { ap: 75, maxMana: 300, haste: 20 }, "HunnaG's own design. Please return it lit."),
  staff: item('staff', 'Rotroot Staff', 2700, 'core', { ap: 90, maxHp: 200 }, 'Grown in the Deep from a single cursed seed. Still growing.'),
  witchfire: item('witchfire', 'Witchfire Taper', 3000, 'core', { ap: 80, haste: 10, moveSpeed: 15 }, 'A candle that burns the other way: into whatever you hit next.'),
  hat: item('hat', 'Great Glowcap Hat', 3400, 'core', { ap: 120 }, 'Mostly mushroom. Entirely magic.'),
  hourglass: item('hourglass', 'Royal Hourglass', 2900, 'core', { ap: 70, armor: 40 }, "King Rix's. Time stops for royalty."),
  plate: item('plate', 'Royal Plate', 2700, 'core', { armor: 70, maxHp: 300 }, 'Forged for King Rix. He had it let out twice.'),
  aegis: item('aegis', 'Deepstone Aegis', 2600, 'core', { mr: 55, maxHp: 300, hpRegen: 2 }, 'Cut from the Deep, where spells go quiet.'),
  oath: item('oath', 'Oath of the Old Guard', 2500, 'core', { armor: 30, mr: 30, maxHp: 250 }, 'Sworn to the old King. Kept for whoever stands beside you.'),
  mossheart: item('mossheart', 'Mossheart', 2700, 'core', { mr: 50, maxHp: 400, haste: 10, hpRegen: 2 }, 'A heart of moss, beating slow. It mends whatever you put into it.'),
  hamhock: item('hamhock', "Ogre's Hamhock", 3000, 'core', { maxHp: 800 }, 'Eat it slowly. You heal while you chew.'),
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export const isItemId = (v: unknown): v is ItemId => typeof v === 'string' && Object.hasOwn(ITEMS, v);

/**
 * What the bigger items are built from. Owning the parts makes the item cheaper by what they cost, and
 * they're used up when you buy it (freeing their slots); the rest of the price pays for the recipe. Parts
 * can have parts of their own: a Bloodreaver can be built up from basics.
 */
export const RECIPES: Partial<Record<ItemId, readonly ItemId[]>> = {
  // Boots
  striders: ['treads', 'quickstring'],
  ironshod: ['treads', 'leather'],
  waders: ['treads', 'bark'],
  clogs: ['treads', 'tonic'],
  // Epics
  fang: ['shiv'],
  drum: ['loaf'],
  mallet: ['shiv', 'shiv'],
  kris: ['shiv', 'quickstring'],
  vest: ['leather', 'leather'],
  mantle: ['bark', 'loaf'],
  tome: ['sagestone', 'sagestone'],
  charm: ['sagestone', 'crystal'],
  ham: ['loaf', 'loaf'],
  whetstone: ['crystal'],
  // Legendaries
  longbow: ['kris', 'shiv'],
  reaver: ['fang', 'mallet'],
  link: ['drum', 'mallet'],
  trident: ['whetstone', 'kris'],
  fork: ['mallet', 'quickstring'],
  stormstring: ['kris', 'quickstring'],
  lantern: ['charm', 'sagestone'],
  staff: ['tome', 'loaf'],
  witchfire: ['whetstone', 'tome'],
  hat: ['tome', 'tome'],
  hourglass: ['tome', 'vest'],
  plate: ['vest', 'loaf'],
  aegis: ['mantle', 'bark'],
  oath: ['vest', 'mantle'],
  mossheart: ['mantle', 'drum'],
  hamhock: ['ham', 'ham'],
};

// ─── Tuning: item passives ────────────────────────────────────────────────────
// What each one does lives in Champion (shared/champions/champion.ts) and World.damage; the numbers live here.

/** Spellblade (Whetstone, Trident, Witchfire): after a cast, the next basic attack within 10s hits harder. */
export const SPELLBLADE = { window: 10, cooldown: 1.5, whetstone: 1.0, trident: 2.0, witchfire: { ad: 0.75, ap: 0.5 } };
/** Ironbark Vest and Royal Plate hit back at champions who hit you with basic attacks; the Plate also wounds. */
export const THORNS = { vest: 8, plate: 10, plateArmorRatio: 0.15, wounds: 3 };
/** Wounds (Rotten Fork, Royal Plate): healing (and regen) on the wounded is cut. */
export const WOUNDS = { cut: 0.4, duration: 3 };
/** Warden's Link: each attack on a champion strips armor, stacking up to the cap. */
export const SUNDER = { perHit: 0.05, max: 0.25, duration: 6 };
/** Pride Longbow: every third attack on the same champion. */
export const PRIDE = { every: 3, damage: 60, bonusAdRatio: 0.25 };
/** Stormstring: every fifth attack chains lightning to the target and others near it. */
export const STATIC = { every: 5, damage: 70, bonusAdRatio: 0.4, chains: 3, range: 500 };
/** Rotroot Staff: ability damage burns a share of max health each second. */
export const ROT_BURN = { perSecond: 0.01, duration: 3 };
/** Great Glowcap Hat: ability power multiplied. */
export const HAT_AP = 0.3;
/** Oath of the Old Guard: allied champions near its holder take less damage (it doesn't stack). */
export const OATH = { radius: 700, reduction: 0.08 };
/** Mossheart: heals and shields on you are stronger. */
export const MOSSHEART = 0.25;
/** Ogre's Hamhock: out of combat a while, you regenerate a share of max health each second. */
export const HAMHOCK = { calmAfter: 6, regen: 0.03 };
/** Ironshod Boots: basic attacks hit you softer. */
export const IRONSHOD = 0.12;
/** Sewer Waders: stuns, roots, slows and fears are shorter. */
export const WADERS = 0.3;
/** Bloodreaver: lifesteal past full health becomes a shield, up to this (grows with level). */
export const BLOODFILL = { base: 50, perLevel: 15, duration: 25 };

const pctOf = (n: number) => `${Math.round(n * 100)}%`;

/** Each item's unique passive, for the shop and tooltips. */
export const PASSIVES: Partial<Record<ItemId, { name: string; description: string }>> = {
  ironshod: { name: 'Hobnails', description: `Basic attacks deal ${pctOf(IRONSHOD)} less damage to you.` },
  waders: { name: 'Watertight', description: `Stuns, roots, slows and fears on you are ${pctOf(WADERS)} shorter.` },
  vest: { name: 'Splinters', description: `Champions who hit you with a basic attack take ${THORNS.vest} magic damage.` },
  whetstone: { name: 'Spellblade', description: `After you cast an ability, your next basic attack within ${SPELLBLADE.window}s deals +${pctOf(SPELLBLADE.whetstone)} of your base attack damage (every ${SPELLBLADE.cooldown}s).` },
  longbow: { name: 'Pride', description: `Every ${PRIDE.every}rd basic attack on the same champion deals ${PRIDE.damage} (+${pctOf(PRIDE.bonusAdRatio)} bonus AD) magic damage.` },
  reaver: { name: 'Bloodfill', description: `Lifesteal past full health becomes a shield, up to ${BLOODFILL.base} + ${BLOODFILL.perLevel} per level.` },
  link: { name: 'Sunder', description: `Basic attacks on a champion strip ${pctOf(SUNDER.perHit)} of their armor for ${SUNDER.duration}s, stacking to ${pctOf(SUNDER.max)}.` },
  trident: { name: 'Spellblade', description: `After you cast an ability, your next basic attack within ${SPELLBLADE.window}s deals +${pctOf(SPELLBLADE.trident)} of your base attack damage (every ${SPELLBLADE.cooldown}s).` },
  fork: { name: 'Rot', description: `Basic attacks on champions wound them for ${WOUNDS.duration}s: ${pctOf(WOUNDS.cut)} less healing.` },
  stormstring: { name: 'Static', description: `Every ${STATIC.every}th basic attack chains lightning to the target and up to ${STATIC.chains} enemies near it: ${STATIC.damage} (+${pctOf(STATIC.bonusAdRatio)} bonus AD) magic damage each.` },
  staff: { name: 'Rotroot', description: `Ability damage burns for ${pctOf(ROT_BURN.perSecond)} of the target's max health each second for ${ROT_BURN.duration}s (magic).` },
  witchfire: { name: 'Spellblade', description: `After you cast an ability, your next basic attack within ${SPELLBLADE.window}s deals +${pctOf(SPELLBLADE.witchfire.ad)} of your base attack damage +${pctOf(SPELLBLADE.witchfire.ap)} AP as magic damage (every ${SPELLBLADE.cooldown}s).` },
  hat: { name: 'Overgrown', description: `Your ability power is ${pctOf(HAT_AP)} higher.` },
  plate: { name: 'Thorns', description: `Champions who hit you with a basic attack take ${THORNS.plate} (+${pctOf(THORNS.plateArmorRatio)} bonus armor) magic damage and are wounded for ${THORNS.wounds}s (${pctOf(WOUNDS.cut)} less healing).` },
  oath: { name: 'Old Guard', description: `Allied champions within ${OATH.radius} of you take ${pctOf(OATH.reduction)} less damage.` },
  mossheart: { name: 'Mending', description: `Heals and shields on you are ${pctOf(MOSSHEART)} stronger.` },
  hamhock: { name: 'Second Helping', description: `After ${HAMHOCK.calmAfter}s without taking damage, regenerate ${pctOf(HAMHOCK.regen)} of your max health each second.` },
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
/** The Royal Hourglass: time stops for you. Nothing can touch you, and you can't do a thing. */
export const ROYAL_PAUSE = { duration: 2.5 };

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
  hourglass: {
    name: 'Royal Pause',
    description: `Time stops for you for ${ROYAL_PAUSE.duration}s: nothing can hurt or target you, and you can't move or act.`,
    cooldown: 90,
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

/** Whether owning `a` rules out buying `b`: only one pair of boots, and one of each legendary. */
export function conflicts(a: ItemId, b: ItemId): boolean {
  const A = ITEMS[a];
  const B = ITEMS[b];
  if (A.tier === 'boots' && B.tier === 'boots') return true;
  return A.tier === 'core' && a === b;
}

export const sellPrice = (id: ItemId): number => Math.round(ITEMS[id].cost * SELL_BACK);

/** The summed stats of a set of items. */
export function sumItemStats(items: readonly ItemId[]): Required<ItemStats> {
  const total: Required<ItemStats> = { ad: 0, ap: 0, maxHp: 0, maxMana: 0, hpRegen: 0, manaRegen: 0, armor: 0, mr: 0, attackSpeedPct: 0, moveSpeed: 0, haste: 0, lifesteal: 0 };
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
  manaRegen: ['mana regen', (v) => `${v}/s`],
  armor: ['armor', String],
  mr: ['magic resist', String],
  attackSpeedPct: ['attack speed', (v) => `${Math.round(v * 100)}%`],
  moveSpeed: ['move speed', String],
  haste: ['ability haste', String],
  lifesteal: ['lifesteal', (v) => `${Math.round(v * 100)}%`],
};

/** Short names for the shop's stat chips. */
const STAT_SHORT: Record<keyof ItemStats, string> = {
  ad: 'AD',
  ap: 'AP',
  maxHp: 'Health',
  maxMana: 'Mana',
  hpRegen: 'Regen',
  manaRegen: 'Mana/s',
  armor: 'Armor',
  mr: 'MR',
  attackSpeedPct: 'Atk Spd',
  moveSpeed: 'Move',
  haste: 'Haste',
  lifesteal: 'Lifesteal',
};

/** Each stat as a value and a short name ("+25", "AD"), for the shop's big stat chips. */
export function statParts(stats: ItemStats): { key: keyof ItemStats; value: string; label: string; full: string }[] {
  return (Object.entries(stats) as [keyof ItemStats, number][]).map(([k, v]) => ({ key: k, value: `+${STAT_LABELS[k][1](v)}`, label: STAT_SHORT[k], full: STAT_LABELS[k][0] }));
}

/** "+10 attack damage", one line per stat, for tooltips. */
export function statLines(stats: ItemStats): string[] {
  return (Object.entries(stats) as [keyof ItemStats, number][]).map(([k, v]) => `+${STAT_LABELS[k][1](v)} ${STAT_LABELS[k][0]}`);
}

/** How much shorter cooldowns get: 100 haste halves them. */
export const hasteMultiplier = (haste: number): number => 100 / (100 + haste);
