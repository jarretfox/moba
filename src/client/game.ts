import { Container, Graphics, type Application } from 'pixi.js';
import { CHAMPION_INFO } from '../shared/champions/registry';
import type { ChampionInfo } from '../shared/champions/types';
import { TEAM, type Slot, type Team } from '../shared/constants';
import { MAP } from '../shared/map/mapData';
import { NavGrid } from '../shared/map/navGrid';
import { dist, type Vec2 } from '../shared/math';
import type { Command, EntitySnap, GameEvent, HostMessage } from '../shared/protocol';
import { Camera } from './camera';
import type { Connection } from './connection';
import { Hud } from './hud';
import { FxLayer } from './render/fx';
import { drawIndicator } from './render/indicator';
import { buildMap, buildNavOverlay } from './render/mapView';
import { PALETTE, ProjectileView, StructureView, TrapView, UnitView, type EntityView, type Relation, type ViewContext } from './render/views';
import { SnapshotBuffer } from './snapshotBuffer';

/** How far behind the host we render. Two ticks is plenty for a host in this tab; remote hosts (M2) will want ~100ms. */
const INTERP_DELAY = 0.067;
/** While right mouse is held, re-send the move target this often. */
const HOLD_MOVE_INTERVAL = 0.12;
/** Extra pixels of forgiveness when right-clicking an enemy. */
const CLICK_SLOP = 20;
const SLOT_BY_CODE: Record<string, Slot> = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 };

/** Everything the player sees and touches. Reads host snapshots; sends commands. Never simulates. */
export class GameClient {
  private readonly worldLayer = new Container();
  private readonly groundLayer = new Container();
  private readonly underLayer = new Container();
  private readonly structureLayer = new Container();
  private readonly unitLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly indicator = new Graphics();
  private readonly fx = new FxLayer();
  private navOverlay: Graphics | null = null;

  private readonly camera = new Camera(MAP);
  private readonly buffer = new SnapshotBuffer(INTERP_DELAY);
  private readonly views = new Map<number, EntityView>();
  private readonly hud: Hud;

  private myId = -1;
  private myTeam: Team = TEAM.blue;
  private myInfo: ChampionInfo | null = null;
  private ents = new Map<number, EntitySnap>();

  private mouse = { x: 0, y: 0, inside: false };
  private rightHeld = false;
  private holdTimer = 0;
  private aiming: Slot | null = null;
  private centerHeld = false;
  private cursor = '';

  constructor(
    private readonly app: Application,
    private readonly conn: Connection,
    hudRoot: HTMLElement,
  ) {
    this.hud = new Hud(hudRoot);
    this.groundLayer.addChild(buildMap(MAP));
    this.worldLayer.addChild(this.groundLayer, this.underLayer, this.structureLayer, this.indicator, this.unitLayer, this.projectileLayer, this.fx.container);
    app.stage.addChild(this.worldLayer);
    conn.listen((msg) => this.onMessage(msg));
    this.bindInput();
    app.ticker.add((ticker) => this.frame(ticker.deltaMS / 1000));
  }

  private onMessage(msg: HostMessage): void {
    if (msg.t === 'welcome') {
      this.myId = msg.unitId;
      this.myTeam = msg.team;
      return;
    }
    this.buffer.push(msg.snap, performance.now() / 1000);
  }

  // ─── Per frame ────────────────────────────────────────────────────────────

  private frame(dt: number): void {
    const { ents, events } = this.buffer.sample(performance.now() / 1000);
    this.ents = new Map(ents.map((e) => [e.id, e]));
    this.syncViews(dt);
    for (const ev of events) this.playEvent(ev);
    this.fx.update(dt);

    const me = this.ents.get(this.myId);
    if (me?.champ && !this.myInfo) {
      this.myInfo = CHAMPION_INFO[me.champ];
      this.hud.setChampion(this.myInfo);
    }

    const { width: w, height: h } = this.app.screen;
    this.camera.update(dt, me && !me.dead ? me : null, this.mouse.inside ? this.mouse : null, w, h, this.centerHeld);
    this.camera.apply(this.worldLayer, w, h);

    const mouseWorld = this.mouseWorld();
    if (this.rightHeld && (this.holdTimer -= dt) <= 0) this.rightClick(false);
    this.setCursor(this.enemyAt(mouseWorld) ? 'crosshair' : 'default');
    if (this.aiming !== null && this.myInfo && me && !me.dead) drawIndicator(this.indicator, this.myInfo.abilities[this.aiming], me, mouseWorld);
    else this.indicator.clear();

    const latest = this.buffer.latest;
    this.hud.update(latest?.me, latest?.ents.find((e) => e.id === this.myId), `tick ${latest?.tick ?? 0} · ${Math.round(this.app.ticker.FPS)} fps`);
    this.hud.setClock(latest?.time ?? 0, latest?.nextWave);
    if (latest?.winner) this.hud.showGameOver(latest.winner === this.myTeam);
  }

  private syncViews(dt: number): void {
    for (const [id, view] of this.views) {
      if (this.ents.has(id)) continue;
      view.container.destroy({ children: true });
      this.views.delete(id);
    }
    const me = this.ents.get(this.myId);
    const ctx: ViewContext = { me: me && !me.dead ? me : undefined };
    for (const s of this.ents.values()) {
      let view = this.views.get(s.id);
      if (!view) {
        view = this.createView(s);
        this.views.set(s.id, view);
      }
      view.update(s, dt, ctx);
    }
  }

  private createView(s: EntitySnap): EntityView {
    const rel = this.relation(s);
    let view: EntityView;
    let layer: Container;
    switch (s.k) {
      case 'projectile':
        view = new ProjectileView(s, rel);
        layer = this.projectileLayer;
        break;
      case 'trap':
        view = new TrapView(s, rel);
        layer = this.underLayer;
        break;
      case 'structure':
        view = new StructureView(s, rel);
        layer = this.structureLayer;
        break;
      default:
        view = new UnitView(s, rel);
        layer = this.unitLayer;
    }
    layer.addChild(view.container);
    return view;
  }

  private relation(s: EntitySnap): Relation {
    return s.id === this.myId ? 'self' : s.tm === this.myTeam ? 'ally' : 'enemy';
  }

  private playEvent(ev: GameEvent): void {
    switch (ev.e) {
      case 'dmg': {
        // Like League, only damage you deal or take gets a number; a lane full of Chuds would be unreadable otherwise.
        if (ev.src !== this.myId && ev.target !== this.myId) return;
        const t = this.ents.get(ev.target);
        if (t) this.fx.damageNumber(t.x, t.y - t.r, ev.amount, ev.type);
        return;
      }
      case 'attack':
        this.views.get(ev.src)?.onAttack?.();
        return;
      case 'death': {
        const t = this.ents.get(ev.id);
        if (t) this.fx.death(t.x, t.y, t.r);
        return;
      }
      case 'heal': {
        if (ev.target !== this.myId) return;
        const t = this.ents.get(ev.target);
        if (t) this.fx.healNumber(t.x, t.y - t.r, ev.amount);
        return;
      }
      case 'fx':
        this.playFx(ev);
        return;
      case 'cast':
        return;
    }
  }

  private playFx(ev: Extract<GameEvent, { e: 'fx' }>): void {
    const x2 = ev.x2 ?? ev.x;
    const y2 = ev.y2 ?? ev.y;
    const teamColor = ev.team === this.myTeam ? PALETTE.ally : PALETTE.enemy;
    switch (ev.fx) {
      case 'aimLine':
        return this.fx.aimLine(ev.x, ev.y, x2, y2, ev.dur ?? 1, ev.team === this.myTeam);
      case 'trapSnap':
        return this.fx.burst(ev.x, ev.y, 0xffd166);
      case 'roll':
        return this.fx.streak(ev.x, ev.y, x2, y2);
      case 'cleave':
        return this.fx.wedge(ev.x, ev.y, x2, y2, ev.r ?? 90, 0xffb36b);
      case 'warCry':
        return this.fx.shockwave(ev.x, ev.y, ev.r ?? 300, teamColor, 0.5);
      case 'slam':
        return this.fx.shockwave(ev.x, ev.y, ev.r ?? 180, 0xc9a86a, 0.35);
      case 'berserk':
        return this.fx.shockwave(ev.x, ev.y, (ev.r ?? 45) * 3, 0xff3b30, 0.45);
    }
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private bindInput(): void {
    const canvas = this.app.canvas;
    const track = (e: PointerEvent | WheelEvent) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
    };
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointermove', track);
    document.documentElement.addEventListener('mouseleave', () => (this.mouse.inside = false));

    canvas.addEventListener('pointerdown', (e) => {
      track(e);
      if (e.button === 2) {
        this.aiming = null;
        this.rightHeld = true;
        this.rightClick(true);
      } else if (e.button === 0 && this.aiming !== null) {
        this.castAimed();
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.rightHeld = false;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        track(e);
        this.camera.zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => {
      this.rightHeld = false;
      this.aiming = null;
      this.centerHeld = false;
    });
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    // Leave browser shortcuts alone — Ctrl+W closes the tab and can't be intercepted anyway.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const slot = SLOT_BY_CODE[e.code];
    if (slot !== undefined) {
      if (down && !e.repeat) this.aiming = slot;
      else if (!down && this.aiming === slot) this.castAimed();
      return;
    }
    if (e.code === 'Space') {
      this.centerHeld = down;
      e.preventDefault();
      return;
    }
    if (!down || e.repeat) return;
    switch (e.code) {
      case 'KeyS':
        this.send({ k: 'stop' });
        break;
      case 'KeyY':
        this.camera.locked = !this.camera.locked;
        break;
      case 'Backquote':
        this.toggleNavOverlay();
        break;
      case 'Escape':
        this.aiming = null;
        break;
    }
  }

  private rightClick(initial: boolean): void {
    this.holdTimer = HOLD_MOVE_INTERVAL;
    const p = this.mouseWorld();
    const target = this.enemyAt(p);
    if (target) {
      this.send({ k: 'attack', target: target.id });
      if (initial) this.fx.clickMarker(target.x, target.y, true);
      return;
    }
    this.send({ k: 'move', x: Math.round(p.x), y: Math.round(p.y) });
    if (initial) this.fx.clickMarker(p.x, p.y, false);
  }

  private castAimed(): void {
    const slot = this.aiming;
    this.aiming = null;
    if (slot === null || !this.myInfo) return;
    const latest = this.buffer.latest;
    const self = latest?.ents.find((e) => e.id === this.myId);
    const cd = latest?.me?.abilities[slot].cd ?? 0;
    if (cd > 0 || (self?.mp ?? 0) < this.myInfo.abilities[slot].cost) {
      this.hud.flash(slot);
      return;
    }
    const p = this.mouseWorld();
    this.send({ k: 'cast', slot, x: Math.round(p.x), y: Math.round(p.y) });
  }

  /** The enemy under the cursor that a right-click would attack. Shielded structures don't count. */
  private enemyAt(p: Vec2): EntitySnap | null {
    let best: EntitySnap | null = null;
    let bestD = Infinity;
    for (const e of this.ents.values()) {
      const attackable = e.k === 'champion' || e.k === 'chud' || e.k === 'dummy' || (e.k === 'structure' && !e.inv);
      if (!attackable || e.dead || e.tm === this.myTeam) continue;
      const d = dist(p, e);
      if (d <= e.r + CLICK_SLOP && d < bestD) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  private mouseWorld(): Vec2 {
    return this.camera.toWorld(this.mouse.x, this.mouse.y, this.app.screen.width, this.app.screen.height);
  }

  private setCursor(c: string): void {
    if (c === this.cursor) return;
    this.cursor = c;
    this.app.canvas.style.cursor = c;
  }

  private toggleNavOverlay(): void {
    if (this.navOverlay) {
      this.navOverlay.visible = !this.navOverlay.visible;
      return;
    }
    this.navOverlay = buildNavOverlay(new NavGrid(MAP));
    this.groundLayer.addChild(this.navOverlay);
  }

  private send(cmd: Command): void {
    this.conn.send({ t: 'cmd', cmd });
  }
}
