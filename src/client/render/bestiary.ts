import { Container, Graphics, Rectangle, type Renderer } from 'pixi.js';
import { Beast, type BeastKind } from './beasts';
import { UNIT_BUILDS, unitPalette } from './builds';
import { Rig, type Figure } from './rig';
import { PALETTE } from './views';

// Portraits of what lives in the jungle (and the river and the pit), for the jungle legend: each drawn once
// at startup from its own figure, standing, on a dark disc, like the champions' portraits.

export type BestiaryKey = 'ratKing' | 'mossback' | 'emberToad' | 'glowcap' | 'crab' | 'warden';

const PORTRAITS: Partial<Record<BestiaryKey, string>> = {};

export function bestiaryPortrait(key: BestiaryKey): string | undefined {
  return PORTRAITS[key];
}

/** Draws every portrait with the game's renderer (call once, after it's ready). */
export function renderBestiary(renderer: Renderer): void {
  const R = 40;
  for (const key of ['ratKing', 'mossback', 'emberToad', 'glowcap', 'crab', 'warden'] as const) {
    const figure: Figure = key === 'warden' ? new Rig(UNIT_BUILDS['monster:warden'], R, unitPalette(PALETTE.neutral)) : new Beast(key as BeastKind, R);
    figure.update({ dt: 0, speed: 0, facing: 1, turn: 0, reach: 0, twist: 0, lunge: 0, grow: 0, stretch: 0, air: 0 });
    const root = new Container();
    const bg = new Graphics().circle(0, 0, R * 1.7).fill(0x10161f).circle(0, 0, R * 1.7).stroke({ width: 3, color: 0x2b3440 });
    // The whole creature, standing on the disc's lower edge.
    const k = Math.min((R * 2.6) / Math.max(1, figure.height), 2.2);
    figure.root.scale.set(k);
    figure.root.position.set(0, R * 1.15);
    root.addChild(bg, figure.root);
    const canvas = renderer.extract.canvas({ target: root, frame: new Rectangle(-R * 1.7, -R * 1.7, R * 3.4, R * 3.4), resolution: 1.5 });
    PORTRAITS[key] = (canvas as HTMLCanvasElement).toDataURL('image/png');
    root.destroy({ children: true });
  }
}
