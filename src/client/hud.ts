import { atRank, perRank, type ChampionInfo } from '../shared/champions/types';
import { SLOT_KEYS, type Slot } from '../shared/constants';
import type { EntitySnap, MeSnap } from '../shared/protocol';
import { MAX_BASIC_RANK, MAX_ULT_RANK, canRankUp } from '../shared/sim/progression';

interface SlotEls {
  root: HTMLElement;
  cd: HTMLElement;
  cdText: HTMLElement;
  cost: HTMLElement;
  pips: HTMLElement;
  up: HTMLButtonElement;
}

interface BarEls {
  fill: HTMLElement;
  text: HTMLElement;
}

const HELP = [
  ['Right-click', 'move / attack (hold to keep steering)'],
  ['Q W E R', 'hold to aim, release to cast'],
  ['Shift+Q W E R', 'level up an ability'],
  ['S', 'stop'],
  ['B', 'recall home (4s, breaks if hit)'],
  ['Space', 'center camera (hold)'],
  ['Y', 'lock / unlock camera'],
  ['Wheel', 'zoom'],
  ['`', 'nav grid overlay'],
];

/** Seconds a kill-feed line stays up. */
const FEED_TIME = 7;

/** DOM overlay for everything screen-space. Only touches the DOM when a value actually changes. */
export class Hud {
  /** Called when the player clicks an ability's "+" to spend a skill point. */
  onLevelUp: ((slot: Slot) => void) | null = null;
  private readonly debug: HTMLElement;
  private readonly clockTime: HTMLElement;
  private readonly clockWave: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly portrait: HTMLElement;
  private readonly stacks: HTMLElement;
  private readonly level: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly slots: SlotEls[] = [];
  private readonly hp: BarEls;
  private readonly mp: BarEls;
  private readonly xp: BarEls;
  private readonly tooltip: HTMLElement;
  private readonly respawn: HTMLElement;
  private readonly gameOver: HTMLElement;
  private info: ChampionInfo | null = null;
  private ranks: number[] = [0, 0, 0, 0];
  private readonly written = new WeakMap<HTMLElement, Map<string, string>>();

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="debug"></div>
      <div class="feed"></div>
      <div class="clock"><span class="time">0:00</span><span class="wave"></span></div>
      <div class="help"><div class="help-title"></div>${HELP.map(([k, v]) => `<div><kbd>${k}</kbd> ${v}</div>`).join('')}</div>
      <div class="respawn"></div>
      <div class="gameover" hidden><div class="gameover-title"></div><div class="gameover-sub"></div><button class="gameover-again">Back to menu</button></div>
      <div class="bar" hidden>
        <div class="portrait"><span class="initial"></span><span class="stacks"></span><span class="lvl">1</span></div>
        <div class="center">
          <div class="slots">${SLOT_KEYS.map(
            (k) =>
              `<div class="slot"><button class="up" hidden>+</button><div class="name"></div><div class="cd"></div><div class="cdtext"></div><kbd>${k}</kbd><div class="cost"></div><div class="pips"></div></div>`,
          ).join('')}</div>
          <div class="res hp"><div class="fill"></div><span></span></div>
          <div class="res mp"><div class="fill"></div><span></span></div>
          <div class="res xp"><div class="fill"></div><span></span></div>
        </div>
        <div class="purse"><span class="coin"></span><span class="gold">0</span></div>
      </div>
      <div class="tooltip" hidden></div>`;
    const q = (sel: string, parent: ParentNode = root) => parent.querySelector(sel) as HTMLElement;
    this.debug = q('.debug');
    this.feed = q('.feed');
    this.clockTime = q('.clock .time');
    this.clockWave = q('.clock .wave');
    this.bar = q('.bar');
    this.portrait = q('.portrait');
    this.stacks = q('.stacks');
    this.level = q('.lvl');
    this.gold = q('.gold');
    this.tooltip = q('.tooltip');
    this.respawn = q('.respawn');
    this.gameOver = q('.gameover');
    q('.gameover-again').addEventListener('click', () => location.reload());
    this.hp = { fill: q('.hp .fill'), text: q('.hp span') };
    this.mp = { fill: q('.mp .fill'), text: q('.mp span') };
    this.xp = { fill: q('.xp .fill'), text: q('.xp span') };
    root.querySelectorAll<HTMLElement>('.slot').forEach((el, i) => {
      const up = q('.up', el) as HTMLButtonElement;
      up.addEventListener('click', () => this.onLevelUp?.(i as Slot));
      this.slots.push({ root: el, cd: q('.cd', el), cdText: q('.cdtext', el), cost: q('.cost', el), pips: q('.pips', el), up });
      el.addEventListener('mouseenter', () => this.showTooltip(el, i));
      el.addEventListener('mouseleave', () => (this.tooltip.hidden = true));
    });
    this.portrait.addEventListener('mouseenter', () => this.showTooltip(this.portrait, -1));
    this.portrait.addEventListener('mouseleave', () => (this.tooltip.hidden = true));
  }

  setChampion(info: ChampionInfo): void {
    this.info = info;
    this.bar.hidden = false;
    (this.portrait.querySelector('.initial') as HTMLElement).textContent = info.name.slice(0, 2).toUpperCase();
    this.bar.classList.toggle('rage', info.resource === 'rage');
    info.abilities.forEach((a, i) => {
      (this.slots[i].root.querySelector('.name') as HTMLElement).textContent = a.name;
    });
  }

  update(me: MeSnap | undefined, self: EntitySnap | undefined, debug: string): void {
    this.set(this.debug, 'text', debug);
    if (!this.info || !me || !self) return;

    this.set(this.hp.fill, 'width', pct(self.hp ?? 0, self.mhp ?? 1));
    this.set(this.hp.text, 'text', `${Math.max(0, self.hp ?? 0)} / ${self.mhp}`);
    this.set(this.mp.fill, 'width', pct(self.mp ?? 0, self.mmp ?? 1));
    this.set(this.mp.text, 'text', `${self.mp} / ${self.mmp}`);
    this.set(this.xp.fill, 'width', me.xpNext ? pct(me.xp, me.xpNext) : '100%');
    this.set(this.xp.text, 'text', me.xpNext ? `${me.xp} / ${me.xpNext} xp` : 'max level');
    this.set(this.level, 'text', String(me.level));
    this.set(this.gold, 'text', String(me.gold));
    this.set(this.stacks, 'text', me.passiveStacks ? String(me.passiveStacks) : '');
    this.set(this.portrait, 'class', me.empowered ? 'portrait empowered' : 'portrait');

    me.abilities.forEach((a, i) => {
      const el = this.slots[i];
      const info = this.info!.abilities[i];
      this.ranks[i] = a.rank;
      const cdMax = atRank(info.cooldown, a.rank);
      const cost = atRank(info.cost, a.rank);
      const noMana = a.rank > 0 && (self.mp ?? 0) < cost;
      const canLevel = me.points > 0 && canRankUp(i as Slot, a.rank, me.level);
      this.set(el.cd, 'background', a.cd > 0 ? `conic-gradient(rgba(4,7,10,.78) ${(a.cd / cdMax) * 360}deg, transparent 0)` : 'none');
      this.set(el.cdText, 'text', a.cd > 0 ? (a.cd < 1 ? a.cd.toFixed(1) : String(Math.ceil(a.cd))) : '');
      this.set(el.cost, 'text', cost ? String(cost) : '');
      const maxRank = i === 3 ? MAX_ULT_RANK : MAX_BASIC_RANK;
      this.set(el.pips, 'text', '●'.repeat(a.rank) + '○'.repeat(maxRank - a.rank));
      this.set(el.root, 'class', `slot${a.rank === 0 ? ' unlearned' : ''}${a.cd > 0 ? ' cooling' : ''}${noMana ? ' nomana' : ''}${canLevel ? ' levelable' : ''}`);
      if (el.up.hidden === canLevel) el.up.hidden = !canLevel;
    });

    const recalling = self.st?.includes('recall');
    this.set(this.respawn, 'text', me.respawnIn > 0 ? `Respawning in ${Math.ceil(me.respawnIn)}` : recalling ? 'Recalling…' : '');
  }

  /** A line in the kill feed; `ours` colors it for the viewer's side. */
  pushFeed(killer: string, victim: string, ours: boolean | null): void {
    const line = document.createElement('div');
    line.className = `feed-line${ours === null ? '' : ours ? ' ours' : ' theirs'}`;
    const k = document.createElement('b');
    k.textContent = killer;
    const v = document.createElement('b');
    v.textContent = victim;
    line.append(k, document.createTextNode(' ⚔ '), v);
    this.feed.prepend(line);
    while (this.feed.children.length > 5) this.feed.lastElementChild!.remove();
    setTimeout(() => line.remove(), FEED_TIME * 1000);
  }

  setTitle(title: string): void {
    const el = this.debug.parentElement?.querySelector('.help-title') as HTMLElement | null;
    if (el) el.textContent = title;
  }

  showGameOver(victory: boolean): void {
    this.showOverlay(victory ? 'VICTORY' : 'DEFEAT', victory ? 'Their Da Base has fallen.' : 'Your Da Base has fallen.', victory);
  }

  /** A full-screen message with a way back to the menu, e.g. when the host leaves. */
  showNotice(title: string, detail: string): void {
    this.showOverlay(title, detail, false);
  }

  private showOverlay(title: string, detail: string, victory: boolean): void {
    if (!this.gameOver.hidden) return;
    this.gameOver.hidden = false;
    this.gameOver.classList.toggle('victory', victory);
    (this.gameOver.querySelector('.gameover-title') as HTMLElement).textContent = title;
    (this.gameOver.querySelector('.gameover-sub') as HTMLElement).textContent = detail;
  }

  /** Match clock, plus a countdown while the next Chud wave is close. */
  setClock(gameTime: number, nextWave: number | undefined): void {
    this.set(this.clockTime, 'text', mmss(gameTime));
    this.set(this.clockWave, 'text', nextWave !== undefined && nextWave <= 10 ? `Chuds in ${nextWave}` : '');
  }

  /** Brief red flash when you press an ability that isn't ready. */
  flash(slot: number): void {
    const el = this.slots[slot]?.root;
    if (!el) return;
    el.classList.remove('denied');
    void el.offsetWidth; // restart the animation
    el.classList.add('denied');
  }

  private showTooltip(anchor: HTMLElement, slot: number): void {
    if (!this.info) return;
    const t = this.tooltip;
    t.replaceChildren();
    const line = (cls: string, text: string) => {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = text;
      t.appendChild(d);
    };
    if (slot < 0) {
      line('tt-name', `${this.info.name} — ${this.info.title}`);
      line('tt-meta', `Passive: ${this.info.passive.name}`);
      line('tt-desc', this.info.passive.description);
    } else {
      const a = this.info.abilities[slot];
      const rank = this.ranks[slot];
      line('tt-name', `${a.name} [${SLOT_KEYS[slot]}] ${rank ? `· rank ${rank}` : '· not learned'}`);
      const cost = a.cost.some((c) => c > 0) ? `${perRank(a.cost)} ${this.info.resource}` : 'No cost';
      line('tt-meta', `${cost} · ${perRank(a.cooldown)}s cooldown${a.castTime ? ` · ${a.castTime}s cast` : ''}`);
      line('tt-desc', a.description);
    }
    t.hidden = false;
    const r = anchor.getBoundingClientRect();
    t.style.left = `${Math.max(8, Math.min(window.innerWidth - 328, r.left + r.width / 2 - 160))}px`;
    t.style.bottom = `${window.innerHeight - r.top + 10}px`;
  }

  private set(el: HTMLElement, prop: 'text' | 'width' | 'background' | 'class', value: string): void {
    let cache = this.written.get(el);
    if (!cache) this.written.set(el, (cache = new Map()));
    if (cache.get(prop) === value) return;
    cache.set(prop, value);
    if (prop === 'text') el.textContent = value;
    else if (prop === 'class') el.className = value;
    else el.style[prop] = value;
  }
}

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
