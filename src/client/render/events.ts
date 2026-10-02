import { Container, Graphics, Text } from 'pixi.js';
import { TEAM, type PlayerTeam, type Team } from '../../shared/constants';
import type { EventSite, MapData } from '../../shared/map/mapData';
import type { EventStatus, GameEvent } from '../../shared/protocol';
import type { Tone } from '../hud';
import type { Minimap } from '../minimap';
import type { SoundCue } from '../sfx';
import { CartFigure, drawStall } from './eventFigures';
import type { FxLayer } from './fx';
import { inkLoop, inkOf, mix } from './organic';
import { PALETTE } from './views';

// Everything a player sees and hears of the map events (sim/events.ts) that isn't a unit: the beacon that
// marks the site from the warning on, the cart rolling along its path with the flags at each end, the tax
// stall and its capture circle, the boss's topple telegraph and crash, the announcer's banners, the
// readout under the clock, and the marker on the minimap. Fed the `event` status from the host's
// snapshots each frame, and the `evt` game events as playback reaches them.

type EventEv = Extract<GameEvent, { e: 'evt' }>;

export interface EventsHooks {
  fx: FxLayer;
  /** The match's map, for where the cart's path ends. */
  map: MapData;
  /** On the ground, under the units (rings, the path, the telegraph). */
  under: Container;
  /** Sorted in with the units (the beacon, the cart, the stall). */
  units: Container;
  /** The HUD's root, for the readout. */
  hudRoot: HTMLElement;
  minimap: Minimap;
  /** The viewer's side. */
  team: () => Team;
  announce: (title: string, detail: string, tone: Tone) => void;
  cue: (cue: SoundCue) => void;
  shake: (at: { x: number; y: number }, amount: number) => void;
}

const GOLD = 0xe8c46a;
const WICK_PURPLE = 0x9b5cff;
const COAT_TAN = 0x9a7a52;
/** The cart's bell rings about this often while it rolls. */
const BELL_EVERY = 2.6;

export class EventsView {
  private readonly ground = new Graphics();
  private readonly beacon = new Container();
  private readonly beaconG = new Graphics();
  private readonly count: Text;
  private readonly flags = new Graphics();
  private cart: CartFigure | null = null;
  private cartAt: { x: number; y: number } | null = null;
  private cartSpeed = 0;
  private nextBell = 0;
  private stall: Container | null = null;
  private readonly hud: { root: HTMLElement; name: HTMLElement; time: HTMLElement; sub: HTMLElement; bar: HTMLElement; ours: HTMLElement; theirs: HTMLElement; knob: HTMLElement };
  private hudKey = '';
  private clock = 0;

  constructor(private readonly h: EventsHooks) {
    h.under.addChild(this.ground, this.flags);
    this.count = new Text({ text: '', style: { fontFamily: "'Lilita One', 'Nunito', system-ui, sans-serif", fontSize: 30, fill: 0xffffff, stroke: { color: 0x000000, width: 6 }, letterSpacing: 1 } });
    this.count.anchor.set(0.5, 1);
    this.beacon.addChild(this.beaconG, this.count);
    this.beacon.visible = false;
    h.units.addChild(this.beacon);
    // The readout under the clock (and the Warden's lines): name and timer, a line of state, a bar.
    const root = document.createElement('div');
    root.className = 'event-hud';
    root.hidden = true;
    root.innerHTML = `<div class="event-head"><span class="event-name"></span><span class="event-time"></span></div><div class="event-sub"></div><div class="event-bar"><div class="event-fill ours"></div><div class="event-fill theirs"></div><div class="event-knob"></div></div>`;
    const q = (sel: string) => root.querySelector(sel) as HTMLElement;
    this.hud = { root, name: q('.event-name'), time: q('.event-time'), sub: q('.event-sub'), bar: q('.event-bar'), ours: q('.event-fill.ours'), theirs: q('.event-fill.theirs'), knob: q('.event-knob') };
    h.hudRoot.append(root);
  }

  // ─── Each frame ───────────────────────────────────────────────────────────

  update(dt: number, s: EventStatus | undefined): void {
    this.clock += dt;
    if (!s) {
      this.beacon.visible = false;
      this.ground.clear();
      this.flags.clear();
      if (this.cart) this.cart.root.visible = false;
      if (this.stall) this.stall.visible = false;
      this.h.minimap.event = null;
      if (!this.hud.root.hidden) this.hud.root.hidden = true;
      return;
    }
    const me = this.h.team();
    const ours = (team: PlayerTeam | undefined) => (team === undefined ? GOLD : team === me ? PALETTE.ally : PALETTE.enemy);
    this.h.minimap.event = { x: s.x, y: s.y, kind: s.kind, phase: s.phase, color: s.team ? ours(s.team) : s.phase === 'soon' ? 0xffffff : GOLD };
    this.drawBeacon(s, ours(s.team));
    this.ground.clear();
    this.flags.clear();
    if (s.kind === 'escort') this.escort(dt, s, me);
    else if (this.cart) this.cart.root.visible = false;
    if (s.kind === 'capture') this.capture(s, me);
    else if (this.stall) this.stall.visible = false;
    this.readout(s, me);
  }

  /** The beacon at the site: a pole with a pennant and a light on top, rings on the ground, a countdown while it's coming. */
  private drawBeacon(s: EventStatus, color: number): void {
    const b = this.beacon;
    // The escort's beacon stands where the cart set off (the status follows the cart); the rest where the event is.
    const at = s.kind === 'escort' ? this.escortSite(s)?.pos ?? s : s;
    b.visible = s.phase !== 'done' || s.kind !== 'boss';
    b.position.set(at.x, at.y);
    b.zIndex = at.y;
    const g = this.beaconG.clear();
    const t = this.clock;
    const soon = s.phase === 'soon';
    const pulse = 0.5 + 0.5 * Math.sin(t * (soon ? 5 : 2.2));
    // Rings on the ground: pulsing out while it's coming, steady once it's on.
    const ring = soon ? 2 : 1;
    for (let i = 0; i < ring; i++) {
      const k = soon ? (t * 0.8 + i * 0.5) % 1 : 0;
      const rr = 70 + k * 120;
      g.ellipse(0, 0, rr, rr * 0.45).stroke({ width: soon ? 4 * (1 - k) + 1 : 3, color, alpha: soon ? 0.8 * (1 - k) : 0.5 + 0.2 * pulse });
    }
    g.ellipse(0, 0, 40, 18).fill({ color, alpha: 0.12 + 0.08 * pulse });
    // The pole, a lantern on top, and a pennant flapping from it.
    g.moveTo(0, 0).lineTo(0, -150).stroke({ width: 6, color: 0x2a2018 });
    g.moveTo(0, 0).lineTo(0, -150).stroke({ width: 3, color: 0x6b4a2b });
    const flap = Math.sin(t * 6) * 6;
    g.poly([0, -148, 54, -134 + flap, 0, -118]).fill(mix(color, 0xffffff, 0.2)).stroke({ width: 2.5, color: inkOf(color), join: 'round' });
    g.circle(0, -160, 20 + 6 * pulse).fill({ color, alpha: 0.18 });
    g.circle(0, -160, 9).fill(0xfff6d8).stroke({ width: 2.5, color: inkOf(color) });
    this.h.fx.light(at.x, at.y - 40, 320, color, 0.15, 0.3 + 0.25 * pulse);
    const text = soon ? clock(s.left) : '';
    if (this.count.text !== text) this.count.text = text;
    this.count.position.set(0, -176);
  }

  /** The escort site the cart is on: the one whose path runs nearest it. */
  private escortSite(s: EventStatus): EventSite | undefined {
    let best: EventSite | undefined;
    let bestD = Infinity;
    for (const site of this.h.map.eventSites ?? []) {
      if (site.kind !== 'escort') continue;
      for (const p of site.path ?? [site.pos]) {
        const d = Math.hypot(p.x - s.x, p.y - s.y);
        if (d < bestD) {
          bestD = d;
          best = site;
        }
      }
    }
    return best;
  }

  /** Old Wick's cart on its path: the flags at each end, who's pushing, and the cart itself rolling along. */
  private escort(dt: number, s: EventStatus, me: Team): void {
    const g = this.ground;
    if (!this.cart) {
      this.cart = new CartFigure(58);
      this.h.units.addChild(this.cart.root);
    }
    const cart = this.cart;
    cart.root.visible = s.phase !== 'soon';
    // The status is the host's latest word; glide the cart toward it.
    if (!this.cartAt || Math.hypot(s.x - this.cartAt.x, s.y - this.cartAt.y) > 600) this.cartAt = { x: s.x, y: s.y };
    const k = Math.min(1, dt * 6);
    const was = { ...this.cartAt };
    this.cartAt.x += (s.x - this.cartAt.x) * k;
    this.cartAt.y += (s.y - this.cartAt.y) * k;
    const moved = Math.hypot(this.cartAt.x - was.x, this.cartAt.y - was.y);
    this.cartSpeed += ((dt > 0 ? moved / dt : 0) - this.cartSpeed) * Math.min(1, dt * 5);
    const facing = Math.abs(this.cartAt.x - was.x) > 0.5 ? Math.sign(this.cartAt.x - was.x) : 0;
    cart.root.position.set(this.cartAt.x, this.cartAt.y);
    cart.root.zIndex = this.cartAt.y;
    cart.update(dt, this.cartSpeed, facing);
    this.h.fx.light(this.cartAt.x + cart.lantern.x, this.cartAt.y + cart.lantern.y, 260, WICK_PURPLE, 0.15, 0.45 + 0.1 * Math.sin(this.clock * 7));
    if (cart.root.visible && this.cartSpeed > 30) {
      // Dust off the wheels, and the bell now and then.
      for (let i = 0; i < this.h.fx.rate(14); i++) this.h.fx.particles.emit({ shape: 'puff', glow: false, x: this.cartAt.x + (Math.random() - 0.5) * 70, y: this.cartAt.y + 6, vx: -facing * 40 + (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 20, drag: 0.3, life: 0.7, size: 10, size2: 26, color: 0xb9a27c, alpha: 0.35 });
      if (this.clock >= this.nextBell) {
        this.nextBell = this.clock + BELL_EVERY;
        this.h.cue({ name: 'cartBell', at: this.cartAt, gain: 0.5 });
      }
    }
    // Who's pushing shows as a ring round it in their color; both there and it's split.
    const pushing = s.team;
    if (s.phase === 'live') {
      const color = pushing === undefined ? 0xcfcfcf : pushing === me ? PALETTE.ally : PALETTE.enemy;
      const r = 90 + Math.sin(this.clock * 4) * 4;
      g.ellipse(this.cartAt.x, this.cartAt.y, r, r * 0.45).stroke({ width: 4, color, alpha: pushing === undefined ? 0.3 : 0.8 });
      if ((s.blue ?? 0) > 0 && (s.red ?? 0) > 0) g.ellipse(this.cartAt.x, this.cartAt.y, r + 10, (r + 10) * 0.45).stroke({ width: 3, color: 0xffffff, alpha: 0.5 + 0.3 * Math.sin(this.clock * 9) });
    }
    // The path as a trail of dots, and a flag at each end in our colors, so you know which way to push.
    const site = this.escortSite(s);
    const path = site?.path;
    if (path && path.length >= 2) {
      const f = this.flags;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1];
        const b = path[i];
        const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 110));
        for (let k = 0; k < n; k++) f.ellipse(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, 7, 3.5).fill({ color: 0xe8dcc0, alpha: 0.35 });
      }
      for (const team of [TEAM.blue, TEAM.red] as const) {
        const e = team === TEAM.blue ? path[0] : path[path.length - 1];
        const color = team === me ? PALETTE.ally : PALETTE.enemy;
        f.ellipse(e.x, e.y, 70, 30).fill({ color, alpha: 0.12 }).stroke({ width: 3, color, alpha: 0.6 });
        f.moveTo(e.x, e.y).lineTo(e.x, e.y - 90).stroke({ width: 5, color: 0x2a2018 });
        f.poly([e.x, e.y - 88, e.x + 40, e.y - 76 + Math.sin(this.clock * 5 + team) * 5, e.x, e.y - 64]).fill(color).stroke({ width: 2, color: inkOf(color) });
      }
    }
  }

  /** The Royal Tax Stall and its circle: each team's bar as an arc round it, tinted for whoever holds it. */
  private capture(s: EventStatus, me: Team): void {
    if (!this.stall) {
      this.stall = drawStall();
      this.h.units.addChild(this.stall);
    }
    this.stall.visible = true;
    this.stall.position.set(s.x, s.y - 30);
    this.stall.zIndex = s.y - 30;
    const g = this.ground;
    const R = 320;
    const holder = s.team;
    const holderColor = holder === undefined ? 0xffffff : holder === me ? PALETTE.ally : PALETTE.enemy;
    // The circle: inked, filled faintly in the holder's color.
    const pts: number[] = [];
    for (let i = 0; i < 48; i++) pts.push(s.x + Math.cos((i / 48) * Math.PI * 2) * R, s.y + Math.sin((i / 48) * Math.PI * 2) * R * 0.5);
    g.poly(pts).fill({ color: holderColor, alpha: holder === undefined ? 0.04 : 0.1 + 0.04 * Math.sin(this.clock * 5) });
    inkLoop(g, pts, 5, { color: inkOf(GOLD), alpha: 0.6, seed: 4 }, 4);
    g.poly(pts).stroke({ width: 2, color: GOLD, alpha: 0.5 });
    // Each team's bar: ours sweeps round from the left, theirs from the right.
    const mine = me === TEAM.blue ? s.blue : s.red;
    const theirs = me === TEAM.blue ? s.red : s.blue;
    const sweep = (share: number, from: number, dir: number, color: number) => {
      if (share <= 0) return;
      const a0 = from;
      const a1 = from + dir * share * Math.PI;
      const n = Math.max(2, Math.ceil(share * 24));
      const outer: number[] = [];
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        outer.push(s.x + Math.cos(a) * (R + 14), s.y + Math.sin(a) * (R + 14) * 0.5);
      }
      g.moveTo(outer[0], outer[1]);
      for (let i = 2; i < outer.length; i += 2) g.lineTo(outer[i], outer[i + 1]);
      g.stroke({ width: 9, color, alpha: 0.9, cap: 'round' });
    };
    sweep(mine ?? 0, Math.PI, 1, PALETTE.ally);
    sweep(mine ?? 0, Math.PI, -1, PALETTE.ally);
    sweep(theirs ?? 0, 0, 1, PALETTE.enemy);
    sweep(theirs ?? 0, 0, -1, PALETTE.enemy);
    if (s.phase === 'live') this.h.fx.light(s.x, s.y, 420, holderColor, 0.15, holder === undefined ? 0.15 : 0.35);
  }

  /** Under the clock: the name and the time, what's happening, and a bar. */
  private readout(s: EventStatus, me: Team): void {
    const h = this.hud;
    if (h.root.hidden) h.root.hidden = false;
    const oursTeam = (team: PlayerTeam | undefined) => (team === undefined ? '' : team === me ? 'ours' : 'theirs');
    let sub = '';
    let oursW = 0;
    let theirsW = 0;
    let knob = -1;
    let cls = `event-hud ${s.kind} ${s.phase}`;
    const side = (team: PlayerTeam | undefined) => (team === undefined ? 'Nobody' : team === me ? 'We' : 'They');
    if (s.phase === 'soon') sub = 'Head for the beacon';
    else if (s.phase === 'done') sub = s.team ? `${side(s.team)} took it` : 'Nobody took it';
    else if (s.kind === 'boss') {
      sub = s.enraged ? 'Enraged! Finish it' : 'Kill it for the team';
      oursW = (s.progress ?? 1) * 100;
      cls += ' hp';
    } else if (s.kind === 'escort') {
      const mine = me === TEAM.blue ? s.blue ?? 0 : s.red ?? 0;
      const theirs = me === TEAM.blue ? s.red ?? 0 : s.blue ?? 0;
      sub = s.team === me ? `We're pushing it home · ${mine} v ${theirs}` : s.team ? `They're pushing it · ${mine} v ${theirs}` : mine && theirs ? `Contested · ${mine} v ${theirs}` : 'Stand by it to push';
      // Our end on the left.
      const p = s.progress ?? 0.5;
      knob = (me === TEAM.blue ? p : 1 - p) * 100;
      if (s.team === me) oursW = knob;
      else if (s.team) theirsW = 100 - knob;
    } else {
      const mine = (me === TEAM.blue ? s.blue : s.red) ?? 0;
      const theirs = (me === TEAM.blue ? s.red : s.blue) ?? 0;
      sub = s.team === me ? 'We hold it: collecting' : s.team ? 'They hold it' : mine || theirs ? 'Contested: nothing moves' : 'Stand in it to take it';
      oursW = mine * 50;
      theirsW = theirs * 50;
    }
    if (s.team) cls += ` winning-${oursTeam(s.team)}`;
    const key = [s.name, s.left, sub, Math.round(oursW), Math.round(theirsW), Math.round(knob), cls].join('|');
    if (key === this.hudKey) return;
    this.hudKey = key;
    h.root.className = cls;
    h.name.textContent = s.name;
    h.time.textContent = s.phase === 'soon' ? `in ${clock(s.left)}` : s.phase === 'live' ? clock(s.left) : '';
    h.sub.textContent = sub;
    h.bar.hidden = s.phase !== 'live';
    h.ours.style.width = `${oursW}%`;
    h.theirs.style.width = `${theirsW}%`;
    h.knob.hidden = knob < 0;
    if (knob >= 0) h.knob.style.left = `${knob}%`;
  }

  // ─── Moments ──────────────────────────────────────────────────────────────

  onEvent(ev: EventEv): void {
    const me = this.h.team();
    const fx = this.h.fx;
    const tone: Tone = ev.team === undefined ? 'neutral' : ev.team === me ? 'ours' : 'theirs';
    const who = ev.team === undefined ? 'Nobody' : ev.team === me ? 'We' : 'They';
    const teamName = ev.team === TEAM.blue ? 'Blue team' : ev.team === TEAM.red ? 'Red team' : 'Nobody';
    switch (ev.k) {
      case 'soon': {
        const title = ev.kind === 'boss' ? 'SOMETHING TALL IS COMING' : ev.kind === 'escort' ? "OLD WICK'S CART IS COMING" : 'THE TAX COLLECTOR IS COMING';
        const detail = ev.kind === 'boss' ? `Three Chuds in a Coat arrive in ${ev.dur ?? 30}s: kill them for gold and Deep Pockets` : ev.kind === 'escort' ? `Push Old Wick's cart home in ${ev.dur ?? 30}s: gold and Wick's Favor at your end` : `The Royal Tax Stall opens in ${ev.dur ?? 30}s: hold it for gold and Royal Favor`;
        this.h.announce(title, detail, 'neutral');
        this.h.cue({ name: 'eventWarn', gain: 0.7 });
        fx.pillar(ev.x, ev.y, 70, 0xffffff, 1.6);
        fx.sigil(ev.x, ev.y, 170, GOLD, 2.2, 0.8);
        return;
      }
      case 'start': {
        const title = ev.kind === 'boss' ? 'THREE CHUDS IN A COAT' : ev.kind === 'escort' ? "OLD WICK'S CART" : 'TAX TIME';
        const detail = ev.kind === 'boss' ? 'A very tall bloke has arrived at the river. The Oak was right.' : ev.kind === 'escort' ? 'Stand by the cart to push it toward your side' : 'Stand in the circle, alone, to fill your bar';
        this.h.announce(title, detail, 'neutral');
        this.h.cue({ name: 'eventStart', gain: 0.8 });
        fx.pillar(ev.x, ev.y, 110, GOLD, 1.8);
        fx.shockwave(ev.x, ev.y, 420, GOLD, 0.7);
        fx.particles.burst(30, { shape: 'star', x: ev.x, y: ev.y, life: 1.2, size: 16, size2: 3, color: 0xfff1b8, color2: GOLD, drag: 0.3, ay: -60, spin: 4 }, [80, 300]);
        if (ev.kind === 'escort') this.nextBell = this.clock + 0.5;
        return;
      }
      case 'won': {
        const good = tone === 'ours';
        const title = ev.kind === 'boss' ? 'THE COAT IS SLAIN' : ev.kind === 'escort' ? 'CART DELIVERED' : 'TAXES COLLECTED';
        const detail = ev.kind === 'boss' ? `${ev.text ?? teamName} finished Three Chuds in a Coat: ${who.toLowerCase() === 'we' ? 'we' : 'they'} have Deep Pockets` : ev.kind === 'escort' ? `${teamName} got Old Wick's cart home: ${good ? 'we' : 'they'} have Wick's Favor` : `${teamName} took the Royal Tax Stall: ${good ? 'we' : 'they'} have Royal Favor`;
        this.h.announce(title, detail, tone);
        this.h.cue({ name: good ? 'fanfare' : 'toll', gain: 0.7 });
        if (good) this.h.cue({ name: 'kaching', gain: 0.5 });
        const color = good ? PALETTE.ally : PALETTE.enemy;
        fx.pillar(ev.x, ev.y, 90, color, 1.6);
        fx.sigil(ev.x, ev.y, 240, color, 1.6, 1.4);
        for (let i = 0; i < 3; i++) fx.later(i * 0.15, () => fx.particles.burst(18, { shape: 'star', x: ev.x, y: ev.y - 40, life: 1.4, size: 18, size2: 4, color: 0xfff1b8, color2: GOLD, drag: 0.25, ay: 260, spin: 6 }, [120, 420]));
        return;
      }
      case 'over': {
        const title = ev.kind === 'boss' ? 'THE COAT WANDERED OFF' : ev.kind === 'escort' ? 'THE CART BROKE DOWN' : 'THE COLLECTOR PACKED UP';
        const detail = ev.kind === 'boss' ? 'Nobody finished it. It had somewhere to be.' : ev.kind === 'escort' ? (ev.team ? `It gave out on ${who.toLowerCase() === 'we' ? 'our' : 'their'} side: a little something for ${who.toLowerCase() === 'we' ? 'us' : 'them'}` : 'Right in the middle. Nobody gets a thing.') : 'Nobody held the stall long enough';
        this.h.announce(title, detail, tone);
        this.h.cue({ name: 'toll', gain: 0.45 });
        fx.particles.burst(14, { shape: 'smoke', glow: false, x: ev.x, y: ev.y, life: 1.2, size: 30, size2: 70, color: 0x9a8f80, alpha: 0.45, drag: 0.1 }, [40, 120]);
        return;
      }
      case 'topple': {
        // The strip it's about to fall along: an inked box that fills from the coat outward over the warning.
        const x2 = ev.x2 ?? ev.x;
        const y2 = ev.y2 ?? ev.y;
        const half = ev.r ?? 100;
        const dur = ev.dur ?? 1;
        const a = Math.atan2(y2 - ev.y, x2 - ev.x);
        const nx = -Math.sin(a) * half;
        const ny = Math.cos(a) * half * 0.6;
        const len = Math.hypot(x2 - ev.x, y2 - ev.y);
        fx.custom(dur, (g, t) => {
          const reach = len * Math.min(1, t * 1.05);
          const ex = ev.x + Math.cos(a) * reach;
          const ey = ev.y + Math.sin(a) * reach;
          g.poly([ev.x + nx, ev.y + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, ev.x - nx, ev.y - ny]).fill({ color: 0xff3b30, alpha: 0.12 }).stroke({ width: 3, color: 0xff3b30, alpha: 0.85 });
          g.poly([ev.x + nx, ev.y + ny, ex + nx, ey + ny, ex - nx, ey - ny, ev.x - nx, ev.y - ny]).fill({ color: 0xff3b30, alpha: 0.22 });
          // A shadow of the coat, falling.
          g.ellipse(ex, ey, half * 0.8 * t, half * 0.4 * t).fill({ color: 0x000000, alpha: 0.25 * t });
        }, 'under');
        this.h.cue({ name: 'coatCreak', at: ev, gain: 0.8 });
        fx.comic(ev.x, ev.y - 190, 'TIMBERRR', COAT_TAN);
        return;
      }
      case 'crash': {
        const x2 = ev.x2 ?? ev.x;
        const y2 = ev.y2 ?? ev.y;
        const half = ev.r ?? 100;
        const n = 7;
        for (let i = 0; i <= n; i++) {
          const k = i / n;
          const px = ev.x + (x2 - ev.x) * k;
          const py = ev.y + (y2 - ev.y) * k;
          fx.later(k * 0.12, () => {
            fx.particles.burst(8, { shape: 'smoke', glow: false, x: px, y: py, life: 0.9, size: half * 0.5, size2: half * 1.3, color: 0xb9a27c, alpha: 0.5, drag: 0.1 }, [60, 200]);
            fx.particles.burst(5, { shape: 'shard', glow: false, x: px, y: py, life: 0.7, size: 10, size2: 5, color: 0x6b5a42, drag: 0.1, spin: 8, ay: 300 }, [120, 320]);
          });
        }
        const mx = (ev.x + x2) / 2;
        const my = (ev.y + y2) / 2;
        fx.shockwave(mx, my, half * 2.4, 0xd9c9a0, 0.5);
        fx.cracks(x2, y2, half * 1.1, COAT_TAN, 1.2, 7);
        fx.scar(mx, my, half * 1.4, 'crack', 0x000000, 14);
        fx.comic(x2, y2 - 60, 'WHUMP!', COAT_TAN, true);
        this.h.cue({ name: 'coatCrash', at: { x: mx, y: my }, gain: 1 });
        this.h.shake({ x: mx, y: my }, 14);
        return;
      }
      case 'add': {
        fx.particles.burst(12, { shape: 'puff', glow: false, x: ev.x, y: ev.y - 20, life: 0.6, size: 18, size2: 40, color: 0xe8e0d0, alpha: 0.7, drag: 0.1 }, [60, 160]);
        fx.burst(ev.x, ev.y, COAT_TAN, 90);
        fx.comic(ev.x, ev.y - 70, 'OI!', 0xffe066);
        this.h.cue({ name: 'snap', at: ev, gain: 0.7 });
        this.h.announce('A CHUD FELL OUT', ev.text ? `It's ${ev.text.toLowerCase()} now` : 'The coat is getting shorter', 'neutral');
        return;
      }
      case 'enrage': {
        fx.flash(ev.x, ev.y - 100, 80, 0xff3b30, 0.5, 0.8);
        fx.comic(ev.x, ev.y - 200, 'RIGHT, THAT\'S IT', 0xff3b30, true);
        this.h.cue({ name: 'roar', at: ev, gain: 0.8 });
        this.h.announce('THE COAT IS LOSING ITS PATIENCE', 'Faster, harder, and it topples more often', 'neutral');
        return;
      }
      case 'collect': {
        // Coins out of the strongbox for whoever's holding it.
        const color = ev.team === me ? PALETTE.ally : PALETTE.enemy;
        fx.particles.burst(6, { shape: 'star', x: ev.x, y: ev.y - 110, life: 0.8, size: 14, size2: 3, color: 0xfff1b8, color2: GOLD, drag: 0.2, ay: 200, spin: 5 }, [60, 180]);
        fx.flash(ev.x, ev.y - 100, 26, mix(GOLD, color, 0.3), 0.25, 0.6);
        if (ev.team === me) this.h.cue({ name: 'gold', gain: 0.25 });
        return;
      }
    }
  }
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
