import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { ChampionId } from '../../shared/champions/types';
import { SLOT_KEYS, TEAM, type PlayerTeam } from '../../shared/constants';
import type { LobbyState, MatchMode } from '../../shared/protocol';
import { el } from './dom';

const TEAM_SIZE = 3;

export interface LobbyOptions {
  /** Solo: skip the lobby — picking a champion starts the match straight away in this mode. */
  solo?: MatchMode;
  /** Shown to the host so they can share it. */
  code?: string;
  onPick(pick: { team?: PlayerTeam; champion?: ChampionId }): void;
  onStart(mode: MatchMode): void;
}

/** Pre-match screen: teams, champion picks, and (for the host) mode and Start. */
export class LobbyScreen {
  private readonly screen = el('div', 'select');
  private readonly teams = el('div', 'lobby-teams');
  private readonly cards = new Map<ChampionId, HTMLButtonElement>();
  private readonly footer = el('div', 'lobby-footer');
  private mode: MatchMode = 'bots';

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
    this.screen.append(el('div', 'select-title', 'Choose your champion'), this.championCards());
    if (!opts.solo) this.screen.append(this.footer);
    root.append(this.screen);
  }

  update(lobby: LobbyState, you: string): void {
    const me = lobby.players.find((p) => p.id === you);
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
            row.append(el('span', 'lobby-slot-name', `${p.name}${p.host ? ' ★' : ''}`), el('span', 'lobby-slot-champ', p.champion ? CHAMPION_INFO[p.champion].name : 'picking…'));
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

  showError(message: string): void {
    this.screen.append(el('div', 'menu-error', message));
  }

  close(): void {
    this.screen.remove();
  }

  private championCards(): HTMLElement {
    const cards = el('div', 'select-cards');
    for (const info of Object.values(CHAMPION_INFO)) {
      const card = el('button', `select-card ${info.resource}`);
      card.append(
        el('div', 'select-name', info.name),
        el('div', 'select-sub', `${info.title} · ${{ rage: 'Rage', mana: 'Mana', none: 'No resource' }[info.resource]}`),
        el('div', 'select-passive', `Passive — ${info.passive.name}`),
      );
      const list = el('div', 'select-abilities');
      info.abilities.forEach((a, i) => {
        const row = el('div', 'select-ability');
        row.append(el('kbd', '', SLOT_KEYS[i]), document.createTextNode(` ${a.name}`));
        list.append(row);
      });
      card.append(list);
      card.addEventListener('click', () => {
        this.opts.onPick({ champion: info.id });
        if (this.opts.solo) this.opts.onStart(this.opts.solo);
      });
      this.cards.set(info.id, card);
      cards.append(card);
    }
    return cards;
  }
}
