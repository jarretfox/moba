import type { ChampionId } from '../../shared/champions/types';
import type { EntitySnap } from '../../shared/protocol';
import type { Anim } from './animation';
import { arc } from './draw';
import type { FxLayer } from './fx';
import { CAST_COLORS } from './signatures';
import { chestHeight } from './stature';

// How each champion's basic attack looks: the swing (or the shot leaving the hand) as the blow is thrown,
// and the hit landing on whoever they hit, each in character. The Oak's axe splinters wood and throws a
// comic star, Paris's point is a pinprick of light, Dongmaster's fist lands with a POW and speed lines,
// HunnaG's spores burst softly. Timed to the attack animations in animation.ts so the arc, the weapon's
// glint and the hit come together. Purely cosmetic.

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** Who fights hand to hand. Havarti does too until she's Aged (see `meleeNow`). */
export const MELEE_LOOK: ReadonlySet<ChampionId> = new Set(['barbarian', 'willmore', 'logan', 'dongmaster', 'paris', 'daltonomo']);

/** How fast each ranged champion's basic attack flies (the same numbers as their kits; only the timing of the hit depends on it). */
const SHOT_SPEED: Partial<Record<ChampionId, number>> = { marksman: 2200, hunnag: 1500, kingrix: 1700, dabber: 2000, havarti: 1700, scrimby: 1600, bigwhale: 1400 };

/** The sim throws the blow (or looses the shot) about this long into an attack: a fifth of the attack time. */
const WINDUP = 0.22;

const swings = new Map<number, number>();

/** Which of its swings a unit is on: counts up with each basic attack, so they're played in turn. */
export function nextSwing(id: number): number {
  const n = (swings.get(id) ?? -1) + 1;
  if (swings.size > 500) swings.clear();
  swings.set(id, n);
  return n;
}

/** Whether this attack is a blow by hand rather than a shot (Havarti's reach grows as she ages). */
export function meleeNow(champ: ChampionId, src: EntitySnap, tgt: EntitySnap): boolean {
  if (MELEE_LOOK.has(champ)) return true;
  if (champ !== 'havarti') return false;
  return Math.hypot(tgt.x - src.x, tgt.y - src.y) < src.r + tgt.r + 260;
}

/** One blow, worked out from where the two of them stand. */
export interface Blow {
  fx: FxLayer;
  champ: ChampionId;
  /** Which of the champion's swings this is. */
  swing: number;
  /** Yours: a little bigger and brighter. */
  mine: boolean;
  /** The attacker's hand, out in front at chest height; the middle of their body; and the target's chest. */
  hx: number;
  hy: number;
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  /** The direction and distance from hand to target, and from the body's middle. */
  a: number;
  d: number;
  ca: number;
  /** +1 facing right, −1 left. */
  face: number;
  r: number;
  tr: number;
  color: number;
}

/** How far a swing's arc reaches from the body's middle: out to the target, within arm's length. */
const arcReach = (b: Blow) => Math.min(Math.hypot(b.tx - b.cx, b.ty - b.cy) * 1.05 + b.tr * 0.3, b.r * 3.8);

/** True when a sweep should run the other way so that, whichever way they face, a chop comes down and a backhand goes up. */
const downward = (b: Blow, up: boolean) => up !== b.face < 0;

export function blowAt(fx: FxLayer, champ: ChampionId, src: EntitySnap, t: EntitySnap, swing: number, mine: boolean): Blow {
  const face = Math.cos(src.f) < 0 ? -1 : 1;
  const cx = src.x;
  const cy = src.y - chestHeight(src) * 0.85;
  const hx = cx + face * src.r * 0.6;
  const hy = cy;
  const tx = t.x;
  const ty = t.y - chestHeight(t);
  return { fx, champ, swing, mine, hx, hy, cx, cy, tx, ty, a: Math.atan2(ty - hy, tx - hx), d: Math.hypot(tx - hx, ty - hy), ca: Math.atan2(ty - cy, tx - cx), face, r: src.r, tr: t.r, color: CAST_COLORS[champ] };
}

/**
 * Everything seen of one basic attack, timed to its animation `anim`: the swing (or the shot leaving the
 * hand) as the blow is thrown, and the hit on the target: at once for a blow by hand, after the flight for
 * a shot. `target()` looks the target up again when the hit lands, since it may have moved on (or died).
 */
export function attackLook(fx: FxLayer, src: EntitySnap, tgt: EntitySnap, swing: number, anim: Anim, mine: boolean, target: () => EntitySnap | undefined): void {
  const champ = src.champ;
  if (!champ) return;
  const melee = meleeNow(champ, src, tgt);
  const hitAt = anim.dur * (anim.hit ?? 0.5);
  fx.later(hitAt, () => {
    const t = target() ?? tgt;
    const b = blowAt(fx, champ, src, t, swing, mine);
    LAUNCH[champ](b, melee);
    if (melee) IMPACT[champ](b, true);
  });
  if (melee) return;
  const flight = Math.hypot(tgt.x - src.x, tgt.y - src.y) / (SHOT_SPEED[champ] ?? 1800);
  fx.later(Math.max(hitAt, WINDUP) + flight, () => {
    const t = target();
    if (t && !t.dead) IMPACT[champ](blowAt(fx, champ, src, t, swing, mine), false);
  });
}

/** The blow being thrown: the weapon's arc through the air, or the shot leaving the hand. */
export const LAUNCH: Record<ChampionId, (b: Blow, melee: boolean) => void> = {
  // The axe: a heavy orange arc. The chop comes down, the sweep goes round flat, the backhand rips up.
  barbarian(b) {
    const { fx, swing } = b;
    const reach = arcReach(b);
    const k = b.mine ? 1.15 : 1;
    if (swing % 3 === 1) fx.sweep(b.cx, b.cy + b.r * 0.3, b.ca, reach, 2.0, 0xff8a3d, { life: 0.34, squash: 0.45, width: 0.5 });
    else fx.sweep(b.cx, b.cy, b.ca, reach, 1.6 * k, 0xff8a3d, { life: 0.36, reverse: downward(b, swing % 3 === 2), width: 0.48 });
  },

  // The hook on its chain, flung out at them (and swung down from overhead on the second swing).
  willmore(b) {
    const { fx } = b;
    fx.chain(b.hx, b.hy, b.tx, b.ty, 0.18);
    fx.particles.burst(5, { shape: 'spark', x: b.tx, y: b.ty, life: 0.25, size: 10, size2: 3, stretch: 0.05, color: 0xffe0b0, color2: 0xc8945a }, [120, 260]);
    if (b.swing % 3 === 1) fx.sweep(b.cx, b.cy, b.ca, arcReach(b), 1.5, 0x9aa1ab, { life: 0.3, reverse: downward(b, false), width: 0.3 });
  },

  // Claws: three thin golden arcs raked down or across, or the whole lion lunging in jaws first.
  logan(b) {
    const { fx, swing } = b;
    if (swing % 3 === 2) {
      fx.thrust(b.hx, b.hy, b.a, b.d * 0.8, 0xffc04d, 0.2, 12);
      return;
    }
    const across = swing % 3 === 1;
    const reach = arcReach(b);
    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * b.r * 0.22;
      fx.sweep(b.cx - Math.sin(b.ca) * off, b.cy + Math.cos(b.ca) * off, b.ca, reach * (0.9 + i * 0.05), across ? 1.9 : 1.3, 0xffc04d, { life: 0.28, reverse: downward(b, across), squash: across ? 0.5 : 1, width: 0.16 });
    }
  },

  // A punch: a straight white streak, speed lines trailing the fist. The uppercut goes up.
  dongmaster(b) {
    const { fx, swing } = b;
    const up = swing % 4 === 2;
    const a = up ? b.a - b.face * 0.75 : b.a;
    fx.thrust(b.hx, b.hy, a, b.d * (up ? 0.7 : 0.95), 0xffffff, 0.2, b.mine ? 16 : 13);
    fx.speedLines(b.hx, b.hy, b.r * 1.6, 0xffb070, 5, 0.22, a + Math.PI, 1.2);
  },

  // The point: a long thin line of light to the target. The moulinet is a thin circling cut.
  paris(b) {
    const { fx, swing } = b;
    if (swing % 4 === 2) fx.sweep(b.cx, b.cy, b.ca, arcReach(b), 2.2, 0xdfe6ff, { life: 0.26, reverse: downward(b, false), width: 0.14 });
    else fx.thrust(b.hx, b.hy, b.a, b.d * 1.05, 0xdfe6ff, 0.26, swing % 4 === 1 ? 9 : 7);
  },

  // Two knives: a quick stab, a full twirl of steel, or the knife brought down.
  daltonomo(b) {
    const { fx, swing } = b;
    const n = swing % 4;
    if (n === 1) {
      fx.sweep(b.cx, b.cy + b.r * 0.2, b.ca, b.r * 1.6, Math.PI * 1.7, 0xd8c8f0, { life: 0.3, squash: 0.5, width: 0.22 });
      return;
    }
    if (n === 2) {
      fx.sweep(b.cx, b.cy, b.ca, arcReach(b), 1.1, 0xd8c8f0, { life: 0.26, reverse: downward(b, false), width: 0.2 });
      return;
    }
    fx.thrust(b.hx, b.hy, b.a + 0.12, b.d * 0.9, 0xd8dde6, 0.18, 6);
    fx.thrust(b.hx, b.hy + b.r * 0.15, b.a - 0.12, b.d * 0.8, 0xb98be0, 0.18, 5);
  },

  // The rind blade: a golden arc with a lick of flame; once she's Aged, a flick that sends a cheese bolt.
  havarti(b, melee) {
    const { fx, swing } = b;
    if (melee) {
      const flat = swing % 3 === 1;
      fx.sweep(b.cx, b.cy, b.ca, arcReach(b), flat ? 1.9 : 1.4, 0xffd166, { life: 0.32, reverse: downward(b, swing % 3 === 2), squash: flat ? 0.5 : 1, width: 0.4 });
      fx.particles.burst(5, { shape: 'glow', x: b.tx, y: b.ty, life: 0.4, size: 16, size2: 3, color: 0xfff1b8, color2: 0xff9f43, drag: 0.4 }, [60, 160], -Math.PI / 2, 1.5);
      return;
    }
    fx.flash(b.hx, b.hy, 18, 0xffe29a, 0.15, 0.8);
    fx.particles.burst(4, { shape: 'star', x: b.hx, y: b.hy, life: 0.3, size: 12, size2: 2, color: 0xffffff, color2: 0xffd166, spin: 5 }, [60, 150]);
  },

  // The bowstring snaps forward and hums.
  marksman(b) {
    const { fx } = b;
    const bx = b.hx + b.face * b.r * 0.15;
    fx.custom(0.16, (g, t) => {
      const w = Math.sin(t * 28) * b.r * 0.14 * (1 - t);
      g.moveTo(bx, b.hy - b.r * 0.75).quadraticCurveTo(bx + w * 2, b.hy, bx, b.hy + b.r * 0.75).stroke({ width: 2.5, color: 0xf2efe6, alpha: 0.9 * (1 - t) });
    });
    fx.flash(bx, b.hy, b.mine ? 20 : 14, b.color, 0.12, 0.8);
    fx.particles.burst(3, { shape: 'spark', x: bx, y: b.hy, life: 0.2, size: 8, size2: 2, stretch: 0.05, color: 0xffffff, color2: b.color }, [160, 300], b.a, 0.5);
  },

  // A spore puffs off the orb on the staff.
  hunnag(b) {
    const { fx } = b;
    const ox = b.hx + b.face * b.r * 0.3;
    const oy = b.hy - b.r * 0.9;
    fx.flash(ox, oy, 16, b.color, 0.2, 0.7);
    fx.particles.burst(6, { shape: 'mote', x: ox, y: oy, life: 0.5, size: 9, size2: 2, color: 0xc9f59a, color2: b.color, drag: 0.2 }, [40, 140]);
    fx.particles.emit({ shape: 'ring', x: ox, y: oy, life: 0.35, size: 10, size2: 34, color: 0xc9f59a, alpha: 0.8 });
  },

  // The scepter's orb flares gold.
  kingrix(b) {
    const { fx } = b;
    const ox = b.hx + b.face * b.r * 0.4;
    const oy = b.hy - b.r * 0.5;
    fx.flash(ox, oy, b.mine ? 24 : 18, 0xffd166, 0.18, 0.9);
    fx.particles.burst(4, { shape: 'star', x: ox, y: oy, life: 0.4, size: 16, size2: 2, color: 0xffffff, color2: 0xffd166, spin: 6 }, [50, 140]);
  },

  // A cough of smoke out of the rig.
  dabber(b) {
    const { fx } = b;
    const ox = b.hx + b.face * b.r * 0.5;
    for (let i = 0; i < 3; i++) fx.particles.emit({ shape: 'smoke', x: ox + rand(-6, 6), y: b.hy + rand(-6, 6), vx: Math.cos(b.a) * 60 + rand(-20, 20), vy: -30 + rand(-15, 15), drag: 0.3, life: 0.7, size: 12, size2: 32, color: 0xc8d6b0, color2: 0x5a6a4a, alpha: 0.45 });
    fx.flash(ox, b.hy, 12, 0xffb347, 0.15, 0.7);
  },
  // A subway token spun off the thumb, a glint of brass.
  scrimby(b) {
    const { fx } = b;
    const ox = b.hx + b.face * b.r * 0.3;
    const oy = b.hy - b.r * 0.4;
    fx.flash(ox, oy, b.mine ? 16 : 12, 0xffd166, 0.15, 0.8);
    fx.particles.burst(3, { shape: 'spark', x: ox, y: oy, life: 0.25, size: 10, size2: 2, stretch: 0.05, color: 0xfff1b8, color2: 0xffb04a }, [80, 160]);
  },

  // A coin flicked off the knuckle, glittering.
  bigwhale(b) {
    const { fx } = b;
    const ox = b.hx + b.face * b.r * 0.4;
    const oy = b.hy - b.r * 0.4;
    fx.flash(ox, oy, b.mine ? 20 : 15, 0xffd166, 0.18, 0.85);
    fx.particles.burst(4, { shape: 'star', x: ox, y: oy, life: 0.4, size: 12, size2: 2, color: 0xffffff, color2: 0xffd166, spin: 6 }, [50, 130]);
  },
};

/** The hit landing on the target. */
export const IMPACT: Record<ChampionId, (b: Blow, melee: boolean) => void> = {
  // CHOP: a comic star, a burst of splinters, dust, and the air cracking round the blow.
  barbarian(b) {
    const { fx, tx, ty } = b;
    const s = b.mine ? 1.2 : 1;
    fx.particles.emit({ shape: 'pow', glow: false, x: tx, y: ty, life: 0.2, size: b.tr * 1.6 * s, size2: b.tr * 2.3 * s, color: 0xffb070, rotation: Math.random() * 6, fadeIn: 0.05 });
    fx.speedLines(tx, ty, b.tr * 2.6 * s, 0xff8a3d, 9, 0.28);
    fx.particles.burst(10, { shape: 'shard', glow: false, x: tx, y: ty, life: 0.55, size: 10, size2: 5, color: 0x8a5a2b, drag: 0.1, spin: 12, ay: 420 }, [160, 380], b.a, 2.4);
    fx.particles.burst(8, { shape: 'spark', x: tx, y: ty, life: 0.3, size: 12, size2: 3, stretch: 0.05, color: 0xffe0a0, color2: 0xff5a2a, drag: 0.03 }, [200, 460], b.a, 2.0);
    fx.particles.burst(4, { shape: 'smoke', glow: false, x: tx, y: ty + b.tr * 0.8, life: 0.5, size: 16, size2: 36, color: 0xb9a68a, alpha: 0.35, drag: 0.1 }, [40, 100]);
  },

  // CLANK: the hook rings off them, grey sparks and a bit of junk knocked loose.
  willmore(b) {
    const { fx, tx, ty } = b;
    fx.vibrate(tx, ty, b.tr * 1.2, 0xdfe6ee, 0.3);
    fx.flash(tx, ty, b.tr * 0.9, 0xc8945a, 0.18, 0.6);
    fx.particles.burst(8, { shape: 'spark', x: tx, y: ty, life: 0.3, size: 10, size2: 3, stretch: 0.06, color: 0xffffff, color2: 0x9aa1ab, drag: 0.03 }, [180, 400]);
    fx.particles.burst(3, { shape: 'shard', glow: false, x: tx, y: ty, life: 0.6, size: 9, size2: 6, color: 0x9aa1ab, drag: 0.1, spin: 10, ay: 400 }, [120, 260], -Math.PI / 2, 1.6);
  },

  // Three red claw marks raked across them (or a bite: two rows of teeth snapping shut), and a tuft of fur.
  logan(b) {
    const { fx, tx, ty, swing } = b;
    if (swing % 3 === 2) {
      const s = b.tr * 0.9;
      fx.custom(0.3, (g, t) => {
        const close = easeOut(Math.min(1, t / 0.3));
        const gap = s * (0.9 - 0.75 * close);
        const fade = 1 - Math.max(0, (t - 0.4) / 0.6);
        for (const side of [-1, 1]) {
          const jy = ty + side * gap;
          arc(g, tx, jy - side * s * 0.1, s, side > 0 ? 0.25 : Math.PI + 0.25, side > 0 ? Math.PI - 0.25 : Math.PI * 2 - 0.25).stroke({ width: 6, color: 0x5a3a1a, alpha: 0.9 * fade, cap: 'round' });
          for (let i = -1; i <= 1; i++) {
            const px = tx + i * s * 0.45;
            g.poly([px - s * 0.12, jy, px, jy - side * s * 0.4, px + s * 0.12, jy]).fill({ color: 0xfff6dc, alpha: fade }).stroke({ width: 1.5, color: 0x5a3a1a, alpha: fade });
          }
        }
      });
    } else {
      fx.claws(tx, ty, b.a + (swing % 3 === 1 ? 0.15 : 0.75) * b.face, b.tr * 2.2, 0xff3b3b, 3, 0.4, b.tr * 0.32);
    }
    fx.particles.burst(5, { shape: 'leaf', glow: false, x: tx, y: ty, life: 0.7, size: 10, size2: 7, color: 0xd98a2b, drag: 0.2, ay: 80, spin: 5 }, [80, 200]);
    fx.particles.burst(5, { shape: 'spark', x: tx, y: ty, life: 0.25, size: 10, size2: 3, stretch: 0.05, color: 0xfff1c1, color2: 0xff9f43 }, [150, 320], b.a, 1.6);
  },

  // POW: a big comic star, speed lines, sweat flying, and a knuckle shine.
  dongmaster(b) {
    const { fx, tx, ty } = b;
    const s = b.mine ? 1.25 : 1;
    fx.particles.emit({ shape: 'pow', glow: false, x: tx, y: ty, life: 0.24, size: b.tr * 1.9 * s, size2: b.tr * 2.6 * s, color: 0xfff1b8, rotation: Math.random() * 6, fadeIn: 0.05 });
    fx.speedLines(tx, ty, b.tr * 3 * s, 0xffffff, 11, 0.26);
    fx.particles.burst(7, { shape: 'mote', glow: false, x: tx, y: ty, life: 0.5, size: 8, size2: 4, color: 0x9fd6ff, ay: 500, drag: 0.2 }, [120, 300], b.a, 2.2);
    fx.particles.emit({ shape: 'star', x: tx - Math.cos(b.a) * b.tr * 0.5, y: ty - Math.sin(b.a) * b.tr * 0.5, life: 0.3, size: 24, size2: 4, color: 0xffffff, color2: 0xffd166, spin: 5 });
    fx.flash(tx, ty, b.tr * 1.2, 0xffb070, 0.2, 0.7);
  },

  // Touché: a pinprick of light where the point lands, a thin ring, and a petal.
  paris(b) {
    const { fx, tx, ty } = b;
    fx.burst(tx, ty, 0xffffff, b.tr * 0.9);
    fx.particles.emit({ shape: 'star', x: tx, y: ty, life: 0.3, size: 26, size2: 6, color: 0xffffff, color2: 0xdfe6ff, spin: 3 });
    fx.particles.burst(4, { shape: 'spark', x: tx, y: ty, life: 0.22, size: 9, size2: 2, stretch: 0.05, color: 0xffffff, color2: 0xff8fb0 }, [150, 300], b.a, 1.2);
    fx.particles.emit({ shape: 'leaf', glow: false, x: tx, y: ty, vx: rand(-30, 30), vy: -40, ay: 60, life: 0.9, size: 9, size2: 7, color: 0xff6b8a, spin: 5 });
  },

  // Two knives crossing in an X, the chime of a bell, and a scrap or two of confetti.
  daltonomo(b) {
    const { fx, tx, ty } = b;
    fx.claws(tx, ty, b.a + 0.65, b.tr * 2, 0xd8dde6, 1, 0.32);
    fx.claws(tx, ty, b.a - 0.65, b.tr * 2, 0xb98be0, 1, 0.32);
    fx.particles.emit({ shape: 'star', x: tx, y: ty, life: 0.3, size: 20, size2: 4, color: 0xffffff, color2: 0xffd166, spin: 6 });
    const colors = [0xff6b8a, 0xffd166, 0x7fe3ff, 0x9be15d, 0xb98be0];
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      fx.particles.emit({ shape: 'shard', glow: false, x: tx, y: ty, vx: Math.cos(a) * rand(60, 160), vy: Math.sin(a) * rand(60, 160) - 60, drag: 0.08, ay: 220, life: rand(0.7, 1.1), size: 8, size2: 6, color: colors[i], spin: 12 });
    }
  },

  // The blade bites: crumbs of cheese, a golden flash and a sizzle. The bolt splats molten.
  havarti(b, melee) {
    const { fx, tx, ty } = b;
    fx.flash(tx, ty, b.tr * (melee ? 1.1 : 0.8), 0xffe29a, 0.2, 0.7);
    fx.particles.burst(melee ? 8 : 10, { shape: melee ? 'shard' : 'mote', glow: false, x: tx, y: ty, life: 0.55, size: 9, size2: 5, color: 0xf3dc8a, drag: 0.1, ay: 300, spin: 6 }, [100, 260], b.a, 2.4);
    fx.particles.burst(4, { shape: 'glow', x: tx, y: ty, life: 0.4, size: 14, size2: 3, color: 0xfff1b8, color2: 0xff9f43, drag: 0.4 }, [40, 120], -Math.PI / 2, 1.2);
    if (melee) fx.particles.emit({ shape: 'pow', glow: false, x: tx, y: ty, life: 0.18, size: b.tr * 1.2, size2: b.tr * 1.8, color: 0xfff1b8, rotation: Math.random() * 6, fadeIn: 0.05 });
  },

  // THWIP: the arrow lands with a snap of ice-blue sparks and a flutter of paper.
  marksman(b) {
    const { fx, tx, ty } = b;
    fx.flash(tx, ty, b.tr * 0.9, b.color, 0.15, 0.7);
    fx.particles.burst(4, { shape: 'spark', x: tx, y: ty, life: 0.25, size: 12, size2: 3, stretch: 0.05, color: 0xffffff, color2: b.color, drag: 0.03 }, [200, 380], b.a + Math.PI, 1.2);
    fx.particles.burst(3, { shape: 'shard', glow: false, x: tx, y: ty, life: 0.8, size: 10, size2: 9, color: 0xf6f0e0, drag: 0.2, ay: 90, spin: 5 }, [60, 160]);
    fx.speedLines(tx, ty, b.tr * 1.8, b.color, 4, 0.2, b.a + Math.PI, 1.4);
  },

  // A spore bursts softly on them: rings and a drift of green.
  hunnag(b) {
    const { fx, tx, ty } = b;
    fx.flash(tx, ty, b.tr * 0.9, b.color, 0.25, 0.5);
    for (let i = 0; i < 3; i++) fx.particles.emit({ shape: 'ring', x: tx + rand(-8, 8), y: ty + rand(-8, 8), vy: rand(-40, -10), life: rand(0.35, 0.6), size: 8, size2: 30, color: 0xc9f59a, alpha: 0.8 });
    fx.particles.burst(6, { shape: 'mote', x: tx, y: ty, life: 0.6, size: 9, size2: 2, color: 0xc9f59a, color2: b.color, drag: 0.2, ay: -40 }, [40, 120]);
  },

  // BONK: a gold star and a spill of coins.
  kingrix(b) {
    const { fx, tx, ty } = b;
    fx.particles.emit({ shape: 'pow', glow: false, x: tx, y: ty, life: 0.18, size: b.tr * 1.2, size2: b.tr * 1.7, color: 0xffe29a, rotation: Math.random() * 6, fadeIn: 0.05 });
    fx.particles.burst(5, { shape: 'star', x: tx, y: ty, life: 0.4, size: 14, size2: 2, color: 0xfff1b8, color2: 0xffd166, spin: 6 }, [80, 200]);
    fx.particles.burst(4, { shape: 'mote', glow: false, x: tx, y: ty, life: 0.6, size: 8, size2: 6, color: 0xffd166, ay: 500, drag: 0.2, spin: 8 }, [80, 220], -Math.PI / 2, 1.6);
    fx.flash(tx, ty, b.tr, 0xffd166, 0.18, 0.7);
  },

  // A sticky splat: amber resin dripping, and a puff of smoke.
  dabber(b) {
    const { fx, tx, ty } = b;
    fx.particles.burst(6, { shape: 'mote', glow: false, x: tx, y: ty, life: 0.6, size: 9, size2: 5, color: 0xd98a1e, ay: 300, drag: 0.15 }, [60, 180], b.a, 2.0);
    fx.particles.emit({ shape: 'smoke', x: tx, y: ty, vy: -25, life: 0.7, size: 14, size2: 36, color: 0xc8d6b0, color2: 0x7a8a5a, alpha: 0.4 });
    fx.particles.burst(3, { shape: 'spark', x: tx, y: ty, life: 0.3, size: 10, size2: 3, stretch: 0.08, color: 0xffe2a0, color2: 0xd98a1e }, [80, 200]);
    fx.flash(tx, ty, b.tr * 0.7, 0xffb347, 0.15, 0.6);
  },
  // The token pings off them.
  scrimby(b) {
    const { fx, tx, ty } = b;
    fx.particles.emit({ shape: 'pow', glow: false, x: tx, y: ty, life: 0.16, size: b.tr * 1.1, size2: b.tr * 1.5, color: 0xffd166, rotation: Math.random() * 6, fadeIn: 0.04 });
    fx.particles.burst(5, { shape: 'spark', x: tx, y: ty, life: 0.3, size: 10, size2: 2, stretch: 0.05, color: 0xffffff, color2: 0xffb04a }, [120, 260], b.a, 1.6);
  },

  // Ka-ching: coins bounce off them.
  bigwhale(b) {
    const { fx, tx, ty } = b;
    fx.particles.emit({ shape: 'pow', glow: false, x: tx, y: ty, life: 0.18, size: b.tr * 1.2, size2: b.tr * 1.6, color: 0xffe29a, rotation: Math.random() * 6, fadeIn: 0.05 });
    fx.particles.burst(6, { shape: 'mote', glow: false, x: tx, y: ty, life: 0.6, size: 8, size2: 6, color: 0xffd166, ay: 520, drag: 0.15, spin: 8 }, [80, 220], -Math.PI / 2, 1.6);
  },
};
