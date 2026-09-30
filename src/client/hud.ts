import type { ChampionInfo } from '../shared/champions/types';
import { SLOT_KEYS } from '../shared/constants';
import type { EntitySnap, MeSnap } from '../shared/protocol';

interface SlotEls {
  root: HTMLElement;
  cd: HTMLElement;
  cdText: HTMLElement;
  cost: HTMLElement;
}

interface BarEls {
  fill: HTMLElement;
  text: HTMLElement;
}

const HELP = [
  ['Right-click', 'move / attack (hold to keep steering)'],
  ['Q W E R', 'hold to aim, release to cast'],
  ['S', 'stop'],
  ['Space', 'center camera (hold)'],
  ['Y', 'lock / unlock camera'],
  ['Wheel', 'zoom'],
  ['`', 'nav grid overlay'],
];

/** DOM overlay for everything screen-space. Only touches the DOM when a value actually changes. */
export class Hud {
  private readonly debug: HTMLElement;
  private readonly clockTime: HTMLElement;
  private readonly clockWave: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly portrait: HTMLElement;
  private readonly stacks: HTMLElement;
  private readonly slots: SlotEls[] = [];
  private readonly hp: BarEls;
  private readonly mp: BarEls;
  private readonly tooltip: HTMLElement;
  private readonly respawn: HTMLElement;
  private info: ChampionInfo | null = null;
  private readonly written = new WeakMap<HTMLElement, Map<string, string>>();

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="debug"></div>
      <div class="clock"><span class="time">0:00</span><span class="wave"></span></div>
      <div class="help"><div class="help-title">Practice Range</div>${HELP.map(([k, v]) => `<div><kbd>${k}</kbd> ${v}</div>`).join('')}</div>
      <div class="respawn"></div>
      <div class="bar" hidden>
        <div class="portrait"><span class="initial"></span><span class="stacks"></span></div>
        <div class="center">
          <div class="slots">${SLOT_KEYS.map(
            (k) => `<div class="slot"><div class="name"></div><div class="cd"></div><div class="cdtext"></div><kbd>${k}</kbd><div class="cost"></div></div>`,
          ).join('')}</div>
          <div class="res hp"><div class="fill"></div><span></span></div>
          <div class="res mp"><div class="fill"></div><span></span></div>
        </div>
      </div>
      <div class="tooltip" hidden></div>`;
    const q = (sel: string, parent: ParentNode = root) => parent.querySelector(sel) as HTMLElement;
    this.debug = q('.debug');
    this.clockTime = q('.clock .time');
    this.clockWave = q('.clock .wave');
    this.bar = q('.bar');
    this.portrait = q('.portrait');
    this.stacks = q('.stacks');
    this.tooltip = q('.tooltip');
    this.respawn = q('.respawn');
    this.hp = { fill: q('.hp .fill'), text: q('.hp span') };
    this.mp = { fill: q('.mp .fill'), text: q('.mp span') };
    root.querySelectorAll<HTMLElement>('.slot').forEach((el, i) => {
      this.slots.push({ root: el, cd: q('.cd', el), cdText: q('.cdtext', el), cost: q('.cost', el) });
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
    info.abilities.forEach((a, i) => {
      (this.slots[i].root.querySelector('.name') as HTMLElement).textContent = a.name;
      this.slots[i].cost.textContent = String(a.cost);
    });
  }

  update(me: MeSnap | undefined, self: EntitySnap | undefined, debug: string): void {
    this.set(this.debug, 'text', debug);
    if (!this.info || !me || !self) return;

    this.set(this.hp.fill, 'width', pct(self.hp ?? 0, self.mhp ?? 1));
    this.set(this.hp.text, 'text', `${Math.max(0, self.hp ?? 0)} / ${self.mhp}`);
    this.set(this.mp.fill, 'width', pct(self.mp ?? 0, self.mmp ?? 1));
    this.set(this.mp.text, 'text', `${self.mp} / ${self.mmp}`);
    this.set(this.stacks, 'text', me.passiveStacks ? String(me.passiveStacks) : '');
    this.set(this.portrait, 'class', me.empowered ? 'portrait empowered' : 'portrait');

    me.abilities.forEach((a, i) => {
      const el = this.slots[i];
      const cdMax = this.info!.abilities[i].cooldown;
      const noMana = (self.mp ?? 0) < this.info!.abilities[i].cost;
      this.set(el.cd, 'background', a.cd > 0 ? `conic-gradient(rgba(4,7,10,.78) ${(a.cd / cdMax) * 360}deg, transparent 0)` : 'none');
      this.set(el.cdText, 'text', a.cd > 0 ? (a.cd < 1 ? a.cd.toFixed(1) : String(Math.ceil(a.cd))) : '');
      this.set(el.root, 'class', `slot${a.cd > 0 ? ' cooling' : ''}${noMana ? ' nomana' : ''}`);
    });

    this.set(this.respawn, 'text', me.respawnIn > 0 ? `Respawning in ${Math.ceil(me.respawnIn)}` : '');
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
      line('tt-name', `${a.name} [${SLOT_KEYS[slot]}]`);
      line('tt-meta', `${a.cost} mana · ${a.cooldown}s cooldown${a.castTime ? ` · ${a.castTime}s cast` : ''}`);
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
