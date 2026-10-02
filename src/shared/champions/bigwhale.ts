import type { PlayerTeam, Slot } from '../constants';
import { add, dirTo, dist, scale, type Vec2 } from '../math';
import { HomingProjectile, LineProjectile } from '../sim/projectile';
import { enemiesInRadius } from '../sim/query';
import type { Stats, Unit } from '../sim/unit';
import type { World } from '../sim/world';
import { Champion } from './champion';
import { perRank, type ChampionInfo, type StatGrowth } from './types';

// Big Whale: a very rich whale in a yacht blazer, gold chains and sunglasses, who has bought his way into
// every room in the realm and been asked to leave most of them. He doesn't notice. He tips everyone,
// loudly, and thinks the splash he makes is a gift. (It sort of is.)

// ─── Tuning ──────────────────────────────────────────────────────────────────

const BASE_STATS: Stats = {
  maxHp: 640, hpRegen: 4, maxMana: 380, manaRegen: 8,
  ad: 55, ap: 0, armor: 30, mr: 30,
  attackSpeed: 0.62, attackRange: 450, moveSpeed: 330,
};
const GROWTH: StatGrowth = { maxHp: 92, hpRegen: 0.6, maxMana: 40, manaRegen: 0.6, ad: 2.6, armor: 4, mr: 1.2, attackSpeedPct: 0.018 };
const RADIUS = 40;
const COIN_SPEED = 1400;

/** Tipping Culture: allies near him get tipped for every last hit, whether they want it or not. */
export const TIPPING = { range: 800, gold: 4 };
export const MAKE_IT_RAIN = {
  cost: [60, 65, 70, 75], cooldown: [7, 6.5, 6, 5.5], castTime: 0.25,
  range: 800, radius: 230, delay: 0.3, damage: [80, 115, 150, 185], apRatio: 0.55, slow: 0.35, slowFor: 1.5,
};
export const YACHT_PARTY = {
  cost: [70, 70, 70, 70], cooldown: [16, 15, 14, 13], castTime: 0,
  range: 700, grab: 250, shield: [80, 110, 140, 170], apRatio: 0.5, lasts: 3, speed: 0.15, speedFor: 2,
};
export const HOSTILE_TAKEOVER = {
  cost: [80, 80, 80, 80], cooldown: [16, 15, 14, 13], castTime: 0.2,
  range: 900, width: 80, speed: 1400, damage: [60, 90, 120, 150], apRatio: 0.4, stun: [1, 1.1, 1.2, 1.3],
};
export const SPLASH_ZONE = {
  cost: [100, 100, 100], cooldown: [110, 95, 80], castTime: 0.2,
  range: 750, radius: 350, flight: 0.6, damage: [150, 250, 350], apRatio: 0.6, knockUp: 1, heal: [100, 150, 200], healApRatio: 0.5,
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const BIG_WHALE_INFO: ChampionInfo = {
  id: 'bigwhale',
  name: 'Big Whale',
  title: 'The Unwanted Investor',
  resource: 'mana',
  passive: {
    name: 'Tipping Culture',
    icon: '💸',
    description: `Allied champions within ${TIPPING.range} of him get ${TIPPING.gold} extra gold for every Chud they finish off. He makes sure they know it was him.`,
  },
  abilities: [
    {
      name: 'Make It Rain',
      icon: '💵',
      description: `Throw a fistful of cash. After ${MAKE_IT_RAIN.delay}s it comes down: enemies under it take ${perRank(MAKE_IT_RAIN.damage)} (+${pct(MAKE_IT_RAIN.apRatio)} AP) magic damage and are slowed by ${pct(MAKE_IT_RAIN.slow)} for ${MAKE_IT_RAIN.slowFor}s, scrabbling for it.`,
      cost: MAKE_IT_RAIN.cost,
      cooldown: MAKE_IT_RAIN.cooldown,
      castTime: MAKE_IT_RAIN.castTime,
      targeting: { kind: 'point', range: MAKE_IT_RAIN.range, radius: MAKE_IT_RAIN.radius },
    },
    {
      name: 'Yacht Party',
      icon: '🛥️',
      description: `Invite the allied champion nearest the cursor (whether they want to come or not): both of you get a ${perRank(YACHT_PARTY.shield)} (+${pct(YACHT_PARTY.apRatio)} AP) shield for ${YACHT_PARTY.lasts}s and ${pct(YACHT_PARTY.speed)} speed for ${YACHT_PARTY.speedFor}s. Nobody near the cursor: just him.`,
      cost: YACHT_PARTY.cost,
      cooldown: YACHT_PARTY.cooldown,
      castTime: YACHT_PARTY.castTime,
      targeting: { kind: 'point', range: YACHT_PARTY.range, radius: YACHT_PARTY.grab },
    },
    {
      name: 'Hostile Takeover',
      icon: '💼',
      description: `Fling a briefcase full of paperwork. The first enemy hit takes ${perRank(HOSTILE_TAKEOVER.damage)} (+${pct(HOSTILE_TAKEOVER.apRatio)} AP) magic damage and is stunned for ${perRank(HOSTILE_TAKEOVER.stun)}s, reading the fine print.`,
      cost: HOSTILE_TAKEOVER.cost,
      cooldown: HOSTILE_TAKEOVER.cooldown,
      castTime: HOSTILE_TAKEOVER.castTime,
      targeting: { kind: 'direction', range: HOSTILE_TAKEOVER.range, width: HOSTILE_TAKEOVER.width },
    },
    {
      name: 'Splash Zone',
      icon: '🐋',
      description: `He breaches: a leap to the target spot that lands in an enormous splash. Enemies in it take ${perRank(SPLASH_ZONE.damage)} (+${pct(SPLASH_ZONE.apRatio)} AP) magic damage and are knocked up for ${SPLASH_ZONE.knockUp}s; allied champions in it are healed for ${perRank(SPLASH_ZONE.heal)} (+${pct(SPLASH_ZONE.healApRatio)} AP). He calls it "a gift."`,
      cost: SPLASH_ZONE.cost,
      cooldown: SPLASH_ZONE.cooldown,
      castTime: SPLASH_ZONE.castTime,
      targeting: { kind: 'point', range: SPLASH_ZONE.range, radius: SPLASH_ZONE.radius },
    },
  ],
};

export class BigWhale extends Champion {
  readonly info = BIG_WHALE_INFO;

  constructor(world: World, team: PlayerTeam) {
    super(world, team, RADIUS, BASE_STATS, GROWTH, 'Big Whale');
  }

  protected launchAttack(world: World, target: Unit): void {
    const damage = this.stats.ad;
    world.add(new HomingProjectile(world, this, target, COIN_SPEED, 'coin', (w, t) => w.damage(this, t, damage, 'physical', { basic: true })));
  }

  // ─── Passive: Tipping Culture ─────────────────────────────────────────────

  onAllyLastHit(world: World, _victim: Unit, source?: Champion): void {
    if (!source || source.dead || dist(source.pos, this.pos) > TIPPING.range) return;
    source.gainGold(world, TIPPING.gold);
    world.emit({ e: 'fx', fx: 'tip', x: Math.round(source.pos.x), y: Math.round(source.pos.y), team: this.team });
  }

  // ─── Abilities ────────────────────────────────────────────────────────────

  protected onCast(world: World, slot: Slot, aim: Vec2): void {
    switch (slot) {
      case 0: return this.makeItRain(world, aim);
      case 1: return this.yachtParty(world, aim);
      case 2: return this.hostileTakeover(world, aim);
      case 3: return this.splashZone(world, aim);
    }
  }

  private makeItRain(world: World, aim: Vec2): void {
    const q = MAKE_IT_RAIN;
    const at = { ...aim };
    const damage = this.byRank(0, q.damage) + q.apRatio * this.stats.ap;
    world.emit({ e: 'fx', fx: 'cashRain', x: Math.round(at.x), y: Math.round(at.y), r: q.radius, dur: q.delay, team: this.team });
    world.schedule(q.delay, () => {
      for (const u of enemiesInRadius(world, this.team, at, q.radius)) {
        world.damage(this, u, damage, 'magic');
        u.addStatus(world, 'slow', q.slowFor, q.slow);
      }
    });
  }

  /** Who Yacht Party picks up: the allied champion nearest the spot, if anyone's close enough to it. */
  partyGuest(world: World, aim: Vec2): Champion | undefined {
    return world
      .units()
      .filter((u): u is Champion => u instanceof Champion && u !== this && u.team === this.team && !u.dead && dist(u.pos, aim) <= YACHT_PARTY.grab + u.radius)
      .sort((a, b) => dist(a.pos, aim) - dist(b.pos, aim))[0];
  }

  private yachtParty(world: World, aim: Vec2): void {
    const w = YACHT_PARTY;
    const shield = this.byRank(1, w.shield) + w.apRatio * this.stats.ap;
    const guest = this.partyGuest(world, aim);
    for (const u of guest ? [this, guest] : [this]) {
      u.addShield(world, shield, w.lasts);
      u.addStatus(world, 'speed', w.speedFor, w.speed);
      world.emit({ e: 'fx', fx: 'yachtParty', x: Math.round(u.pos.x), y: Math.round(u.pos.y), r: u.radius, team: this.team });
    }
  }

  private hostileTakeover(world: World, aim: Vec2): void {
    const e = HOSTILE_TAKEOVER;
    const damage = this.byRank(2, e.damage) + e.apRatio * this.stats.ap;
    const stun = this.byRank(2, e.stun);
    world.add(
      new LineProjectile(world, this, {
        from: this.pos, dir: dirTo(this.pos, aim), speed: e.speed, range: e.range, width: e.width, vis: 'briefcase', pierce: false,
        onHit: (w, target) => {
          w.damage(this, target, damage, 'magic');
          target.addStatus(w, 'stun', stun);
          w.emit({ e: 'fx', fx: 'paperwork', x: Math.round(target.pos.x), y: Math.round(target.pos.y), r: target.radius, dur: stun, team: this.team });
        },
      }),
    );
  }

  private splashZone(world: World, aim: Vec2): void {
    const s = SPLASH_ZONE;
    const d = Math.min(s.range, dist(this.pos, aim));
    const to = world.grid.nearestWalkable(add(this.pos, scale(dirTo(this.pos, aim), d))) ?? { ...this.pos };
    const from = { ...this.pos };
    this.startDash(world, to, s.flight);
    world.emit({ e: 'fx', fx: 'breach', x: Math.round(from.x), y: Math.round(from.y), x2: Math.round(to.x), y2: Math.round(to.y), dur: s.flight, team: this.team });
    world.schedule(s.flight, () => {
      if (this.dead) return;
      const damage = this.byRank(3, s.damage) + s.apRatio * this.stats.ap;
      for (const u of enemiesInRadius(world, this.team, this.pos, s.radius)) {
        world.damage(this, u, damage, 'magic');
        if (u.dead) continue;
        u.addStatus(world, 'stun', s.knockUp);
        u.addStatus(world, 'airborne', s.knockUp);
      }
      const heal = this.byRank(3, s.heal) + s.healApRatio * this.stats.ap;
      for (const u of world.units()) if (u.kind === 'champion' && u.team === this.team && !u.dead && dist(u.pos, this.pos) <= s.radius + u.radius) u.heal(world, heal);
      world.emit({ e: 'fx', fx: 'splashZone', x: Math.round(this.pos.x), y: Math.round(this.pos.y), r: s.radius, team: this.team });
    });
  }
}
