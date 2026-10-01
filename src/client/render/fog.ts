import { Sprite, Texture } from 'pixi.js';
import type { Team } from '../../shared/constants';
import type { EntitySnap } from '../../shared/protocol';
import { sightOf } from '../../shared/sim/sight';
import type { VisionGrid, VisionSource } from '../../shared/sim/vision';

/** How dark unseen ground is (0–255). Terrain stays readable; you just can't see who's on it. */
const FOG_ALPHA = 150;
/** Seconds between fog redraws. */
const REFRESH = 0.1;
/** Always-fogged cells around the map, so the fog fades out past the edge instead of stopping in a hard line. */
const PAD = 8;

/**
 * Darkens what your team can't see. The client works this out itself from your team's own units
 * (which the host always sends), using the same vision code as the host — so it costs no bandwidth.
 * One pixel per vision cell, stretched over the map with smoothing, gives soft edges for free.
 */
export class FogLayer {
  readonly sprite: Sprite;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly visible: Uint8Array;
  private readonly texture: Texture;
  private nextAt = 0;

  constructor(private readonly grid: VisionGrid) {
    const canvas = document.createElement('canvas');
    canvas.width = grid.cols + PAD * 2;
    canvas.height = grid.rows + PAD * 2;
    this.ctx = canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < this.image.data.length; i += 4) {
      this.image.data[i] = 4;
      this.image.data[i + 1] = 7;
      this.image.data[i + 2] = 10;
      this.image.data[i + 3] = FOG_ALPHA;
    }
    this.visible = new Uint8Array(grid.cols * grid.rows);
    this.texture = Texture.from(canvas);
    this.texture.source.scaleMode = 'linear'; // smooth the 100×-stretched pixels into soft fog edges
    this.sprite = new Sprite(this.texture);
    this.sprite.scale.set(grid.cellSize);
    this.sprite.position.set(-PAD * grid.cellSize, -PAD * grid.cellSize);
  }

  /** Paints the fog (without its padding) into another canvas, scaled to w × h: the minimap. */
  drawOn(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.drawImage(this.ctx.canvas, PAD, PAD, this.grid.cols, this.grid.rows, 0, 0, w, h);
  }

  update(ents: Iterable<EntitySnap>, team: Team, now: number): void {
    if (now < this.nextAt) return;
    this.nextAt = now + REFRESH;
    const sources: VisionSource[] = [];
    for (const e of ents) {
      if (e.tm !== team || e.dead) continue;
      // Wards see as far as their radius; the Lantern's light sees into brush and over walls.
      if (e.k === 'ward') sources.push({ x: e.x, y: e.y, sight: e.r, pierce: e.vis === 'lantern' });
      const sight = sightOf(e.k, e.role);
      if (sight > 0) sources.push({ x: e.x, y: e.y, sight });
    }
    this.grid.compute(sources, this.visible);
    const data = this.image.data;
    const { cols, rows } = this.grid;
    const stride = cols + PAD * 2;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) data[((r + PAD) * stride + c + PAD) * 4 + 3] = this.visible[r * cols + c] ? 0 : FOG_ALPHA;
    }
    this.ctx.putImageData(this.image, 0, 0);
    this.texture.source.update();
  }
}
