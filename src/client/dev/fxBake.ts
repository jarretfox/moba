// Dev only: builds the particle atlas (public/art/particles.png and particles.json) from free CC0 textures:
// Kenney's Particle Pack (white, so they can be tinted any color) and Smoke Particles (soft colored puffs).
// They're unpacked under incoming/vfx/ (not in the repo; public/CREDITS.md says where they're from).
// In a dev build's console: `await bakeParticles()`. See render/particles.ts for how they're used.

/** Each atlas shape: its source images (incoming/vfx/<dir>/<name>.png) and how big to draw them for their size. */
export const ATLAS: Record<string, { dir: string; files: string[]; scale: number; turn?: Record<string, number> }> = {
  // Soft smoke, for any smoke the effects throw (tinted).
  smoke: { dir: 'particles', files: ['smoke_02', 'smoke_03', 'smoke_04', 'smoke_05', 'smoke_06', 'smoke_07', 'smoke_08'], scale: 1.5 },
  // Streaks, for sparks flying (stretched along their flight).
  spark: { dir: 'particles', files: ['trace_01_rotated', 'trace_02_rotated', 'trace_03_rotated', 'trace_04_rotated', 'trace_05_rotated'], scale: 1.2 },
  star: { dir: 'particles', files: ['star_01', 'star_02', 'star_03', 'star_04', 'star_05', 'star_06', 'star_07', 'star_08', 'star_09'], scale: 1.4 },
  flame: { dir: 'particles', files: ['flame_01', 'flame_02', 'flame_03', 'flame_04', 'fire_01', 'fire_02'], scale: 1.3 },
  magic: { dir: 'particles', files: ['magic_01', 'magic_02', 'magic_03', 'magic_04', 'magic_05'], scale: 1.25 },
  twirl: { dir: 'particles', files: ['twirl_01', 'twirl_02', 'twirl_03'], scale: 1.25 },
  // Crescent swooshes of a blade (all turned to bulge forward, +x, so a swing's angle points them), and claw marks.
  slash: { dir: 'particles', files: ['slash_02', 'slash_03', 'slash_04'], scale: 1.25, turn: { slash_02: -90, slash_04: 90 } },
  claw: { dir: 'particles', files: ['slash_01', 'scratch_01'], scale: 1.25 },
  circle: { dir: 'particles', files: ['circle_01', 'circle_02', 'circle_03', 'circle_04', 'circle_05'], scale: 1.15 },
  flare: { dir: 'particles', files: ['light_01', 'light_02', 'light_03', 'flare_01'], scale: 1.4 },
  scorch: { dir: 'particles', files: ['scorch_01', 'scorch_02', 'scorch_03'], scale: 1.2 },
  dirt: { dir: 'particles', files: ['dirt_01', 'dirt_02', 'dirt_03'], scale: 1.3 },
  muzzle: { dir: 'particles', files: ['muzzle_01', 'muzzle_02', 'muzzle_03', 'muzzle_04', 'muzzle_05'], scale: 1.25 },
  zap: { dir: 'particles', files: ['spark_01', 'spark_02', 'spark_03', 'spark_04'], scale: 1.25 },
  heart: { dir: 'particles', files: ['symbol_01'], scale: 1.2 },
  // The soft puffs, in their own colors (left white, or tinted lightly).
  cloud: { dir: 'frames/puff', files: ['whitePuff00', 'whitePuff03', 'whitePuff06', 'whitePuff09', 'whitePuff12', 'whitePuff15', 'whitePuff18', 'whitePuff21'], scale: 1.35 },
  soot: { dir: 'frames/blacksmoke', files: ['blackSmoke00', 'blackSmoke03', 'blackSmoke06', 'blackSmoke09', 'blackSmoke12', 'blackSmoke15', 'blackSmoke18', 'blackSmoke21'], scale: 1.35 },
  blast: { dir: 'frames/explosion', files: ['explosion00', 'explosion01', 'explosion02', 'explosion03', 'explosion04', 'explosion05', 'explosion06', 'explosion07', 'explosion08'], scale: 1.3 },
  flash: { dir: 'frames/flash', files: ['flash00', 'flash01', 'flash02', 'flash03', 'flash04', 'flash05'], scale: 1.3 },
};

/** Cell size in the atlas: plenty for particles, which are rarely more than a hundred pixels across. */
export const ATLAS_CELL = 128;
const COLS = 16;

export interface ParticleAtlas {
  cell: number;
  /** Each shape: its cells (index across, then down) and its draw scale. */
  shapes: Record<string, { cells: number[]; scale: number }>;
}

async function image(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return createImageBitmap(await res.blob());
}

export async function bakeParticles(): Promise<{ size: [number, number]; shapes: number; bytes: number }> {
  const all = Object.entries(ATLAS).flatMap(([shape, s]) => s.files.map((f) => ({ shape, url: `/incoming/vfx/${s.dir}/${f}.png`, turn: s.turn?.[f] ?? 0 })));
  const rows = Math.ceil(all.length / COLS);
  const canvas = document.createElement('canvas');
  canvas.width = COLS * ATLAS_CELL;
  canvas.height = rows * ATLAS_CELL;
  const ctx = canvas.getContext('2d')!;
  const meta: ParticleAtlas = { cell: ATLAS_CELL, shapes: {} };
  for (const [i, { shape, url, turn }] of all.entries()) {
    const img = await image(url);
    // Fit the picture in its cell, centered, keeping its shape (turned, for those that face another way).
    const k = Math.min(ATLAS_CELL / img.width, ATLAS_CELL / img.height);
    const w = img.width * k;
    const h = img.height * k;
    ctx.save();
    ctx.translate((i % COLS) * ATLAS_CELL + ATLAS_CELL / 2, Math.floor(i / COLS) * ATLAS_CELL + ATLAS_CELL / 2);
    ctx.rotate((turn * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
    (meta.shapes[shape] ??= { cells: [], scale: ATLAS[shape].scale }).cells.push(i);
  }
  const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), 'image/png'));
  for (const [path, body] of [['public/art/particles.png', blob], ['public/art/particles.json', JSON.stringify(meta, null, 1) + '\n']] as const) {
    const res = await fetch(`__save?path=${encodeURIComponent(path)}`, { method: 'POST', body });
    if (!res.ok) throw new Error(`saving ${path}: ${res.status}`);
  }
  return { size: [canvas.width, canvas.height], shapes: Object.keys(meta.shapes).length, bytes: blob.size };
}
