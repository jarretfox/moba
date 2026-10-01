import { Application, Graphics, Text } from 'pixi.js';
import type { Team } from '../../shared/constants';
import type { ScoreRow } from '../../shared/protocol';
import { BUILDS } from '../render/builds';
import { palette } from '../render/champions';
import { endPose, liesDown, type EndPose } from '../render/poses';
import { Rig, type RigInput } from '../render/rig';
import { PALETTE } from '../render/views';

// The end screen's line-up: everyone in the match, live, in what they bought. The winners on the left
// celebrate in character; the losers on the right slump, turned away. A little renderer of its own.

const W = 640;
const H = 196;
/** How tall a figure stands on the podium, in pixels. */
const TALL = 104;
/** Room for each of them, side by side. */
const SLOT = 98;
const FONT = "'Lilita One', 'Nunito', system-ui, sans-serif";

const still: RigInput = { dt: 0, speed: 0, facing: 1, turn: 0, reach: 0, twist: 0, lunge: 0, grow: 0, stretch: 0, air: 0 };

export class Podium {
  readonly canvas = document.createElement('canvas');
  private readonly app = new Application();
  private readonly cast: { rig: Rig; pose: EndPose; facing: number }[] = [];
  private clock = 0;

  constructor(rows: readonly ScoreRow[], winner: Team, myTeam: Team) {
    this.canvas.className = 'gameover-podium';
    void this.app
      .init({ canvas: this.canvas, width: W, height: H, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true })
      .then(() => {
        // Sized by the stylesheet (smaller on a crowded end screen), not by the renderer.
        this.canvas.style.width = this.canvas.style.height = '';
        this.build(rows, winner, myTeam);
        this.app.ticker.add((t) => this.tick(t.deltaMS / 1000));
      })
      .catch(() => undefined);
  }

  private build(rows: readonly ScoreRow[], winner: Team, myTeam: Team): void {
    const won = rows.filter((r) => r.team === winner);
    const lost = rows.filter((r) => r.team !== winner);
    const place = (row: ScoreRow, x: number, win: boolean) => {
      const shadow = new Graphics().ellipse(x, H - 34, 30, 7).fill({ color: 0x000000, alpha: 0.4 });
      const rig = new Rig(BUILDS[row.champ], 60, palette(row.champ, row.skin ?? 0));
      rig.setGear(row.items);
      rig.root.scale.set(TALL / rig.height);
      // Lying flat, they stretch out to the right of their spot: shift them back so they stay in it.
      rig.root.position.set(liesDown(row.champ, win) ? x - TALL * 0.45 : x, H - 34);
      const name = new Text({ text: row.name, style: { fontFamily: FONT, fontSize: 14, fill: row.team === myTeam ? PALETTE.ally : PALETTE.enemy, stroke: { color: 0x000000, width: 4 } } });
      // Cut short to fit under them, so names never run into each other.
      for (let n = row.name.length - 1; name.width > SLOT - 8 && n > 3; n--) name.text = `${row.name.slice(0, n).trimEnd()}…`;
      name.anchor.set(0.5, 0);
      name.position.set(x, H - 24);
      this.app.stage.addChild(shadow, rig.root, name);
      // Everyone faces right: the winners toward the losers, the losers turning their backs on them.
      this.cast.push({ rig, pose: endPose(row.champ, win), facing: 1 });
    };
    // Winners from the left edge in, losers from the middle out, with a gap between.
    won.forEach((row, i) => place(row, 62 + i * SLOT, true));
    lost.forEach((row, i) => place(row, W - 62 - (lost.length - 1 - i) * SLOT, false));
    // Each starts their routine at a different moment, so they're not in step.
    this.cast.forEach((c, i) => c.rig.update({ ...still, ...c.pose(i * 0.37), facing: c.facing, dt: 1 / 60 }));
  }

  private tick(dt: number): void {
    this.clock += dt;
    this.cast.forEach((c, i) => c.rig.update({ ...still, ...c.pose(this.clock + i * 0.37), facing: c.facing, dt }));
  }

  destroy(): void {
    this.app.destroy({ removeView: true }, { children: true });
  }
}
