import { Assets, Rectangle, Texture } from 'pixi.js';
import type { ChampionId } from '../../shared/champions/types';
import type { PartName } from './rig';

// Painted art, where there is some. Everything in the game is drawn in code; this lets a painted image
// stand in for any piece of it, one at a time, without touching the rest:
// - a champion look's body parts (an image per part, pinned at the part's joint, so the rig poses it
//   exactly as it poses the drawn part: walking, swinging, flinching, dying),
// - an effect, as a flipbook (a sheet of frames played over or instead of the drawn effect),
// - a single image for something like a projectile or Scrimby's train.
// public/art/index.json says what exists; nothing else is fetched. Anything missing is drawn as before.
// docs/art-bible.md has the specs for making them.

/** A champion look's painted parts. Parts are drawn in units of the unit's radius r, so one set fits every size. */
export interface PartArt {
  /** Image pixels per r. */
  pxPerR: number;
  /** Each part's image, and where the image's top-left corner sits in the part's own space (in r). */
  parts: Partial<Record<PartName, { texture: Texture; origin: readonly [number, number] }>>;
  /** False: the painting has its own face, so the drawn blinks and winces are left off. */
  face?: boolean;
}

/** A flipbook effect, as listed in the index. */
export interface FlipbookSpec {
  /** The sheet: frames left to right, top to bottom, all the same size. */
  file: string;
  frames: number;
  cols: number;
  fps?: number;
  /** A frame's width on the map: `size` × the effect's radius (or world units, with `absolute`). */
  size: number;
  absolute?: boolean;
  /** Which point of the frame sits on the effect's spot (0–1; the default is its bottom middle). */
  anchor?: readonly [number, number];
  layer?: 'under' | 'mid' | 'top';
  /** Glowing (added light) rather than painted over. */
  glow?: boolean;
  /** Played instead of the drawn effect, not over it. */
  replace?: boolean;
}

/** A single image standing in for something drawn: `width` world units across, pinned at `anchor` (0–1). */
export interface SpriteSpec {
  file: string;
  width: number;
  anchor?: readonly [number, number];
}

export interface ArtIndex {
  /** Champion looks with painted parts: champion → the skins (0–3) that have them. */
  champions: Partial<Record<ChampionId, number[]>>;
  fx: Record<string, FlipbookSpec>;
  sprites: Record<string, SpriteSpec>;
}

export interface Flipbook {
  spec: FlipbookSpec;
  frames: Texture[];
}

export interface SpriteArt {
  spec: SpriteSpec;
  texture: Texture;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
const isFile = (v: unknown): v is string => typeof v === 'string' && /^[\w./-]+$/.test(v) && !v.includes('..');

/** Reads the index, keeping only entries that make sense (a typo in it shouldn't break the game). */
export function parseArtIndex(raw: unknown): ArtIndex {
  const out: ArtIndex = { champions: {}, fx: {}, sprites: {} };
  if (!isObj(raw)) return out;
  if (isObj(raw.champions)) {
    for (const [id, skins] of Object.entries(raw.champions)) {
      if (Array.isArray(skins)) out.champions[id as ChampionId] = skins.filter((s): s is number => Number.isInteger(s) && s >= 0 && s < 8);
    }
  }
  if (isObj(raw.fx)) {
    for (const [name, f] of Object.entries(raw.fx)) {
      if (!isObj(f) || !isFile(f.file) || !Number.isInteger(f.frames) || !Number.isInteger(f.cols) || typeof f.size !== 'number') continue;
      if ((f.frames as number) < 1 || (f.cols as number) < 1 || f.size <= 0) continue;
      out.fx[name] = {
        file: f.file,
        frames: f.frames as number,
        cols: f.cols as number,
        size: f.size,
        fps: typeof f.fps === 'number' && f.fps > 0 ? f.fps : 24,
        absolute: f.absolute === true,
        anchor: isPair(f.anchor) ? f.anchor : undefined,
        layer: f.layer === 'under' || f.layer === 'mid' || f.layer === 'top' ? f.layer : undefined,
        glow: f.glow === true,
        replace: f.replace === true,
      };
    }
  }
  if (isObj(raw.sprites)) {
    for (const [name, s] of Object.entries(raw.sprites)) {
      if (!isObj(s) || !isFile(s.file) || typeof s.width !== 'number' || s.width <= 0) continue;
      out.sprites[name] = { file: s.file, width: s.width, anchor: isPair(s.anchor) ? s.anchor : undefined };
    }
  }
  return out;
}

/** A look's parts manifest (art/champions/<id>/<skin>/parts.json): the files and where they pin. */
export interface PartsManifest {
  pxPerR: number;
  parts: Partial<Record<PartName, { file: string; origin: [number, number] }>>;
  face?: boolean;
}

export function parsePartsManifest(raw: unknown, known: readonly string[]): PartsManifest | null {
  if (!isObj(raw) || typeof raw.pxPerR !== 'number' || raw.pxPerR <= 0 || !isObj(raw.parts)) return null;
  const parts: PartsManifest['parts'] = {};
  for (const [name, p] of Object.entries(raw.parts)) {
    if (!known.includes(name) || !isObj(p) || !isFile(p.file) || !isPair(p.origin)) continue;
    parts[name as PartName] = { file: p.file, origin: p.origin };
  }
  return { pxPerR: raw.pxPerR, parts, face: raw.face === false ? false : undefined };
}

/** The frames of a sheet laid out `cols` across. */
export function sheetFrames(sheet: Texture, frames: number, cols: number): Texture[] {
  const rows = Math.ceil(frames / cols);
  const w = sheet.width / cols;
  const h = sheet.height / rows;
  return Array.from({ length: frames }, (_, i) => new Texture({ source: sheet.source, frame: new Rectangle((i % cols) * w, Math.floor(i / cols) * h, w, h) }));
}

const ROOT = `${import.meta.env.BASE_URL}art/`;
const looks = new Map<string, PartArt>();
const flipbooks = new Map<string, Flipbook>();
const sprites = new Map<string, SpriteArt>();

/** The painted parts for a champion look, if it has them (and they've loaded). */
export function partArt(champ: ChampionId, skin: number): PartArt | undefined {
  return looks.get(`${champ}:${skin}`);
}

/** A painted effect, if there is one. */
export function fxArt(name: string): Flipbook | undefined {
  return flipbooks.get(name);
}

/** A painted stand-in for something drawn, if there is one. */
export function spriteArt(name: string): SpriteArt | undefined {
  return sprites.get(name);
}

/** Every body part a manifest may name. */
export const ART_PARTS: readonly PartName[] = ['back', 'offhand', 'backUpper', 'backFore', 'backHand', 'backThigh', 'backShin', 'backFoot', 'frontThigh', 'frontShin', 'frontFoot', 'torso', 'head', 'dangle', 'weapon', 'frontUpper', 'cap', 'frontFore', 'frontHand'];

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/**
 * Loads whatever painted art the index lists, before the first figure is drawn (the menu waits on it;
 * there's little of it, and it's all small). Missing or broken pieces are skipped with a warning.
 */
export async function loadArt(): Promise<void> {
  let index: ArtIndex;
  try {
    index = parseArtIndex(await getJson(`${ROOT}index.json`));
  } catch {
    return; // no painted art yet
  }
  const jobs: Promise<void>[] = [];
  for (const [champ, skins] of Object.entries(index.champions)) {
    for (const skin of skins ?? []) {
      const dir = `${ROOT}champions/${champ}/${skin}/`;
      jobs.push(
        (async () => {
          const manifest = parsePartsManifest(await getJson(`${dir}parts.json`), ART_PARTS);
          if (!manifest) throw new Error(`${dir}parts.json isn't a parts manifest`);
          const parts: PartArt['parts'] = {};
          await Promise.all(
            Object.entries(manifest.parts).map(async ([name, p]) => {
              parts[name as PartName] = { texture: await Assets.load<Texture>(`${dir}${p!.file}`), origin: p!.origin };
            }),
          );
          looks.set(`${champ}:${skin}`, { pxPerR: manifest.pxPerR, parts, face: manifest.face });
        })(),
      );
    }
  }
  for (const [name, spec] of Object.entries(index.fx)) {
    jobs.push(
      (async () => {
        const sheet = await Assets.load<Texture>(`${ROOT}${spec.file}`);
        flipbooks.set(name, { spec, frames: sheetFrames(sheet, spec.frames, spec.cols) });
      })(),
    );
  }
  for (const [name, spec] of Object.entries(index.sprites)) {
    jobs.push(
      (async () => {
        sprites.set(name, { spec, texture: await Assets.load<Texture>(`${ROOT}${spec.file}`) });
      })(),
    );
  }
  for (const r of await Promise.allSettled(jobs)) if (r.status === 'rejected') console.warn('Painted art skipped:', r.reason);
}
