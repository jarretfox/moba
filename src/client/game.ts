import { STRUCTURE_DEFS } from '../shared/sim/structure';
import type { Shape } from './render/particles';
import { BlurFilter, ColorMatrixFilter, Container, DisplacementFilter, Graphics, RenderTexture, Sprite, type Application } from 'pixi.js';
import { CHAMPION_INFO } from '../shared/champions/registry';
import { atRank, type ChampionInfo } from '../shared/champions/types';
import { TEAM, type PlayerTeam, type Slot, type Team } from '../shared/constants';
import { MAP, type MapData } from '../shared/map/mapData';
import { NavGrid } from '../shared/map/navGrid';
import { Pathfinder } from '../shared/map/pathfind';
import { nextSkill } from '../shared/bots/profiles';
import { SelfPrediction } from './prediction';
import { failLine, failLineTake } from './failLines';
import { shapeContains } from '../shared/map/shapes';
import { VisionGrid } from '../shared/sim/vision';
import { dist, segmentDistance, type Vec2 } from '../shared/math';
import { CAST_QUEUE, type CastFail, type Command, type EntitySnap, type GameEvent, type HostMessage, type MeSnap, type ScoreRow, type Snapshot, type StatusKind } from '../shared/protocol';
import { getSound } from './audio';
import { onSettings, settings } from './settings';
import { Camera } from './camera';
import { announceSound, cueFor, spatialize, type SoundCue } from './sfx';
import { EMOTE_ANIM, attackAnim, timedTo, wardenWindup } from './render/animation';
import { attackLook, nextSwing } from './render/attacks';
import { castSignature } from './render/signatures';
import { CAST_SOUND } from './sfx';
import type { ChampionId } from '../shared/champions/types';
import { Bubbles } from './render/bubbles';
import { typing } from './ui/chat';
import { loadProfile, recordMatch, saveProfile } from './profile';
import { pickMvp } from './scoreboard';
import { BICKER, CHEERS } from './render/chudLife';
import { emoteLine } from './emotes';
import type { Connection } from './net/connection';
import { Hud } from './hud';
import { FogLayer } from './render/fog';
import { Ambience } from './render/ambience';
import { FxLayer } from './render/fx';
import { brazierFire, championDeath, footstep, monsterAura, playSpell, projectileTrail, statusAura, structureCollapse } from './render/spells';
import { FIRE_HEIGHT, propSpots } from './render/props';
import { NightLife, duskAt } from './render/nightlife';
import { Lighting, nightAt, skyAt, type Light } from './render/lighting';
import { FountainView, crystalSpot } from './render/fountain';
import { Announcer, type Weight } from './announcer';
import { JungleLegend } from './ui/jungleLegend';
import { WardenDangle } from './render/wardenDangle';
import { WeatherView } from './render/weather';
import { Critters } from './render/critters';
import { Ripple } from './render/ripple';
import { CAST_COLORS } from './render/spells';
import { KO_WORD, hitWord } from './render/comic';
import { chestHeight, crystalHeight, flightHeight, standHeight } from './render/stature';
import { Wind } from './render/wind';
import { noiseTexture } from './render/groundTexture';
import type { FxKind } from '../shared/protocol';
import type { SoundName } from './audio';
import { driftAt } from './render/backdrop';
import { Water } from './render/water';
import { Minimap, type MinimapPing } from './minimap';
import { PINGS, PingWheel } from './pings';
import type { Tone } from './hud';
import { drawIndicator } from './render/indicator';
import { HEIGHT, buildMap, buildNavOverlay, destroyMapLayer, elevate, type MapLayers } from './render/mapView';
import { lanePath, lanesOf } from '../shared/map/mapData';
import { PALETTE, WardView, enemyLight, setColorblind, PickupView, ProjectileView, StructureView, TrapView, UnitView, ZoneView, type EntityView, type Relation, type ViewContext } from './render/views';
import { SnapshotDecoder } from '../shared/snapshotCodec';
import { SnapshotBuffer } from './snapshotBuffer';
import { DamageLog } from './recap';
import { INTRO_TIME, showIntro } from './intro';
import { Spectator } from './spectate';
import { goldGraph, pickAwards, type GoldSample, type MatchTally } from './awards';
import { Tips } from './hints';
import { utterance, type VoiceMoment } from './voices';
import { Highlights, Replay, type Highlight } from './highlights';
import { Shopkeeper, wickSpot } from './render/shopkeeper';
import { buildLandmarks } from './render/landmarks';
import { WickMood, wickLine, type WickMoment } from './wick';
import { cantBuy, itemChanges, statGains } from './shop';
import { ACTIVES, ITEMS, activeSlots, sellPrice, type ItemId } from '../shared/items';
import { CHUD_DEFS } from '../shared/sim/chud';
import { EventsView } from './render/events';

/** While right mouse is held, re-send the move target this often. */
const HOLD_MOVE_INTERVAL = 0.12;
/** Extra pixels of forgiveness when right-clicking an enemy. */
const CLICK_SLOP = 20;
const SLOT_BY_CODE: Record<string, Slot> = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 };

/** Everything the player sees and touches. Reads host snapshots; sends commands. Never simulates. */
/**
 * Abilities that need someone to land on (see canCastAt in each champion): with nobody in reach they walk in
 * or fail, so they aren't shown early on press.
 */
const NEEDS_TARGET: Partial<Record<ChampionId, Slot[]>> = { logan: [0], paris: [0], daltonomo: [2], willmore: [3], kingrix: [3], dabber: [2] };

/** While any of these is on, you can't walk: your own champion is drawn where the host says. */
const PINNED: ReadonlySet<StatusKind> = new Set<StatusKind>(['stun', 'root', 'fear', 'stasis', 'airborne', 'underground', 'recall']);

/** Speech-bubble ids for Old Wick (blue's, then red's one below it), clear of every entity id. */
const WICK_ID = -100;
/** Seconds between the camera's reactions (punch-in, shove, screen ripple) to big hits. */
const JUICE_GAP = 0.6;
/**
 * Anything further off the screen than this (world units, past its own size) isn't drawn, and an entity's
 * view isn't updated either until it's back near the screen. Pixi rebuilds a layer's draw list whenever
 * something in it changes, so every off-screen figure and prop it can skip makes every frame cheaper.
 */
const CULL_MARGIN = 350;

export class GameClient {
  private readonly worldLayer = new Container();
  // The big static layers (the painted ground, the cliff tops and the canopy: tens of thousands of shapes)
  // are render groups of their own, so they're batched once rather than again with every change elsewhere.
  private readonly groundLayer = new Container({ isRenderGroup: true });
  private readonly underLayer = new Container();
  private readonly structureLayer = new Container();
  /** Raised layers for the tops of tall things: cliffs and trees. */
  private readonly wallTops = new Container({ isRenderGroup: true });
  private readonly canopy = new Container({ isRenderGroup: true });
  /**
   * Units, nearer the bottom of the screen drawn in front (they stand up now, so they overlap). Their own
   * render group: it re-sorts nearly every frame, and that shouldn't make the rest of the map rebuild too.
   */
  private readonly unitLayer = new Container({ sortableChildren: true, isRenderGroup: true });
  /** Each culled view's time since it was last updated, to hand over when it comes back on screen. */
  private readonly offScreen = new Map<number, number>();
  /** The standing props' extents (local space), worked out once each. */
  private readonly propBounds = new WeakMap<Container, { l: number; t: number; r: number; b: number }>();
  /** Views' own containers in the unit layer (they're culled with their entities, not as props). */
  private readonly viewBodies = new WeakSet<Container>();
  private readonly projectileLayer = new Container();
  private readonly indicator = new Graphics();
  /** A reticle under whatever you're attacking (and your reach round you), while you're attacking it. */
  private readonly targetMark = new Graphics();
  /** A ring at the feet of the enemy under the cursor (League's hover outline). */
  private readonly hoverMark = new Graphics();
  /** Each attacker's swing in progress (the tag its effects wait under), so a swing cut short can be called off. */
  private readonly swingTags = new Map<number, number>();
  private swingSeq = 0;
  private markId = -1;
  private markOn = 0;
  private markT = 0;
  private readonly fx = new FxLayer();
  private readonly ambience: Ambience;
  private readonly water: Water;
  /** Birds, bats and frogs. */
  private readonly critters: Critters;
  private navOverlay: Graphics | null = null;
  private readonly nav: NavGrid;
  private readonly visionGrid: VisionGrid;
  private readonly fog: FogLayer;

  private readonly camera: Camera;
  private readonly buffer: SnapshotBuffer;
  private readonly decoder = new SnapshotDecoder();
  private readonly views = new Map<number, EntityView>();
  private readonly hud: Hud;
  private readonly sound = getSound();
  /** The announcer's voice for the big moments. */
  private readonly announcer = new Announcer(() => this.sound.isMuted, (text) => this.sound.announce(text));
  /** Things the announcer has already said this match. */
  private readonly announced = new Set<string>();
  private wardenWasUp = false;
  /** The little Warden hanging off the top of the screen while he's awake. */
  private readonly dangle = new WardenDangle();
  /** Hold Tab: what lives in the jungle, and when the camps are back. */
  private readonly legend: JungleLegend;
  /** When the rain clears up (match seconds), if it does. */
  private weatherClears: number | undefined;
  /** When each champion last traded blows with another (local clock), for the music. */
  private readonly champFightAt = new Map<number, number>();
  private gameOverPlayed = false;
  /** Dusk and the lights in it, laid over the world. */
  private readonly lighting: Lighting;
  /** Spell glows: drawn above the lighting so they shine in the dark. Follows the camera like the world. */
  private readonly emissive = new Container();
  /** World, lighting and glows together, so the whole view can go grey while you're dead. */
  private readonly view = new Container();
  private readonly deathFilter = new ColorMatrixFilter();
  /** The screen bending under the biggest impacts. */
  private readonly ripple = new Ripple();
  /** Units up in the air right now, to catch the moment they land. */
  private readonly inAir = new Set<number>();
  /** Structures that are down, to catch an Oakner growing back. */
  private readonly fallen = new Set<number>();
  /** The wave timer last frame, to catch the moment a wave marches out. */
  private lastNextWave: number | undefined;
  /** When your Da Base's heart last beat. */
  private nextHeartbeat = 0;
  private deadFade = 0;
  /** For the announcer: has anyone drawn first blood, and who's on a multi-kill. */
  private firstBlood = false;
  private multiKills = new Map<string, { n: number; at: number }>();
  private readonly bubbles = new Bubbles();
  /** Lets go of the page-wide input listeners when this match's screen is torn down. */
  private readonly life = new AbortController();
  /** Settings subscriptions to drop on the way out. */
  private readonly offs: (() => void)[] = [];
  /** The frame loop, as a handle so it can be stopped. */
  private readonly tick = (ticker: { deltaMS: number }) => {
    this.watchSpeed(ticker.deltaMS);
    this.frame(ticker.deltaMS / 1000);
  };
  /** Auto graphics: how far it's stepped down this match (see `level`), the frame time it's watching, and for how long it's run slow. */
  private autoStep = 0;
  private frameMs = 16.7;
  private slowFor = 0;
  private matchFrames = 0;
  /** The effects are warmed up (see warmUp), and screen filters are on for warming for this many more frames. */
  private warmed = false;
  private warmFilters = 0;
  /** When the camera last reacted to a big hit (punch, shove, ripple): at most once in a while. */
  private juicedAt = -Infinity;
  /** Seconds added to the match clock for the look of the sky (a match that starts at night). */
  private clockOffset = 0;
  /** When you last pressed Undo in the shop (what comes back then isn't celebrated as a purchase). */
  private undoneAt = -Infinity;
  /** Where the treetops are, for snow to settle on. */
  private crowns: MapLayers['crowns'] = [];
  /** In the snow: when each champion next breathes out a little cloud. */
  private readonly breaths = new Map<number, number>();
  /** Chuds bickering on the march: seconds until the next squabble, and the replies still to come. */
  private bickerIn = 6;
  private replies: { id: number; text: string; at: number }[] = [];
  /** Rain, storms or mist: set when the match starts. */
  private weather: WeatherView | null = null;
  /** Which champion each Shootie is shooting at, so a beam can show it. */
  private readonly towerShots = new Map<number, { target: number; until: number }>();
  private readonly beams = new Graphics();
  /** The lanterns lit one by one as dusk falls, and the moon in the river. */
  private readonly nightLife: NightLife;
  /** Glow bleeding off spells: the glowing layer, blurred and added back over the view. */
  private readonly bloomRt = RenderTexture.create({ width: 16, height: 16, resolution: 0.35 });
  private readonly bloom = new Sprite(this.bloomRt);
  private readonly minimap: Minimap;
  private readonly pingWheel: PingWheel;
  /** Where the ping being picked on the wheel will go. */
  private pingAt: Vec2 | null = null;
  private pingKeyHeld = false;
  private pings: (MinimapPing & { at: number })[] = [];
  /** Held on the minimap: the camera looks there. */
  private peek: Vec2 | null = null;
  private frameCount = 0;
  /** Where each walker was and when its next footstep is due. */
  private readonly steps = new Map<number, { x: number; y: number; next: number; left: boolean }>();
  /** When each source last got a comic word over a hit, so a flurry doesn't bury the screen in them. */
  private readonly lastWord = new Map<number, number>();
  /** The wind: leans the brush, flaps the banners, stirs the leaves. */
  private readonly wind = new Wind();
  /** Patches of tall grass, for the wind to lean. */
  private sway: Container[] = [];
  /** The map's standing props, sorted in with the units. */
  private standing: Container[] = [];
  /** Ripples the tree crowns, as if the leaves were stirring (high graphics only). */
  private readonly leafNoise = new Sprite(noiseTexture());
  private readonly leaves = new DisplacementFilter({ sprite: this.leafNoise, scale: 5 });
  /** When you last traded hits with a champion, for the music. */
  private lastFight = -Infinity;
  /** Old Wick at each fountain (blue's, then red's), and how yours is feeling about you. */
  private readonly wicks: Shopkeeper[];
  /** Each team's fountain (blue's, then red's): the platform's ring and the crystal that guards it. */
  private readonly fountains: FountainView[];
  private fountainsFor: Team | null = null;
  private readonly wickMood = new WickMood();
  private wickN = 0;
  /** Your inventory, stats and max health last frame, to catch purchases and sales landing. */
  private lastItems: ItemId[] | null = null;
  private lastStats: MeSnap['stats'] | null = null;
  private lastMhp = 0;
  /** While you're dead: who the camera follows (your killer, then teammates). */
  private readonly spectator = new Spectator();
  /** The last champion to hit you, and when: your killer, if you go down soon after. */
  private lastChampHit: { id: number; t: number } | null = null;
  private wasDead = false;
  /** For the end screen: the gold race as it went, and Warden kills and Chud deaths from the kill feed. */
  private readonly goldHistory: GoldSample[] = [];
  private readonly tally: MatchTally = { warden: {}, executed: {} };
  private lastScores: ScoreRow[] | undefined;
  /** First-match tips, and what they watch for: have you moved, cast, or opened the shop yet. */
  private readonly tips: Tips;
  private moved = false;
  /** Play of the Game: the best moment so far, and its replay once the match is over. */
  private readonly highlights = new Highlights();
  private replay: Replay | null = null;
  private potgDone = false;
  /** When each champion last spoke, so grunts don't pile up. */
  private readonly spokeAt = new Map<number, number>();
  private casts = 0;
  private shopOpened = false;
  /** The VS screen has had its turn (or there was nobody to face). */
  private introShown = false;
  private introUp = false;
  /** Champion kills per team, for the score by the clock: from the scoreboard, bumped at once by each kill. */
  private readonly teamKills: Record<PlayerTeam, number> = { 1: 0, 2: 0 };
  /** What hurt you lately, for the death recap. */
  private readonly damageLog = new DamageLog();
  private nextPlaceCheck = 0;
  /** When each Sewer Crab next scuttles audibly. */
  private readonly skitters = new Map<number, number>();
  /** When the match ends: where Da Base fell, and when, so the camera can go and watch before the scores. */
  private finale: { x: number; y: number; at: number } | null = null;
  /** The map events: their beacon, cart and stall, the readout under the clock, and their moments (render/events.ts). */
  private readonly events: EventsView;

  private myId = -1;
  private myTeam: Team = TEAM.blue;
  private myInfo: ChampionInfo | null = null;
  private ents = new Map<number, EntitySnap>();

  private mouse = { x: 0, y: 0, inside: false };
  private rightHeld = false;
  private holdTimer = 0;
  private aiming: Slot | null = null;
  /** A pressed: the next left click attack-moves there. */
  private attackMoveArmed = false;
  /** Has attack-moved this match (for the tip). */
  private attackMoved = false;
  /** C held: your attack range shows round you. */
  private rangeHeld = false;
  /** Your attack range, while C is held or an attack-move is waiting for its click. */
  private readonly reachRing = new Graphics();
  /** Playing over the network: your own champion moves on your screen the moment you click (see prediction.ts). */
  private readonly prediction: SelfPrediction | null;
  /** Over the network: a cast already shown on press, so the host's word on it doesn't play it twice. */
  private earlyCast: { slot: Slot; at: number } | null = null;
  /** Over the network: what you just right-clicked to attack, marked before the host confirms it. */
  private pendingTarget: { id: number; until: number } | null = null;
  private readonly finder: Pathfinder;
  /** When your champion last grumbled about a cast that couldn't go, and how many times so far. */
  private grumbledAt = -Infinity;
  private grumbles = 0;
  /** The shop opens by itself once, at the start, while you're standing at it with nothing bought. */
  private startShopDone = false;
  /** Auto-level: when the last skill point went in (so a point isn't spent twice before the host answers). */
  private autoLevelAt = 0;
  private centerHeld = false;
  private scoresHeld = false;
  private cursor = '';

  constructor(
    private readonly app: Application,
    private readonly conn: Connection,
    private readonly hudRoot: HTMLElement,
    /** The map this match is on (the welcome says which). */
    readonly map: MapData = MAP,
  ) {
    this.ambience = new Ambience(map);
    this.water = new Water(map);
    this.critters = new Critters(map);
    this.nav = new NavGrid(map);
    this.finder = new Pathfinder(this.nav);
    // Over the network (or a dev build faking lag), your clicks take a round trip before the host moves you.
    this.prediction = conn.interpDelay > 0.1 ? new SelfPrediction(conn.interpDelay + 0.1) : null;
    this.visionGrid = new VisionGrid(map, this.nav);
    this.fog = new FogLayer(this.visionGrid);
    this.camera = new Camera(map);
    // The Howling Hollow sounds haunted.
    this.sound.setHaunted(map.theme === 'halloween');
    this.lighting = new Lighting(map);
    this.hud = new Hud(hudRoot);
    this.hud.onLevelUp = (slot) => {
      this.sound.play('rankUp', 0.6);
      this.send({ k: 'levelUp', slot });
    };
    // The sounds and Wick's reaction wait for the host to say it went through (see shopLanded).
    this.hud.onBuy = (item) => {
      const me = this.buffer.latest?.me;
      const why = me ? cantBuy(me, item) : null;
      if (why) {
        this.sound.play('deny', 0.6);
        if (why === 'Not enough gold') this.wickSays('broke');
        return;
      }
      this.sound.play('click', 0.5);
      this.send({ k: 'buy', item });
    };
    this.hud.onSell = (slot) => {
      this.sound.play('click', 0.5);
      this.send({ k: 'sell', slot });
    };
    this.hud.onUseItem = (slot) => this.useItem(slot, false);
    this.hud.onUndo = () => {
      this.sound.play('gold', 0.5);
      this.send({ k: 'undo' });
      // What comes back isn't a purchase: no fanfare for it.
      this.undoneAt = performance.now() / 1000;
    };
    this.hud.onMute = () => this.hud.setMuted(this.sound.toggleMute());
    this.tips = new Tips(hudRoot);
    this.legend = new JungleLegend(hudRoot, this.map);
    this.tips.onShow = () => this.sound.play('chime', 0.25);
    this.minimap = new Minimap(hudRoot, this.map);
    this.minimap.setTeam(TEAM.blue);
    this.minimap.onPeek = (p) => (this.peek = p);
    this.minimap.onMove = (p) => {
      this.send({ k: 'move', x: Math.round(p.x), y: Math.round(p.y) });
      this.predictWalk(p);
      this.fx.clickMarker(p.x, p.y, false);
    };
    this.minimap.onPingStart = (e, p) => this.startPing(e, p);
    this.pingWheel = new PingWheel(hudRoot);
    this.hud.setMuted(this.sound.muted);
    this.buffer = new SnapshotBuffer(conn.interpDelay);
    this.setMap(TEAM.blue);
    this.worldLayer.addChild(
      this.groundLayer,
      this.water.container,
      this.ambience.container,
      this.underLayer,
      this.fx.under,
      this.structureLayer,
      this.wallTops,
      this.canopy,
      this.critters.container,
      this.fog.sprite,
      this.indicator,
      this.unitLayer,
      this.projectileLayer,
    );
    this.fountains = [TEAM.blue, TEAM.red].map((team) => {
      const view = new FountainView(this.map.spawns[team], crystalSpot(this.map, team));
      this.underLayer.addChildAt(view.ground, 0);
      this.unitLayer.addChild(view.body);
      this.lighting.addLight(view.light);
      return view;
    });
    this.wicks = [TEAM.blue, TEAM.red].map((team) => {
      const at = wickSpot(this.map, team);
      const wick = new Shopkeeper(at.x, at.y, at.facing, this.fx);
      this.underLayer.addChild(wick.ground);
      this.unitLayer.addChild(wick.body);
      this.lighting.addLight(wick.light);
      return wick;
    });
    // Story landmarks: flat parts with the traps and zones, standing parts sorted in with the units, a few
    // bits on the pit walls raised with the wall tops.
    const landmarks = buildLandmarks(this.map);
    this.underLayer.addChildAt(landmarks.flat, 0);
    this.underLayer.addChild(this.hoverMark, this.targetMark, this.reachRing);
    this.wallTops.addChild(landmarks.tall);
    for (const piece of landmarks.standing) this.unitLayer.addChild(piece);
    for (const light of landmarks.lights) this.lighting.addLight(light);
    this.nightLife = new NightLife(this.map, this.lighting.lanterns);
    this.events = new EventsView({ fx: this.fx, map: this.map, under: this.underLayer, units: this.unitLayer, hudRoot, minimap: this.minimap, team: () => this.myTeam, announce: (t, d, tone) => this.hud.announce(t, d, tone), say: (line, weight) => this.announcer.say(line, weight), cue: (c) => this.playCue(c), shake: (at, k) => this.shakeNear(at, k) });
    this.emissive.addChild(this.nightLife.glow, ...this.wicks.map((w) => w.glow), ...this.fountains.map((f) => f.glow), this.beams, this.fx.container, this.bubbles.container);
    this.bloom.blendMode = 'add';
    this.bloom.alpha = 0.75;
    // The blend has to be on the blur too: a filtered sprite is laid down with its filter's blend, and the
    // default ("normal") let dark parts of the glowing layer draw as a murky copy of it over the view.
    this.bloom.filters = [new BlurFilter({ strength: 10, quality: 3, resolution: 0.35, blendMode: 'add' })];
    this.view.addChild(this.worldLayer, this.lighting.sprite, this.emissive, this.bloom);
    this.offs.push(onSettings((s) => {
      const enemy = PALETTE.enemy;
      setColorblind(s.colorblind);
      if (PALETTE.enemy !== enemy) this.redrawViews();
      this.camera.panScale = s.panSpeed;
      this.applyQuality();
    }));
    app.stage.addChild(this.view, this.ripple.sprite, this.dangle.container);
    this.deathFilter.desaturate();
    this.bindInput();
    app.ticker.add(this.tick, this);
  }

  /** Match messages from the host (the lobby screen handles the rest). */
  handle(msg: HostMessage): void {
    if (msg.t === 'welcome') {
      this.myId = msg.unitId;
      // Back after a dropped connection: the match is already on, no intro.
      if (msg.back) this.introShown = true;
      this.hud.fadeIn();
      if (msg.weather && msg.weather !== 'clear' && !this.weather) this.setWeather(new WeatherView(msg.weather, this.map));
      this.weatherClears = msg.clears;
      this.clockOffset = msg.clock ?? 0;
      if (msg.team !== this.myTeam) {
        this.myTeam = msg.team;
        // Repaint the ground so your own base is the blue one.
        this.setMap(msg.team);
        this.minimap.setTeam(msg.team);
      }
    } else if (msg.t === 'snap') {
      const snap = this.decoder.decode(msg.snap);
      // Late or out of order (we already have a newer one): nothing to show.
      if (!snap) return;
      // Tell the host we have it, so it builds the next ones on it.
      if (msg.snap.base !== undefined) this.conn.send({ t: 'ack', tick: snap.tick });
      this.buffer.push(snap, performance.now() / 1000);
      this.highlights.record(snap);
    }
  }

  private setWeather(w: WeatherView): void {
    this.weather = w;
    this.wind.setWeather(w.kind);
    w.density = this.level === 0 ? 1 : 0.4;
    // Mist and splashes sit over the trees; frost, puddles and fallen leaves on the ground; snow on the
    // treetops. Nothing goes over the whole screen.
    this.worldLayer.addChildAt(w.world, this.worldLayer.getChildIndex(this.canopy) + 1);
    this.worldLayer.addChildAt(w.ground, this.worldLayer.getChildIndex(this.groundLayer) + 1);
    w.dustTrees(this.crowns);
    this.canopy.addChild(w.treetops);
    w.onBolt = (strike) => {
      if (strike) {
        // A strike in view: a blinding flash where it lands, scorched ground, the thunder right on top of it.
        this.fx.flash(strike.x, strike.y, 160, 0xdfeaff, 0.35, 0.9);
        this.fx.scar(strike.x, strike.y, 60, 'scorch');
        this.fx.particles.burst(18, { shape: 'spark', x: strike.x, y: strike.y, life: 0.4, size: 10, size2: 2, stretch: 0.05, color: 0xffffff, color2: 0x9fc4ff }, [200, 520]);
        this.fx.light(strike.x, strike.y, 500, 0xcfe0ff, 0.5, 1);
        this.camera.shake(4);
        this.sound.play('thunder', 0.7);
        return;
      }
      setTimeout(() => this.sound.play('thunder', w.kind === 'storm' ? 0.45 : 0.3), 300 + Math.random() * 1500);
    };
    this.sound.setWeather(w.kind, this.wind.strength / 0.55);
  }

  /** Throws away every unit and structure view so they're drawn again (after the enemy color changes). */
  private redrawViews(): void {
    for (const view of this.views.values()) {
      view.container.destroy({ children: true });
      view.top?.destroy({ children: true });
    }
    this.views.clear();
  }

  /** (Re)paints the map, tinted for the viewer's team. */
  private setMap(team: Team): void {
    const layers = buildMap(this.map, team);
    const replace = (parent: Container, child: Container) => {
      if (parent.children.length) destroyMapLayer(parent.removeChildAt(0));
      parent.addChildAt(child, 0);
    };
    replace(this.groundLayer, layers.ground);
    replace(this.wallTops, layers.wallTops);
    replace(this.canopy, layers.canopy);
    this.sway = layers.sway;
    this.crowns = layers.crowns;
    for (const s of this.standing) s.destroy({ children: true });
    this.standing = layers.standing;
    for (const s of this.standing) this.unitLayer.addChild(s);
  }

  /**
   * Adds the match to your profile (real matches only: someone on the other side), and shows any titles it
   * unlocked on the end screen.
   */
  private recordMatch(rows: readonly ScoreRow[], winner: Team): void {
    const mine = rows.find((r) => r.id === this.myId);
    if (!mine || !rows.some((r) => r.team !== mine.team)) return;
    const { profile, unlocked } = recordMatch(loadProfile(), {
      champ: mine.champ,
      won: winner === mine.team,
      k: mine.k,
      d: mine.d,
      a: mine.a,
      cs: mine.cs,
      mvp: pickMvp(rows, winner)?.id === mine.id,
    }, { at: Date.now(), map: this.map.id, length: Math.round(this.buffer.latest?.time ?? 0), ...(mine.skin ? { skin: mine.skin } : {}) });
    saveProfile(profile);
    if (unlocked.length) {
      this.hud.titlesUnlocked(unlocked.map((t) => t.name));
      // After the stinger has had its say.
      setTimeout(() => this.sound.play('titleUnlock', 0.7), 2600);
    }
  }

  /**
   * A reticle under whatever you're attacking, for as long as your attack order is on it: a turning dashed
   * ring in the enemy's color with four ticks pointing in, popping in as it lands on something new. Your
   * reach shows faintly round you at the same time, so you can see when you're close enough.
   */
  /** The enemy a right-click would attack gets a ring at its feet (unless the target reticle's already on it). */
  private drawHover(e: EntitySnap | null): void {
    const g = this.hoverMark.clear();
    if (!e || (e.id === this.markId && this.markOn > 0)) return;
    const r = e.r * 1.2;
    g.ellipse(e.x, e.y, r, r * 0.45).fill({ color: PALETTE.enemy, alpha: 0.1 }).stroke({ width: 2.5, color: PALETTE.enemy, alpha: 0.9 });
  }

  private drawTargetMark(dt: number, me: EntitySnap | undefined): void {
    const mine = this.buffer.latest?.me;
    const pending = this.pendingTarget && performance.now() / 1000 < this.pendingTarget.until ? this.pendingTarget.id : undefined;
    if (pending !== undefined && mine?.tgt === pending) this.pendingTarget = null;
    const tgtId = pending ?? mine?.tgt;
    const tgt = tgtId !== undefined ? this.ents.get(tgtId) : undefined;
    const g = this.targetMark;
    if (!me || me.dead || !mine || !tgt || tgt.dead || this.replay) {
      if (this.markOn > 0) g.clear();
      this.markOn = 0;
      this.markId = -1;
      return;
    }
    if (this.markId !== tgt.id) {
      this.markId = tgt.id;
      this.markOn = 0;
    }
    this.markOn = Math.min(1, this.markOn + dt * 8);
    this.markT += dt;
    const color = PALETTE.enemy;
    const pop = 1 + (1 - this.markOn) * 0.6;
    const r = tgt.r * 1.3 * pop;
    const rot = this.markT * 1.4;
    const alpha = (0.7 + 0.3 * Math.sin(this.markT * 7)) * this.markOn;
    g.clear();
    g.ellipse(tgt.x, tgt.y, r, r * 0.45).fill({ color, alpha: 0.12 * this.markOn });
    // Eight dashes round the ring (as a flat ellipse, like the ground), and four ticks pointing in.
    for (let i = 0; i < 8; i++) {
      const a0 = rot + (i / 8) * Math.PI * 2;
      for (let k = 0; k <= 4; k++) {
        const a = a0 + (k / 4) * (Math.PI / 8);
        const x = tgt.x + Math.cos(a) * r;
        const y = tgt.y + Math.sin(a) * r * 0.45;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: 3, color, alpha, cap: 'round' });
    }
    for (let i = 0; i < 4; i++) {
      const a = -rot * 0.5 + (i / 4) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a) * 0.45;
      g.moveTo(tgt.x + c * (r + 14), tgt.y + s * (r + 14)).lineTo(tgt.x + c * (r + 5), tgt.y + s * (r + 5)).stroke({ width: 3, color, alpha, cap: 'round' });
    }
    // Your reach, faintly, round you.
    const reach = mine.stats.range + me.r;
    g.ellipse(me.x, me.y, reach, reach * 0.45).stroke({ width: 1.5, color, alpha: 0.2 * this.markOn });
  }

  /** The hour for the look of things: the match clock, plus the head start if the match began at night. */
  private lookTime(): number {
    return (this.replay?.time ?? this.buffer.latest?.time ?? 0) + this.clockOffset;
  }

  showNotice(title: string, detail: string): void {
    this.hud.showNotice(title, detail);
  }

  // ─── Per frame ────────────────────────────────────────────────────────────

  /** How much the graphics are doing: 0 everything, 1 no glow pass and a plain-resolution canvas, 2 fewer particles too. */
  private get level(): number {
    return settings.quality === 'low' ? 2 : settings.quality === 'high' ? 0 : this.autoStep;
  }

  /** Puts the graphics level into effect. */
  private applyQuality(): void {
    const level = this.level;
    this.bloom.visible = level === 0;
    this.fx.density = [1, 0.75, 0.45][level];
    this.fx.particles.limit = [3000, 1800, 900][level];
    this.fx.particles.density = [1, 0.75, 0.5][level];
    if (this.weather) this.weather.density = level === 0 ? 1 : 0.4;
    const resolution = level === 0 ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    if (this.app.renderer.resolution !== resolution) this.app.renderer.resize(this.app.screen.width, this.app.screen.height, resolution);
  }

  /**
   * Auto graphics: if frames run slower than about 48 a second for two seconds of a match, step down a
   * level (and once more if that wasn't enough). The first seconds of a match (loading) and long gaps (a
   * hidden tab) don't count, and it never steps back up mid-match, so the look doesn't flicker.
   */
  private watchSpeed(ms: number): void {
    if (settings.quality !== 'auto' || !this.ents.get(this.myId) || ms > 250) return;
    if (++this.matchFrames < 300 || this.autoStep >= 2) return;
    this.frameMs += (ms - this.frameMs) * 0.05;
    this.slowFor = this.frameMs > 21 ? this.slowFor + ms / 1000 : Math.max(0, this.slowFor - ms / 2000);
    if (this.slowFor < 2) return;
    this.autoStep++;
    this.slowFor = 0;
    this.frameMs = 16.7;
    this.applyQuality();
  }

  /**
   * The first time anything big plays, the GPU has to take in the effect textures and build the shaders
   * for them and the screen filters: a hitch in the middle of the first fight. So on the first frame they
   * all play once, invisibly.
   */
  private warmUp(): void {
    this.warmed = true;
    const shapes: Shape[] = ['glow', 'spark', 'star', 'smoke', 'shard', 'ring', 'mote', 'leaf', 'splat', 'pow', 'puff', 'flame', 'magic', 'twirl', 'slash', 'claw', 'circle', 'flare', 'scorch', 'dirt', 'muzzle', 'zap', 'heart', 'cloud', 'soot', 'blast', 'flash'];
    for (const shape of shapes) for (const glow of [true, false]) this.fx.particles.emit({ shape, glow, x: this.camera.x, y: this.camera.y, life: 0.1, size: 8, color: 0xffffff, alpha: 0.001 });
    this.warmFilters = 2;
  }

  private frame(dt: number): void {
    if (!this.warmed) this.warmUp();
    // Normally the live match; during Play of the Game, the replay.
    const { ents, events } = this.replay ? this.replay.step(dt) : this.buffer.sample(performance.now() / 1000);
    this.ents = new Map(ents.map((e) => [e.id, e]));
    if (this.prediction && !this.replay) this.predictSelf(dt);
    this.syncViews(dt);
    this.emitTrails();
    for (const ev of events) {
      const early = ev.e === 'cast' && ev.src === this.myId && this.earlyCast?.slot === ev.slot && performance.now() / 1000 - this.earlyCast.at < 1.5;
      this.playEvent(ev);
      const cue = early ? null : cueFor(ev, this.ents, this.myId);
      if (cue && ev.e !== 'kill') this.playCue(cue); // the announcer voices kills
    }
    this.fx.update(dt);
    const seen = { x: this.camera.x, y: this.camera.y, w: this.app.screen.width / this.camera.zoom, h: this.app.screen.height / this.camera.zoom };
    this.ambience.update(dt, seen);
    this.water.update(dt, this.ents.values(), seen);
    this.blowWind(dt);
    this.fog.update(this.ents.values(), this.myTeam, performance.now() / 1000);

    const me = this.ents.get(this.myId);
    if (me?.champ && !this.myInfo) {
      this.myInfo = CHAMPION_INFO[me.champ];
      this.hud.setChampion(this.myInfo, me.skin ?? 0);
    }

    const { width: w, height: h } = this.app.screen;
    this.camera.update(dt, me && !me.dead ? me : null, this.mouse.inside ? this.mouse : null, w, h, this.centerHeld);
    const watching = this.spectate(dt, me);
    this.fog.sprite.visible = !!me && !this.replay;
    if (!me && !this.finale) {
      // Waiting in the lobby or champion select: drift over the map like the menu does (no fog: no side yet).
      const at = driftAt(performance.now() / 1000);
      this.camera.x = at.x;
      this.camera.y = at.y;
    }
    if (this.peek) {
      this.camera.x = this.peek.x;
      this.camera.y = this.peek.y;
    }
    if (this.replay) {
      // Play of the Game: the camera rides with the star.
      const star = this.ents.get(this.replay.clip.star);
      const k = Math.min(1, dt * 4);
      if (star) {
        this.camera.x += (star.x - this.camera.x) * k;
        this.camera.y += (star.y - this.camera.y) * k;
      }
    } else if (this.finale) {
      // Glide over to watch Da Base fall.
      const k = Math.min(1, dt * 2.5);
      this.camera.x += (this.finale.x - this.camera.x) * k;
      this.camera.y += (this.finale.y - this.camera.y) * k;
    }
    this.camera.apply(this.worldLayer, w, h, dt);
    this.cullProps(w, h);
    elevate(this.wallTops, HEIGHT.wall, this.camera.x, this.camera.y);
    elevate(this.canopy, HEIGHT.tree, this.camera.x, this.camera.y);
    this.emissive.position.copyFrom(this.worldLayer.position);
    this.emissive.scale.copyFrom(this.worldLayer.scale);
    // The look of the hour (starting at night pushes it on), not the match clock.
    const matchTime = this.lookTime();
    this.clearSkies();
    this.weather?.update(dt, w, h, this.camera, this.wind);
    if (this.weather?.snowy) this.breathe();
    const sky = this.weather ? this.weather.sky(skyAt(matchTime)) : skyAt(matchTime);
    this.lighting.update(this.app.renderer, this.worldLayer, w, h, dt, this.ents.values(), this.myTeam, [...this.fx.lights, ...this.recallLights()], sky, duskAt(matchTime));
    this.ambience.setNight(nightAt(matchTime));
    this.sound.setNight(nightAt(matchTime));
    this.nightLife.update(dt, matchTime, nightAt(matchTime), { x: this.camera.x, y: this.camera.y, w: w / this.camera.zoom, h: h / this.camera.zoom });
    this.critters.setNight(nightAt(matchTime));
    this.critters.update(dt, this.ents.values(), { x: this.camera.x, y: this.camera.y, w: w / this.camera.zoom, h: h / this.camera.zoom });
    // The world drains of color while you wait to respawn.
    this.deadFade = Math.max(0, Math.min(1, this.deadFade + (me?.dead && !this.finale ? dt * 2 : -dt * 3)));
    // Less grey while you're watching someone fight.
    this.deathFilter.alpha = this.deadFade * (watching ? 0.55 : 0.85);
    this.ripple.update(dt);
    // (While warming up: both, doing nothing, so their shaders are built now and not mid-fight.)
    const warming = this.warmFilters > 0 && this.warmFilters-- > 0;
    const filters = [...(this.deadFade > 0 || warming ? [this.deathFilter] : []), ...(this.ripple.active || warming ? [this.ripple.filter] : [])];
    if (filters.length !== (this.view.filters?.length ?? 0) || filters.some((f, i) => this.view.filters?.[i] !== f)) this.view.filters = filters;

    const mouseWorld = this.mouseWorld();
    if (this.rightHeld && (this.holdTimer -= dt) <= 0) this.rightClick(false);
    const hovered = this.enemyAt(mouseWorld);
    this.setCursor(this.attackMoveArmed || hovered ? 'attack' : !this.replay && this.wicks[this.myTeam - 1]?.hit(mouseWorld) ? 'shop' : '');
    this.drawHover(this.replay ? null : hovered);
    if (this.aiming !== null && this.myInfo && me && !me.dead) drawIndicator(this.indicator, this.myInfo.abilities[this.aiming], me, mouseWorld);
    else this.indicator.clear();
    this.drawTargetMark(dt, me);
    this.drawReach(me);
    this.startOfMatch(me);

    this.updateWicks(dt, me);
    if (this.fountainsFor !== this.myTeam) {
      this.fountainsFor = this.myTeam;
      this.fountains.forEach((f, i) => f.paint(i + 1 === this.myTeam || this.myTeam === TEAM.neutral && i === 0 ? PALETTE.ally : PALETTE.enemy));
    }
    for (const f of this.fountains) f.update(dt);
    this.chudChatter(dt);
    this.bubbles.update(dt, (id) => {
      const e = this.ents.get(id);
      // Over the head of whoever's talking, however tall they stand.
      return e ? { x: e.x, y: e.y - standHeight(e) + e.r, r: e.r, dead: e.dead } : this.wicks[WICK_ID - id]?.anchor;
    });
    this.drawBeams();
    this.renderBloom(w, h);
    this.drawMinimap(w, h);
    if (!this.replay) this.baseLife();
    this.updateSoundscape();

    const latest = this.buffer.latest;
    this.hud.update(latest?.me, latest?.ents.find((e) => e.id === this.myId), `tick ${latest?.tick ?? 0} · ${Math.round(this.app.ticker.FPS)} fps`);
    this.hud.setClock(latest?.time ?? 0, latest?.nextWave);
    this.showStealth(me);
    if (this.myTeam !== TEAM.neutral) this.hud.setKills(this.teamKills[this.myTeam], this.teamKills[this.myTeam === 1 ? 2 : 1]);
    this.hud.setWarden(latest?.warden, this.myTeam);
    this.announceMatch(latest);
    this.dangle.update(dt, this.app.screen.width, !this.replay && !latest?.winner && !!latest?.warden?.alive, latest?.warden?.wakesIn);
    this.events.update(dt, this.replay ? undefined : latest?.event);
    // The event readout goes under the Warden's lines, however many of them there are.
    const eventHud = this.hudRoot.querySelector<HTMLElement>('.event-hud');
    if (eventHud && !eventHud.hidden) eventHud.style.top = `${Math.max(48, this.hud.wardenBottom() + 6 - 30)}px`;
    this.hud.setScores(latest?.scores, this.myTeam, this.myId, this.scoresHeld, latest?.time ?? 0, latest?.winner);
    this.legend.update(this.scoresHeld && !latest?.winner && !this.replay, latest?.time ?? 0, this.myTeam, latest?.warden);
    if (!this.introShown && me && latest?.scores) this.playIntro(latest.scores);
    if (latest?.winner) this.tips.hide();
    else if (me && latest?.me && !this.introUp) this.updateTips(me, latest.me, latest.time);
    if (latest?.scores && latest.scores !== this.lastScores) {
      this.lastScores = latest.scores;
      this.teamKills[1] = this.teamKills[2] = 0;
      for (const row of latest.scores) this.teamKills[row.team] += row.k;
      // What everyone's bought shows on them.
      for (const row of latest.scores) {
        (this.views.get(row.id) as UnitView | undefined)?.wear?.(row.items);
        if (row.id === this.myId) this.hud.wear(row.items);
      }
      this.sampleGold(latest.scores, latest.time, !!latest.winner);
    }
    if (latest?.winner) {
      if (!this.finale) {
        const base = [...this.ents.values()].find((e) => e.k === 'structure' && e.role === 'daBase' && e.dead);
        this.finale = { x: base?.x ?? this.camera.x, y: base?.y ?? this.camera.y, at: performance.now() / 1000 };
        this.camera.locked = false;
      }
    }
    if (latest?.winner && performance.now() / 1000 - this.finale!.at > 3.2 && !this.potgDone) {
      // Before the scores: the Play of the Game, if there was one.
      if (!this.replay) {
        this.highlights.close(latest.time);
        if (this.highlights.best) this.startReplay(this.highlights.best);
        else this.potgDone = true;
      } else if (this.replay.done) this.endReplay();
    }
    if (latest?.winner && this.potgDone && performance.now() / 1000 - this.finale!.at > 3.2) {
      if (!this.gameOverPlayed) {
        const awards = pickAwards(latest.scores ?? [], this.tally);
        this.hud.setMatchExtras(awards, goldGraph(this.goldHistory, 340, 72));
        awards.forEach((_, i) => setTimeout(() => this.sound.play('chime', 0.4), 900 + i * 250));
      }
      this.hud.showGameOver(latest.winner === this.myTeam, latest.scores, latest.winner, this.myTeam);
      if (!this.gameOverPlayed) {
        this.sound.endMatch(latest.winner === this.myTeam);
        this.announcer.hush();
        this.announcer.say(latest.winner === this.myTeam ? 'Victory!' : 'Defeat.', 3);
      }
      if (!this.gameOverPlayed && !this.replay) this.recordMatch(latest.scores ?? [], latest.winner);
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
    const ctx: ViewContext = {
      me: me && !me.dead ? me : undefined,
      inBrush: (x, y) => this.visionGrid.brushAt({ x, y }) > 0,
      inWater: (x, y) => this.map.ground.some((p) => p.style === 'river' && shapeContains(p.shape, x, y)),
      wind: this.wind,
      light: (x, y) => this.lighting.lightAt(x, y, nightAt(this.lookTime())),
      night: nightAt(this.lookTime()),
      dusk: duskAt(this.lookTime()),
      myAd: settings.lastHit && me && !me.dead ? this.buffer.latest?.me?.stats.ad : undefined,
    };
    const { width, height } = this.app.screen;
    const halfW = width / 2 / this.camera.zoom + CULL_MARGIN;
    const halfH = height / 2 / this.camera.zoom + CULL_MARGIN;
    for (const s of this.ents.values()) {
      let view = this.views.get(s.id);
      if (!view) {
        view = this.createView(s);
        this.views.set(s.id, view);
      }
      // Off the screen: hidden, and not redrawn. It catches up on the time it missed when it's back.
      const reach = s.r ?? 0;
      const off = Math.abs(s.x - this.camera.x) > halfW + reach || Math.abs(s.y - this.camera.y) > halfH + reach * 2;
      if (view.container.culled !== off) {
        view.container.culled = off;
        if (view.top) view.top.culled = off;
      }
      if (off) {
        this.offScreen.set(s.id, Math.min(0.5, (this.offScreen.get(s.id) ?? 0) + dt));
        continue;
      }
      const missed = this.offScreen.get(s.id);
      if (missed !== undefined) this.offScreen.delete(s.id);
      view.update(s, dt + (missed ?? 0), ctx);
    }
    if (this.frameCount % 300 === 0) for (const id of this.offScreen.keys()) if (!this.ents.has(id)) this.offScreen.delete(id);
  }

  /** The standing props (trees' trunks, rocks, landmarks, the shop, the fountains) off the screen aren't drawn. */
  private cullProps(w: number, h: number): void {
    const halfW = w / 2 / this.camera.zoom + CULL_MARGIN;
    const halfH = h / 2 / this.camera.zoom + CULL_MARGIN;
    const left = this.camera.x - halfW;
    const right = this.camera.x + halfW;
    const top = this.camera.y - halfH;
    const bottom = this.camera.y + halfH;
    for (const c of this.unitLayer.children) {
      if (this.viewBodies.has(c)) continue;
      let b = this.propBounds.get(c);
      if (!b) {
        const lb = c.getLocalBounds();
        // Nothing drawn in it yet: leave it be and look again later.
        if (!(lb.maxX > lb.minX)) continue;
        b = { l: lb.minX, t: lb.minY, r: lb.maxX, b: lb.maxY };
        this.propBounds.set(c, b);
      }
      const off = c.x + b.r < left || c.x + b.l > right || c.y + b.b < top || c.y + b.t > bottom;
      if (c.culled !== off) c.culled = off;
    }
  }

  /** Particles behind projectiles and around units with statuses, for whatever's on screen. */
  private emitTrails(): void {
    const { width, height } = this.app.screen;
    const halfW = width / 2 / this.camera.zoom + 250;
    const halfH = height / 2 / this.camera.zoom + 250;
    const time = performance.now() / 1000;
    // Forget footsteps of things that are gone (dead Chuds pile up over a match).
    if (this.frameCount % 300 === 0) for (const id of this.steps.keys()) if (!this.ents.has(id)) this.steps.delete(id);
    for (const b of propSpots(this.map).braziers) {
      if (Math.abs(b.x - this.camera.x) < halfW && Math.abs(b.y - this.camera.y) < halfH) brazierFire(this.fx, b.x, b.y - FIRE_HEIGHT);
    }
    for (const s of this.ents.values()) {
      if (Math.abs(s.x - this.camera.x) > halfW || Math.abs(s.y - this.camera.y) > halfH) continue;
      if (s.k === 'projectile') projectileTrail(this.fx, { ...s, y: s.y - flightHeight(s.vis) }, s.tm === this.myTeam);
      else {
        this.footsteps(s, time);
        if (s.st?.includes('airborne')) this.inAir.add(s.id);
        else if (this.inAir.delete(s.id)) this.landed(s);
        if (s.k === 'monster' && !s.dead) monsterAura(this.fx, s);
        if (s.st || s.sh) statusAura(this.fx, chestHeight(s) ? { ...s, y: s.y - chestHeight(s) } : s, time);
      }
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
        this.unitLayer.addChild(sv.top);
        this.viewBodies.add(sv.top);
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
      case 'ward':
        view = new WardView(s);
        layer = this.underLayer;
        break;
      default:
        view = new UnitView(s, rel);
        layer = this.unitLayer;
        if (s.k === 'champion') (view as UnitView).wear(this.lastScores?.find((row) => row.id === s.id)?.items ?? []);
        // Fresh Chuds pop out of the portal near their base.
        if (s.k === 'chud' && lanesOf(this.map).some((lane) => {
          const at = lanePath(this.map, s.tm as 1 | 2, lane)[0];
          return Math.hypot(at.x - s.x, at.y - s.y) < 500;
        })) {
          this.fx.burst(s.x, s.y, s.tm === this.myTeam ? 0x7cc4ff : enemyLight(), 70);
          this.fx.particles.burst(6, { shape: 'mote', x: s.x, y: s.y, life: 0.5, size: 8, size2: 2, color: 0xffffff, color2: s.tm === this.myTeam ? PALETTE.ally : PALETTE.enemy, drag: 0.2 }, [60, 140]);
        }
    }
    layer.addChild(view.container);
    this.viewBodies.add(view.container);
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
        // Fights scare the birds off.
        if (hit && hit.k === 'champion') this.critters.alarm(hit.x, hit.y);
        if (hit?.k === 'champion' && from?.k === 'champion' && ev.amount >= 1) {
          const t = performance.now() / 1000;
          this.champFightAt.set(hit.id, t);
          this.champFightAt.set(from.id, t);
        }
        if (ev.amount >= 1) this.views.get(ev.target)?.onHit?.(from, !!hit && ev.amount >= (hit.mhp ?? 1000) * 0.08);
        // Your basic attacks connect: whatever you hit holds for a blink as the blow lands (a big hit holds longer, below).
        if (ev.b && ev.src === this.myId && hit && ev.amount >= 1 && ev.amount < (hit.mhp ?? 1000) * 0.08) this.views.get(ev.target)?.freeze?.(0.05, 2);
        if (hit && ev.amount >= 1 && (hit.k === 'champion' || hit.k === 'monster' || ev.src === this.myId || ev.target === this.myId)) {
          const heavy = ev.amount >= (hit.mhp ?? 1000) * 0.08;
          this.fx.impact(hit.x, hit.y - chestHeight(hit), hit.r, ev.type, heavy);
          // A comic word over a big hit (not too often from any one source).
          if (heavy && (hit.k === 'champion' || from?.k === 'champion')) {
            const now = performance.now() / 1000;
            const key = ev.src ?? -1;
            if ((this.lastWord.get(key) ?? 0) < now - 0.9) {
              this.lastWord.set(key, now);
              // Beside the target, on the side away from the attacker (the damage number goes over its head).
              const side = from ? (from.x > hit.x ? -1 : 1) : Math.random() < 0.5 ? -1 : 1;
              this.fx.comic(hit.x + side * hit.r, hit.y - chestHeight(hit) + 30, hitWord(from?.champ, Math.random()), from?.champ ? CAST_COLORS[from.champ] : 0xffd166, false, side);
            }
          }
          // Hit-stop (visual only): the target freezes and shudders, a close attacker holds too, and if
          // you're in it, the effects crawl for a beat.
          if (heavy && (hit.k === 'champion' || hit.k === 'monster')) {
            const big = ev.amount >= (hit.mhp ?? 1000) * 0.2;
            if (big && hit.k === 'champion') this.speak(hit, 'hurt', ev.amount);
            const hold = big ? 0.12 : 0.075;
            this.views.get(ev.target)?.freeze?.(hold, big ? 5 : 3);
            if (from && Math.hypot(from.x - hit.x, from.y - hit.y) < 450) this.views.get(from.id)?.freeze?.(hold * 0.8, 0);
            if (ev.src === this.myId || ev.target === this.myId) this.fx.hitstop(hold);
          }
          if (ev.target === this.myId && heavy) {
            this.camera.shake(Math.min(18, 6 + (ev.amount / (hit.mhp ?? 1000)) * 60));
            this.sound.play('impact', 0.55);
            if (from) {
              const d = Math.hypot(hit.x - from.x, hit.y - from.y) || 1;
              this.camera.kick(((hit.x - from.x) / d) * 12, ((hit.y - from.y) / d) * 12);
            }
          }
          if (ev.target === this.myId && !this.replay) {
            // Every hit you take flushes the edges of the screen, in proportion; a champion's shoves the view a touch.
            this.hud.hurt(Math.max(0.12, Math.min(0.7, (ev.amount / (hit.mhp ?? 1000)) * 6)));
            if (!heavy && from?.k === 'champion') {
              const d = Math.hypot(hit.x - from.x, hit.y - from.y) || 1;
              this.camera.kick(((hit.x - from.x) / d) * 4, ((hit.y - from.y) / d) * 4);
            }
          }
        }
        if (ev.src !== this.myId && ev.target !== this.myId) return;
        if (ev.target === this.myId && ev.src !== this.myId && ev.amount >= 1 && !this.replay) this.recordHit(ev, from);
        const other = this.ents.get(ev.src === this.myId ? ev.target : (ev.src ?? -1));
        if (other?.k === 'champion' && ev.amount >= 1) this.lastFight = performance.now() / 1000;
        const t = this.ents.get(ev.target);
        if (t && ev.amount >= 1) this.fx.damageNumber(t.x, t.y - standHeight(t), ev.amount, ev.type, ev.b && ev.src === this.myId ? from : undefined);
        return;
      }
      case 'attack': {
        const src = this.ents.get(ev.src);
        const tgt = this.ents.get(ev.target);
        // A champion's swings come in turn (a chop, a sweep, a backhand...), each with its own look: the
        // weapon's arc (or the shot leaving the hand) as the blow is thrown, and the hit landing on the
        // target in the champion's own style (render/attacks.ts). Everyone else plays their one move.
        const swing = src?.champ ? nextSwing(ev.src) : 0;
        const move = src?.champ ? attackAnim(src.champ, swing) : undefined;
        // Timed so the blow lands when the hit really does (`w`, the windup), however fast they attack.
        const anim = move && ev.w ? timedTo(move, ev.w) : move;
        this.views.get(ev.src)?.onAttack?.(move, ev.w);
        const tag = ++this.swingSeq;
        this.swingTags.set(ev.src, tag);
        this.damageLog.noteAttack(ev.src, performance.now() / 1000);
        const shooter = this.ents.get(ev.src);
        if (shooter?.k === 'structure' && this.ents.get(ev.target)?.k === 'champion') this.towerShots.set(ev.src, { target: ev.target, until: performance.now() / 1000 + 1.4 });
        if (shooter?.k === 'structure') this.shootieFires(shooter, this.ents.get(ev.target));
        const mine = ev.src === this.myId;
        if (src?.k === 'champion' && anim && tgt) attackLook(this.fx, src, tgt, swing, anim, mine, () => this.ents.get(ev.target), tag);
        // Your own attack has an edge you always hear; an enemy champion's at you comes in with a whoosh.
        if (mine && src) this.sound.play('atkEdge', 0.5);
        else if (src?.k === 'champion' && src.tm !== this.myTeam && ev.target === this.myId) this.playCue({ name: 'incoming', at: src, gain: 0.6 });
        return;
      }
      case 'attackStop': {
        // Cut short before the blow landed (they moved, or cast): no blow, no shot.
        const tag = this.swingTags.get(ev.src);
        if (tag !== undefined) this.fx.cancel(tag);
        this.swingTags.delete(ev.src);
        this.views.get(ev.src)?.cancelAttack?.();
        return;
      }
      case 'death': {
        const t = this.ents.get(ev.id);
        if (!t) return;
        if (t.k === 'monster' && t.mon && !this.replay) this.legend.noteDeath(t.mon, t.x, t.y, this.buffer.latest?.time ?? 0);
        if (t.k === 'structure') structureCollapse(this.fx, t.x, t.y, t.r, t.role === 'daBase');
        if (t.k === 'structure') this.chudsCheer(t);
        else this.fx.death(t.x, t.y - chestHeight(t) * 0.6, t.r, t.k === 'champion' || t.k === 'monster');
        if (t.k === 'champion') championDeath(this.fx, t);
        if (t.k === 'champion') this.fx.comic(t.x, t.y - standHeight(t) - 20, KO_WORD, 0xff5a5f, true);
        if (t.k === 'champion') this.speak(t, 'death', ev.id, true);
        if (ev.id === this.myId && !this.replay) {
          this.camera.shake(16);
          this.hud.showRecap(this.damageLog.recap(performance.now() / 1000));
        }
        else if (t.k === 'structure' && t.role === 'daBase') this.camera.shake(24);
        else if (t.k === 'structure' || (t.k === 'monster' && t.mon === 'warden')) this.shakeNear(t, 20);
        return;
      }
      case 'heal': {
        if (ev.target !== this.myId) return;
        const t = this.ents.get(ev.target);
        if (t) this.fx.healNumber(t.x, t.y - standHeight(t), ev.amount);
        return;
      }
      case 'gold': {
        if (this.replay) return;
        const t = ev.id === this.myId ? this.ents.get(ev.id) : undefined;
        if (t && ev.amount > 0) this.fx.goldNumber(t.x, t.y - standHeight(t) - 18, ev.amount);
        if (t && ev.amount >= 15) {
          const { width, height } = this.app.screen;
          this.hud.flyCoins((t.x - this.camera.x) * this.camera.zoom + width / 2, (t.y - this.camera.y) * this.camera.zoom + height / 2, ev.amount);
        }
        return;
      }
      case 'level': {
        if (this.replay) return;
        const t = ev.id === this.myId ? this.ents.get(ev.id) : undefined;
        if (t) this.fx.levelUp(t.x, t.y, t.r, ev.level);
        if (t) this.hud.levelFlash();
        return;
      }
      case 'castFail':
        if (ev.src === this.myId) {
          this.hud.flash(ev.slot);
          this.grumble(ev.why);
        }
        return;
      case 'emote': {
        const u = this.ents.get(ev.id);
        if (!u?.champ) return;
        const color = u.id === this.myId ? 0xe8c46a : u.tm === this.myTeam ? PALETTE.ally : PALETTE.enemy;
        this.bubbles.say(u.id, emoteLine(u.champ, ev.kind, ev.n, ev.vs), color);
        this.speak(u, ev.kind, ev.n, true);
        (this.views.get(u.id) as UnitView | undefined)?.play?.(EMOTE_ANIM[ev.kind]);
        if (ev.kind !== 'line') (this.views.get(u.id) as UnitView | undefined)?.smile?.(1.2);
        return;
      }
      case 'zap': {
        this.fountains[ev.team - 1]?.zap(ev.x2, ev.y2);
        if (Math.hypot(ev.x2 - (this.ents.get(this.myId)?.x ?? -1e9), ev.y2 - (this.ents.get(this.myId)?.y ?? -1e9)) < 60) this.camera.shake(10);
        return;
      }
      case 'ping': {
        const info = PINGS[ev.kind];
        this.pings.push({ x: ev.x, y: ev.y, kind: ev.kind, age: 0, at: performance.now() / 1000 });
        this.fx.ping(ev.x, ev.y, info.color, info.glyph, `${ev.name}: ${info.label}`);
        return;
      }
      case 'evt':
        if (!this.replay) this.events.onEvent(ev);
        return;
      case 'kill':
        if (!this.replay && ev.what === 'warden') this.tally.warden[ev.killer] = (this.tally.warden[ev.killer] ?? 0) + 1;
        if (!this.replay && ev.what === 'champion' && !ev.killerChamp) this.tally.executed[ev.victim] = (this.tally.executed[ev.victim] ?? 0) + 1;
        this.hud.pushFeed(ev, ev.team === TEAM.neutral ? null : ev.team === this.myTeam);
        if (ev.what === 'champion' && ev.killerChamp && ev.team !== TEAM.neutral && !this.replay) this.teamKills[ev.team]++;
        // Whoever got it grins.
        if (ev.what === 'champion') {
          const killer = [...this.ents.values()].find((e) => e.k === 'champion' && e.name === ev.killer);
          if (killer) (this.views.get(killer.id) as UnitView | undefined)?.smile?.();
          if (killer?.id === this.myId) this.hud.smile();
        }
        this.announceKill(ev);
        return;
      case 'fx':
        this.playFx(ev);
        return;
      case 'cast': {
        const caster = this.ents.get(ev.src);
        // Already shown the moment you pressed it (over the network)? Then just the bookkeeping.
        const shown = ev.src === this.myId && this.takeEarlyCast(ev.slot);
        if (!shown) this.views.get(ev.src)?.onCast?.(ev.slot);
        // Their own mark on the ground and round the body (the Oak splits the earth, Daltonomo's diamonds spin...).
        if (caster && !shown) castSignature(this.fx, caster, ev.slot);
        if (ev.src === this.myId) this.casts++;
        if (caster?.champ) this.damageLog.noteCast(ev.src, CHAMPION_INFO[caster.champ].abilities[ev.slot].name, performance.now() / 1000);
        if (caster?.champ && ev.slot === 3) {
          this.speak(caster, 'ult', 0, true);
          if (ev.src === this.myId) this.hud.smile();
          const name = CHAMPION_INFO[caster.champ].abilities[3].name.toUpperCase();
          this.fx.callout(caster.x, caster.y - standHeight(caster) - 50, name.endsWith('!') ? name : `${name}!`, CAST_COLORS[caster.champ]);
          this.playCue({ name: 'ultimate', at: caster, gain: 0.8 });
          const halfView = this.app.screen.width / 2 / this.camera.zoom;
          if (Math.hypot(caster.x - this.camera.x, caster.y - this.camera.y) < halfView) {
            this.camera.punch(0.025);
            this.sound.duck(0.3);
          }
        }
        return;
      }
    }
  }

  /** Notes a hit on you for the death recap: who, and with what. */
  private recordHit(ev: Extract<GameEvent, { e: 'dmg' }>, from: EntitySnap | undefined): void {
    const t = performance.now() / 1000;
    const key = ev.src === undefined ? 'unknown' : String(ev.src);
    let name = from?.name;
    let label = ev.src === undefined ? 'Lingering effects' : this.damageLog.labelFor(ev.src, t);
    if (from?.k === 'champion') this.lastChampHit = { id: from.id, t };
    if (from?.k === 'structure') {
      name = from.role === 'daBase' ? 'Da Base' : 'Shootie';
      label = 'Shootie shots';
    } else if (from?.k === 'chud') {
      name = CHUD_DEFS[from.chud ?? 'melee'].name;
      label = 'Chud hits';
    } else if (from?.k === 'monster' && label === 'Basic attacks') label = 'Mauling';
    this.damageLog.add({ t, key, name, champ: from?.champ, skin: from?.skin, kind: from?.k, label, amount: ev.amount });
  }

  /** Rolls the Play of the Game: letterboxed, the HUD put away, the announcer calling it again. */
  private startReplay(clip: Highlight): void {
    this.replay = new Replay(clip);
    this.multiKills.clear();
    this.hud.showPlayOfTheGame(clip, () => this.endReplay());
    this.sound.play('fanfare', 0.6);
  }

  private endReplay(): void {
    if (!this.replay) return;
    this.replay = null;
    this.potgDone = true;
    this.hud.hidePlayOfTheGame();
  }

  /** Notes who's ahead on gold (every ten seconds or so, and at the very end). */
  private sampleGold(rows: readonly ScoreRow[], t: number, final: boolean): void {
    const last = this.goldHistory[this.goldHistory.length - 1];
    if (last && t - last.t < 10 && !final) return;
    const lead = rows.reduce((sum, r) => sum + (r.team === this.myTeam ? r.gold : -r.gold), 0);
    this.goldHistory.push({ t, lead });
  }

  /** Tells the tips what's going on: gold and items, points and casts, health, and enemy Shooties nearby. */
  private updateTips(self: EntitySnap, me: MeSnap, time: number): void {
    if (this.hud.shop.open) this.shopOpened = true;
    let shootieAlone = false;
    for (const s of this.ents.values()) {
      if (s.k !== 'structure' || s.tm === this.myTeam || s.dead || !s.role?.endsWith('Shootie')) continue;
      if (Math.hypot(s.x - self.x, s.y - self.y) > 1000) continue;
      const covered = [...this.ents.values()].some((c) => c.k === 'chud' && c.tm === this.myTeam && Math.hypot(c.x - s.x, c.y - s.y) < 700);
      if (!covered) shootieAlone = true;
    }
    this.tips.update(
      {
        time,
        inShop: me.inShop,
        gold: me.gold,
        items: me.items.length,
        shopOpened: this.shopOpened,
        moved: this.moved,
        points: me.points,
        learned: me.abilities.filter((a) => a.rank > 0).length,
        casts: this.casts,
        hp: (self.hp ?? 0) / (self.mhp ?? 1),
        dead: !!self.dead,
        recalling: !!self.st?.includes('recall'),
        shootieAlone,
        attackMoved: this.attackMoved,
      },
      performance.now() / 1000,
    );
  }

  /** Your teammates still standing, in a steady order. */
  private livingAllies(): number[] {
    return [...this.ents.values()]
      .filter((e) => e.k === 'champion' && e.tm === this.myTeam && e.id !== this.myId && !e.dead)
      .map((e) => e.id)
      .sort((a, b) => a - b);
  }

  /** While you're dead and the camera's locked: glide after your killer, then a teammate. Returns who. */
  private spectate(dt: number, me: EntitySnap | undefined): EntitySnap | undefined {
    const t = performance.now() / 1000;
    const dead = !!me?.dead && !this.finale;
    if (dead && !this.wasDead) {
      const hit = this.lastChampHit;
      this.spectator.start(hit && t - hit.t < 6 ? hit.id : null, t);
    } else if (!dead && this.wasDead) this.spectator.stop();
    this.wasDead = dead;
    let watching: EntitySnap | undefined;
    if (dead && this.camera.locked) {
      const id = this.spectator.pick(t, (id) => !!this.ents.get(id) && !this.ents.get(id)!.dead, this.livingAllies());
      watching = id === null ? undefined : this.ents.get(id);
      if (watching) {
        const k = Math.min(1, dt * 5);
        this.camera.x += (watching.x - this.camera.x) * k;
        this.camera.y += (watching.y - this.camera.y) * k;
      }
    }
    this.hud.setSpectating(watching ? { name: watching.name ?? '', champ: watching.champ, skin: watching.skin, killer: this.spectator.onKiller } : null);
    return watching;
  }

  /** Both teams side by side and a VS, as the match opens (not in practice, with nobody to face). */
  private playIntro(rows: ScoreRow[]): void {
    this.introShown = true;
    if (!rows.some((r) => r.team !== this.myTeam)) return;
    const t = performance.now() / 1000;
    // Old Wick holds his hello until the screen clears.
    this.wickMood.heard(t + INTRO_TIME - 3.5);
    let over = false;
    this.introUp = true;
    const at = (seconds: number, fn: () => void) => setTimeout(() => !over && fn(), seconds * 1000);
    at(0.15, () => this.sound.play('whoosh', 0.5));
    at(0.85, () => {
      this.sound.play('impact', 0.8);
      this.sound.play('horn', 0.35);
    });
    at(1.4, () => this.announcer.say('Welcome to Da Base!', 2));
    showIntro(this.hudRoot, rows, this.myTeam, this.myId, Math.floor(Math.random() * 6), () => {
      over = true;
      this.introUp = false;
      this.wickMood.heard(performance.now() / 1000 - 3.5);
      const me = this.ents.get(this.myId);
      const wick = this.wicks[this.myTeam - 1];
      if (me && wick && Math.hypot(me.x - wick.x, me.y - wick.y) < 650) this.wickSays('greet');
    });
  }

  /** Old Wick: both of them breathe and watch; yours greets you, sees you off, and reacts to your shopping. */
  private updateWicks(dt: number, me: EntitySnap | undefined): void {
    const t = performance.now() / 1000;
    this.wicks.forEach((wick, i) => {
      const team = i + 1;
      let customer: EntitySnap | null = null;
      let best = 800;
      for (const e of this.ents.values()) {
        if (e.k !== 'champion' || e.dead || e.tm !== team) continue;
        const d = Math.hypot(e.x - wick.x, e.y - wick.y);
        if (d < best) [customer, best] = [e, d];
      }
      wick.update(dt, customer);
    });
    if (!me || this.replay) return;
    const mine = this.wicks[this.myTeam - 1];
    const moment = mine && this.wickMood.update(Math.hypot(me.x - mine.x, me.y - mine.y), !!me.dead, t);
    if (moment) this.wickSays(moment);
    this.shopLanded(me);
  }

  /** Old Wick says something: in a bubble over his hood (if he's in sight) and in the shop's header. */
  private wickSays(moment: WickMoment): void {
    const wick = this.wicks[this.myTeam - 1];
    if (!wick) return;
    const line = wickLine(moment, this.wickN++);
    this.hud.wickSays(line);
    this.bubbles.say(WICK_ID - (this.myTeam - 1), line, 0x9b5cff);
    const near = Math.hypot(this.camera.x - wick.x, this.camera.y - wick.y) < 1400;
    const laughs = moment === 'buy' || moment === 'bigBuy' || moment === 'sell' || moment === 'welcomeBack' || moment === 'idle';
    this.sound.play(laughs ? 'chuckle' : 'murmur', near ? 0.7 : 0.4);
    if (laughs) wick.chuckle();
    else wick.showWares(moment === 'greet' ? 3 : 1.5);
  }

  /** A purchase or sale went through: the icon flies to its slot, the new stats rise off you, Wick reacts. */
  private shopLanded(self: EntitySnap): void {
    const me = this.buffer.latest?.me;
    if (!me) return;
    const before = this.lastItems;
    const stats = this.lastStats;
    const mhp = this.lastMhp;
    this.lastItems = [...me.items];
    this.lastStats = { ...me.stats };
    this.lastMhp = self.mhp ?? 0;
    if (!before || !stats) return;
    if (performance.now() / 1000 - this.undoneAt < 1.5) return;
    const { bought, sold } = itemChanges(before, me.items);
    if (!bought.length && !sold.length) return;
    const t = performance.now() / 1000;
    this.wickMood.heard(t);
    for (const { id, slot } of bought) {
      const gains = statGains(stats, me.stats, [mhp, self.mhp ?? 0]);
      this.sound.play('buy', 0.7);
      this.hud.itemBought(id, slot, gains.map((g) => g.key));
      if (!self.dead) this.fx.statLines(self.x, self.y - standHeight(self) - 30, gains.map((g) => g.text));
      this.wickSays(ITEMS[id].tier === 'core' ? 'bigBuy' : 'buy');
    }
    if (!bought.length) {
      for (const { id, slot } of sold) this.hud.itemSold(slot, sellPrice(id));
      this.sound.play('gold', 0.6);
      this.wickSays('sell');
    }
  }

  /** Coming down from a knock-up or a leap: a squash, a ring of dust and a thud. */
  private landed(s: EntitySnap): void {
    (this.views.get(s.id) as UnitView | undefined)?.land?.();
    this.fx.particles.burst(10, { shape: 'smoke', glow: false, x: s.x, y: s.y + s.r * 0.3, life: 0.6, size: s.r * 0.5, size2: s.r * 1.2, color: 0xb9a27c, alpha: 0.45, drag: 0.08 }, [s.r * 1.5, s.r * 3]);
    this.fx.burst(s.x, s.y, 0xd8cfc0, s.r * 2.2);
    this.playCue({ name: 'land', at: s, gain: s.k === 'champion' ? 0.55 : 0.3 });
    if (s.id === this.myId) this.camera.shake(5);
  }

  /** Dust and leaves under anything walking: champions step often, Chuds and monsters less. */
  private footsteps(s: EntitySnap, time: number): void {
    if (s.dead || (s.k !== 'champion' && s.k !== 'chud' && s.k !== 'monster' && s.k !== 'guard') || s.st?.includes('burrowed') || s.st?.includes('underground')) return;
    const last = this.steps.get(s.id);
    if (!last) {
      this.steps.set(s.id, { x: s.x, y: s.y, next: time, left: false });
      return;
    }
    const moved = Math.hypot(s.x - last.x, s.y - last.y);
    const heading = Math.atan2(s.y - last.y, s.x - last.x);
    last.x = s.x;
    last.y = s.y;
    if (moved < 1 || time < last.next) return;
    last.next = time + (s.k === 'champion' ? 0.16 : 0.32);
    const style = this.map.ground.find((p) => shapeContains(p.shape, s.x, s.y))?.style;
    if (style === 'river') return; // the water has its own ripples
    const inBrush = this.visionGrid.brushAt({ x: s.x, y: s.y }) > 0;
    footstep(this.fx, s.x, s.y, s.r, inBrush ? 'brush' : style === 'lane' || style === 'base' ? 'dust' : 'grass');
    // Champions leave footprints in the dirt, left and right in turn (paws for the lion and the rat). In
    // the snow everyone sinks in, everywhere, Chuds too.
    const snow = !!this.weather?.snowy;
    if ((s.k === 'champion' || (snow && s.k === 'chud')) && !inBrush && (snow || style === 'lane' || style === 'jungle')) {
      last.left = !last.left;
      const side = (last.left ? 1 : -1) * s.r * 0.16;
      this.fx.footprint(s.x - Math.sin(heading) * side, s.y + Math.cos(heading) * side, heading, s.r * 0.42, s.champ === 'logan' || s.champ === 'dabber', snow);
    }
  }

  /** In the snow, every champion's breath shows: a little white cloud now and then, out in front. */
  private breathe(): void {
    const now = performance.now() / 1000;
    for (const e of this.ents.values()) {
      if (e.k !== 'champion' || e.dead) continue;
      const next = this.breaths.get(e.id) ?? now + Math.random() * 2;
      if (now >= next) {
        const facing = Math.cos(e.f) < 0 ? -1 : 1;
        this.fx.particles.emit({ shape: 'puff', x: e.x + facing * e.r * 0.4, y: e.y - standHeight(e) * 0.8, vx: facing * 30, vy: -10, drag: 0.4, life: 1.1, size: 5, size2: 16, color: 0xffffff, color2: 0xdfe8f2, alpha: 0.5, glow: false });
      }
      this.breaths.set(e.id, now >= next ? now + 1.8 + Math.random() * 1.2 : next);
    }
  }

  /** The wind: the brush leans from its foot, and (on high graphics) the tree crowns stir. */
  private blowWind(dt: number): void {
    this.wind.update(dt);
    for (const patch of this.sway) patch.skew.x = this.wind.at(patch.x, patch.y) * 0.07;
    const stir = this.level === 0;
    if (stir && !this.leafNoise.parent) {
      this.leafNoise.renderable = false;
      this.leafNoise.scale.set(6);
      this.worldLayer.addChild(this.leafNoise);
    }
    // Autumn turns the leaves.
    const turned = this.weather?.canopyFilter;
    this.canopy.filters = [...(stir ? [this.leaves] : []), ...(turned ? [turned] : [])];
    if (stir) {
      this.leafNoise.x += dt * 30 * this.wind.strength * this.wind.gust();
      this.leafNoise.y += dt * 9 * this.wind.strength;
      this.leaves.scale.set(3 + 4 * this.wind.strength * this.wind.gust());
    }
  }

  /** A Shootie firing: a flash off its crystal (up on the raised top) and sparks toward its target. */
  private shootieFires(s: EntitySnap, target: EntitySnap | undefined): void {
    // From the crystal floating over the tower.
    const x = s.x;
    const y = s.y - crystalHeight(s);
    const color = s.tm === this.myTeam ? 0x7cc4ff : enemyLight();
    this.fx.flash(x, y, 34, color, 0.2, 0.9);
    const a = target ? Math.atan2(target.y - y, target.x - x) : 0;
    this.fx.particles.burst(8, { shape: 'spark', x, y, life: 0.25, size: 14, size2: 3, stretch: 0.05, color: 0xffffff, color2: color, drag: 0.05 }, [250, 500], a, 0.9);
  }

  /**
   * The life of the bases: a horn and a glowing portal when a Chud wave marches out, Oakners springing
   * back with leaves and light, and your Da Base's heart beating when it's in danger.
   */
  private baseLife(): void {
    const latest = this.buffer.latest;
    const next = latest?.nextWave;
    if (next !== undefined && this.lastNextWave !== undefined && this.lastNextWave < 2 && next > this.lastNextWave + 5) this.waveMarches();
    this.lastNextWave = next;
    const now = performance.now() / 1000;
    for (const s of this.ents.values()) {
      if (s.k !== 'structure') continue;
      if (s.dead) this.fallen.add(s.id);
      else if (this.fallen.delete(s.id) && s.role === 'oakner') {
        this.fx.pillar(s.x, s.y, 70, 0x8fd14f, 1.4);
        this.fx.sigil(s.x, s.y, s.r * 2.2, 0x8fd14f, 1.4, 1.5);
        this.fx.particles.burst(30, { shape: 'leaf', glow: false, x: s.x, y: s.y, life: 1.2, size: 16, size2: 10, color: 0x6fae2e, color2: 0x3d6a14, drag: 0.15, ay: 60, spin: 6 }, [150, 420]);
        this.playCue({ name: 'regrow', at: s, gain: 0.7 });
      }
      // Your own Da Base, badly hurt: its heartbeat, in time with the glow.
      if (s.role === 'daBase' && s.tm === this.myTeam && !s.dead) {
        const health = (s.hp ?? 1) / (s.mhp ?? 1);
        if (health < 0.35 && now >= this.nextHeartbeat) {
          this.sound.play('heartbeat', 0.5);
          this.nextHeartbeat = now + 0.55 + health * 1.3;
        }
      }
    }
  }

  /** A Chud wave marching out: a horn, and a glowing portal where each lane's Chuds climb out. */
  private waveMarches(): void {
    this.sound.play('horn', 0.35);
    if (!this.replay && !this.announced.has('chuds')) {
      this.announced.add('chuds');
      this.announcer.say('The Chuds have spawned!', 2);
    }
    const halfW = this.app.screen.width / 2 / this.camera.zoom + 300;
    const halfH = this.app.screen.height / 2 / this.camera.zoom + 300;
    for (const team of [TEAM.blue, TEAM.red] as const) {
      const color = team === this.myTeam ? PALETTE.ally : PALETTE.enemy;
      for (const lane of lanesOf(this.map)) {
        const at = lanePath(this.map, team, lane)[0];
        if (Math.abs(at.x - this.camera.x) > halfW || Math.abs(at.y - this.camera.y) > halfH) continue;
        this.fx.sigil(at.x, at.y, 150, color, 1.8, 2);
        this.fx.pillar(at.x, at.y, 60, color, 1.4);
        this.fx.particles.burst(20, { shape: 'mote', x: at.x, y: at.y, life: 1, size: 10, size2: 2, color: 0xffffff, color2: color, drag: 0.4, ay: -80 }, [60, 200]);
      }
    }
  }

  /** A beam from each Shootie to the champion it's shooting: red when it's one of yours. */
  private drawBeams(): void {
    const g = this.beams.clear();
    const now = performance.now() / 1000;
    for (const [id, shot] of this.towerShots) {
      const s = this.ents.get(id);
      const t = this.ents.get(shot.target);
      if (now > shot.until || !s || !t || s.dead || t.dead) {
        this.towerShots.delete(id);
        continue;
      }
      // From the crystal floating over the tower, to the middle of whoever it's shooting.
      const sx = s.x;
      const sy = s.y - crystalHeight(s);
      const ours = t.tm === this.myTeam;
      const color = ours ? 0xff4a4a : 0x6fb4ff;
      const pulse = 0.75 + 0.25 * Math.sin(now * 12);
      g.moveTo(sx, sy).lineTo(t.x, t.y).stroke({ width: 14, color, alpha: 0.18 * pulse, cap: 'round' });
      g.moveTo(sx, sy).lineTo(t.x, t.y).stroke({ width: 3, color: ours ? 0xffb0a8 : 0xd6ecff, alpha: 0.85 * pulse, cap: 'round' });
      g.circle(t.x, t.y, t.r + 10).stroke({ width: 3, color, alpha: 0.7 * pulse });
      // It's shooting you: its whole reach lights up red (League's turret warning), so you know to get out.
      if (t.id === this.myId && s.role) {
        const reach = STRUCTURE_DEFS[s.role].stats.attackRange + s.r + t.r;
        g.circle(s.x, s.y, reach).stroke({ width: 5, color: 0xff3b3b, alpha: 0.55 * pulse }).fill({ color: 0xff3b3b, alpha: 0.05 * pulse });
      }
    }
  }

  /** Rain that clears up partway through: over half a minute from its moment, then the rain's sound and the wind die down. */
  private clearSkies(): void {
    const w = this.weather;
    if (!w || this.weatherClears === undefined || w.cleared) return;
    const time = this.buffer.latest?.time ?? 0;
    w.setClearing((time - this.weatherClears) / 30);
    if (w.cleared) {
      this.wind.setWeather('clear');
      this.sound.setWeather('clear', this.wind.strength / 0.55);
    }
  }

  /** The announcer's other lines: the Chuds coming, and the Warden waking. */
  private announceMatch(latest: Snapshot | null | undefined): void {
    if (!latest || this.replay || latest.winner) return;
    const next = latest.nextWave;
    // The first wave comes at 0:20: a warning ten seconds before.
    if (!this.announced.has('chudsSoon') && !this.announced.has('chuds') && next !== undefined && next <= 10 && next > 8 && latest.time < 60) {
      this.announced.add('chudsSoon');
      this.announcer.say('Ten seconds until the Chuds spawn.', 1);
    }
    const up = !!latest.warden?.alive;
    if (up && !this.wardenWasUp && latest.time > 60) {
      this.sound.play('epic', 0.7);
      this.hud.announce('THE WARDEN HAS AWOKEN', 'He waits in his pit. Bring friends.', 'neutral', true);
      this.announcer.say('The Warden has awoken!', 3);
    }
    this.wardenWasUp = up;
  }

  /** Champions recalling light up the ground round them, brighter and wider as it builds. */
  private recallLights(): Light[] {
    const out: Light[] = [];
    for (const e of this.ents.values()) {
      if (e.k !== 'champion' || e.dead || !e.st?.includes('recall')) continue;
      const k = (this.views.get(e.id) as UnitView | undefined)?.recallProgress ?? 0;
      out.push({ x: e.x, y: e.y, r: 160 + 280 * k * k, color: 0x7cc4ff, alpha: 0.2 + 0.6 * k * k });
    }
    return out;
  }

  /** Whether (and how) you're hidden right now, shown at the edges of the screen. */
  private showStealth(me: EntitySnap | undefined): void {
    if (!me || me.dead || this.replay) return this.hud.setStealth(0, '');
    const st = me.st ?? [];
    // Marked by a Royal Decree or bleeding from a Maul: everyone can see you anyway.
    if (st.includes('decreed') || st.includes('bleed')) return this.hud.setStealth(0, '');
    const unseen = st.includes('vanished') ? 'Unseen' : st.includes('hazed') ? 'In the haze' : st.includes('underground') ? 'Down below' : st.includes('burrowed') ? 'Burrowed' : '';
    if (unseen) this.hud.setStealth(2, unseen);
    else if (this.visionGrid.brushAt({ x: me.x, y: me.y }) > 0) this.hud.setStealth(1, 'In the grass');
    else this.hud.setStealth(0, '');
  }

  /** Renders the glowing layer (no numbers or bubbles) into a small texture that's blurred over the view. */
  private renderBloom(w: number, h: number): void {
    if (this.level !== 0) return;
    if (this.bloomRt.width !== w || this.bloomRt.height !== h) this.bloomRt.resize(w, h);
    this.fx.top.visible = false;
    this.bubbles.container.visible = false;
    this.app.renderer.render({ container: this.emissive, target: this.bloomRt, clear: true });
    this.fx.top.visible = true;
    this.bubbles.container.visible = true;
  }

  /**
   * Feeds the music how much of a fight you're in, and the soundscape what's around the camera: jungle,
   * river, the Warden's pit and the nearest standing structure. The Sewer Crabs scuttle audibly too.
   */
  private updateSoundscape(): void {
    const now = performance.now() / 1000;
    // The music follows the fight: a skirmish you're in brings the drums in, a teamfight on screen brings
    // everything (brass, taiko, strings, choir).
    let fighting = 0;
    for (const e of this.ents.values()) {
      if (e.k !== 'champion' || e.dead || (this.champFightAt.get(e.id) ?? -9) < now - 4) continue;
      if (Math.hypot(e.x - this.camera.x, e.y - this.camera.y) < 1600) fighting++;
    }
    const mine = now - this.lastFight < 6;
    this.sound.setIntensity(fighting >= 4 ? 1 : fighting >= 3 ? 0.8 : mine ? 0.55 : fighting >= 2 ? 0.35 : 0);
    for (const e of this.ents.values()) {
      if (e.k !== 'monster' || e.mon !== 'crab' || e.dead) continue;
      if (now < (this.skitters.get(e.id) ?? 0)) continue;
      this.skitters.set(e.id, now + 1.1 + Math.random() * 0.9);
      this.playCue({ name: 'crabSkitter', at: e, gain: 0.5 });
    }
    if (now < this.nextPlaceCheck) return;
    this.nextPlaceCheck = now + 0.4;
    let jungle = 0;
    let river = 0;
    const spots = [[0, 0], [-500, 0], [500, 0], [0, -350], [0, 350]];
    for (const [dx, dy] of spots) {
      const x = this.camera.x + dx;
      const y = this.camera.y + dy;
      const style = this.map.ground.find((p) => shapeContains(p.shape, x, y))?.style;
      if (style === 'river') river++;
      else if (style !== 'lane' && style !== 'base') jungle++; // jungle paths and the woods off them
    }
    // The pit drones within a screen or so of the map's center; the crystals hum near a standing structure.
    const pit = this.map.aram ? 0 : Math.max(0, 1 - Math.hypot(this.camera.x - this.map.width / 2, this.camera.y - this.map.height / 2) / 1300);
    let hum = 0;
    for (const s of this.ents.values()) {
      if (s.k !== 'structure' || s.dead) continue;
      hum = Math.max(hum, 1 - Math.hypot(this.camera.x - s.x, this.camera.y - s.y) / 900);
    }
    this.sound.setPlace(jungle / spots.length, river / spots.length, pit, hum);
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
    /** A banner, its sound, and the announcer's line: weight-3 lines are the epic ones, with the big hit under them. */
    const say = (title: string, detail: string, big: boolean, voice?: string, weight: Weight = 1) => {
      this.hud.announce(title, detail, tone, weight === 3);
      if (weight === 3 && !this.replay) this.sound.play('epic', 0.75);
      else this.sound.play(announceSound(ev, big, good), big ? 0.7 : 0.5);
      if (voice && !this.replay) this.announcer.say(voice, weight);
    };
    switch (ev.what) {
      case 'warden':
        return say('THE WARDEN IS SLAIN', `${good ? 'We are' : 'They are'} ${ev.victim.includes('Uprising') ? 'in Uprising!' : 'Unchained'}`, true, 'The Warden has been slain!', 3);
      case 'oakner':
        return say(good ? 'OAKNER FELLED' : 'OAKNER LOST', `${ev.killer} brought down ${good ? 'their' : 'our'} Oakner`, true, good ? 'Oakner felled!' : 'Our Oakner has fallen!', 2);
      case 'outerShootie':
      case 'innerShootie':
      case 'baseShootie':
        return say(good ? 'OBJECTIVE DESTROYED' : 'OBJECTIVE LOST', `${ev.killer} destroyed ${good ? 'their' : 'our'} ${ev.victim}`, true, good ? 'Objective destroyed!' : 'Our Shootie has fallen!', 2);
      case 'daBase':
        return; // the finale speaks for itself
      case 'crab':
        return say('SEWER CRAB TAKEN', `${ev.killer} took the river: ${good ? 'we' : 'they'} can see it now`, false, 'Sewer Crab taken.');
      case 'champion': {
        if (ev.team === TEAM.neutral) return say('EXECUTED', `${ev.victim} fell to ${ev.killer === 'Executed' ? 'the lane' : ev.killer}`, false, 'Executed.');
        const now = this.replay?.time ?? this.buffer.latest?.time ?? 0;
        const last = this.multiKills.get(ev.killer);
        const n = last && now - last.at < 10 ? last.n + 1 : 1;
        this.multiKills.set(ev.killer, { n, at: now });
        const myName = this.ents.get(this.myId)?.name;
        const detail = `${ev.killer} slew ${ev.victim}`;
        const streak = ev.streak ?? 0;
        if (!this.firstBlood) say('FIRST BLOOD', detail, true, 'First blood!', 3);
        else if (n >= 2) say(n === 2 ? 'DOUBLE KILL' : n === 3 ? 'TRIPLE KILL' : 'RAMPAGE', detail, true, n === 2 ? 'Double kill!' : n === 3 ? 'Triple kill!' : 'Rampage!', n === 2 ? 2 : 3);
        else if (ev.shutdown) say('BOUNTY CLAIMED', `${ev.killer} collected ${ev.bounty ? `${ev.bounty}g` : 'the bounty'} on ${ev.victim}`, true, 'Shutdown! Bounty claimed!', 3);
        else if (streak >= 3) {
          const voice = streak === 3 ? `${ev.killer} is on a killing spree!` : streak === 4 ? `${ev.killer} is on a rampage!` : streak === 5 ? `${ev.killer} is unstoppable!` : `${ev.killer} is godlike!`;
          say(streak === 3 ? 'KILLING SPREE' : streak === 4 ? 'RAMPAGE' : streak === 5 ? 'UNSTOPPABLE' : 'GODLIKE', detail, true, voice, streak >= 5 ? 3 : 2);
        } else if (ev.victim === myName) say('YOU HAVE BEEN SLAIN', detail, false, 'You have been slain.', 2);
        else if (ev.killer === myName) say('YOU HAVE SLAIN AN ENEMY', detail, false, 'You have slain an enemy.', 2);
        else say(good ? 'ENEMY SLAIN' : 'ALLY SLAIN', detail, false, good ? 'An enemy has been slain.' : 'An ally has been slain.');
        this.firstBlood = true;
        if (ev.ace) say('ACE', good ? 'Their whole team is down' : 'Our whole team is down', true, 'Ace!', 3);
        return;
      }
    }
  }

  /** Plays a cue where it happened: quieter the further it is from the middle of the screen, panned left or right. */
  /**
   * A champion says something out loud, from where they stand. Grunts wait their turn (a few seconds
   * apart); emotes, ultimates and deaths always speak up.
   */
  /** A Shootie (or an Oakner) falls: the other side's Chuds nearby cheer, and one of them shouts about it. */
  private chudsCheer(fallen: EntitySnap): void {
    let shouted = false;
    for (const e of this.ents.values()) {
      if (e.k !== 'chud' || e.dead || e.tm === fallen.tm || Math.hypot(e.x - fallen.x, e.y - fallen.y) > 900) continue;
      (this.views.get(e.id) as UnitView | undefined)?.cheer?.();
      if (!shouted && e.chud !== 'siege') {
        this.bubbles.say(e.id, CHEERS[Math.floor(Math.random() * CHEERS.length)], e.tm === this.myTeam ? PALETTE.ally : PALETTE.enemy, true);
        shouted = true;
      }
    }
  }

  /**
   * Every so often two Chuds marching side by side (with no one to fight) have words, where you can see
   * them: one mutters something, the other answers back.
   */
  private chudChatter(dt: number): void {
    const now = performance.now() / 1000;
    for (const r of this.replies.filter((r) => r.at <= now)) {
      const e = this.ents.get(r.id);
      if (e && !e.dead) this.bubbles.say(r.id, r.text, e.tm === this.myTeam ? PALETTE.ally : PALETTE.enemy, true);
    }
    this.replies = this.replies.filter((r) => r.at > now);
    this.bickerIn -= dt;
    if (this.bickerIn > 0 || this.replay) return;
    this.bickerIn = 7 + Math.random() * 7;
    const chuds = [...this.ents.values()].filter(
      (e) => e.k === 'chud' && !e.dead && e.chud !== 'siege' && Math.hypot(e.x - this.camera.x, e.y - this.camera.y) < 700,
    );
    const calm = (c: EntitySnap) => ![...this.ents.values()].some((o) => !o.dead && o.tm !== c.tm && (o.k === 'chud' || o.k === 'champion' || o.k === 'structure') && Math.hypot(o.x - c.x, o.y - c.y) < 650);
    for (const a of chuds.sort(() => Math.random() - 0.5)) {
      const b = chuds.find((c) => c !== a && c.tm === a.tm && Math.hypot(c.x - a.x, c.y - a.y) < 140);
      if (!b || !calm(a)) continue;
      const [line, reply] = BICKER[Math.floor(Math.random() * BICKER.length)];
      this.bubbles.say(a.id, line, a.tm === this.myTeam ? PALETTE.ally : PALETTE.enemy, true);
      this.replies.push({ id: b.id, text: reply, at: now + 0.9 });
      return;
    }
  }

  private speak(u: EntitySnap, moment: VoiceMoment, n: number, always = false): void {
    if (!u.champ) return;
    const t = performance.now() / 1000;
    if (!always && t - (this.spokeAt.get(u.id) ?? -Infinity) < 3) return;
    this.spokeAt.set(u.id, t);
    const halfView = this.app.screen.width / 2 / this.camera.zoom;
    const where = spatialize(u.x - this.camera.x, u.y - this.camera.y, halfView);
    const gain = (u.id === this.myId ? 0.75 : 0.6) * where.gain;
    // Their recorded line, if there is one; otherwise the mumble.
    if (this.sound.say(u.champ, moment, n, gain * 1.3, where.pan, where.far)) return;
    this.sound.speak(utterance(u.champ, moment, n), gain, where.pan, where.far);
  }

  /** Plays a cue where it happened: quieter, duller and wetter the further it is from the middle of the screen, panned left or right. */
  private playCue(cue: SoundCue): void {
    if (!cue.at) return this.sound.play(cue.name, cue.gain, 0, 0, cue.take, cue.over);
    const halfView = this.app.screen.width / 2 / this.camera.zoom;
    const where = spatialize(cue.at.x - this.camera.x, cue.at.y - this.camera.y, halfView);
    this.sound.play(cue.name, cue.gain * where.gain, where.pan, where.far, cue.take, cue.over);
  }

  /**
   * The weight under big abilities: a deep impact sound, the music dipping, the screen bending in a ring,
   * a shove and a punch-in, all scaled by how close to the middle of the screen it happened.
   */
  private landHeavy(ev: Extract<GameEvent, { e: 'fx' }>): void {
    const HEAVY: Partial<Record<FxKind, { sound: SoundName; ripple: number; duck: number; punch: number }>> = {
      slam: { sound: 'quake', ripple: 1, duck: 0.5, punch: 0.02 },
      wardenSlam: { sound: 'quake', ripple: 1.3, duck: 0.7, punch: 0.035 },
      deepHands: { sound: 'quake', ripple: 1, duck: 0.6, punch: 0.03 },
      kneel: { sound: 'quake', ripple: 0, duck: 0.5, punch: 0.025 },
      surface: { sound: 'impact', ripple: 0.9, duck: 0.35, punch: 0.015 },
      roar: { sound: 'impact', ripple: 0, duck: 0.35, punch: 0.02 },
      berserk: { sound: 'impact', ripple: 0, duck: 0.3, punch: 0.02 },
      warCry: { sound: 'impact', ripple: 0, duck: 0.25, punch: 0 },
      ascension: { sound: 'quake', ripple: 1, duck: 0.5, punch: 0.03 },
      fondueEruption: { sound: 'quake', ripple: 1, duck: 0.5, punch: 0.03 },
      cloneBoom: { sound: 'impact', ripple: 0.8, duck: 0.3, punch: 0.015 },
      chinCheck: { sound: 'impact', ripple: 0, duck: 0.2, punch: 0.01 },
      decree: { sound: 'impact', ripple: 0, duck: 0.25, punch: 0.015 },
      summon: { sound: 'impact', ripple: 0, duck: 0.2, punch: 0 },
      pounce: { sound: 'impact', ripple: 0, duck: 0, punch: 0 },
      maul: { sound: 'impact', ripple: 0, duck: 0, punch: 0 },
      cleave: { sound: 'impact', ripple: 0, duck: 0, punch: 0 },
    };
    const h = HEAVY[ev.fx];
    if (!h) return;
    // KNEEL! lands out in front of King Rix; everything else where it's centered.
    const at = ev.fx === 'kneel' && ev.x2 !== undefined && ev.y2 !== undefined ? { x: ev.x + (ev.x2 - ev.x) * 0.6, y: ev.y + (ev.y2 - ev.y) * 0.6 } : ev;
    this.playCue({ name: h.sound, at, gain: 0.85 });
    const { width, height } = this.app.screen;
    const halfView = width / 2 / this.camera.zoom;
    const near = Math.max(0, 1 - Math.hypot(at.x - this.camera.x, at.y - this.camera.y) / (halfView * 1.4));
    if (near <= 0.05) return;
    if (h.duck) this.sound.duck(h.duck * near);
    // The camera only reacts to big hits close to your champion (or close to the middle of the screen if
    // you have none), and at most once in a while: a teamfight shouldn't throw the view about.
    const me = this.ents.get(this.myId);
    const close = me && !me.dead ? Math.max(0, 1 - Math.hypot(at.x - me.x, at.y - me.y) / 650) : near * 0.4;
    const t = performance.now() / 1000;
    if (close <= 0.05 || t - this.juicedAt < JUICE_GAP) return;
    this.juicedAt = t;
    if (h.punch) this.camera.punch(h.punch * close);
    const r = (ev.fx === 'kneel' ? 260 : ev.r ?? 200) * h.ripple;
    if (r > 0) this.ripple.start((at.x - this.camera.x) * this.camera.zoom + width / 2, (at.y - this.camera.y) * this.camera.zoom + height / 2, r * this.camera.zoom * 1.8, close * 0.7);
    // Shove the view away from the blast.
    const dx = this.camera.x - at.x;
    const dy = this.camera.y - at.y;
    const d = Math.hypot(dx, dy) || 1;
    this.camera.kick((dx / d) * 8 * close, (dy / d) * 8 * close);
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
    this.landHeavy(ev);
    if (ev.fx === 'wardenMark') {
      // The Warden rears back for the whole warning, then brings it down.
      const warden = [...this.ents.values()].find((e) => e.k === 'monster' && e.mon === 'warden');
      if (warden) (this.views.get(warden.id) as UnitView | undefined)?.play?.(wardenWindup(ev.dur ?? 1));
    }
    playSpell(this.fx, ev, ev.team === this.myTeam);
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  private bindInput(): void {
    const canvas = this.app.canvas;
    // Everything here is let go of when this match's screen is torn down (a rematch builds a new one).
    const signal = this.life.signal;
    const track = (e: PointerEvent | WheelEvent) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = true;
    };
    window.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    window.addEventListener('pointermove', track, { signal });
    document.documentElement.addEventListener('mouseleave', () => (this.mouse.inside = false), { signal });

    canvas.addEventListener('pointerdown', (e) => {
      track(e);
      if (e.button === 0 && this.startPing(e, this.mouseWorld())) return;
      if (e.button === 0 && this.attackMoveArmed) {
        this.attackMoveArmed = false;
        this.attackMoveClick();
        return;
      }
      if (e.button === 2) this.attackMoveArmed = false;
      // Either button on Old Wick opens the shop (and walks you over if you're not at the fountain).
      if ((e.button === 2 || (e.button === 0 && this.aiming === null)) && this.visitWick()) {
        this.aiming = null;
        return;
      }
      if (e.button === 2) {
        this.aiming = null;
        this.rightHeld = true;
        this.rightClick(true);
      } else if (e.button === 0 && this.aiming !== null) {
        this.castAimed();
      }
    }, { signal });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 2) this.rightHeld = false;
      if (e.button === 0 && this.pingWheel.open) {
        const kind = this.pingWheel.finish(e.clientX, e.clientY);
        if (kind && this.pingAt) this.send({ k: 'ping', kind, x: Math.round(this.pingAt.x), y: Math.round(this.pingAt.y) });
        this.pingAt = null;
      }
    }, { signal });
    window.addEventListener('pointermove', (e) => this.pingWheel.move(e.clientX, e.clientY), { signal });
    // Alt on its own can pull focus to the browser's menu bar; it's the ping key here.
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Alt') e.preventDefault();
    }, { signal });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        track(e);
        this.camera.zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
      },
      { passive: false, signal },
    );

    window.addEventListener('keydown', (e) => this.onKey(e, true), { signal });
    window.addEventListener('keyup', (e) => this.onKey(e, false), { signal });
    window.addEventListener('blur', () => {
      this.scoresHeld = false;
      this.rightHeld = false;
      this.aiming = null;
      this.centerHeld = false;
      this.pingKeyHeld = false;
      this.attackMoveArmed = false;
      this.rangeHeld = false;
    }, { signal });
  }

  /**
   * Takes this match's screen down (for a rematch, which builds a fresh one): input let go, the frame loop
   * stopped, the scene and its little renderers destroyed, the weather's sounds hushed.
   */
  destroy(): void {
    this.life.abort();
    for (const off of this.offs) off();
    this.app.ticker.remove(this.tick, this);
    this.app.stage.removeChild(this.view, this.ripple.sprite);
    this.dangle.destroy();
    this.view.destroy({ children: true });
    this.hud.destroy();
    this.sound.setWeather(null, 1);
    this.sound.setPlace(0, 0, 0, 0);
    this.sound.setHaunted(false);
    this.app.canvas.classList.remove('cursor-attack', 'cursor-shop');
  }

  /** What the end screen's Rematch does (`swap`: change sides too). */
  set onRematch(fn: ((swap: boolean) => void) | null) {
    this.hud.onRematch = fn;
  }

  /** The end screen's Rematch: the host can also swap sides. */
  setHost(host: boolean): void {
    this.hud.setRematchHost(host);
  }

  /** Who's asked for a rematch so far. */
  rematchVotes(votes: string[], of: number): void {
    this.hud.rematchVotes(votes, of);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    // Typing (in the chat) isn't playing.
    if (typing(e.target)) return;
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
      // Dead: Space watches the next teammate instead.
      if (down && !e.repeat && this.ents.get(this.myId)?.dead) this.spectator.next(this.livingAllies());
      e.preventDefault();
      return;
    }
    if (e.code === 'Tab') {
      this.scoresHeld = down;
      e.preventDefault();
      return;
    }
    if (e.code === 'KeyC') {
      this.rangeHeld = down;
      return;
    }
    if (!down || e.repeat) return;
    switch (e.code) {
      case 'KeyS':
        this.send({ k: 'stop' });
        this.prediction?.release();
        break;
      case 'KeyA':
        // Attack-move: the next left click picks where.
        this.attackMoveArmed = true;
        this.aiming = null;
        break;
      case 'KeyD':
      case 'KeyF': {
        const slot = activeSlots(this.buffer.latest?.me?.items ?? [])[e.code === 'KeyD' ? 0 : 1];
        if (slot !== undefined) this.useItem(slot, true);
        break;
      }
      case 'KeyB':
        this.aiming = null;
        this.send({ k: 'recall' });
        this.prediction?.release();
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
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
        this.send({ k: 'emote', kind: (['taunt', 'laugh', 'cheer', 'line'] as const)[Number(e.code.slice(5)) - 1] });
        break;
      case 'KeyN':
        this.sound.toggleMusic();
        break;
      case 'KeyH':
        this.hud.toggleHelp();
        break;
      case 'KeyP':
        this.hud.shop.toggle();
        this.sound.play(this.hud.shop.open ? 'shopOpen' : 'shopClose', 0.5);
        break;
      case 'Escape':
        // Esc backs out of whatever's open: aiming, then the shop, then the menu.
        if (this.aiming !== null) this.aiming = null;
        else if (this.attackMoveArmed) this.attackMoveArmed = false;
        else if (this.hud.shop.open) {
          this.hud.shop.toggle(false);
          this.sound.play('shopClose', 0.5);
        } else this.hud.toggleMenu();
        break;
    }
  }

  /** Clicked on your Old Wick: open the shop, and if you're out of reach of it, walk over to him. */
  private visitWick(): boolean {
    const wick = this.wicks[this.myTeam - 1];
    if (!wick || this.replay || !wick.hit(this.mouseWorld())) return false;
    this.hud.shop.toggle(true);
    wick.showWares(2);
    const me = this.ents.get(this.myId);
    if (me && !me.dead && !this.buffer.latest?.me?.inShop) {
      const to = wick.counter;
      this.send({ k: 'move', x: Math.round(to.x), y: Math.round(to.y) });
      this.predictWalk(to);
      this.fx.clickMarker(to.x, to.y, false);
    }
    return true;
  }

  /**
   * Uses the item in an inventory slot. From a hotkey it's aimed at the cursor; clicked on the HUD, where
   * the cursor's on the bar, it goes off where you stand.
   */
  private useItem(slot: number, atCursor: boolean): void {
    const me = this.buffer.latest?.me;
    const id = me?.items[slot];
    const self = this.ents.get(this.myId);
    if (!me || !id || !ACTIVES[id] || !self || self.dead) return;
    if ((me.itemCd?.[slot] ?? 0) > 0) {
      this.sound.play('deny', 0.5);
      return;
    }
    const p = atCursor ? this.mouseWorld() : { x: self.x, y: self.y };
    this.send({ k: 'use', slot, x: Math.round(p.x), y: Math.round(p.y) });
  }

  private rightClick(initial: boolean): void {
    this.holdTimer = HOLD_MOVE_INTERVAL;
    const p = this.mouseWorld();
    const target = this.enemyAt(p);
    if (target) {
      this.send({ k: 'attack', target: target.id });
      this.prediction?.release();
      if (this.prediction) this.pendingTarget = { id: target.id, until: performance.now() / 1000 + 0.8 };
      if (initial) this.fx.clickMarker(target.x, target.y, true);
      return;
    }
    this.send({ k: 'move', x: Math.round(p.x), y: Math.round(p.y) });
    this.predictWalk(p);
    this.pendingTarget = null;
    if (initial) this.fx.clickMarker(p.x, p.y, false);
  }

  /** A (then left click): walk there, fighting the first enemy that comes into reach. Clicking an enemy just attacks it. */
  private attackMoveClick(): void {
    const p = this.mouseWorld();
    const target = this.enemyAt(p);
    if (target) this.send({ k: 'attack', target: target.id });
    else this.send({ k: 'attackMove', x: Math.round(p.x), y: Math.round(p.y) });
    this.attackMoved = true;
    this.prediction?.release();
    this.fx.clickMarker(target?.x ?? p.x, target?.y ?? p.y, true);
  }

  /** Over the network: set off for `to` on screen right away (the host's copy follows a moment later). */
  private predictWalk(to: Vec2): void {
    if (!this.prediction) return;
    const me = this.ents.get(this.myId);
    if (!me || me.dead) return;
    const path = this.finder.find(me, to);
    if (path.length) this.prediction.walk(path);
    else this.prediction.release();
  }

  /** Draws your champion where the prediction has it, rather than where the delayed playback does. */
  private predictSelf(dt: number): void {
    const me = this.ents.get(this.myId);
    const newest = this.buffer.latest?.ents.find((e) => e.id === this.myId);
    if (!me || !newest || !this.prediction) return;
    const free = !me.dead && !me.st?.some((s) => PINNED.has(s));
    const at = this.prediction.update(dt, performance.now() / 1000, me, newest, this.buffer.latest?.me?.stats.ms ?? 330, free);
    if (at.x === me.x && at.y === me.y) return;
    const heading = this.prediction.heading;
    this.ents.set(me.id, { ...me, x: at.x, y: at.y, ...(heading !== null ? { f: heading } : {}) });
  }

  /** Your attack range round you, while C is held or an attack-move waits for its click. */
  private drawReach(me: EntitySnap | undefined): void {
    const g = this.reachRing;
    const mine = this.buffer.latest?.me;
    g.clear();
    if (!me || me.dead || !mine || this.replay || !(this.rangeHeld || this.attackMoveArmed)) return;
    const reach = mine.stats.range + me.r;
    const color = this.attackMoveArmed ? PALETTE.enemy : 0xffffff;
    g.ellipse(me.x, me.y, reach, reach * 0.45).fill({ color, alpha: 0.06 }).stroke({ width: 2.5, color, alpha: 0.55 });
  }

  /**
   * The start of a match: the shop opens by itself while you stand at it with nothing bought, and (if
   * you've turned it on) skill points spend themselves in the order the bots use.
   */
  private startOfMatch(me: EntitySnap | undefined): void {
    const latest = this.buffer.latest;
    const mine = latest?.me;
    if (!me || !mine || !latest || this.replay || me.dead) return;
    if (!this.startShopDone && !this.introUp) {
      this.startShopDone = true;
      if (mine.inShop && mine.items.length === 0 && latest.time < 90 && !this.hud.shop.open) {
        this.hud.shop.toggle(true);
        this.sound.play('shopOpen', 0.5);
      }
    }
    const now = performance.now() / 1000;
    if (settings.autoLevel && mine.points > 0 && me.champ && now >= this.autoLevelAt) {
      const slot = nextSkill(me.champ, mine.abilities.map((a) => a.rank), mine.level);
      if (slot !== null) {
        this.send({ k: 'levelUp', slot });
        this.autoLevelAt = now + 0.4;
      }
    }
  }

  /** Plays your cast on press, before the host's word on it arrives: the wind-up, your mark, the sound, a flash where you aimed. */
  private castNow(slot: Slot, at: Vec2): void {
    const me = this.ents.get(this.myId);
    if (!me?.champ || me.dead) return;
    this.views.get(me.id)?.onCast?.(slot);
    castSignature(this.fx, me, slot);
    this.sound.play(CAST_SOUND[me.champ], 0.5);
    if (this.myInfo?.abilities[slot].targeting.kind !== 'self') this.fx.flash(at.x, at.y, 34, CAST_COLORS[me.champ], 0.25, 0.5);
    this.earlyCast = { slot, at: performance.now() / 1000 };
  }

  /** Whether the host's cast of `slot` is one already shown on press (and forget it, either way it's done). */
  private takeEarlyCast(slot: Slot): boolean {
    const e = this.earlyCast;
    if (!e || e.slot !== slot) return false;
    this.earlyCast = null;
    return performance.now() / 1000 - e.at < 1.5;
  }

  /** Your champion mutters why a cast didn't go (only you hear it, and not every time). */
  private grumble(why: CastFail): void {
    const me = this.ents.get(this.myId);
    if (!me?.champ || me.dead) return;
    const t = performance.now() / 1000;
    if (t - this.grumbledAt < 2.5) return;
    this.grumbledAt = t;
    this.bubbles.say(me.id, failLine(me.champ, why, this.grumbles), 0xe8c46a, true);
    // (A recorded grumble is picked to say the same words: failLineTake.)
    this.speak(me, 'grumble', failLineTake(me.champ, why, this.grumbles++), true);
  }

  private castAimed(): void {
    const slot = this.aiming;
    this.aiming = null;
    if (slot === null || !this.myInfo) return;
    const latest = this.buffer.latest;
    const self = latest?.ents.find((e) => e.id === this.myId);
    const cd = latest?.me?.abilities[slot].cd ?? 0;
    const rank = latest?.me?.abilities[slot].rank ?? 0;
    // A recast (steer, surface, brake): it goes, whatever the cooldown and mana say.
    if (latest?.me?.abilities[slot].recast) {
      const p = this.mouseWorld();
      this.send({ k: 'cast', slot, x: Math.round(p.x), y: Math.round(p.y) });
      return;
    }
    if (rank === 0) {
      this.hud.flash(slot);
      this.hud.nudgeLevel(slot);
      return;
    }
    // Nearly ready: send it anyway, the host holds it until it can go.
    const why: CastFail | null = cd > CAST_QUEUE ? 'cooldown' : (self?.mp ?? 0) < atRank(this.myInfo.abilities[slot].cost, rank) ? 'mana' : null;
    if (why) {
      this.hud.flash(slot);
      this.grumble(why);
      return;
    }
    const p = this.mouseWorld();
    this.send({ k: 'cast', slot, x: Math.round(p.x), y: Math.round(p.y) });
    this.prediction?.release();
    // Over the network, show it going off now rather than a round trip later (if it's ready to go, and
    // isn't one that needs someone to land on: those might walk in first).
    if (this.prediction && cd <= 0 && !NEEDS_TARGET[this.myInfo.id]?.includes(slot)) this.castNow(slot, p);
  }

  /** The enemy under the cursor that a right-click would attack. Shielded structures don't count. */
  private enemyAt(p: Vec2): EntitySnap | null {
    let best: EntitySnap | null = null;
    let bestD = Infinity;
    for (const e of this.ents.values()) {
      const attackable = e.k === 'champion' || e.k === 'chud' || e.k === 'dummy' || e.k === 'monster' || e.k === 'totem' || e.k === 'guard' || (e.k === 'structure' && !e.inv);
      if (!attackable || e.dead || e.tm === this.myTeam) continue;
      // Anything standing up can be clicked anywhere from its feet to its head.
      const h = chestHeight(e) * 1.7;
      const d = h ? segmentDistance(p, e, { x: e.x, y: e.y - h }).d : dist(p, e);
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
    this.app.canvas.classList.toggle('cursor-attack', c === 'attack');
    this.app.canvas.classList.toggle('cursor-shop', c === 'shop');
  }

  /** The match has a winner (a lost connection now is just the end). */
  get over(): boolean {
    return !!this.buffer.latest?.winner;
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
    if (cmd.k === 'move' || cmd.k === 'attack') this.moved = true;
    this.conn.send({ t: 'cmd', cmd });
  }
}
