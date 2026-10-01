import { noise2 } from '../render/organic';

// The interface in the same hand-inked style as the game: panels framed by a brushed ink border (thicker
// in places, thinner in others, with a faint bronze line just inside it) over warm, grainy paper, and
// ability slots with an inked rim. Drawn once into little images at startup and handed to the CSS as
// variables (--ink-panel, --ink-slot, --ink-paper), which it uses as 9-slice border images and textures.

/** Points round a rounded rectangle, pushed in and out by noise so the edge wobbles. */
function wobblyRect(x: number, y: number, w: number, h: number, r: number, wobble: number, seed: number): [number, number][] {
  const pts: [number, number][] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  const side = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 6));
    for (let i = 1; i < n; i++) pts.push([ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n]);
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  side(x + w, y + r, x + w, y + h - r);
  corner(x + w - r, y + h - r, 0);
  side(x + w - r, y + h, x + r, y + h);
  corner(x + r, y + h - r, Math.PI / 2);
  side(x, y + h - r, x, y + r);
  corner(x + r, y + r, Math.PI);
  side(x + r, y, x + w - r, y);
  const cx = x + w / 2;
  const cy = y + h / 2;
  return pts.map(([px, py]) => {
    const d = (noise2(px * 0.08 + seed, py * 0.08, seed) - 0.5) * 2 * wobble;
    const len = Math.hypot(px - cx, py - cy) || 1;
    return [px + ((px - cx) / len) * d, py + ((py - cy) / len) * d];
  });
}

/** A brushed ring along those points: its width swells and thins the way round. */
function brush(ctx: CanvasRenderingContext2D, pts: [number, number][], width: number, color: string, seed: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const w = width * (0.55 + 0.9 * noise2(i * 0.35 + seed, 0.5, seed));
    ctx.beginPath();
    ctx.lineWidth = w;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** The frame round a panel: transparent in the middle, ink round the edge, bronze inside it. */
function panelFrame(): string {
  const [c, ctx] = canvas(96);
  brush(ctx, wobblyRect(7, 7, 82, 82, 10, 1.6, 3), 6, '#0b0908', 3);
  brush(ctx, wobblyRect(12, 12, 72, 72, 7, 1.2, 9), 1.6, 'rgba(201,160,90,0.55)', 9);
  // A little ink flick at each corner.
  ctx.strokeStyle = '#0b0908';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (const [x, y, dx, dy] of [[5, 16, 1, -1], [80, 5, 1, 1], [91, 80, -1, 1], [16, 91, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + dx * 3, y + dy * 3, x + dx * 9, y + dy * 2);
    ctx.stroke();
  }
  return c.toDataURL('image/png');
}

/** The rim of an ability or item slot. */
function slotFrame(): string {
  const [c, ctx] = canvas(64);
  brush(ctx, wobblyRect(4, 4, 56, 56, 8, 1.2, 5), 4.5, '#0b0908', 5);
  brush(ctx, wobblyRect(8, 8, 48, 48, 5, 0.8, 11), 1.8, 'rgba(201,160,90,0.7)', 11);
  return c.toDataURL('image/png');
}

/** Warm paper grain: faint fibers and specks. */
function paper(): string {
  const [c, ctx] = canvas(128);
  const img = ctx.createImageData(128, 128);
  let s = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const n = (s / 4294967296) * 30;
    img.data[i] = 255;
    img.data[i + 1] = 236;
    img.data[i + 2] = 200;
    img.data[i + 3] = n < 3 ? 26 : n < 9 ? 8 : 0;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(255,230,190,0.05)';
  for (let i = 0; i < 18; i++) {
    const x = (i * 37) % 128;
    const y = (i * 71) % 128;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 10, y + 4, x + 22, y + (i % 3) * 3);
    ctx.stroke();
  }
  return c.toDataURL('image/png');
}

/** Draws the frames and hands them to the CSS. Call once at startup. */
export function installInkUi(): void {
  const root = document.documentElement.style;
  root.setProperty('--ink-panel', `url(${panelFrame()})`);
  root.setProperty('--ink-slot', `url(${slotFrame()})`);
  root.setProperty('--ink-paper', `url(${paper()})`);
}
