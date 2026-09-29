import { Container, Graphics, Text } from 'pixi.js';
import type { EntitySnap } from '../../shared/protocol';

export type Relation = 'self' | 'ally' | 'enemy';

/** Colors are relative to the viewer, like League: you're green, allies blue, enemies red. */
export const PALETTE = {
  ally: 0x3d8bfd,
  enemy: 0xe5484d,
  selfHp: 0x4ade80,
  mana: 0x5aa9ff,
  dummy: 0xb58b52,
  outline: 0x0b0f14,
} as const;

export interface EntityView {
  readonly container: Container;
  update(s: EntitySnap, dt: number): void;
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

  constructor(s: EntitySnap, private readonly relation: Relation) {
    const r = s.r;
    const color = s.k === 'dummy' ? PALETTE.dummy : relation === 'enemy' ? PALETTE.enemy : PALETTE.ally;

    this.body.circle(4, 6, r).fill({ color: 0x000000, alpha: 0.35 });
    this.body.circle(0, 0, r).fill(color).stroke({ width: 3, color: relation === 'self' ? 0xffffff : PALETTE.outline });
    if (s.k === 'dummy') {
      this.body.circle(0, 0, r * 0.62).stroke({ width: 5, color: PALETTE.enemy });
      this.body.circle(0, 0, r * 0.24).fill(PALETTE.enemy);
    } else {
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
    this.body.scale.set(1 + this.pulse * 0.08);

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
    const w = s.k === 'champion' ? 84 : 70;
    const h = 9;
    const x = -w / 2;
    const y = -s.r - 20;
    const showMana = this.relation !== 'enemy' && (s.mmp ?? 0) > 0;
    const hpColor = this.relation === 'self' ? PALETTE.selfHp : this.relation === 'ally' ? PALETTE.ally : PALETTE.enemy;
    const mhp = s.mhp ?? 1;

    g.rect(x - 2, y - 2, w + 4, h + 4 + (showMana ? 6 : 0)).fill({ color: 0x000000, alpha: 0.75 });
    g.rect(x, y, (w * Math.max(0, s.hp ?? 0)) / mhp, h).fill(hpColor);
    // A notch every 100 health so big and small health pools read differently at a glance.
    for (let v = 100; v < mhp; v += 100) {
      g.rect(x + (w * v) / mhp, y, 1, v % 1000 === 0 ? h : h * 0.5).fill({ color: 0x000000, alpha: 0.55 });
    }
    if (showMana) g.rect(x, y + h + 2, (w * (s.mp ?? 0)) / (s.mmp ?? 1), 4).fill(PALETTE.mana);
  }

  private drawStatus(s: EntitySnap): void {
    const g = this.statusRing.clear();
    const st = s.st ?? [];
    const r = s.r;
    if (st.includes('root')) g.circle(0, 0, r + 9).stroke({ width: 6, color: 0x8b5a2b, alpha: 0.95 });
    if (st.includes('stun')) g.circle(0, 0, r + 14).stroke({ width: 4, color: 0xffd166 });
    if (st.includes('slow')) g.circle(0, 0, r + 5).stroke({ width: 3, color: 0x9bd4ff, alpha: 0.8 });
  }
}

export class ProjectileView implements EntityView {
  readonly container = new Graphics();

  constructor(s: EntitySnap) {
    const g = this.container;
    switch (s.vis) {
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
