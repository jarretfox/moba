import { TEAM, type PlayerTeam } from '../constants';
import { Champion } from '../champions/champion';
import { add, dirTo, scale, type Vec2 } from '../math';
import type { EntitySnap } from '../protocol';
import { Unit, type Stats } from './unit';
import { Ward } from './ward';
import type { World, WorldSystem } from './world';

// ─── Tuning: the Sewer Crab ───────────────────────────────────────────────────

/**
 * A river objective. A Sewer Crab scuttles up and down each half of the river; it never fights back, it
 * just runs. Whoever takes it gets a little gold, a burst of speed, and their team keeps an eye on that
 * stretch of river for a while.
 */
export const CRAB = {
  /** First one at 2:30; another this long after each is taken. */
  firstAt: 150,
  respawn: 150,
  gold: 70,
  xp: 90,
  /** Vision left behind at the spot: radius and seconds. */
  sight: 900,
  sightFor: 90,
  /** The taker's burst of speed. */
  speed: 0.3,
  speedFor: 5,
  /** How far up and down the river from its spot it wanders. */
  wander: 280,
};

const CRAB_STATS: Stats = { maxHp: 900, hpRegen: 0, maxMana: 0, manaRegen: 0, ad: 0, ap: 0, armor: 30, mr: 30, attackSpeed: 0, attackRange: 0, moveSpeed: 230 };

/** Where the crabs live: the middle of the river, above and below the Warden's pit. */
export function crabSpots(world: World): Vec2[] {
  const { width, height } = world.map;
  return [
    { x: width / 2, y: 2250 },
    { x: width / 2, y: height - 2250 },
  ];
}

export class Crab extends Unit {
  readonly kind = 'monster';
  private goingUp = Math.random() < 0.5;

  constructor(world: World, readonly home: Vec2) {
    super(world.newId(), TEAM.neutral, home, 40, { ...CRAB_STATS }, 'Sewer Crab');
  }

  /** Up and down its stretch of river; hit, it scurries off the other way, fast. */
  protected think(world: World): void {
    const scared = world.time - this.lastDamagedAt < 2;
    if (scared && !this.has('speed')) this.addStatus(world, 'speed', 2, 0.5);
    if (this.order.kind !== 'idle') return;
    this.goingUp = !this.goingUp;
    this.commandMove(world, add(this.home, { x: (Math.random() - 0.5) * 120, y: (this.goingUp ? -1 : 1) * CRAB.wander }));
  }

  /** Something hit it: off it goes, away from whoever it was. */
  onDamaged(world: World, source: Unit | null, _amount: number): void {
    if (!source || this.dead) return;
    const away = add(this.pos, scale(dirTo(source.pos, this.pos), 220));
    const y = Math.max(this.home.y - CRAB.wander, Math.min(this.home.y + CRAB.wander, away.y));
    this.commandMove(world, { x: this.home.x + Math.max(-150, Math.min(150, away.x - this.home.x)), y });
  }

  protected respawnDelay(): number {
    return Infinity; // a fresh one comes along (see CrabSpawner)
  }

  die(world: World, killer: Unit | null): void {
    super.die(world, killer);
    world.schedule(1.5, () => (this.removed = true));
  }

  snapshot(world: World): EntitySnap {
    return { ...super.snapshot(world), mon: 'crab' };
  }
}

/** Taking a crab: gold and a burst of speed for the taker, and vision of that stretch of river for their team. */
export function rewardCrab(world: World, crab: Crab, source: Unit | null, helpers: Unit[]): void {
  const taker = source instanceof Champion ? source : helpers.find((h): h is Champion => h instanceof Champion);
  if (!taker) return;
  taker.score.cs++;
  taker.gainGold(world, CRAB.gold);
  taker.gainXp(world, CRAB.xp);
  taker.addStatus(world, 'speed', CRAB.speedFor, CRAB.speed);
  world.add(new Ward(world, taker.team, { ...crab.home }, CRAB.sight, CRAB.sightFor, 'crab'));
  const team = taker.team as PlayerTeam;
  world.emit({ e: 'kill', killer: taker.name, victim: 'Sewer Crab', team, what: 'crab', killerChamp: taker.info.id, killerSkin: taker.skin });
}

/** Puts a crab in each half of the river at 2:30, and another a while after each one's taken. */
export class CrabSpawner implements WorldSystem {
  private readonly spots: { home: Vec2; crab: Crab | null; nextAt: number }[];

  constructor(world: World) {
    this.spots = crabSpots(world).map((home) => ({ home, crab: null, nextAt: CRAB.firstAt }));
  }

  update(world: World): void {
    for (const spot of this.spots) {
      if (spot.crab && spot.crab.dead) {
        spot.crab = null;
        spot.nextAt = world.time + CRAB.respawn;
      }
      if (!spot.crab && world.time + 1e-9 >= spot.nextAt) spot.crab = world.add(new Crab(world, spot.home));
    }
  }

  /** The crabs out right now (for tests and bots). */
  crabs(): Crab[] {
    return this.spots.flatMap((s) => (s.crab && !s.crab.dead ? [s.crab] : []));
  }
}
