// Player settings: volumes, graphics quality and the FPS readout. Kept in the browser between visits;
// anything that cares listens for changes and applies them on the spot.

export interface Settings {
  /** 0–1. */
  master: number;
  music: number;
  effects: number;
  /** Low turns off the glow pass and thins out particles and rain, for slower machines. */
  quality: 'high' | 'low';
  showFps: boolean;
  /** Enemies in orange-yellow instead of red, for red-blind players. */
  colorblind: boolean;
  /** Interface size, 0.8–1.3. */
  uiScale: number;
  /** Tips for first matches. */
  tips: boolean;
}

export const DEFAULT_SETTINGS: Settings = { master: 0.8, music: 0.6, effects: 0.8, quality: 'high', showFps: false, colorblind: false, uiScale: 1, tips: true };

const KEY = 'moba.settings';

/** Reads saved settings, keeping only values that make sense and filling the rest from the defaults. */
export function parseSettings(raw: string | null): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw) return s;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof Settings, unknown>>;
    for (const k of ['master', 'music', 'effects'] as const) {
      const n = v[k];
      if (typeof n === 'number' && Number.isFinite(n)) s[k] = Math.max(0, Math.min(1, n));
    }
    if (v.quality === 'high' || v.quality === 'low') s.quality = v.quality;
    if (typeof v.showFps === 'boolean') s.showFps = v.showFps;
    if (typeof v.colorblind === 'boolean') s.colorblind = v.colorblind;
    if (typeof v.tips === 'boolean') s.tips = v.tips;
    if (typeof v.uiScale === 'number' && Number.isFinite(v.uiScale)) s.uiScale = Math.max(0.8, Math.min(1.3, v.uiScale));
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
export function onSettings(fn: (s: Settings) => void): void {
  listeners.push(fn);
  fn(settings);
}

/** Interface size, 80–130%. */
function scaleSlider(): HTMLElement {
  const row = document.createElement('label');
  row.className = 'settings-row';
  const name = document.createElement('span');
  name.textContent = 'Interface size';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '80';
  input.max = '130';
  input.step = '5';
  input.value = String(Math.round(settings.uiScale * 100));
  const value = document.createElement('b');
  value.textContent = `${input.value}%`;
  input.addEventListener('input', () => {
    value.textContent = `${input.value}%`;
    updateSettings({ uiScale: Number(input.value) / 100 });
  });
  row.append(name, input, value);
  return row;
}

/** The settings panel: sliders and toggles, for the in-game menu and the main menu's gear. */
export function settingsPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'settings';
  const slider = (key: 'master' | 'music' | 'effects', label: string) => {
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
    toggle('Graphics', [
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
    scaleSlider(),
    toggle('Tips', [
      ['Off', () => !settings.tips, () => updateSettings({ tips: false })],
      ['On (from the start)', () => settings.tips, () => updateSettings({ tips: true })],
    ]),
  );
  return panel;
}
