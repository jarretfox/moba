import { el } from './dom';

// The game's name and crest: BLOKES, Battle for Da Base. The crest is a shield split between the two
// sides with crossed swords behind it and a big gold B.

export const GAME_NAME = 'Blokes';
export const GAME_SUBTITLE = 'Battle for Da Base';

export const CREST_SVG = `<svg class="crest" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="crest-field" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0.5" stop-color="#3d8bfd"/><stop offset="0.5" stop-color="#e5484d"/>
    </linearGradient>
    <linearGradient id="crest-shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g stroke-linecap="round">
    <line x1="14" y1="14" x2="106" y2="106" stroke="#1a1408" stroke-width="11"/>
    <line x1="106" y1="14" x2="14" y2="106" stroke="#1a1408" stroke-width="11"/>
    <line x1="14" y1="14" x2="106" y2="106" stroke="#d8dee8" stroke-width="6"/>
    <line x1="106" y1="14" x2="14" y2="106" stroke="#d8dee8" stroke-width="6"/>
    <circle cx="106" cy="106" r="6" fill="#e8c46a" stroke="#1a1408" stroke-width="2.5"/>
    <circle cx="14" cy="106" r="6" fill="#e8c46a" stroke="#1a1408" stroke-width="2.5"/>
  </g>
  <path d="M60 12 L100 26 L100 58 C100 84 82 100 60 110 C38 100 20 84 20 58 L20 26 Z" fill="url(#crest-field)" stroke="#1a1408" stroke-width="9" stroke-linejoin="round"/>
  <path d="M60 12 L100 26 L100 58 C100 84 82 100 60 110 C38 100 20 84 20 58 L20 26 Z" fill="url(#crest-field)" stroke="#e8c46a" stroke-width="4.5" stroke-linejoin="round"/>
  <path d="M60 16 L96 29 L96 50 L24 50 L24 29 Z" fill="url(#crest-shine)"/>
  <text x="60" y="80" text-anchor="middle" font-family="'Lilita One', system-ui, sans-serif" font-size="58" fill="#ffe29a" stroke="#1a1408" stroke-width="5" paint-order="stroke">B</text>
</svg>`;

/** The full logo: crest, name, and subtitle. */
export function logo(): HTMLElement {
  const box = el('div', 'logo');
  box.innerHTML = CREST_SVG;
  box.append(el('div', 'logo-word', GAME_NAME.toUpperCase()), el('div', 'logo-sub', GAME_SUBTITLE));
  return box;
}
