// Player settings: volumes, graphics quality and the FPS readout. Kept in the browser between visits;
// anything that cares listens for changes and applies them on the spot.

export interface Settings {
  /** 0–1. */
  master: number;
  music: number;
  effects: number;
  /** The world's own sounds: wind, birds, water, rain, the night. Low by default; it's a backdrop. */
  ambience: number;
  /**
   * Low turns off the glow pass and thins out particles and blowing leaves, for slower machines. Auto (the
   * default) starts high and steps down during a match if frames run slow.
   */
  quality: 'auto' | 'high' | 'low';
  showFps: boolean;
  /** Enemies in orange-yellow instead of red, for red-blind players. */
  colorblind: boolean;
  /** Interface size, 0.8–1.3. */
  uiScale: number;
  /** Tips for first matches. */
  tips: boolean;
  /** How fast the camera pans at the screen's edge with the camera unlocked, 0.4–2.5 (1 is normal). */
  panSpeed: number;
  /** The announcer's voice (First blood! Objective destroyed!). */
  announcer: boolean;
  /** Spend skill points automatically, in the order the bots use. */
  autoLevel: boolean;
  /** Light up an enemy Chud's health bar when one basic attack from you would kill it. */
  lastHit: boolean;
  /** Which layout these were saved in (2: graphics has Auto). */
  v: number;
}

export const DEFAULT_SETTINGS: Settings = { master: 0.8, music: 0.6, effects: 0.8, ambience: 0.3, quality: 'auto', showFps: false, colorblind: false, uiScale: 1, tips: true, panSpeed: 1, announcer: true, autoLevel: false, lastHit: true, v: 2 };

const KEY = 'moba.settings';

/** Reads saved settings, keeping only values that make sense and filling the rest from the defaults. */
export function parseSettings(raw: string | null): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw) return s;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    for (const k of ['master', 'music', 'effects', 'ambience'] as const) {
      const n = v[k];
      if (typeof n === 'number' && Number.isFinite(n)) s[k] = Math.max(0, Math.min(1, n));
    }
    // Saves from before Auto stored "high" whether or not anyone chose it: those get Auto.
    if (v.quality === 'auto' || v.quality === 'low' || (v.quality === 'high' && v.v === 2)) s.quality = v.quality;
    if (typeof v.showFps === 'boolean') s.showFps = v.showFps;
    if (typeof v.colorblind === 'boolean') s.colorblind = v.colorblind;
    if (typeof v.tips === 'boolean') s.tips = v.tips;
    if (typeof v.announcer === 'boolean') s.announcer = v.announcer;
    if (typeof v.autoLevel === 'boolean') s.autoLevel = v.autoLevel;
    if (typeof v.lastHit === 'boolean') s.lastHit = v.lastHit;
    if (typeof v.uiScale === 'number' && Number.isFinite(v.uiScale)) s.uiScale = Math.max(0.8, Math.min(1.3, v.uiScale));
    if (typeof v.panSpeed === 'number' && Number.isFinite(v.panSpeed)) s.panSpeed = Math.max(0.4, Math.min(2.5, v.panSpeed));
  } catch {
    // a broken save just means the defaults
  }
  return s;
}

function load(): Settings {
  try {
    return parseSettings(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export const settings: Settings = load();
const listeners: ((s: Settings) => void)[] = [];

/** Change some settings, save them, and tell everyone listening. */
export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage blocked: the change still applies for this visit
  }
  for (const fn of listeners) fn(settings);
}

/** Calls \`fn\` now and whenever settings change. */
export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.push(fn);
  fn(settings);
  return () => {
    const at = listeners.indexOf(fn);
    if (at >= 0) listeners.splice(at, 1);
  };
}

/** A percentage slider for a setting stored as a share (1 = 100%). */
function percentSlider(key: 'uiScale' | 'panSpeed', label: string, min: number, max: number, step: number): HTMLElement {
  const row = document.createElement('label');
  row.className = 'settings-row';
  const name = document.createElement('span');
  name.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(Math.round(settings[key] * 100));
  const value = document.createElement('b');
  value.textContent = `${input.value}%`;
  input.addEventListener('input', () => {
    value.textContent = `${input.value}%`;
    updateSettings({ [key]: Number(input.value) / 100 });
  });
  row.append(name, input, value);
  return row;
}

/** Full screen on and off (the browser's own; Esc or F11 work too). Not saved: browsers only allow it on a click. */
function fullscreenRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'settings-row';
  const name = document.createElement('span');
  name.textContent = 'Full screen';
  const group = document.createElement('div');
  group.className = 'settings-choice';
  const off = document.createElement('button');
  off.textContent = 'Off';
  const on = document.createElement('button');
  on.textContent = 'On';
  const show = () => {
    const full = !!document.fullscreenElement;
    on.classList.toggle('on', full);
    off.classList.toggle('on', !full);
  };
  on.addEventListener('click', () => void setFullscreen(true).then(show));
  off.addEventListener('click', () => void setFullscreen(false).then(show));
  document.addEventListener('fullscreenchange', show);
  show();
  group.append(off, on);
  row.append(name, group);
  return row;
}

/**
 * Into or out of full screen. Where the browser allows it (Chrome), Esc is kept for the game's menu while
 * full screen: holding it still leaves.
 */
export async function setFullscreen(full: boolean): Promise<void> {
  try {
    if (full && !document.fullscreenElement) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      const keyboard = (navigator as Navigator & { keyboard?: { lock?: (keys: string[]) => Promise<void> } }).keyboard;
      await keyboard?.lock?.(['Escape']).catch(() => undefined);
    } else if (!full && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch {
    // refused (not from a click, or not allowed here): nothing to do
  }
}

/** The settings panel: sliders and toggles, for the in-game menu and the main menu's gear. */
export function settingsPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'settings';
  const slider = (key: 'master' | 'music' | 'effects' | 'ambience', label: string) => {
    const row = document.createElement('label');
    row.className = 'settings-row';
    const name = document.createElement('span');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(settings[key] * 100));
    const value = document.createElement('b');
    value.textContent = input.value;
    input.addEventListener('input', () => {
      value.textContent = input.value;
      updateSettings({ [key]: Number(input.value) / 100 });
    });
    row.append(name, input, value);
    return row;
  };
  const toggle = (label: string, options: [string, () => boolean, () => void][]) => {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const name = document.createElement('span');
    name.textContent = label;
    const group = document.createElement('div');
    group.className = 'settings-choice';
    const buttons = options.map(([text, isOn, choose]) => {
      const b = document.createElement('button');
      b.textContent = text;
      b.addEventListener('click', () => {
        choose();
        buttons.forEach((x, i) => x.classList.toggle('on', options[i][1]()));
      });
      b.classList.toggle('on', isOn());
      return b;
    });
    group.append(...buttons);
    row.append(name, group);
    return row;
  };
  panel.append(
    slider('master', 'Master volume'),
    slider('music', 'Music'),
    slider('effects', 'Sound effects'),
    slider('ambience', 'Ambient sound'),
    toggle('Announcer voice', [
      ['Off', () => !settings.announcer, () => updateSettings({ announcer: false })],
      ['On', () => settings.announcer, () => updateSettings({ announcer: true })],
    ]),
    toggle('Graphics', [
      ['Auto', () => settings.quality === 'auto', () => updateSettings({ quality: 'auto' })],
      ['High', () => settings.quality === 'high', () => updateSettings({ quality: 'high' })],
      ['Low', () => settings.quality === 'low', () => updateSettings({ quality: 'low' })],
    ]),
    toggle('FPS counter', [
      ['Off', () => !settings.showFps, () => updateSettings({ showFps: false })],
      ['On', () => settings.showFps, () => updateSettings({ showFps: true })],
    ]),
    toggle('Enemy color', [
      ['Red', () => !settings.colorblind, () => updateSettings({ colorblind: false })],
      ['Orange (colorblind)', () => settings.colorblind, () => updateSettings({ colorblind: true })],
    ]),
    percentSlider('uiScale', 'Interface size', 80, 130, 5),
    percentSlider('panSpeed', 'Camera pan speed', 40, 250, 10),
    fullscreenRow(),
    toggle('Level abilities', [
      ['Myself', () => !settings.autoLevel, () => updateSettings({ autoLevel: false })],
      ['Automatically', () => settings.autoLevel, () => updateSettings({ autoLevel: true })],
    ]),
    toggle('Last-hit marker', [
      ['On', () => settings.lastHit, () => updateSettings({ lastHit: true })],
      ['Off', () => !settings.lastHit, () => updateSettings({ lastHit: false })],
    ]),
    toggle('Tips', [
      ['Off', () => !settings.tips, () => updateSettings({ tips: false })],
      ['On (from the start)', () => settings.tips, () => updateSettings({ tips: true })],
    ]),
  );
  return panel;
}
