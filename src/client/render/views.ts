import { Container, Graphics, Text } from 'pixi.js';
import { CHAMPION_INFO } from '../../shared/champions/registry';
import type { ChudType, EntitySnap } from '../../shared/protocol';
import { STRUCTURE_DEFS } from '../../shared/sim/structure';

export type Relation = 'self' | 'ally' | 'enemy';

/** Colors are relative to the viewer, like League: you're green, allies blue, enemies red. */
export const PALETTE = {
  ally: 0x3d8bfd,
  enemy: 0xe5484d,
  selfHp: 0x4ade80,
  mana: 0x5aa9ff,
  rage: 0xff6b3d,
  dummy: 0xb58b52,
  outline: 0x0b0f14,
  invulnerable: 0x8a93a0,
  stone: 0x59606c,
  stoneDark: 0x3a3f48,
  bark: 0x6b4a2b,
  leaf: 0x3f7a35,
  leafDark: 0x2c5a26,
} as const;

/** What a view might need to know beyond its own entity. */
export interface ViewContext {
  /** The viewer's champion, if alive. */
  me: EntitySnap | undefined;
}

export interface EntityView {
  readonly container: Container;
  update(s: EntitySnap, dt: number, ctx: ViewContext): void;
  onAttack?(): void;
}

export class UnitView implements EntityView {
  readonly container = new Container();
  private readonly body = new Graphics();
  private readonly facing = new Graphics();
  private readonly statusRing = new Graphics();
  private readonly bars = new Graphics();
  private readonly label: Text;
  private barKey = '';
  private statusKey = '';
  private pulse = 0;
  private air = 0;
  /** The radius the body was drawn at; Berserk grows the real one. */
  private readonly baseR: number;
  private readonly resourceColor: number;

  constructor(s: EntitySnap, private readonly relation: Relation) {
    const r = s.r;
    this.baseR = r;
    this.resourceColor = s.champ && CHAMPION_INFO[s.champ].resource === 'rage' ? PALETTE.rage : PALETTE.mana;
    const color = s.k === 'dummy' ? PALETTE.dummy : relation === 'enemy' ? PALETTE.enemy : PALETTE.ally;

    this.body.circle(4, 6, r).fill({ color: 0x000000, alpha: 0.35 });
    if (s.k === 'chud') {
      // Chuds turn to face what they're fighting, so the whole figure lives on the rotating layer.
      drawChud(this.facing, s.chud ?? 'melee', r, color);
    } else if (s.k === 'dummy') {
      this.body.circle(0, 0, r).fill(color).stroke({ width: 3, color: PALETTE.outline });
      this.body.circle(0, 0, r * 0.62).stroke({ width: 5, color: PALETTE.enemy });
      this.body.circle(0, 0, r * 0.24).fill(PALETTE.enemy);
    } else {
      this.body.circle(0, 0, r).fill(color).stroke({ width: 3, color: relation === 'self' ? 0xffffff : PALETTE.outline });
      this.body.circle(0, 0, r * 0.55).fill({ color: 0xffffff, alpha: 0.12 });
      this.facing.poly([r - 6, -10, r + 12, 0, r - 6, 10]).fill(0xffffff).stroke({ width: 2, color: PALETTE.outline });
    }

    this.label = new Text({
      text: s.name ?? '',
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 13, fontWeight: '600', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } },
    });
    this.label.anchor.set(0.5, 1);
    this.label.position.set(0, -r - 24);

    this.container.addChild(this.statusRing, this.body, this.facing, this.bars, this.label);
  }

  update(s: EntitySnap, dt: number): void {
    this.container.visible = !s.dead;
    this.container.position.set(s.x, s.y);
    this.facing.rotation = s.f;

    this.pulse = Math.max(0, this.pulse - dt * 6);
    // Leaping units swell toward the camera and settle back as they land.
    const airborne = s.st?.includes('airborne') ?? false;
    this.air = airborne ? Math.min(1, this.air + dt * 8) : Math.max(0, this.air - dt * 8);
    const size = (s.r / this.baseR) * (1 + this.pulse * 0.08) * (1 + this.air * 0.3);
    this.body.scale.set(size);
    this.facing.scale.set(size);

    const barKey = `${s.hp}|${s.mhp}|${s.mp}|${s.mmp}`;
    if (barKey !== this.barKey) {
      this.barKey = barKey;
      this.drawBars(s);
    }
    const statusKey = (s.st ?? []).join();
    if (statusKey !== this.statusKey) {
      this.statusKey = statusKey;
      this.drawStatus(s);
    }
  }

  onAttack(): void {
    this.pulse = 1;
  }

  private drawBars(s: EntitySnap): void {
    const g = this.bars.clear();
    const w = s.k === 'champion' ? 84 : s.k === 'chud' ? 44 : 70;
    const h = s.k === 'chud' ? 5 : 9;
    const x = -w / 2;
    const y = -s.r - (s.k === 'chud' ? 12 : 20);
    const showMana = this.relation !== 'enemy' && (s.mmp ?? 0) > 0;
    const hpColor = this.relation === 'self' ? PALETTE.selfHp : this.relation === 'ally' ? PALETTE.ally : PALETTE.enemy;
    const mhp = s.mhp ?? 1;

    g.rect(x - 2, y - 2, w + 4, h + 4 + (showMana ? 6 : 0)).fill({ color: 0x000000, alpha: 0.75 });
    g.rect(x, y, (w * Math.max(0, s.hp ?? 0)) / mhp, h).fill(hpColor);
    // A notch every 100 health so big and small health pools read differently at a glance.
    for (let v = 100; s.k !== 'chud' && v < mhp; v += 100) {
      g.rect(x + (w * v) / mhp, y, 1, v % 1000 === 0 ? h : h * 0.5).fill({ color: 0x000000, alpha: 0.55 });
    }
    if (showMana) g.rect(x, y + h + 2, (w * (s.mp ?? 0)) / (s.mmp ?? 1), 4).fill(this.resourceColor);
  }

  private drawStatus(s: EntitySnap): void {
    const g = this.statusRing.clear();
    const st = s.st ?? [];
    const r = s.r;
    if (st.includes('root')) g.circle(0, 0, r + 9).stroke({ width: 6, color: 0x8b5a2b, alpha: 0.95 });
    if (st.includes('stun')) g.circle(0, 0, r + 14).stroke({ width: 4, color: 0xffd166 });
    if (st.includes('slow')) g.circle(0, 0, r + 5).stroke({ width: 3, color: 0x9bd4ff, alpha: 0.8 });
    if (st.includes('weaken')) g.circle(0, 0, r + 18).stroke({ width: 2, color: 0xb57bff, alpha: 0.7 });
    if (st.includes('berserk')) g.circle(0, 0, r + 8).fill({ color: 0xff3b30, alpha: 0.18 }).stroke({ width: 5, color: 0xff3b30, alpha: 0.75 });
    if (st.includes('recall')) g.circle(0, 0, r + 22).fill({ color: 0x7cc4ff, alpha: 0.12 }).stroke({ width: 4, color: 0x7cc4ff, alpha: 0.8 });
  }
}

export class ProjectileView implements EntityView {
  readonly container = new Graphics();

  constructor(s: EntitySnap, relation: Relation) {
    const g = this.container;
    switch (s.vis) {
      case 'shootie': {
        const color = relation === 'enemy' ? PALETTE.enemy : PALETTE.ally;
        g.circle(0, 0, 22).fill({ color, alpha: 0.3 });
        g.circle(0, 0, 13).fill(color);
        g.circle(0, 0, 6).fill(0xffffff);
        break;
      }
      case 'pebble':
        g.circle(0, 0, 6).fill(0xa3a3a3).stroke({ width: 1.5, color: 0x333333 });
        break;
      case 'boulder':
        g.circle(0, 0, 14).fill(0x7d7d7d).stroke({ width: 2, color: 0x333333 });
        g.circle(-4, -4, 4).fill({ color: 0xffffff, alpha: 0.2 });
        break;
      case 'arrowHeavy':
        g.rect(-30, -6, 44, 12).fill({ color: 0xffc94d, alpha: 0.35 });
        g.rect(-24, -2.5, 34, 5).fill(0xffe7a3);
        g.poly([10, -7, 22, 0, 10, 7]).fill(0xffe7a3);
        break;
      case 'bolt':
        g.rect(-52, -9, 72, 18).fill({ color: 0x7fe3ff, alpha: 0.28 });
        g.rect(-44, -4, 60, 8).fill(0xe8fbff);
        break;
      case 'longshot':
        g.ellipse(-20, 0, 110, s.r).fill({ color: 0xff8a3d, alpha: 0.3 });
        g.ellipse(0, 0, 70, s.r * 0.45).fill({ color: 0xffb070, alpha: 0.8 });
        g.ellipse(10, 0, 40, s.r * 0.2).fill(0xfff1dc);
        break;
      default: // 'arrow'
        g.rect(-20, -1.5, 26, 3).fill(0xf3e2b3);
        g.poly([6, -5, 14, 0, 6, 5]).fill(0xf3e2b3);
    }
  }

  update(s: EntitySnap): void {
    this.container.position.set(s.x, s.y);
    this.container.rotation = s.f;
  }
}

export class TrapView implements EntityView {
  readonly container = new Graphics();

  constructor(s: EntitySnap, relation: Relation) {
    const color = relation === 'enemy' ? PALETTE.enemy : 0xd9c27a;
    const pts: number[] = [];
    const spikes = 10;
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = i % 2 === 0 ? s.r : s.r * 0.55;
      pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    this.container.poly(pts).fill({ color, alpha: 0.35 }).stroke({ width: 3, color });
    this.container.circle(0, 0, s.r * 0.25).fill(color);
  }

  update(s: EntitySnap): void {
    this.container.position.set(s.x, s.y);
    this.container.alpha = s.armed ? 1 : 0.4;
  }
}

/** Shooties, Oakners and Da Base. The body is redrawn only when it changes state (standing, shielded, fallen). */
export class StructureView implements EntityView {
  readonly container = new Container();
  private readonly range = new Graphics();
  private readonly body = new Graphics();
  private readonly bars = new Graphics();
  private readonly note: Text;
  private bodyKey = '';
  private barKey = '';
  private rangeShown = false;

  constructor(s: EntitySnap, private readonly relation: Relation) {
    this.note = new Text({
      text: '',
      style: { fontFamily: 'system-ui, sans-serif', fontSize: 15, fontWeight: '800', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } },
    });
    this.note.anchor.set(0.5, 0);
    this.note.position.set(0, s.r + 12);
    this.container.addChild(this.range, this.body, this.bars, this.note);
    this.container.position.set(s.x, s.y);
  }

  update(s: EntitySnap, _dt: number, ctx: ViewContext): void {
    const bodyKey = `${s.dead ? 'fallen' : 'up'}|${s.inv ? 'shielded' : ''}`;
    if (bodyKey !== this.bodyKey) {
      this.bodyKey = bodyKey;
      this.drawBody(s);
    }
    const barKey = s.dead ? 'fallen' : `${s.hp}|${s.mhp}|${s.inv ? 1 : 0}`;
    if (barKey !== this.barKey) {
      this.barKey = barKey;
      this.drawBars(s);
    }
    const note = s.regrow ? `Regrows in ${clock(s.regrow)}` : s.role === 'daBase' && !s.dead ? 'DA BASE' : '';
    if (this.note.text !== note) this.note.text = note;
    this.updateRange(s, ctx.me);
  }

  /** Enemy Shooties show their reach when you get close, like League's tower range. */
  private updateRange(s: EntitySnap, me: EntitySnap | undefined): void {
    const attackRange = s.role ? STRUCTURE_DEFS[s.role].stats.attackRange : 0;
    const reach = attackRange + s.r + (me?.r ?? 0);
    const show = !s.dead && this.relation === 'enemy' && attackRange > 0 && !!me && Math.hypot(me.x - s.x, me.y - s.y) < reach + 400;
    if (show === this.rangeShown) return;
    this.rangeShown = show;
    this.range.clear();
    if (show) this.range.circle(0, 0, reach).fill({ color: PALETTE.enemy, alpha: 0.06 }).stroke({ width: 3, color: PALETTE.enemy, alpha: 0.55 });
  }

  private drawBody(s: EntitySnap): void {
    const g = this.body.clear();
    const r = s.r;
    const team = this.relation === 'enemy' ? PALETTE.enemy : PALETTE.ally;
    if (s.dead) {
      if (s.role === 'oakner') drawStump(g, r);
      else drawRubble(g, r);
      return;
    }
    if (s.role === 'oakner') drawOakner(g, r, team);
    else if (s.role === 'daBase') drawDaBase(g, r, team);
    else drawShootie(g, r, team);
    if (s.inv) g.circle(0, 0, r + 12).stroke({ width: 5, color: 0xdfe6ee, alpha: 0.35 });
  }

  private drawBars(s: EntitySnap): void {
    const g = this.bars.clear();
    if (s.dead) return;
    const w = s.role === 'daBase' ? 180 : 120;
    const h = 10;
    const x = -w / 2;
    const y = -s.r - 26;
    const mhp = s.mhp ?? 1;
    const color = s.inv ? PALETTE.invulnerable : this.relation === 'enemy' ? PALETTE.enemy : PALETTE.ally;
    g.rect(x - 2, y - 2, w + 4, h + 4).fill({ color: 0x000000, alpha: 0.75 });
    g.rect(x, y, (w * Math.max(0, s.hp ?? 0)) / mhp, h).fill(color);
    for (let v = 500; v < mhp; v += 500) g.rect(x + (w * v) / mhp, y, 1, h * 0.5).fill({ color: 0x000000, alpha: 0.55 });
  }
}

const CHUD_SKIN = 0x87916c;
const CHUD_BRUTE_SKIN = 0x6c7652;
const CHUD_EYES = 0xffe066;

/** Hunched tunnel-dwellers in team-colored hoods, drawn facing +x. */
function drawChud(g: Graphics, type: ChudType, r: number, team: number): void {
  const outline = { width: 2, color: PALETTE.outline };
  if (type === 'siege') {
    // A rickety cart with a boulder loaded up front and the team's banner at the back.
    g.roundRect(-r, -r * 0.75, r * 1.8, r * 1.5, 6).fill(PALETTE.bark).stroke(outline);
    g.rect(-r * 0.95, -r * 0.8, r * 0.45, r * 1.6).fill(team);
    g.circle(r * 0.35, 0, r * 0.45).fill(0x8d8d8d).stroke(outline);
    return;
  }
  if (type === 'brute') {
    // Spikes poking out of a team-colored helmet, and a club the size of a regular Chud.
    const spikes: number[] = [];
    for (let i = 0; i < 14; i++) {
      const a = Math.PI / 2 + (i / 13) * Math.PI;
      const rr = i % 2 === 0 ? r * 1.25 : r * 0.95;
      spikes.push(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.poly(spikes).fill(team).stroke(outline);
  }
  g.circle(0, 0, r).fill(type === 'brute' ? CHUD_BRUTE_SKIN : CHUD_SKIN).stroke(outline);
  g.moveTo(0, 0).arc(0, 0, r, Math.PI / 2, Math.PI * 1.5).closePath().fill(team); // hood over the back
  g.circle(r * 0.45, -r * 0.28, r * 0.14).fill(CHUD_EYES);
  g.circle(r * 0.45, r * 0.28, r * 0.14).fill(CHUD_EYES);
  if (type === 'melee' || type === 'brute') g.roundRect(r * 0.25, r * 0.55, r * 1.0, r * 0.3, 3).fill(PALETTE.bark).stroke(outline); // club
  else g.circle(r * 1.05, 0, r * 0.3).fill(0x6e6e6e).stroke(outline); // stone ready in the sling
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function regularPolygon(sides: number, radius: number, rotation = 0, cx = 0, cy = 0): number[] {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2;
    pts.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
  }
  return pts;
}

function drawShadow(g: Graphics, r: number): void {
  g.circle(6, 9, r).fill({ color: 0x000000, alpha: 0.35 });
}

function drawShootie(g: Graphics, r: number, team: number): void {
  drawShadow(g, r);
  g.poly(regularPolygon(8, r, Math.PI / 8)).fill(PALETTE.stone).stroke({ width: 4, color: PALETTE.stoneDark });
  g.poly(regularPolygon(8, r * 0.7, Math.PI / 8)).fill(PALETTE.stoneDark);
  g.circle(0, 0, r * 0.45).fill(team).stroke({ width: 3, color: PALETTE.outline });
  g.circle(0, 0, r * 0.17).fill({ color: 0xffffff, alpha: 0.85 });
}

function drawOakner(g: Graphics, r: number, team: number): void {
  drawShadow(g, r);
  g.circle(0, 0, r + 6).stroke({ width: 5, color: team });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.circle(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.5).fill(i % 2 ? PALETTE.leaf : PALETTE.leafDark);
  }
  g.circle(0, 0, r * 0.45).fill(PALETTE.leaf);
  g.circle(0, 0, r * 0.16).fill(team);
}

function drawStump(g: Graphics, r: number): void {
  const ring = { width: 2, color: 0x3d2a18, alpha: 0.7 };
  g.circle(0, 0, r * 0.5).fill(PALETTE.bark).stroke({ width: 3, color: 0x3d2a18 });
  g.circle(0, 0, r * 0.32).stroke(ring);
  g.circle(0, 0, r * 0.15).stroke(ring);
}

function drawDaBase(g: Graphics, r: number, team: number): void {
  drawShadow(g, r);
  g.poly(regularPolygon(6, r)).fill(PALETTE.stoneDark).stroke({ width: 6, color: PALETTE.outline });
  g.poly(regularPolygon(6, r * 0.78)).fill(team).stroke({ width: 4, color: PALETTE.outline, alpha: 0.6 });
  g.poly(regularPolygon(6, r * 0.45, Math.PI / 6)).fill(PALETTE.stone);
  g.circle(0, 0, r * 0.2).fill({ color: 0xffffff, alpha: 0.9 });
}

/** Fixed pattern so a fallen structure's rubble doesn't reshuffle every redraw. */
const RUBBLE: [number, number, number][] = [
  [-0.4, -0.2, 0.28],
  [0.3, -0.35, 0.22],
  [0.1, 0.35, 0.3],
  [-0.35, 0.4, 0.18],
  [0.45, 0.15, 0.2],
];

function drawRubble(g: Graphics, r: number): void {
  g.circle(0, 0, r * 0.9).fill({ color: PALETTE.stoneDark, alpha: 0.6 });
  RUBBLE.forEach(([x, y, size], i) => g.poly(regularPolygon(5, r * size, i, x * r, y * r)).fill(PALETTE.stone));
}
