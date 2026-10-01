import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { ChampionId } from '../../shared/champions/types';
import type { PlayerTeam } from '../../shared/constants';
import { MAX_CHAT, type HostMessage } from '../../shared/protocol';
import { el } from './dom';

// Chat, in the lobby and through the match: Enter talks to your team, Shift+Enter to everyone (Tab
// switches while you're typing). Lines show bottom-left for a while and then fade; while you're typing,
// the recent ones come back. Lives for the whole session, so it carries on into a rematch.

type ChatLine = Extract<HostMessage, { t: 'chat' }>;

/** Seconds a line stays up when you're not typing. */
const LINGER = 10;
/** Lines kept in the log. */
const KEEP = 40;

/** Is the player typing into something (the chat, a name box)? Game keys should leave them alone. */
export function typing(target: EventTarget | null = document.activeElement): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

export class ChatBox {
  private readonly root = el('div', 'chat');
  private readonly log = el('div', 'chat-log');
  private readonly row = el('div', 'chat-input');
  private readonly scope = el('button', 'chat-scope');
  private readonly input = el('input');
  private all = false;
  private myTeam: PlayerTeam | null = null;
  /** Heard when a line arrives (for a sound). */
  onLine: ((line: ChatLine) => void) | null = null;

  constructor(
    parent: HTMLElement,
    private readonly send: (text: string, all: boolean) => void,
  ) {
    this.input.maxLength = MAX_CHAT;
    this.input.placeholder = 'Say something…';
    this.input.spellcheck = false;
    this.row.append(this.scope, this.input);
    this.row.hidden = true;
    this.root.append(this.log, this.row);
    parent.append(this.root);
    this.scope.addEventListener('click', () => this.setScope(!this.all));
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || this.isOpen || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      this.open(e.shiftKey);
    });
    this.input.addEventListener('keydown', (e) => {
      // Nothing typed here reaches the game.
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.input.value.trim();
        if (text) this.send(text, this.all);
        this.close();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.setScope(!this.all);
      }
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('blur', () => setTimeout(() => this.close(), 0));
  }

  get isOpen(): boolean {
    return !this.row.hidden;
  }

  /** Whose side you're on (to color names, and to know who "Team" is). */
  setTeam(team: PlayerTeam): void {
    this.myTeam = team;
  }

  /** Opens the box: to everyone, or to your team. */
  open(all: boolean): void {
    this.setScope(all);
    this.row.hidden = false;
    this.root.classList.add('typing');
    this.input.value = '';
    this.input.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.row.hidden = true;
    this.root.classList.remove('typing');
    this.input.blur();
  }

  add(line: ChatLine): void {
    const row = el('div', `chat-line${line.all ? ' all' : ''}`);
    const mine = this.myTeam === null || line.team === this.myTeam;
    row.append(
      el('span', 'chat-tag', line.all ? '[All]' : '[Team]'),
      el('span', `chat-name ${mine ? 'ally' : 'enemy'}`, `${line.from}${line.champ ? ` (${champName(line.champ)})` : ''}:`),
      el('span', 'chat-text', ` ${line.text}`),
    );
    this.log.append(row);
    while (this.log.children.length > KEEP) this.log.firstElementChild!.remove();
    // Shown for a while, then faded out (the log comes back while you're typing).
    setTimeout(() => row.classList.add('old'), LINGER * 1000);
    this.onLine?.(line);
  }

  private setScope(all: boolean): void {
    this.all = all;
    this.scope.textContent = all ? 'All' : 'Team';
    this.scope.classList.toggle('all', all);
    this.scope.title = 'Tab to switch';
  }
}

const champName = (id: ChampionId) => CHAMPION_INFO[id].name;
