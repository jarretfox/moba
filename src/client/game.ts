import { ColorMatrixFilter, Container, Graphics, type Application } from 'pixi.js';
import { CHAMPION_INFO } from '../shared/champions/registry';
import { atRank, type ChampionInfo } from '../shared/champions/types';
import { TEAM, type Slot, type Team } from '../shared/constants';
import { MAP } from '../shared/map/mapData';
import { NavGrid } from '../shared/map/navGrid';
import { shapeContains } from '../shared/map/shapes';
import { VisionGrid } from '../shared/sim/vision';
import { dist, type Vec2 } from '../shared/math';
import type { Command, EntitySnap, GameEvent, HostMessage } from '../shared/protocol';
import { Sound } from './audio';
import { Camera } from './camera';
import { MELEE, cueFor, type SoundCue } from './sfx';
import type { Connection } from './net/connection';
import { Hud } from './hud';
import { FogLayer } from './render/fog';
import { Ambience } from './render/ambience';
import { FxLayer } from './render/fx';
import { castFlash, playSpell, projectileTrail, statusAura, structureCollapse } from './render/spells';
import { Lighting } from './render/lighting';
import { Minimap, type MinimapPing } from './minimap';
import { PINGS, PingWheel } from './pings';
import type { Tone } from './hud';
import { drawIndicator } from './render/indicator';
import { HEIGHT, buildMap, buildNavOverlay, elevate } from './render/mapView';
import { PickupView, ProjectileView, StructureView, TrapView, UnitView, ZoneView, type EntityView, type Relation, type ViewContext } from './render/views';
import { SnapshotDecoder } from '../shared/snapshotCodec';
import { SnapshotBuffer } from './snapshotBuffer';

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
  /** Raised layers for the tops of tall things: cliffs, structures, trees. */
  private readonly wallTops = new Container();
  private readonly structureTops = new Container();
  private readonly canopy = new Container();
  private readonly unitLayer = new Container();
  private readonly projectileLayer = new Container();
  private readonly indicator = new Graphics();
  private readonly fx = new FxLayer();
  private readonly ambience = new Ambience(MAP);
  private navOverlay: Graphics | null = null;
  private readonly nav = new NavGrid(MAP);
  private readonly visionGrid = new VisionGrid(MAP, this.nav);
  private readonly fog = new FogLayer(this.visionGrid);

  private readonly camera = new Camera(MAP);
  private readonly buffer: SnapshotBuffer;
  private readonly decoder = new SnapshotDecoder();
  private readonly views = new Map<number, EntityView>();
  private readonly hud: Hud;
  private readonly sound = new Sound();
  private gameOverPlayed = false;
  /** Dusk and the lights in it, laid over the world. */
  private readonly lighting = new Lighting(MAP);
  /** Spell glows: drawn above the lighting so they shine in the dark. Follows the camera like the world. */
  private readonly emissive = new Container();
  /** World, lighting and glows together, so the whole view can go grey while you're dead. */
  private readonly view = new Container();
  private readonly deathFilter = new ColorMatrixFilter();
  private deadFade = 0;
  /** For the announcer: has anyone drawn first blood, and who's on a multi-kill. */
  private firstBlood = false;
  private multiKills = new Map<string, { n: number; at: number }>();
  private readonly minimap: Minimap;
  private readonly pingWheel: PingWheel;
  /** Where the ping being picked on the wheel will go. */
  private pingAt: Vec2 | null = null;
  private pingKeyHeld = false;
  private pings: (MinimapPing & { at: number })[] = [];
  /** Held on the minimap: the camera looks there. */
  private peek: Vec2 | null = null;
  private frameCount = 0;
  /** When you last traded hits with a champion, for the music. */
  private lastFight = -Infinity;
  private nextPlaceCheck = 0;
  /** When the match ends: where Da Base fell, and when, so the camera can go and watch before the scores. */
  private finale: { x: number; y: number; at: number } | null = null;

  private myId = -1;
  private myTeam: Team = TEAM.blue;
  private myInfo: ChampionInfo | null = null;
  private ents = new Map<number, EntitySnap>();

  private mouse = { x: 0, y: 0, inside: false };
  private rightHeld = false;
  private holdTimer = 0;
  private aiming: Slot | null = null;
  private centerHeld = false;
  private scoresHeld = false;
  private cursor = '';

  constructor(
    private readonly app: Application,
    private readonly conn: Connection,
    hudRoot: HTMLElement,
  ) {
    this.hud = new Hud(hudRoot);
    this.hud.onLevelUp = (slot) => {
      this.sound.play('click', 0.6);
      this.send({ k: 'levelUp', slot });
    };
    this.hud.onBuy = (item) => {
      this.sound.play('buy', 0.6);
      this.send({ k: 'buy', item });
    };
    this.hud.onSell = (slot) => {
      this.sound.play('buy', 0.4);
      this.send({ k: 'sell', slot });
    };
    this.hud.onMute = () => this.hud.setMuted(this.sound.toggleMute());
    this.minimap = new Minimap(hudRoot, MAP);
    this.minimap.setTeam(TEAM.blue);
    this.minimap.onPeek = (p) => (this.peek = p);
    this.minimap.onMove = (p) => {
      this.send({ k: 'move', x: Math.round(p.x), y: Math.round(p.y) });
      this.fx.clickMarker(p.x, p.y, false);
    };
    this.minimap.onPingStart = (e, p) => this.startPing(e, p);
    this.pingWheel = new PingWheel(hudRoot);
    this.hud.setMuted(this.sound.muted);
    this.buffer = new SnapshotBuffer(conn.interpDelay);
    this.setMap(TEAM.blue);
    this.worldLayer.addChild(
      this.groundLayer,
      this.ambience.container,
      this.underLayer,
      this.fx.under,
      this.structureLayer,
      this.wallTops,
      this.structureTops,
      this.canopy,
      this.fog.sprite,
      this.indicator,
      this.unitLayer,
      this.projectileLayer,
    );
    this.emissive.addChild(this.fx.container);
    this.view.addChild(this.worldLayer, this.lighting.sprite, this.emissive);
    app.stage.addChild(this.view);
    this.deathFilter.desaturate();
    this.bindInput();
    app.ticker.add((ticker) => this.frame(ticker.deltaMS / 1000));
  }

  /** Match messages from the host (the lobby screen handles the rest). */
  handle(msg: HostMessage): void {
    if (msg.t === 'welcome') {
      this.myId = msg.unitId;
      if (msg.team !== this.myTeam) {
        this.myTeam = msg.team;
        // Repaint the ground so your own base is the blue one.
        this.setMap(msg.team);
        this.minimap.setTeam(msg.team);
      }
    } else if (msg.t === 'snap') {
      this.buffer.push(this.decoder.decode(msg.snap), performance.now() / 1000);
    }
  }

  /** (Re)paints the map, tinted for the viewer's team. */
  private setMap(team: Team): void {
    const layers = buildMap(MAP, team);
    const replace = (parent: Container, child: Container) => {
      if (parent.children.length) parent.removeChildAt(0).destroy({ children: true });
      parent.addChildAt(child, 0);
    };
    replace(this.groundLayer, layers.ground);
    replace(this.wallTops, layers.wallTops);
    replace(this.canopy, layers.canopy);
  }

  showNotice(title: string, detail: string): void {
    this.hud.showNotice(title, detail);
  }

  // ─── Per frame ────────────────────────────────────────────────────────────

  private frame(dt: number): void {
    const { ents, events } = this.buffer.sample(performance.now() / 1000);
    this.ents = new Map(ents.map((e) => [e.id, e]));
    this.syncViews(dt);
    this.emitTrails();
    for (const ev of events) {
      this.playEvent(ev);
      const cue = cueFor(ev, this.ents, this.myId);
      if (cue && ev.e !== 'kill') this.playCue(cue); // the announcer voices kills
    }
    this.fx.update(dt);
    this.ambience.update(dt);
    this.fog.update(this.ents.values(), this.myTeam, performance.now() / 1000);

    const me = this.ents.get(this.myId);
    if (me?.champ && !this.myInfo) {
      this.myInfo = CHAMPION_INFO[me.champ];
      this.hud.setChampion(this.myInfo);
    }

    const { width: w, height: h } = this.app.screen;
    this.camera.update(dt, me && !me.dead ? me : null, this.mouse.inside ? this.mouse : null, w, h, this.centerHeld);
    if (this.peek) {
      this.camera.x = this.peek.x;
      this.camera.y = this.peek.y;
    }
    if (this.finale) {
      // Glide over to watch Da Base fall.
      const k = Math.min(1, dt * 2.5);
      this.camera.x += (this.finale.x - this.camera.x) * k;
      this.camera.y += (this.finale.y - this.camera.y) * k;
    }
    this.camera.apply(this.worldLayer, w, h, dt);
    elevate(this.wallTops, HEIGHT.wall, this.camera.x, this.camera.y);
    elevate(this.structureTops, HEIGHT.structure, this.camera.x, this.camera.y);
    elevate(this.canopy, HEIGHT.tree, this.camera.x, this.camera.y);
    this.emissive.position.copyFrom(this.worldLayer.position);
    this.emissive.scale.copyFrom(this.worldLayer.scale);
    this.lighting.update(this.app.renderer, this.worldLayer, w, h, dt, this.ents.values(), this.myTeam, this.fx.lights);
    // The world drains of color while you wait to respawn.
    this.deadFade = Math.max(0, Math.min(1, this.deadFade + (me?.dead && !this.finale ? dt * 2 : -dt * 3)));
    this.deathFilter.alpha = this.deadFade * 0.85;
    const wantFilter = this.deadFade > 0;
    if (wantFilter !== (this.view.filters?.length === 1)) this.view.filters = wantFilter ? [this.deathFilter] : [];

    const mouseWorld = this.mouseWorld();
    if (this.rightHeld && (this.holdTimer -= dt) <= 0) this.rightClick(false);
    this.setCursor(this.enemyAt(mouseWorld) ? 'crosshair' : 'default');
    if (this.aiming !== null && this.myInfo && me && !me.dead) drawIndicator(this.indicator, this.myInfo.abilities[this.aiming], me, mouseWorld);
    else this.indicator.clear();

    this.drawMinimap(w, h);
    this.updateSoundscape();

    const latest = this.buffer.latest;
    this.hud.update(latest?.me, latest?.ents.find((e) => e.id === this.myId), `tick ${latest?.tick ?? 0} · ${Math.round(this.app.ticker.FPS)} fps`);
    this.hud.setClock(latest?.time ?? 0, latest?.nextWave);
    this.hud.setWarden(latest?.warden, this.myTeam);
    this.hud.setScores(latest?.scores, this.myTeam, this.myId, this.scoresHeld, latest?.time ?? 0, latest?.winner);
    if (latest?.winner) {
      if (!this.finale) {
        const base = [...this.ents.values()].find((e) => e.k === 'structure' && e.role === 'daBase' && e.dead);
        this.finale = { x: base?.x ?? this.camera.x, y: base?.y ?? this.camera.y, at: performance.now() / 1000 };
        this.camera.locked = false;
      }
    }
    if (latest?.winner && performance.now() / 1000 - this.finale!.at > 3.2) {
      this.hud.showGameOver(latest.winner === this.myTeam);
      if (!this.gameOverPlayed) this.sound.play(latest.winner === this.myTeam ? 'victory' : 'defeat', 0.8);
      this.gameOverPlayed = true;
    }
  }

  private syncViews(dt: number): void {
    for (const [id, view] of this.views) {
      if (this.ents.has(id)) continue;
      view.container.destroy({ children: true });
      view.top?.destroy({ children: true });
      this.views.delete(id);
    }
    const me = this.ents.get(this.myId);
    const ctx: ViewContext = { me: me && !me.dead ? me : undefined, inBrush: (x, y) => this.visionGrid.brushAt({ x, y }) > 0 };
    for (const s of this.ents.values()) {
      let view = this.views.get(s.id);
      if (!view) {
        view = this.createView(s);
        this.views.set(s.id, view);
      }
      view.update(s, dt, ctx);
    }
  }

  /** Particles behind projectiles and around units with statuses, for whatever's on screen. */
  private emitTrails(): void {
    const { width, height } = this.app.screen;
    const halfW = width / 2 / this.camera.zoom + 250;
    const halfH = height / 2 / this.camera.zoom + 250;
    const time = performance.now() / 1000;
    for (const s of this.ents.values()) {
      if (Math.abs(s.x - this.camera.x) > halfW || Math.abs(s.y - this.camera.y) > halfH) continue;
      if (s.k === 'projectile') projectileTrail(this.fx, s, s.tm === this.myTeam);
      else if (s.st || s.sh) statusAura(this.fx, s, time);
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
      case 'structure': {
        const sv = new StructureView(s, rel);
        this.structureTops.addChild(sv.top);
        view = sv;
        layer = this.structureLayer;
        break;
      }
      case 'pickup':
        view = new PickupView(s);
        layer = this.underLayer;
        break;
      case 'zone':
        view = new ZoneView(s);
        layer = this.underLayer;
        break;
      default:
        view = new UnitView(s, rel);
        layer = this.unitLayer;
    }
    layer.addChild(view.container);
    return view;
  }

  private relation(s: EntitySnap): Relation {
    return s.id === this.myId ? 'self' : s.tm === this.myTeam ? 'ally' : s.tm === TEAM.neutral ? 'neutral' : 'enemy';
  }

  private playEvent(ev: GameEvent): void {
    switch (ev.e) {
      case 'dmg': {
        // Like League, only damage you deal or take gets a number; a lane full of Chuds would be unreadable otherwise.
        const hit = this.ents.get(ev.target);
        const from = ev.src !== undefined ? this.ents.get(ev.src) : undefined;
        if (ev.amount >= 1) this.views.get(ev.target)?.onHit?.(from, !!hit && ev.amount >= (hit.mhp ?? 1000) * 0.08);
        if (hit && ev.amount >= 1 && (hit.k === 'champion' || hit.k === 'monster' || ev.src === this.myId || ev.target === this.myId)) {
          const heavy = ev.amount >= (hit.mhp ?? 1000) * 0.08;
          this.fx.impact(hit.x, hit.y, hit.r, ev.type, heavy);
          if (ev.target === this.myId && heavy) this.camera.shake(Math.min(18, 6 + (ev.amount / (hit.mhp ?? 1000)) * 60));
        }
        if (ev.src !== this.myId && ev.target !== this.myId) return;
        const other = this.ents.get(ev.src === this.myId ? ev.target : (ev.src ?? -1));
        if (other?.k === 'champion' && ev.amount >= 1) this.lastFight = performance.now() / 1000;
        const t = this.ents.get(ev.target);
        if (t && ev.amount >= 1) this.fx.damageNumber(t.x, t.y - t.r, ev.amount, ev.type);
        return;
      }
      case 'attack': {
        this.views.get(ev.src)?.onAttack?.();
        // Melee champions' hits leave a small slash where they land.
        const src = this.ents.get(ev.src);
        const tgt = this.ents.get(ev.target);
        if (src?.k === 'champion' && src.champ && MELEE.has(src.champ) && tgt) {
          const a = Math.atan2(tgt.y - src.y, tgt.x - src.x);
          const reach = Math.min(Math.hypot(tgt.x - src.x, tgt.y - src.y) + tgt.r * 0.4, src.r * 3.2);
          const color = src.champ === 'barbarian' ? 0xff8a3d : src.champ === 'logan' ? 0xffc04d : 0xc8945a;
          this.fx.slash(src.x, src.y, a, reach, 1.2, color, 0.2);
        }
        return;
      }
      case 'death': {
        const t = this.ents.get(ev.id);
        if (!t) return;
        if (t.k === 'structure') structureCollapse(this.fx, t.x, t.y, t.r, t.role === 'daBase');
        else this.fx.death(t.x, t.y, t.r, t.k === 'champion' || t.k === 'monster');
        if (ev.id === this.myId) this.camera.shake(16);
        else if (t.k === 'structure' && t.role === 'daBase') this.camera.shake(24);
        else if (t.k === 'structure' || (t.k === 'monster' && t.mon === 'warden')) this.shakeNear(t, 20);
        return;
      }
      case 'heal': {
        if (ev.target !== this.myId) return;
        const t = this.ents.get(ev.target);
        if (t) this.fx.healNumber(t.x, t.y - t.r, ev.amount);
        return;
      }
      case 'gold': {
        const t = ev.id === this.myId ? this.ents.get(ev.id) : undefined;
        if (t && ev.amount > 0) this.fx.goldNumber(t.x, t.y - t.r - 18, ev.amount);
        return;
      }
      case 'level': {
        const t = ev.id === this.myId ? this.ents.get(ev.id) : undefined;
        if (t) this.fx.levelUp(t.x, t.y, t.r, ev.level);
        return;
      }
      case 'ping': {
        const info = PINGS[ev.kind];
        this.pings.push({ x: ev.x, y: ev.y, kind: ev.kind, age: 0, at: performance.now() / 1000 });
        this.fx.ping(ev.x, ev.y, info.color, info.glyph, `${ev.name}: ${info.label}`);
        return;
      }
      case 'kill':
        this.hud.pushFeed(ev.killer, ev.victim, ev.team === TEAM.neutral ? null : ev.team === this.myTeam);
        this.announceKill(ev);
        return;
      case 'fx':
        this.playFx(ev);
        return;
      case 'cast': {
        const caster = this.ents.get(ev.src);
        this.views.get(ev.src)?.onCast?.(ev.slot);
        if (caster) castFlash(this.fx, caster);
        return;
      }
    }
  }

  /** Feeds the music how much of a fight you're in, and the soundscape what's around the camera. */
  private updateSoundscape(): void {
    const now = performance.now() / 1000;
    this.sound.setIntensity(now - this.lastFight < 6 ? 1 : 0);
    if (now < this.nextPlaceCheck) return;
    this.nextPlaceCheck = now + 0.4;
    let jungle = 0;
    let river = 0;
    const spots = [[0, 0], [-500, 0], [500, 0], [0, -350], [0, 350]];
    for (const [dx, dy] of spots) {
      const x = this.camera.x + dx;
      const y = this.camera.y + dy;
      const style = MAP.ground.find((p) => shapeContains(p.shape, x, y))?.style;
      if (style === 'river') river++;
      else if (style !== 'lane' && style !== 'base') jungle++; // jungle paths and the woods off them
    }
    this.sound.setPlace(jungle / spots.length, river / spots.length);
  }

  /** The minimap, a few times a second is plenty. */
  private drawMinimap(w: number, h: number): void {
    const now = performance.now() / 1000;
    this.pings = this.pings.filter((p) => now - p.at < 3);
    if (this.myId < 0 || this.frameCount++ % 3 !== 0) return;
    this.minimap.root.hidden = false;
    for (const p of this.pings) p.age = now - p.at;
    const vw = w / this.camera.zoom;
    const vh = h / this.camera.zoom;
    this.minimap.draw({
      ents: this.ents.values(),
      myTeam: this.myTeam,
      myId: this.myId,
      view: { x: this.camera.x - vw / 2, y: this.camera.y - vh / 2, w: vw, h: vh },
      drawFog: (ctx, fw, fh) => this.fog.drawOn(ctx, fw, fh),
      pings: this.pings,
    });
  }

  /** Alt or G held: the button opens the ping wheel instead of doing anything else. */
  private startPing(e: PointerEvent, at: Vec2): boolean {
    if (!e.altKey && !this.pingKeyHeld) return false;
    e.preventDefault();
    this.pingAt = at;
    this.pingWheel.start(e.clientX, e.clientY);
    return true;
  }

  /** The announcer: a banner (and a fanfare or a toll) for kills, sprees, structures and the Warden. */
  private announceKill(ev: Extract<GameEvent, { e: 'kill' }>): void {
    const tone: Tone = ev.team === TEAM.neutral ? 'neutral' : ev.team === this.myTeam ? 'ours' : 'theirs';
    const good = tone === 'ours';
    const say = (title: string, detail: string, big: boolean) => {
      this.hud.announce(title, detail, tone);
      this.sound.play(big ? (good ? 'fanfare' : 'toll') : 'kill', big ? 0.7 : 0.5);
    };
    switch (ev.what) {
      case 'warden':
        return say('THE WARDEN IS SLAIN', `${good ? 'We are' : 'They are'} ${ev.victim.includes('Uprising') ? 'in Uprising!' : 'Unchained'}`, true);
      case 'oakner':
        return say('OAKNER FELLED', `${ev.killer} brought down ${good ? 'their' : 'our'} Oakner`, true);
      case 'outerShootie':
      case 'innerShootie':
      case 'baseShootie':
        return say('SHOOTIE DESTROYED', `${ev.killer} destroyed ${good ? 'their' : 'our'} ${ev.victim}`, true);
      case 'daBase':
        return; // the finale speaks for itself
      case 'champion': {
        if (ev.team === TEAM.neutral) return say('EXECUTED', `${ev.victim} fell to ${ev.killer === 'Executed' ? 'the lane' : ev.killer}`, false);
        const now = this.buffer.latest?.time ?? 0;
        const last = this.multiKills.get(ev.killer);
        const n = last && now - last.at < 10 ? last.n + 1 : 1;
        this.multiKills.set(ev.killer, { n, at: now });
        const myName = this.ents.get(this.myId)?.name;
        const detail = `${ev.killer} slew ${ev.victim}`;
        const streak = ev.streak ?? 0;
        if (!this.firstBlood) say('FIRST BLOOD', detail, true);
        else if (n >= 2) say(n === 2 ? 'DOUBLE KILL' : n === 3 ? 'TRIPLE KILL' : 'RAMPAGE', detail, true);
        else if (ev.shutdown) say('SHUT DOWN', `${ev.killer} ended ${ev.victim}'s streak`, true);
        else if (streak >= 3) say(streak === 3 ? 'KILLING SPREE' : streak === 4 ? 'RAMPAGE' : streak === 5 ? 'UNSTOPPABLE' : 'GODLIKE', detail, true);
        else if (ev.victim === myName) say('YOU HAVE BEEN SLAIN', detail, false);
        else if (ev.killer === myName) say('YOU HAVE SLAIN AN ENEMY', detail, false);
        else say(good ? 'ENEMY SLAIN' : 'ALLY SLAIN', detail, false);
        this.firstBlood = true;
        if (ev.ace) say('ACE', good ? 'Their whole team is down' : 'Our whole team is down', true);
        return;
      }
    }
  }

  /** Plays a cue where it happened: quieter the further it is from the middle of the screen, panned left or right. */
  private playCue(cue: SoundCue): void {
    if (!cue.at) return this.sound.play(cue.name, cue.gain);
    const halfView = this.app.screen.width / 2 / this.camera.zoom;
    const d = Math.hypot(cue.at.x - this.camera.x, cue.at.y - this.camera.y);
    const falloff = Math.max(0, Math.min(1, 1 - (d - halfView * 0.6) / (halfView * 1.4)));
    const pan = Math.max(-1, Math.min(1, (cue.at.x - this.camera.x) / halfView)) * 0.6;
    this.sound.play(cue.name, cue.gain * falloff, pan);
  }

  /** Shake the camera for something big, less the further it is from the middle of the screen. */
  private shakeNear(at: { x: number; y: number }, amount: number): void {
    const halfView = this.app.screen.width / 2 / this.camera.zoom;
    const d = Math.hypot(at.x - this.camera.x, at.y - this.camera.y);
    const k = Math.max(0, 1 - d / (halfView * 1.5));
    if (k > 0.05) this.camera.shake(amount * k);
  }

  private playFx(ev: Extract<GameEvent, { e: 'fx' }>): void {
    const SHAKES: Partial<Record<typeof ev.fx, number>> = { wardenSlam: 18, slam: 8, surface: 10, deepHands: 12, roar: 6, kneel: 7, berserk: 5, pounce: 4 };
    const kick = SHAKES[ev.fx];
    if (kick) this.shakeNear(ev, kick);
    playSpell(this.fx, ev, ev.team === this.myTeam);
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
      if (e.button === 0 && this.startPing(e, this.mouseWorld())) return;
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
      if (e.button === 0 && this.pingWheel.open) {
        const kind = this.pingWheel.finish(e.clientX, e.clientY);
        if (kind && this.pingAt) this.send({ k: 'ping', kind, x: Math.round(this.pingAt.x), y: Math.round(this.pingAt.y) });
        this.pingAt = null;
      }
    });
    window.addEventListener('pointermove', (e) => this.pingWheel.move(e.clientX, e.clientY));
    // Alt on its own can pull focus to the browser's menu bar; it's the ping key here.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Alt') e.preventDefault();
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
      this.scoresHeld = false;
      this.rightHeld = false;
      this.aiming = null;
      this.centerHeld = false;
      this.pingKeyHeld = false;
    });
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.code === 'KeyG') this.pingKeyHeld = down;
    // Leave browser shortcuts alone — Ctrl+W closes the tab and can't be intercepted anyway.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const slot = SLOT_BY_CODE[e.code];
    if (slot !== undefined) {
      if (e.shiftKey && down) {
        if (!e.repeat) this.send({ k: 'levelUp', slot });
        return;
      }
      if (down && !e.repeat) this.aiming = slot;
      else if (!down && this.aiming === slot) this.castAimed();
      return;
    }
    if (e.code === 'Space') {
      this.centerHeld = down;
      e.preventDefault();
      return;
    }
    if (e.code === 'Tab') {
      this.scoresHeld = down;
      e.preventDefault();
      return;
    }
    if (!down || e.repeat) return;
    switch (e.code) {
      case 'KeyS':
        this.send({ k: 'stop' });
        break;
      case 'KeyB':
        this.aiming = null;
        this.send({ k: 'recall' });
        break;
      case 'KeyY':
        this.camera.locked = !this.camera.locked;
        break;
      case 'Backquote':
        this.toggleNavOverlay();
        break;
      case 'KeyM':
        this.hud.setMuted(this.sound.toggleMute());
        break;
      case 'KeyN':
        this.sound.toggleMusic();
        break;
      case 'KeyH':
        this.hud.toggleHelp();
        break;
      case 'KeyP':
        this.hud.shop.toggle();
        break;
      case 'Escape':
        if (this.aiming === null) this.hud.shop.toggle(false);
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
    const rank = latest?.me?.abilities[slot].rank ?? 0;
    if (rank === 0 || cd > 0 || (self?.mp ?? 0) < atRank(this.myInfo.abilities[slot].cost, rank)) {
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
      const attackable = e.k === 'champion' || e.k === 'chud' || e.k === 'dummy' || e.k === 'monster' || e.k === 'totem' || e.k === 'guard' || (e.k === 'structure' && !e.inv);
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

  setTitle(title: string): void {
    this.hud.setTitle(title);
  }

  private toggleNavOverlay(): void {
    if (this.navOverlay) {
      this.navOverlay.visible = !this.navOverlay.visible;
      return;
    }
    this.navOverlay = buildNavOverlay(this.nav);
    this.groundLayer.addChild(this.navOverlay);
  }

  private send(cmd: Command): void {
    this.conn.send({ t: 'cmd', cmd });
  }
}
