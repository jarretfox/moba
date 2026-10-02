import { Container, Graphics, Rectangle, type Renderer } from 'pixi.js';
import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { ChampionId } from '../../shared/champions/types';
import { ART_PARTS, type PartsManifest } from './art';
import { palette } from './champions';
import { buildFor } from './costumes';
import { Rig } from './rig';

// Dev only: the templates for painting a champion look (`bakeArt('scrimby')` in the console of a dev build).
// Each body part as it's drawn now, at high resolution, cut out exactly where the rig pins it, plus the
// parts.json that pins them. Paint over each picture (same size, same place), drop the set in
// public/art/champions/<id>/<skin>/, list it in public/art/index.json, and the painting walks, swings,
// flinches and dies exactly as the drawn figure does. Also the whole figure standing (for an AI image
// tool or an artist to work from) and a guide with every joint marked. See docs/art-bible.md.

/** Pixels per r in the templates: a champion of radius 32 drawn 10× over (a head about 300 pixels across), room to paint detail. */
export const TEMPLATE_PX_PER_R = 320;
/** Room left round each part, in r, for a painting that spills a little past the drawn outline. */
const PAD = 0.12;

async function save(path: string, canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  const blob = canvas instanceof HTMLCanvasElement ? await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png')) : await canvas.convertToBlob({ type: 'image/png' });
  if (!blob) throw new Error(`couldn't make ${path}`);
  return (await fetch(`__save?path=${encodeURIComponent(path)}`, { method: 'POST', body: blob })).text();
}

async function saveText(path: string, text: string): Promise<string> {
  return (await fetch(`__save?path=${encodeURIComponent(path)}`, { method: 'POST', body: text })).text();
}

/** Writes a look's templates to art-templates/<id>/<skin>/. Returns the files written. */
export async function bakeArt(renderer: Renderer, id: ChampionId, skin = 0, pxPerR = TEMPLATE_PX_PER_R): Promise<string[]> {
  const r = 32;
  const rig = new Rig(buildFor(id, skin, true), r, palette(id, skin));
  const dir = `art-templates/${id}/${skin}`;
  const written: string[] = [];
  const manifest: PartsManifest = { pxPerR, parts: {} };
  for (const name of ART_PARTS) {
    const part = rig.part[name];
    if (!part.context.instructions.length) continue;
    // A fresh copy with no pose on it: the part in its own space, joint at (0, 0).
    const copy = new Graphics(part.context);
    const b = copy.getLocalBounds();
    const frame = new Rectangle(b.minX - PAD * r, b.minY - PAD * r, b.maxX - b.minX + 2 * PAD * r, b.maxY - b.minY + 2 * PAD * r);
    const canvas = renderer.extract.canvas({ target: copy, frame, resolution: pxPerR / r, antialias: true });
    written.push(await save(`${dir}/${name}.png`, canvas as HTMLCanvasElement));
    manifest.parts[name] = { file: `${name}.png`, origin: [+(frame.x / r).toFixed(4), +(frame.y / r).toFixed(4)] };
    copy.destroy();
  }
  written.push(await saveText(`${dir}/parts.json`, JSON.stringify(manifest, null, 2)));

  // The whole figure standing, facing right: the reference to paint from.
  rig.update({ dt: 0, speed: 0, facing: 1, turn: 0, reach: 0, twist: 0, lunge: 0, grow: 0, stretch: 0, air: 0 });
  const stand = new Container();
  stand.addChild(rig.root);
  const whole = stand.getLocalBounds();
  const pad = 0.3 * r;
  const frame = new Rectangle(whole.minX - pad, whole.minY - pad, whole.maxX - whole.minX + 2 * pad, whole.maxY - whole.minY + 2 * pad);
  written.push(await save(`${dir}/full.png`, renderer.extract.canvas({ target: stand, frame, resolution: pxPerR / r, antialias: true }) as HTMLCanvasElement));

  // The guide: the same, every joint marked with a red cross and labelled.
  const marks = new Graphics();
  const z = rig.root.children[0] as Container;
  for (const name of Object.keys(manifest.parts)) {
    const p = rig.part[name as keyof typeof rig.part];
    const at = z.toLocal(p.getGlobalPosition(), undefined);
    marks.moveTo(at.x - 4, at.y).lineTo(at.x + 4, at.y).moveTo(at.x, at.y - 4).lineTo(at.x, at.y + 4).stroke({ width: 1.2, color: 0xff2a2a });
  }
  z.addChild(marks);
  written.push(await save(`${dir}/guide.png`, renderer.extract.canvas({ target: stand, frame, resolution: pxPerR / r, antialias: true }) as HTMLCanvasElement));
  written.push(
    await saveText(
      `${dir}/README.txt`,
      [
        `${CHAMPION_INFO[id].name}, look ${skin}: painting templates.`,
        '',
        'full.png    the whole figure standing, facing right: the reference to paint from.',
        'guide.png   the same with every joint marked (red crosses): where each part pins and turns.',
        '<part>.png  each body part as drawn now, cut out where the rig pins it.',
        'parts.json  where each picture sits (origin, in units of the unit radius r) and its scale (pxPerR).',
        '',
        'Paint over each <part>.png keeping its size and the drawing in the same place (the joint must stay',
        "where it is). Transparent background, facing right. Then copy the folder to public/art/champions/",
        `${id}/${skin}/ and add "${id}": [${skin}] under "champions" in public/art/index.json.`,
        'See docs/art-bible.md for the style.',
      ].join('\n'),
    ),
  );
  stand.destroy({ children: true });
  return written;
}
