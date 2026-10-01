import { Container, Graphics, Rectangle, type Renderer } from 'pixi.js';
import { ICON_ART, iconKey } from './iconArt';

/** Icon pictures as image URLs, keyed by iconKey(emoji); filled in once at startup by renderIcons. */
const URLS = new Map<string, string>();

/** Draws every icon once with the game's renderer (with a soft drop shadow) and keeps the pictures. */
export function renderIcons(renderer: Renderer): void {
  const H = 34; // half the frame: the art fits in ±32, plus room for the shadow
  for (const [key, draw] of Object.entries(ICON_ART)) {
    const root = new Container();
    const art = new Graphics();
    draw(art);
    const shadow = new Graphics(art.context);
    shadow.tint = 0x000000;
    shadow.alpha = 0.4;
    shadow.position.set(1.5, 2.5);
    root.addChild(shadow, art);
    const canvas = renderer.extract.canvas({ target: root, frame: new Rectangle(-H, -H, H * 2, H * 2), resolution: 2 });
    URLS.set(key, (canvas as HTMLCanvasElement).toDataURL('image/png'));
    root.destroy({ children: true });
  }
}

/** The picture for an icon, or undefined before renderIcons has run (or for an emoji with no art). */
export function iconUrl(emoji: string): string | undefined {
  return URLS.get(iconKey(emoji));
}

/** An element showing an icon: the drawn picture when there is one, else the emoji itself. */
export function iconEl(emoji: string, className = 'ico'): HTMLElement {
  const url = iconUrl(emoji);
  if (!url) {
    const span = document.createElement('span');
    span.className = `${className} emoji`;
    span.textContent = emoji;
    return span;
  }
  const img = document.createElement('img');
  img.className = className;
  img.src = url;
  img.alt = '';
  img.draggable = false;
  return img;
}
