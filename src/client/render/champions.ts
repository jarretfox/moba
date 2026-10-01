import { Container, Graphics, Rectangle, type Renderer } from 'pixi.js';
import type { ChampionId } from '../../shared/champions/types';

// Champion art, drawn in code like the rest of the game. Every figure is seen from above, facing right
// (+x), sized to the champion's radius `r`, and lives on the layer that turns to face where they're going.
// The team shows as a colored ring underneath (drawChampionBase), so the figures keep their own colors.

const OUTLINE = { width: 2, color: 0x0b0f14 };
const SKIN = 0xd6a274;
const CHUD_SKIN = 0x87916c;

/** The disc under a champion: shadow, a ring in their team's color, and a white edge for yourself. */
export function drawChampionBase(g: Graphics, r: number, teamColor: number, self: boolean): void {
  g.circle(4, 6, r).fill({ color: 0x000000, alpha: 0.35 });
  g.circle(0, 0, r).fill({ color: teamColor, alpha: 0.22 }).stroke({ width: 5, color: teamColor });
  if (self) g.circle(0, 0, r + 4).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
}

export function drawChampionFigure(g: Graphics, id: ChampionId, r: number): void {
  FIGURES[id](g, r);
}

const FIGURES: Record<ChampionId, (g: Graphics, r: number) => void> = {
  /** A hooded archer in a green cloak, an arrow on the string and a quiver on her back. */
  marksman(g, r) {
    g.ellipse(-0.15 * r, 0, 0.95 * r, 0.85 * r).fill(0x2f5d3a).stroke(OUTLINE); // cloak
    g.roundRect(-1.05 * r, 0.1 * r, 0.6 * r, 0.3 * r, 4).fill(0x6b4a2b).stroke(OUTLINE); // quiver
    for (const y of [0.13, 0.25, 0.37]) g.poly([-1.2 * r, y * r - 4, -1.05 * r, y * r, -1.2 * r, y * r + 4]).fill(0xe8d7b0);
    g.circle(0.1 * r, 0, 0.48 * r).fill(0x3d7a4a).stroke(OUTLINE); // hood
    g.circle(0.3 * r, 0, 0.22 * r).fill(0x1d2a20); // face in shadow
    g.circle(0.55 * r, 0.35 * r, 0.14 * r).fill(SKIN); // drawing hand
    g.arc(0.35 * r, 0, 0.95 * r, -1.15, 1.15).stroke({ width: 4, color: 0x8a5a2b }); // bow
    const tip = { x: 0.35 * r + Math.cos(1.15) * 0.95 * r, y: Math.sin(1.15) * 0.95 * r };
    g.moveTo(tip.x, -tip.y).lineTo(0.35 * r, 0).lineTo(tip.x, tip.y).stroke({ width: 1.5, color: 0xf2efe6 }); // string
    g.moveTo(0.35 * r, 0).lineTo(1.4 * r, 0).stroke({ width: 2, color: 0xe8d7b0 }); // arrow
    g.poly([1.4 * r, -5, 1.6 * r, 0, 1.4 * r, 5]).fill(0xb8bec6);
  },

  /** Broad shoulders, fur pauldrons, a horned helmet, a great axe, and a broken shackle on one wrist. */
  barbarian(g, r) {
    g.ellipse(0, 0, 0.75 * r, 1.0 * r).fill(SKIN).stroke(OUTLINE); // shoulders
    for (const side of [-1, 1]) {
      g.circle(-0.05 * r, side * 0.68 * r, 0.38 * r).fill(0x6b4a2b).stroke(OUTLINE); // fur
      for (const [x, y] of [[-0.2, 0.55], [0.1, 0.6], [-0.05, 0.85]]) g.circle(x * r, side * y * r, 0.1 * r).fill(0x8a6a44);
    }
    g.moveTo(0.3 * r, 0.75 * r).lineTo(1.35 * r, 0.55 * r).stroke({ width: 5, color: 0x6b4a2b }); // axe haft
    g.poly([1.15 * r, 0.15 * r, 1.5 * r, 0.3 * r, 1.55 * r, 0.75 * r, 1.15 * r, 0.95 * r, 1.25 * r, 0.55 * r]).fill(0xb8bec6).stroke(OUTLINE); // blade
    g.circle(0.15 * r, 0, 0.42 * r).fill(SKIN).stroke(OUTLINE); // head
    g.circle(0.1 * r, 0, 0.36 * r).fill(0x8a9099).stroke(OUTLINE); // helmet
    for (const side of [-1, 1]) g.poly([0.05 * r, side * 0.3 * r, 0.6 * r, side * 0.8 * r, 0.32 * r, side * 0.24 * r]).fill(0xefe3c8).stroke(OUTLINE); // horns
    for (let i = 0; i < 3; i++) g.ellipse(0.35 * r + i * 7, -0.85 * r - i * 3, 4, 2.5).stroke({ width: 2, color: 0x8a9099 }); // broken chain
  },

  /** A Chud in goggles and a trash-can-lid crown, a sack of junk on his back and a hook in his fist. */
  willmore(g, r) {
    g.circle(-0.65 * r, 0.1 * r, 0.5 * r).fill(0x7a6a4a).stroke(OUTLINE); // junk sack
    g.moveTo(-0.9 * r, -0.05 * r).lineTo(-0.45 * r, 0.3 * r).stroke({ width: 2, color: 0x4a3f2a }); // a patch
    g.circle(0, 0, 0.8 * r).fill(CHUD_SKIN).stroke(OUTLINE); // body
    g.circle(0.05 * r, 0, 0.36 * r).fill(0x9aa1ab).stroke(OUTLINE); // the lid
    g.roundRect(-0.03 * r, -0.08 * r, 0.16 * r, 0.16 * r, 2).fill(0x5d636d);
    g.moveTo(0.5 * r, -0.28 * r).lineTo(0.5 * r, 0.28 * r).stroke({ width: 3, color: 0x6b5a22 }); // goggle strap
    for (const side of [-1, 1]) g.circle(0.55 * r, side * 0.28 * r, 0.2 * r).fill(0x9fe6ff).stroke({ width: 3, color: 0xb8a46a }); // goggles
    g.moveTo(0.3 * r, 0.6 * r).lineTo(0.85 * r, 0.75 * r).stroke({ width: 2, color: 0x8a6a44 }); // rope
    g.arc(1.0 * r, 0.6 * r, 0.22 * r, -0.5, 3.4).stroke({ width: 4, color: 0x5d636d }); // hook
  },

  /** A Chud under a spotted mushroom cap, eyes glowing green, with a staff topped by a glowing spore. */
  hunnag(g, r) {
    g.circle(0, 0, 0.8 * r).fill(CHUD_SKIN).stroke(OUTLINE); // body
    g.moveTo(0.2 * r, 0.65 * r).lineTo(1.25 * r, 0.5 * r).stroke({ width: 3, color: 0x6b4a2b }); // staff
    g.circle(1.3 * r, 0.5 * r, 0.36 * r).fill({ color: 0x8fd14f, alpha: 0.25 });
    g.circle(1.3 * r, 0.5 * r, 0.18 * r).fill(0xb8f07a).stroke({ width: 1.5, color: 0x3d6a14 });
    g.ellipse(-0.1 * r, 0, 0.9 * r, 0.85 * r).fill(0x7a3fb0).stroke(OUTLINE); // the cap
    for (const [x, y, rr] of [[-0.45, -0.35, 0.16], [-0.1, 0.4, 0.13], [-0.55, 0.25, 0.1], [0.15, -0.3, 0.12], [-0.25, -0.05, 0.09]]) g.circle(x * r, y * r, rr * r).fill(0xe8d7ff);
    for (const side of [-1, 1]) g.circle(0.62 * r, side * 0.2 * r, 0.09 * r).fill(0xb8f07a); // eyes under the brim
    for (const [x, y] of [[0.9, -0.5], [0.4, -0.85], [-0.8, 0.75]]) g.circle(x * r, y * r, 2.5).fill({ color: 0xb8f07a, alpha: 0.8 }); // spores
  },

  /** A lion from above: a great mane, muzzle forward, and a broken collar from the royal cage. */
  logan(g, r) {
    const mane: number[] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = i % 2 === 0 ? 1.05 * r : 0.82 * r;
      mane.push(Math.cos(a) * rr - 0.05 * r, Math.sin(a) * rr);
    }
    g.poly(mane).fill(0xd98a2b).stroke({ width: 2, color: 0x8a4f12 });
    g.circle(0, 0, 0.7 * r).fill(0xe8a33d);
    g.arc(-0.05 * r, 0, 0.62 * r, 2.2, 4.1).stroke({ width: 4, color: 0x8a9099 }); // the broken collar
    g.ellipse(-0.75 * r, -0.62 * r, 4, 2.5).stroke({ width: 2, color: 0x8a9099 });
    for (const side of [-1, 1]) g.circle(-0.02 * r, side * 0.48 * r, 0.14 * r).fill(0xd98a2b).stroke({ width: 1.5, color: 0x8a4f12 }); // ears
    g.ellipse(0.35 * r, 0, 0.42 * r, 0.32 * r).fill(0xf2c27a).stroke({ width: 1.5, color: 0x8a4f12 }); // muzzle
    for (const side of [-1, 1]) g.circle(0.2 * r, side * 0.2 * r, 0.06 * r).fill(0x2e1a08); // eyes
    g.poly([0.62 * r, -0.1 * r, 0.75 * r, 0, 0.62 * r, 0.1 * r]).fill(0x5a2e12); // nose
  },

  /** The king from above: a red cape, an ermine collar, a jeweled crown, and a gold scepter. */
  kingrix(g, r) {
    g.ellipse(-0.35 * r, 0, 0.85 * r, 0.95 * r).fill(0xa8232e).stroke(OUTLINE); // cape
    g.ellipse(0, 0, 0.5 * r, 0.72 * r).fill(0xf2f2f2).stroke(OUTLINE); // ermine
    for (const [x, y] of [[-0.25, -0.45], [-0.3, 0.4], [0.2, -0.55], [0.15, 0.55], [-0.4, 0]]) g.ellipse(x * r, y * r, 2, 3).fill(0x111111);
    g.moveTo(0.3 * r, 0.6 * r).lineTo(1.2 * r, 0.45 * r).stroke({ width: 3, color: 0xd9a52b }); // scepter
    g.circle(1.25 * r, 0.44 * r, 0.15 * r).fill(0xffd166).stroke({ width: 1.5, color: 0x8a6a1e });
    g.circle(1.25 * r, 0.44 * r, 0.06 * r).fill(0xc0182b);
    g.circle(0.1 * r, 0, 0.33 * r).fill(SKIN).stroke(OUTLINE); // head
    g.circle(0.1 * r, 0, 0.28 * r).stroke({ width: 5, color: 0xffd166 }); // crown band
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.circle(0.1 * r + Math.cos(a) * 0.28 * r, Math.sin(a) * 0.28 * r, 0.07 * r).fill(i % 2 ? 0xc0182b : 0x3d8bfd).stroke({ width: 1, color: 0x8a6a1e });
    }
  },
};

/** Portraits, filled in once at startup by renderPortraits. */
export const PORTRAITS: Partial<Record<ChampionId, string>> = {};

/**
 * One small picture per champion, for the HUD and the champion select: the figure facing up on a dark
 * disc. Rendered once with the game's own renderer, so the art only lives in one place.
 */
export function renderPortraits(renderer: Renderer, ids: readonly ChampionId[]): Record<ChampionId, string> {
  const out = {} as Record<ChampionId, string>;
  const R = 40;
  for (const id of ids) {
    const root = new Container();
    const bg = new Graphics().circle(0, 0, R * 1.7).fill(0x10161f);
    const fig = new Graphics();
    drawChampionFigure(fig, id, R);
    fig.rotation = -Math.PI / 2; // facing up, at the viewer
    fig.scale.set(1.15);
    root.addChild(bg, fig);
    const canvas = renderer.extract.canvas({ target: root, frame: new Rectangle(-R * 1.7, -R * 1.7, R * 3.4, R * 3.4), resolution: 2 });
    out[id] = (canvas as HTMLCanvasElement).toDataURL('image/png');
    root.destroy({ children: true });
  }
  return out;
}
