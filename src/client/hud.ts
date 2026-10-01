import { atRank, perRank, type ChampionInfo } from '../shared/champions/types';
import { SLOT_KEYS, type Slot, type Team } from '../shared/constants';
import { INVENTORY_SLOTS, ITEMS, hasteMultiplier, sellPrice, statLines, type ItemId } from '../shared/items';
import type { BuffKind, EntitySnap, MeSnap, ScoreRow, WardenStatus } from '../shared/protocol';
import { BUFFS, EMBER, GLOWCAP } from '../shared/sim/jungle';
import { MAX_BASIC_RANK, MAX_ULT_RANK, canRankUp } from '../shared/sim/progression';
import { portraitOf } from './render/champions';
import { iconEl } from './render/icons';
import { matchReport, mvpCard, pickMvp, scoreTables } from './scoreboard';
import { ShopPanel } from './shop';

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
  ['P', 'shop (at your fountain)'],
  ['M', 'mute sound'],
  ['N', 'music on / off'],
  ['1 2 3 4', 'taunt, laugh, cheer, say a line'],
  ['Tab', 'scoreboard (hold)'],
  ['Space', 'center camera (hold)'],
  ['Alt / G + click', 'ping (drag to pick one)'],
  ['Minimap', 'click to look, right-click to walk'],
  ['H', 'hide / show this'],
  ['Y', 'lock / unlock camera'],
  ['Wheel', 'zoom'],
  ['`', 'nav grid overlay'],
];

const BUFF_TEXT: Record<BuffKind, string> = {
  ember: `Basic attacks burn for ${EMBER.damage(1)} + 2 per level true damage and slow ${EMBER.slow * 100}% for ${EMBER.slowFor}s.`,
  glowcap: `+${GLOWCAP.haste} ability haste, and ${GLOWCAP.manaRegenPct * 100}% of max mana back each second.`,
};

const HELP_KEY = 'moba.helpFolded';

/** Seconds a kill-feed line stays up. */
const FEED_TIME = 7;

/** DOM overlay for everything screen-space. Only touches the DOM when a value actually changes. */
export class Hud {
  /** Called when the player clicks an ability's "+" to spend a skill point. */
  onLevelUp: ((slot: Slot) => void) | null = null;
  onBuy: ((id: ItemId) => void) | null = null;
  onSell: ((slot: number) => void) | null = null;
  onMute: (() => void) | null = null;
  private readonly muteButton: HTMLButtonElement;
  readonly shop: ShopPanel;
  private readonly inv: HTMLElement[] = [];
  private invItems: (ItemId | undefined)[] = [];
  private readonly debug: HTMLElement;
  private readonly clockTime: HTMLElement;
  private readonly clockWave: HTMLElement;
  private readonly warden: HTMLElement;
  private readonly feed: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly portrait: HTMLElement;
  private readonly stacks: HTMLElement;
  private readonly level: HTMLElement;
  private readonly gold: HTMLElement;
  private readonly slots: SlotEls[] = [];
  private readonly hp: BarEls;
  /** The white chunk behind the health bar showing what you just lost; it drains after a moment. */
  private readonly hpLag: HTMLElement;
  private lastHp = -1;
  /** Each slot's cooldown last frame, to flash it the moment it comes back. */
  private readonly lastCd: number[] = [0, 0, 0, 0];
  private readonly purse: HTMLElement;
  private readonly mp: BarEls;
  private readonly xp: BarEls;
  private readonly tooltip: HTMLElement;
  private readonly respawn: HTMLElement;
  private readonly gameOver: HTMLElement;
  private info: ChampionInfo | null = null;
  private ranks: number[] = [0, 0, 0, 0];
  private readonly buffBar: HTMLElement;
  private readonly scoreboard: HTMLElement;
  private scoreKey = '';
  /** The final match report, for the Copy button. */
  private report = '';
  private readonly written = new WeakMap<HTMLElement, Map<string, string>>();
  private readonly announceEl: HTMLElement;
  private readonly dangerEl: HTMLElement;
  /** Banners waiting their turn; one shows at a time. */
  private banners: { title: string; detail: string; tone: Tone }[] = [];
  private bannerUntil = 0;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="vignette"></div>
      <div class="danger"></div>
      <div class="announce"></div>
      <div class="debug"></div>
      <div class="feed"></div>
      <div class="clock"><span class="time">0:00</span><span class="wave"></span><button class="mute" title="Sound on/off (M)">🔊</button></div>
      <div class="warden"></div>
      <div class="help"><div class="help-title"></div><div class="help-keys">${HELP.map(([k, v]) => `<div><kbd>${k}</kbd> ${v}</div>`).join('')}</div><div class="help-hint"><kbd>H</kbd> controls</div></div>
      <div class="respawn"></div>
      <div class="scoreboard" hidden></div>
      <div class="gameover" hidden><div class="gameover-rays"></div><div class="gameover-title"></div><div class="gameover-sub"></div><div class="gameover-scores"></div><div class="gameover-actions"><button class="gameover-copy" hidden>Copy match report</button><button class="gameover-again">Back to menu</button></div></div>
      <div class="buffs"></div>
      <div class="bar" hidden>
        <div class="portrait"><img class="face" alt="" /><span class="initial"></span><span class="stacks"></span><span class="lvl">1</span></div>
        <div class="center">
          <div class="slots">${SLOT_KEYS.map(
            (k) =>
              `<div class="slot"><button class="up" hidden>+</button><div class="icon"></div><div class="name"></div><div class="cd"></div><div class="cdtext"></div><kbd>${k}</kbd><div class="cost"></div><div class="pips"></div></div>`,
          ).join('')}</div>
          <div class="res hp"><div class="lag"></div><div class="fill"></div><span></span></div>
          <div class="res mp"><div class="fill"></div><span></span></div>
          <div class="res xp"><div class="fill"></div><span></span></div>
        </div>
        <div class="side">
          <div class="inv">${'<div class="item"></div>'.repeat(INVENTORY_SLOTS)}</div>
          <button class="purse" title="Shop (P)"><span class="coin"></span><span class="gold">0</span></button>
        </div>
      </div>
      <div class="tooltip" hidden></div>`;
    const q = (sel: string, parent: ParentNode = root) => parent.querySelector(sel) as HTMLElement;
    this.debug = q('.debug');
    try {
      if (localStorage.getItem(HELP_KEY) === '1') q('.help').classList.add('folded');
    } catch {
      // private mode: start unfolded
    }
    this.announceEl = q('.announce');
    this.dangerEl = q('.danger');
    this.feed = q('.feed');
    this.buffBar = q('.buffs');
    this.clockTime = q('.clock .time');
    this.clockWave = q('.clock .wave');
    this.muteButton = q('.mute') as HTMLButtonElement;
    this.muteButton.addEventListener('click', () => this.onMute?.());
    this.warden = q('.warden');
    this.bar = q('.bar');
    this.portrait = q('.portrait');
    this.stacks = q('.stacks');
    this.level = q('.lvl');
    this.gold = q('.gold');
    this.tooltip = q('.tooltip');
    this.respawn = q('.respawn');
    this.gameOver = q('.gameover');
    q('.gameover-again').addEventListener('click', () => location.reload());
    this.scoreboard = q('.scoreboard');
    const copy = q('.gameover-copy');
    copy.addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.report).then(() => (copy.textContent = 'Copied! Paste it to whoever balances the game'));
    });
    this.hp = { fill: q('.hp .fill'), text: q('.hp span') };
    this.hpLag = q('.hp .lag');
    this.purse = q('.purse');
    this.mp = { fill: q('.mp .fill'), text: q('.mp span') };
    this.xp = { fill: q('.xp .fill'), text: q('.xp span') };
    root.querySelectorAll<HTMLElement>('.slot').forEach((el, i) => {
      const up = q('.up', el) as HTMLButtonElement;
      up.addEventListener('click', () => this.onLevelUp?.(i as Slot));
      this.slots.push({ root: el, cd: q('.cd', el), cdText: q('.cdtext', el), cost: q('.cost', el), pips: q('.pips', el), up });
      el.addEventListener('mouseenter', () => this.showTooltip(el, i));
      el.addEventListener('mouseleave', () => (this.tooltip.hidden = true));
    });
    root.querySelectorAll<HTMLElement>('.inv .item').forEach((el, i) => {
      this.inv.push(el);
      el.addEventListener('mouseenter', () => this.showItemTooltip(el, i));
      el.addEventListener('mouseleave', () => (this.tooltip.hidden = true));
    });
    q('.purse').addEventListener('click', () => this.shop.toggle());
    this.shop = new ShopPanel(
      root,
      (id) => this.onBuy?.(id),
      (slot) => this.onSell?.(slot),
    );
    this.portrait.addEventListener('mouseenter', () => this.showTooltip(this.portrait, -1));
    this.portrait.addEventListener('mouseleave', () => (this.tooltip.hidden = true));
  }

  setChampion(info: ChampionInfo, skin = 0): void {
    this.info = info;
    this.bar.hidden = false;
    const face = portraitOf(info.id, skin);
    (this.portrait.querySelector('.initial') as HTMLElement).textContent = face ? '' : info.name.slice(0, 2).toUpperCase();
    if (face) (this.portrait.querySelector('.face') as HTMLImageElement).src = face;
    this.bar.classList.toggle('rage', info.resource === 'rage');
    this.bar.classList.toggle('nores', info.resource === 'none');
    info.abilities.forEach((a, i) => {
      (this.slots[i].root.querySelector('.name') as HTMLElement).textContent = a.name;
      (this.slots[i].root.querySelector('.icon') as HTMLElement).replaceChildren(iconEl(a.icon));
    });
  }

  update(me: MeSnap | undefined, self: EntitySnap | undefined, debug: string): void {
    this.set(this.debug, 'text', debug);
    if (!this.info || !me || !self) return;

    this.set(this.hp.fill, 'width', pct(self.hp ?? 0, self.mhp ?? 1));
    // Losing health leaves a white chunk that drains after a beat; healing just fills straight up.
    const hp = self.hp ?? 0;
    if (hp !== this.lastHp) {
      if (hp > this.lastHp) {
        this.hpLag.style.transition = 'none';
        this.hpLag.style.width = pct(hp, self.mhp ?? 1);
        void this.hpLag.offsetWidth;
        this.hpLag.style.transition = '';
      } else this.hpLag.style.width = pct(hp, self.mhp ?? 1);
      this.lastHp = hp;
    }
    this.set(this.hp.text, 'text', `${Math.max(0, self.hp ?? 0)} / ${self.mhp}`);
    this.set(this.mp.fill, 'width', pct(self.mp ?? 0, self.mmp ?? 1));
    this.set(this.mp.text, 'text', `${self.mp} / ${self.mmp}`);
    this.set(this.xp.fill, 'width', me.xpNext ? pct(me.xp, me.xpNext) : '100%');
    this.set(this.xp.text, 'text', me.xpNext ? `${me.xp} / ${me.xpNext} xp` : 'max level');
    this.set(this.level, 'text', String(me.level));
    this.set(this.gold, 'text', String(me.gold));
    this.invItems = me.items;
    this.inv.forEach((el, i) => {
      const id = me.items[i];
      this.set(el, 'icon', id ? ITEMS[id].icon : '');
      this.set(el, 'class', id ? `item tier-${ITEMS[id].tier}` : 'item');
    });
    this.shop.update(me);
    this.updateBuffs(me);
    this.set(this.stacks, 'text', me.passiveStacks ? String(me.passiveStacks) : '');
    this.set(this.portrait, 'class', me.empowered ? 'portrait empowered' : 'portrait');

    me.abilities.forEach((a, i) => {
      const el = this.slots[i];
      const info = this.info!.abilities[i];
      this.ranks[i] = a.rank;
      const cdMax = atRank(info.cooldown, a.rank) * hasteMultiplier(me.stats.haste);
      const cost = atRank(info.cost, a.rank);
      const noMana = a.rank > 0 && (self.mp ?? 0) < cost;
      const canLevel = me.points > 0 && canRankUp(i as Slot, a.rank, me.level);
      this.set(el.cd, 'background', a.cd > 0 ? `conic-gradient(rgba(4,7,10,.78) ${(a.cd / cdMax) * 360}deg, transparent 0)` : 'none');
      this.set(el.cdText, 'text', a.cd > 0 ? (a.cd < 1 ? a.cd.toFixed(1) : String(Math.ceil(a.cd))) : '');
      this.set(el.cost, 'text', a.note ?? (cost ? String(cost) : ''));
      this.set(el.cost, 'class', a.note ? 'cost note' : 'cost');
      const maxRank = i === 3 ? MAX_ULT_RANK : MAX_BASIC_RANK;
      this.set(el.pips, 'text', '●'.repeat(a.rank) + '○'.repeat(maxRank - a.rank));
      this.set(el.root, 'class', `slot${a.rank === 0 ? ' unlearned' : ''}${a.cd > 0 ? ' cooling' : ''}${noMana ? ' nomana' : ''}${canLevel ? ' levelable' : ''}`);
      if (el.up.hidden === canLevel) el.up.hidden = !canLevel;
      // Back off cooldown: a quick golden flash.
      if (this.lastCd[i] > 0 && a.cd <= 0 && a.rank > 0) this.pop(el.root, 'ready');
      this.lastCd[i] = a.cd;
    });

    const low = !self.dead && (self.hp ?? 0) / (self.mhp ?? 1) < 0.3;
    this.set(this.dangerEl, 'class', low ? 'danger on' : 'danger');

    const recalling = self.st?.includes('recall');
    this.set(this.respawn, 'text', me.respawnIn > 0 ? `Respawning in ${Math.ceil(me.respawnIn)}` : recalling ? 'Recalling…' : '');
  }

  /** One chip per jungle buff, with seconds left. Rebuilt only when the set of buffs changes. */
  private updateBuffs(me: MeSnap): void {
    const kinds = me.buffs.map((b) => b.kind).join();
    if (this.buffBar.dataset.kinds !== kinds) {
      this.buffBar.dataset.kinds = kinds;
      this.buffBar.replaceChildren(
        ...me.buffs.map((b) => {
          const chip = document.createElement('div');
          chip.className = `buff buff-${b.kind}`;
          chip.title = `${BUFFS[b.kind].name}: ${BUFF_TEXT[b.kind]}`;
          const name = document.createElement('span');
          name.textContent = BUFFS[b.kind].name;
          chip.append(name, document.createElement('b'));
          return chip;
        }),
      );
    }
    me.buffs.forEach((b, i) => this.set(this.buffBar.children[i].querySelector('b') as HTMLElement, 'text', `${b.left}s`));
  }

  /** A big banner across the top for a moment worth shouting about. Queued if one is already up. */
  announce(title: string, detail: string, tone: Tone): void {
    if (this.banners.length >= 3) this.banners.shift();
    this.banners.push({ title, detail, tone });
    this.nextBanner();
  }

  private nextBanner(): void {
    const now = performance.now();
    if (now < this.bannerUntil || !this.banners.length) return;
    const b = this.banners.shift()!;
    const el = this.announceEl;
    el.replaceChildren();
    const card = document.createElement('div');
    card.className = `banner ${b.tone}`;
    const title = document.createElement('div');
    title.className = 'banner-title';
    title.textContent = b.title;
    const detail = document.createElement('div');
    detail.className = 'banner-detail';
    detail.textContent = b.detail;
    card.append(title, detail);
    el.append(card);
    const hold = 2600;
    this.bannerUntil = now + hold;
    setTimeout(() => {
      card.classList.add('out');
      setTimeout(() => {
        card.remove();
        this.nextBanner();
      }, 350);
    }, hold - 350);
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

  /** The Tab scoreboard while it's held; on the game-over screen, the final one and the match report. */
  setScores(rows: ScoreRow[] | undefined, myTeam: Team, meId: number, held: boolean, time: number, winner: Team | undefined): void {
    const over = winner !== undefined && !this.gameOver.hidden;
    const show = !!rows && (held || over);
    if (this.scoreboard.hidden === (show && !over)) this.scoreboard.hidden = !(show && !over);
    if (!show || !rows) return;
    const key = JSON.stringify([rows, over]);
    if (key === this.scoreKey) return;
    this.scoreKey = key;
    const tables = scoreTables(rows, myTeam, meId);
    if (over) {
      const mvp = pickMvp(rows, winner);
      (this.gameOver.querySelector('.gameover-scores') as HTMLElement).replaceChildren(...(mvp ? [mvpCard(mvp)] : []), tables);
      this.report = matchReport(rows, winner, time);
      (this.gameOver.querySelector('.gameover-copy') as HTMLElement).hidden = false;
    } else {
      this.scoreboard.replaceChildren(tables);
    }
  }

  /** Folds the controls panel down to its title (H), remembered for next time. */
  toggleHelp(): void {
    const help = this.debug.parentElement?.querySelector('.help') as HTMLElement | null;
    if (!help) return;
    const folded = help.classList.toggle('folded');
    try {
      localStorage.setItem(HELP_KEY, folded ? '1' : '0');
    } catch {
      // private mode: just don't remember
    }
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

  setMuted(muted: boolean): void {
    this.muteButton.textContent = muted ? '🔇' : '🔊';
    this.muteButton.classList.toggle('off', muted);
  }

  /** Under the clock: when the Warden wakes (the last two minutes), and who's Unchained. */
  setWarden(w: WardenStatus | undefined, myTeam: Team): void {
    const lines: [string, string][] = [];
    if (w && !w.alive && w.wakesIn !== undefined && w.wakesIn <= 120) lines.push(['', `The Warden wakes in ${mmss(w.wakesIn)}`]);
    for (const u of w?.unchained ?? []) {
      const who = u.team === myTeam ? 'We are' : 'They are';
      lines.push([u.team === myTeam ? 'ours' : 'theirs', `${who} ${u.uprising ? 'in Uprising' : 'Unchained'} · ${mmss(u.left)}`]);
    }
    const key = JSON.stringify(lines);
    if (this.warden.dataset.key === key) return;
    this.warden.dataset.key = key;
    this.warden.replaceChildren(
      ...lines.map(([cls, text]) => {
        const d = document.createElement('div');
        d.className = `warden-line ${cls}`;
        d.textContent = text;
        return d;
      }),
    );
  }

  /** Coins flying from where you earned them (screen position) into the purse. */
  flyCoins(fromX: number, fromY: number, amount: number): void {
    const target = this.purse.getBoundingClientRect();
    const count = Math.min(6, 1 + Math.floor(amount / 25));
    for (let i = 0; i < count; i++) {
      const coin = document.createElement('div');
      coin.className = 'coin-fly';
      const sx = fromX + (Math.random() - 0.5) * 40;
      const sy = fromY + (Math.random() - 0.5) * 30;
      coin.style.left = `${sx}px`;
      coin.style.top = `${sy}px`;
      this.purse.parentElement!.closest('#hud')!.append(coin);
      const dx = target.left + 14 - sx;
      const dy = target.top + target.height / 2 - sy;
      const flight = coin.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * 0.3}px, ${dy * 0.3 - 60}px) scale(1.2)`, opacity: 1, offset: 0.35 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.9 },
        ],
        { duration: 650 + i * 70, easing: 'cubic-bezier(0.5, 0, 0.75, 0.6)' },
      );
      flight.onfinish = () => {
        coin.remove();
        this.pop(this.purse, 'bump');
      };
    }
  }

  /** The XP bar and portrait burst with light on a level up. */
  levelFlash(): void {
    this.pop(this.xp.fill.parentElement as HTMLElement, 'burst');
    this.pop(this.portrait, 'burst');
  }

  /** Replays a one-shot CSS animation class on an element. */
  private pop(el: HTMLElement, cls: string): void {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
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
    const line = (cls: string, text: string, icon?: string) => {
      const d = document.createElement('div');
      d.className = cls;
      if (icon) d.append(iconEl(icon, 'tt-ico'));
      d.append(text);
      t.appendChild(d);
    };
    if (slot < 0) {
      line('tt-name', `${this.info.name} — ${this.info.title}`);
      line('tt-meta', `Passive: ${this.info.passive.name}`, this.info.passive.icon);
      line('tt-desc', this.info.passive.description);
    } else {
      const a = this.info.abilities[slot];
      const rank = this.ranks[slot];
      line('tt-name', `${a.name} [${SLOT_KEYS[slot]}] ${rank ? `· rank ${rank}` : '· not learned'}`, a.icon);
      const cost = a.cost.some((c) => c > 0) ? `${perRank(a.cost)} ${this.info.resource}` : 'No cost';
      line('tt-meta', `${cost} · ${perRank(a.cooldown)}s cooldown${a.castTime ? ` · ${a.castTime}s cast` : ''}`);
      line('tt-desc', a.description);
    }
    t.hidden = false;
    const r = anchor.getBoundingClientRect();
    t.style.left = `${Math.max(8, Math.min(window.innerWidth - 328, r.left + r.width / 2 - 160))}px`;
    t.style.bottom = `${window.innerHeight - r.top + 10}px`;
  }

  private showItemTooltip(anchor: HTMLElement, slot: number): void {
    const id = this.invItems[slot];
    if (!id) return;
    const it = ITEMS[id];
    const t = this.tooltip;
    t.replaceChildren();
    for (const [cls, text] of [
      ['tt-name', it.name],
      ['tt-meta', `${it.cost} gold · sells for ${sellPrice(id)}`],
      ['tt-desc', statLines(it.stats).join(' · ')],
      ['tt-flavor', it.flavor],
    ]) {
      const d = document.createElement('div');
      d.className = cls;
      if (cls === 'tt-name') d.append(iconEl(it.icon, 'tt-ico'));
      d.append(text);
      t.appendChild(d);
    }
    t.hidden = false;
    const r = anchor.getBoundingClientRect();
    t.style.left = `${Math.max(8, Math.min(window.innerWidth - 328, r.left + r.width / 2 - 160))}px`;
    t.style.bottom = `${window.innerHeight - r.top + 10}px`;
  }

  private set(el: HTMLElement, prop: 'text' | 'icon' | 'width' | 'background' | 'class', value: string): void {
    let cache = this.written.get(el);
    if (!cache) this.written.set(el, (cache = new Map()));
    if (cache.get(prop) === value) return;
    cache.set(prop, value);
    if (prop === 'text') el.textContent = value;
    else if (prop === 'icon') el.replaceChildren(...(value ? [iconEl(value)] : []));
    else if (prop === 'class') el.className = value;
    else el.style[prop] = value;
  }
}

/** Whose good news a banner is: yours (gold), theirs (red), or nobody's. */
export type Tone = 'ours' | 'theirs' | 'neutral';

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
