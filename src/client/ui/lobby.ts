import { CHAMPION_INFO } from '../../shared/champions/registry';
import { ROLES, ROLE_INFO, ROLE_ORDER } from '../../shared/champions/roles';
import { SKIN_COUNT, type ChampionId } from '../../shared/champions/types';
import { SLOT_KEYS, TEAM, type PlayerTeam } from '../../shared/constants';
import { START_GOLD_OPTIONS, type LobbyState, type MatchMode, type MatchSettings } from '../../shared/protocol';
import { WEATHER_CHANCES } from '../../shared/weather';
import { titleName } from '../../shared/titles';
import { SKINS, portraitOf, swatchColor } from '../render/champions';
import { CAST_COLORS } from '../render/spells';
import { getSound } from '../audio';
import { emoteLine } from '../emotes';
import { LORE } from './lore';
import { iconEl } from '../render/icons';
import { el } from './dom';
import { ChampionStage } from './stage';

/** How long (ms) the pointer rests on a champion's card before the showcase changes to them. */
const HOVER_SETTLE = 220;

const TEAM_SIZE = 3;

export interface LobbyOptions {
  /** Solo: skip the lobby — picking a champion starts the match straight away in this mode. */
  solo?: MatchMode;
  /** Shown to the host so they can share it. */
  code?: string;
  onPick(pick: { team?: PlayerTeam; champion?: ChampionId; skin?: number }): void;
  onStart(mode: MatchMode): void;
  /** The host changed a match setting. */
  onSettings?(settings: Partial<MatchSettings>): void;
}

const WEATHER_NAMES: Record<string, string> = { random: 'Random', clear: 'Clear', rain: 'Rain', storm: 'Storm', mist: 'Mist', snow: 'Snow', autumn: 'Autumn wind' };

/** Pre-match screen: teams, champion picks, and (for the host) mode and Start. */
export class LobbyScreen {
  private readonly screen = el('div', 'select');
  private readonly teams = el('div', 'lobby-teams');
  private readonly cards = new Map<ChampionId, HTMLButtonElement>();
  private readonly footer = el('div', 'lobby-footer');
  /** The match settings: the host's to change, everyone else's to see. */
  private readonly settingsBar = el('div', 'lobby-settings');
  private mode: MatchMode = 'bots';
  /** The look chosen on each card (0 is the classic one). */
  private readonly skins = new Map<ChampionId, number>();
  private picked: ChampionId | null = null;
  /** The big panel showing whichever champion you're looking at. */
  private readonly showcase = el('div', 'showcase');
  private shown: ChampionId | null = null;
  /** Pointing at a card shows that champion only once the pointer settles on it (see championCards). */
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly cardFaces = new Map<ChampionId, HTMLImageElement>();
  /** The champion you're looking at, standing in the showcase. */
  private readonly stage = new ChampionStage(200);

  constructor(
    root: HTMLElement,
    private readonly opts: LobbyOptions,
  ) {
    if (opts.code) {
      const code = el('div', 'lobby-code');
      const copy = el('button', 'lobby-copy', 'Copy');
      copy.addEventListener('click', () => {
        void navigator.clipboard?.writeText(opts.code!).then(() => (copy.textContent = 'Copied'));
      });
      code.append(el('span', 'lobby-code-label', 'Lobby code'), el('span', 'lobby-code-value', opts.code), copy);
      this.screen.append(code);
    }
    if (!opts.solo) this.screen.append(this.teams);
    this.screen.append(el('div', 'select-title', 'Choose your champion'));
    // Solo, the match starts as soon as you pick, so the settings come first.
    if (opts.solo) this.screen.append(this.settingsBar);
    this.screen.append(this.championCards());
    if (!opts.solo) this.screen.append(this.settingsBar, this.footer);
    root.append(this.screen);
  }

  update(lobby: LobbyState, you: string): void {
    const me = lobby.players.find((p) => p.id === you);
    this.drawSettings(lobby.settings, !!me?.host);
    this.picked = me?.champion ?? null;
    for (const [id, card] of this.cards) {
      card.classList.toggle('picked', me?.champion === id);
      // One of each champion per team: a teammate's pick is off the table.
      const taken = lobby.players.some((p) => p.id !== you && p.team === me?.team && p.champion === id);
      card.classList.toggle('taken', taken);
      card.disabled = taken;
    }

    this.teams.replaceChildren(
      ...([TEAM.blue, TEAM.red] as const).map((team) => {
        const col = el('div', `lobby-team ${team === TEAM.blue ? 'blue' : 'red'}`);
        col.append(el('div', 'lobby-team-title', team === TEAM.blue ? 'Blue' : 'Red'));
        const members = lobby.players.filter((p) => p.team === team);
        for (let i = 0; i < TEAM_SIZE; i++) {
          const p = members[i];
          const row = el('div', `lobby-slot${p?.id === you ? ' you' : ''}`);
          if (p) {
            const who = el('span', 'lobby-slot-name', `${p.name}${p.host ? ' ★' : ''}`);
            const title = titleName(p.title);
            if (title) who.append(el('span', 'lobby-slot-title', title));
            row.append(who, el('span', 'lobby-slot-champ', p.champion ? CHAMPION_INFO[p.champion].name : 'picking…'));
          } else {
            row.append(el('span', 'lobby-slot-empty', this.mode === 'bots' ? 'Bot' : 'Empty'));
          }
          col.append(row);
        }
        if (me && me.team !== team && members.length < TEAM_SIZE) {
          const move = el('button', 'lobby-move', `Join ${team === TEAM.blue ? 'Blue' : 'Red'}`);
          move.addEventListener('click', () => this.opts.onPick({ team }));
          col.append(move);
        }
        return col;
      }),
    );

    this.footer.replaceChildren();
    if (me?.host) {
      const modes = el('div', 'select-modes');
      for (const [mode, label] of [['bots', 'Bots fill empty slots'], ['practice', 'No bots (practice)']] as const) {
        const b = el('button', `select-mode${this.mode === mode ? ' active' : ''}`, label);
        b.addEventListener('click', () => {
          this.mode = mode;
          this.update(lobby, you);
        });
        modes.append(b);
      }
      const ready = lobby.players.every((p) => p.champion);
      const start = el('button', 'lobby-start', ready ? 'Start match' : 'Waiting for everyone to pick…');
      start.disabled = !ready;
      start.addEventListener('click', () => this.opts.onStart(this.mode));
      this.footer.append(modes, start);
    } else {
      this.footer.append(el('div', 'lobby-wait', me?.champion ? 'Waiting for the host to start…' : 'Pick a champion'));
    }
  }

  /** Weather, time of day, starting gold and pace: buttons for the host, the same buttons greyed out for everyone else. */
  private drawSettings(s: MatchSettings | undefined, host: boolean): void {
    if (!s) return;
    const bar = this.settingsBar;
    bar.replaceChildren();
    bar.classList.toggle('readonly', !host);
    const change = (patch: Partial<MatchSettings>) => this.opts.onSettings?.(patch);
    const group = <T>(label: string, options: readonly (readonly [T, string])[], current: T, pick: (v: T) => void) => {
      const g = el('div', 'set-group');
      g.append(el('span', 'set-label', label));
      for (const [value, text] of options) {
        const b = el('button', `set-opt${value === current ? ' on' : ''}`, text);
        b.disabled = !host;
        b.addEventListener('click', () => pick(value));
        g.append(b);
      }
      return g;
    };
    const weather = el('div', 'set-group');
    weather.append(el('span', 'set-label', 'Weather'));
    const select = el('select', 'set-select');
    for (const w of ['random', ...WEATHER_CHANCES.map(([k]) => k)]) {
      const o = el('option', '', WEATHER_NAMES[w] ?? w);
      o.value = w;
      o.selected = w === s.weather;
      select.append(o);
    }
    select.disabled = !host;
    select.addEventListener('change', () => change({ weather: select.value as MatchSettings['weather'] }));
    weather.append(select);
    bar.append(
      weather,
      group('Time', [[false, 'Evening'], [true, 'Night']] as const, s.night, (night) => change({ night })),
      group('Starting gold', START_GOLD_OPTIONS.map((g) => [g, String(g)] as const), s.gold, (gold) => change({ gold })),
      group('Pace', [[false, 'Normal'], [true, 'Fast']] as const, s.fast, (fast) => change({ fast })),
    );
    bar.title = host ? '' : 'The host picks these';
  }

  showError(message: string): void {
    this.screen.append(el('div', 'menu-error', message));
  }

  close(): void {
    clearTimeout(this.hoverTimer);
    this.stage.destroy();
    this.screen.remove();
  }

  private championCards(): HTMLElement {
    const picker = el('div', 'select-picker');
    const cards = el('div', 'select-cards');
    // Grouped by role: a labelled cluster each.
    const groups = new Map(
      ROLE_ORDER.map((role) => {
        const group = el('div', `role-group role-${role}`);
        const head = el('div', 'role-head', ROLE_INFO[role].name);
        head.title = ROLE_INFO[role].blurb;
        const list = el('div', 'role-cards');
        group.append(head, list);
        cards.append(group);
        return [role, list] as const;
      }),
    );
    for (const info of Object.values(CHAMPION_INFO)) {
      const card = el('button', `select-card ${info.resource}`);
      const img = el('img', 'select-face');
      img.src = portraitOf(info.id) ?? '';
      img.alt = '';
      this.cardFaces.set(info.id, img);
      card.append(img, el('div', `select-name${info.name.length > 12 ? ' long' : ''}`, info.name), el('div', 'select-sub', info.title));
      // Look at a champion by pointing at them; pick them by clicking. The pointer has to rest on a card
      // for a moment first, so crossing the top row on the way up to a bottom-row champion's looks and
      // abilities doesn't swap them out.
      card.addEventListener('pointerenter', () => {
        clearTimeout(this.hoverTimer);
        this.hoverTimer = setTimeout(() => this.show(info.id), HOVER_SETTLE);
      });
      card.addEventListener('pointerleave', () => clearTimeout(this.hoverTimer));
      card.addEventListener('focus', () => this.show(info.id));
      card.addEventListener('click', () => this.lockIn(info.id));
      this.cards.set(info.id, card);
      groups.get(ROLES[info.id].main)!.append(card);
    }
    // A role nobody plays yet stays off the screen.
    for (const list of groups.values()) if (!list.childElementCount) list.parentElement?.remove();
    picker.append(this.showcase, cards);
    this.show(Object.values(CHAMPION_INFO)[0].id);
    return picker;
  }

  /** Fills the showcase with a champion: big portrait, story, looks, and their kit. */
  private show(id: ChampionId): void {
    if (this.shown === id) return;
    this.shown = id;
    const info = CHAMPION_INFO[id];
    const color = `#${CAST_COLORS[id].toString(16).padStart(6, '0')}`;
    const skin = this.skins.get(id) ?? 0;
    const s = this.showcase;
    s.replaceChildren();
    s.style.setProperty('--champ', color);
    s.classList.remove('locked');

    const art = el('div', 'showcase-art');
    art.append(el('div', 'showcase-ring'), this.stage.canvas, el('div', 'showcase-quote'));
    this.stage.show(id, skin);

    const text = el('div', 'showcase-info');
    text.append(
      el('div', 'showcase-name', info.name),
      el('div', 'showcase-title', `${info.title} · ${{ rage: 'Rage', mana: 'Mana', none: 'No resource' }[info.resource]}`),
      el('div', 'showcase-roles', [ROLES[id].main, ROLES[id].also].filter((r) => r !== undefined).map((r) => ROLE_INFO[r].name).join(' · ')),
      el('div', 'showcase-lore', LORE[id]),
    );

    // Looks: a dot per skin.
    const looks = el('div', 'select-skins');
    const lookName = el('span', 'skin-name', SKINS[id][skin].name);
    const dots: HTMLElement[] = [];
    for (let k = 0; k < SKIN_COUNT; k++) {
      const dot = el('span', `skin-dot${k === skin ? ' on' : ''}`);
      dot.style.background = `#${swatchColor(id, k).toString(16).padStart(6, '0')}`;
      dot.title = SKINS[id][k].name;
      dot.addEventListener('click', () => {
        this.skins.set(id, k);
        this.stage.show(id, k, true);
        const card = this.cardFaces.get(id);
        if (card) card.src = portraitOf(id, k) ?? '';
        lookName.textContent = SKINS[id][k].name;
        dots.forEach((d, i) => d.classList.toggle('on', i === k));
        if (this.picked === id) this.opts.onPick({ skin: k });
      });
      dots.push(dot);
      looks.append(dot);
    }
    looks.append(lookName);

    // The kit: passive and abilities as tiles; point at one to read it.
    const kit = el('div', 'showcase-kit');
    const desc = el('div', 'showcase-desc');
    const describe = (name: string, key: string, body: string) => {
      desc.replaceChildren(el('b', '', `${name} `), el('span', 'showcase-key', key), document.createTextNode(` ${body}`));
    };
    const tile = (icon: string, key: string, name: string, body: string) => {
      const t = el('div', 'showcase-tile');
      t.append(iconEl(icon, 'showcase-icon'), el('kbd', '', key));
      t.addEventListener('pointerenter', () => describe(name, key === 'P' ? 'Passive' : `[${key}]`, body));
      kit.append(t);
    };
    tile(info.passive.icon, 'P', info.passive.name, info.passive.description);
    info.abilities.forEach((a, i) => tile(a.icon, SLOT_KEYS[i], a.name, a.description));
    describe(info.passive.name, 'Passive', info.passive.description);

    text.append(looks, kit, desc);
    s.append(art, text);
  }

  /** Picking a champion: a flash, a fanfare and a line from them. Solo games start a moment later. */
  private lockIn(id: ChampionId): void {
    if (this.cards.get(id)?.disabled) return;
    clearTimeout(this.hoverTimer);
    this.show(id);
    this.opts.onPick({ champion: id, skin: this.skins.get(id) ?? 0 });
    this.showcase.classList.remove('locked');
    void this.showcase.offsetWidth;
    this.showcase.classList.add('locked');
    this.stage.cheer();
    const quote = this.showcase.querySelector('.showcase-quote') as HTMLElement | null;
    if (quote) quote.textContent = `“${emoteLine(id, 'line', Math.floor(Math.random() * 99))}”`;
    getSound().play('fanfare', 0.6);
    if (this.opts.solo) {
      const solo = this.opts.solo;
      setTimeout(() => this.opts.onStart(solo), 1100);
    }
  }
}
