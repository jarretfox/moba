import type { Graphics } from 'pixi.js';
import { blob, inkLine, inkOf, inked, rng, shade, smooth } from './organic';

// Chuds aren't all the same Chud. Each one wears whatever it found on its head (a cooking pot, a bucket,
// a traffic cone, a paper hat, a mushroom, a feather in the hood) or nothing at all, and has a face of its
// own (angry brows, worried ones, a unibrow, a moustache, a sticking plaster, an eyepatch). They cheer
// when a Shootie falls, flap about in a panic when they're nearly done for, and bicker on the march.
// Drawn in head space over the Chud's head (see chudHead in builds.ts: the skull is centered about
// (0.1, −0.36) r, the eyes at x 0.26 and 0.38, y −0.38; the mouth along y −0.18).

type Dress = (g: Graphics, r: number, random: () => number) => void;

const STEEL = 0xa9b1ba;

const HATS: readonly Dress[] = [
  // A cooking pot, handle sticking out the back.
  (g, r) => {
    inkLine(g, -0.24 * r, -0.66 * r, -0.62 * r, -0.62 * r, 5, { color: 0x2a2a2e, tip: 0.6 }, 0);
    inked(g, smooth([-0.3 * r, -0.56 * r, -0.26 * r, -0.92 * r, 0.42 * r, -0.92 * r, 0.46 * r, -0.56 * r], true, 1), STEEL, 2.5);
    g.rect(-0.34 * r, -0.6 * r, 0.84 * r, 0.06 * r).fill(shade(STEEL, 0.3));
    g.moveTo(-0.16 * r, -0.86 * r).lineTo(0.04 * r, -0.86 * r).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
  },
  // A tin bucket, upside down, its handle hanging.
  (g, r) => {
    inked(g, [-0.28 * r, -0.54 * r, -0.18 * r, -0.98 * r, 0.38 * r, -0.98 * r, 0.48 * r, -0.54 * r], 0x8a95a0, 2.5);
    for (const y of [-0.66, -0.86]) g.moveTo(-0.24 * r, y * r).lineTo(0.44 * r, y * r).stroke({ width: 1.5, color: 0x5a636c });
    g.moveTo(-0.26 * r, -0.6 * r).quadraticCurveTo(0.1 * r, -0.3 * r, 0.46 * r, -0.6 * r).stroke({ width: 2, color: 0x3a3f45 });
  },
  // A traffic cone.
  (g, r) => {
    inked(g, [-0.3 * r, -0.58 * r, 0.06 * r, -1.28 * r, 0.14 * r, -1.28 * r, 0.5 * r, -0.58 * r], 0xff7a1a, 2.5);
    inked(g, [-0.36 * r, -0.52 * r, 0.56 * r, -0.52 * r, 0.56 * r, -0.6 * r, -0.36 * r, -0.6 * r], 0xff7a1a, 2);
    g.poly([-0.16 * r, -0.84 * r, 0.36 * r, -0.84 * r, 0.3 * r, -0.96 * r, -0.1 * r, -0.96 * r]).fill(0xf6f0e0);
  },
  // A folded paper hat.
  (g, r) => {
    inked(g, [-0.36 * r, -0.6 * r, 0.06 * r, -1.08 * r, 0.5 * r, -0.6 * r], 0xefe6cf, 2);
    g.rect(-0.38 * r, -0.64 * r, 0.9 * r, 0.08 * r).fill(0xd8ccb0);
    for (const [x, y] of [[-0.04, -0.82], [0.14, -0.74], [0.02, -0.68]]) g.rect(x * r, y * r, 0.14 * r, 0.02 * r).fill({ color: 0x5a5040, alpha: 0.6 }); // newsprint
  },
  // A mushroom cap, worn like a beret.
  (g, r) => {
    inked(g, smooth([-0.36 * r, -0.6 * r, -0.24 * r, -0.9 * r, 0.22 * r, -0.96 * r, 0.52 * r, -0.66 * r], true, 2), 0xc23b3b, 2.5);
    for (const [x, y, s] of [[-0.12, -0.8, 0.05], [0.14, -0.86, 0.06], [0.34, -0.72, 0.04]]) g.circle(x * r, y * r, s * r).fill(0xf6f0e0);
  },
  // A feather stuck in the hood.
  (g, r) => {
    inked(g, smooth([-0.36 * r, -0.72 * r, -0.62 * r, -1.1 * r, -0.5 * r, -1.14 * r, -0.28 * r, -0.76 * r], true, 1), 0x4fb3d9, 1.8);
    inkLine(g, -0.32 * r, -0.72 * r, -0.56 * r, -1.1 * r, 1.4, { color: 0x1a4a6a }, 0.05);
  },
];

const FACES: readonly Dress[] = [
  // Angry brows.
  (g, r) => {
    for (const x of [0.26, 0.38]) inkLine(g, (x - 0.06) * r, -0.5 * r, (x + 0.05) * r, -0.45 * r, 3, { color: 0x1a1414 }, 0);
  },
  // Worried brows.
  (g, r) => {
    for (const x of [0.26, 0.38]) inkLine(g, (x - 0.06) * r, -0.45 * r, (x + 0.05) * r, -0.5 * r, 2.6, { color: 0x1a1414 }, 0);
  },
  // A unibrow.
  (g, r) => {
    g.moveTo(0.19 * r, -0.47 * r).quadraticCurveTo(0.32 * r, -0.53 * r, 0.45 * r, -0.47 * r).stroke({ width: 3.5, color: 0x1a1414, cap: 'round' });
  },
  // A droopy moustache.
  (g, r) => {
    inked(g, smooth([0.22 * r, -0.24 * r, 0.42 * r, -0.26 * r, 0.46 * r, -0.14 * r, 0.4 * r, -0.2 * r, 0.3 * r, -0.2 * r, 0.2 * r, -0.12 * r], true, 1), 0x3a2a1c, 1.4);
  },
  // A sticking plaster on the cheek.
  (g, r) => {
    g.roundRect(0.08 * r, -0.32 * r, 0.14 * r, 0.06 * r, 0.02 * r).fill(0xf2d2a8).stroke({ width: 1.2, color: 0x8a6a4a });
    g.moveTo(0.11 * r, -0.29 * r).lineTo(0.19 * r, -0.29 * r).stroke({ width: 1, color: 0x8a6a4a });
  },
  // An eyepatch over the front eye.
  (g, r) => {
    g.moveTo(-0.08 * r, -0.5 * r).lineTo(0.44 * r, -0.36 * r).stroke({ width: 1.6, color: 0x1a1414 });
    inked(g, blob(0.38 * r, -0.38 * r, 0.07 * r, 0.065 * r, 3, 0.05, 10), 0x1a1414, 1.2);
  },
  // Warts.
  (g, r, random) => {
    for (let i = 0; i < 2; i++) g.circle((0.0 + random() * 0.2) * r, (-0.3 - random() * 0.08) * r, 0.025 * r).fill(0x6e7a46).stroke({ width: 1, color: inkOf(0x6e7a46) });
  },
];

/**
 * Dresses one Chud, the same way every time for the same `seed` (its id): a hat (most of them; brutes
 * already wear spikes, so only ever a pot) and a face. Returns what it picked, for tests.
 */
export function dressChud(g: Graphics, r: number, seed: number, brute = false): { hat: number; face: number } {
  const random = rng(seed * 7919 + 13);
  g.clear();
  let hat = -1;
  if (brute ? random() < 0.3 : random() < 0.7) {
    hat = brute ? 0 : Math.floor(random() * HATS.length);
    HATS[hat](g, r, random);
  }
  const face = random() < 0.75 ? Math.floor(random() * FACES.length) : -1;
  if (face >= 0) FACES[face](g, r, random);
  return { hat, face };
}

/** What one Chud says to another on the march, and what it gets back. */
export const BICKER: readonly (readonly [string, string])[] = [
  ['Oi!', 'Wot?'],
  ['#@!%', '#@!% yerself'],
  ['Stop shovin\'', 'You stop shovin\''],
  ['That\'s MY club', 'Finders keepers'],
  ['Are we there yet?', 'NO.'],
  ['You smell', 'You smell worse'],
  ['He started it', 'Did not!'],
  ['Nice hat', '...thanks?'],
  ['Shuddup', 'YOU shuddup'],
];

/** A cheer when a Shootie falls. */
export const CHEERS: readonly string[] = ['WAHEY!', 'Hooray!', 'Down it goes!', 'Yeah!!', 'Timber!'];
