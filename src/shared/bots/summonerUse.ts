import type { Champion } from '../champions/champion';
import { add, dirTo, dist, scale, type Vec2 } from '../math';
import type { Command } from '../protocol';
import { FLASH, IGNITE, SMITE, byLevel, type SummonerId } from '../summoners';
import type { Unit } from '../sim/unit';
import type { World } from '../sim/world';

// How bots take and use summoner spells: what a decent new player would. They Flash and Ghost away when
// they're about to die, Heal and Barrier at low health, Cleanse a stun in a fight, Exhaust whoever's on
// them, Ignite someone it would finish, Smite a camp (or the Warden) it can take, and Clarity when they're
// out of mana. Teleport and Mark are left to people.

/** A bot's spells: by the job it was given (`slot` in the lineup), or at random in ARAM. */
export function botSummoners(job: 'top' | 'carry' | 'jungle' | 'partner' | 'aram', mana: boolean, random: () => number): [SummonerId, SummonerId] {
  switch (job) {
    case 'top':
      return ['flash', 'ignite'];
    case 'carry':
      return ['flash', 'heal'];
    case 'jungle':
      return ['flash', 'smite'];
    case 'partner':
      return ['flash', 'exhaust'];
    case 'aram': {
      const second: SummonerId[] = ['heal', 'ignite', 'barrier', 'exhaust', 'ghost', ...(mana ? (['clarity'] as const) : [])];
      return ['flash', second[Math.min(second.length - 1, Math.floor(random() * second.length))]];
    }
  }
}

/** The moment, if any, for one of the bot's spells; pushes the press onto `out`. */
export function useSummoners(world: World, me: Champion, out: Command[], foe: Unit | undefined, fleeing: boolean, home: Vec2, jungling: boolean): void {
  const hp = me.hp / me.stats.maxHp;
  for (let slot = 0; slot < 2; slot++) {
    if (world.time < me.summonerReady[slot]) continue;
    const press = (at: Vec2) => out.push({ k: 'spell', slot, x: Math.round(at.x), y: Math.round(at.y) });
    const near = foe ? dist(foe.pos, me.pos) : Infinity;
    switch (me.summoners[slot]) {
      case 'flash':
        // About to be caught: blink toward home.
        if (fleeing && foe && near < 450 && hp < 0.22) return void press(add(me.pos, scale(dirTo(me.pos, home), FLASH.range)));
        break;
      case 'ghost':
        if (fleeing && foe && near < 700) return void press(me.pos);
        if (!fleeing && foe && foe.hp / foe.stats.maxHp < 0.3 && near > me.stats.attackRange + 200 && near < 900) return void press(me.pos);
        break;
      case 'heal':
        if (foe && near < 900 && hp < 0.22) return void press(me.pos);
        break;
      case 'barrier':
        if (foe && hp < 0.2 && world.time - me.lastDamagedAt < 1) return void press(me.pos);
        break;
      case 'cleanse':
        if (foe && near < 900 && (me.has('stun') || me.has('root') || me.has('fear'))) return void press(me.pos);
        break;
      case 'exhaust':
        if (foe && foe.kind === 'champion' && near < 600 && (hp < 0.5 || foe.hp / foe.stats.maxHp < 0.3)) return void press(foe.pos);
        break;
      case 'ignite': {
        const burn = byLevel(IGNITE.damage[0], IGNITE.damage[1], me.level);
        if (foe && foe.kind === 'champion' && near < IGNITE.range && foe.hp < burn * 1.3 + me.stats.ad) return void press(foe.pos);
        break;
      }
      case 'smite': {
        // A camp it's clearing, or the Warden, that the hit would finish.
        const hit = byLevel(SMITE.damage[0], SMITE.damage[1], me.level);
        const take = world
          .units()
          .find((u) => u.kind === 'monster' && !u.dead && u.isTargetable() && u.hp <= hit && dist(u.pos, me.pos) <= SMITE.range + me.radius + u.radius && (jungling || u.stats.maxHp >= 3000) && world.vision.canSee(me.team, u));
        if (take) return void press(take.pos);
        break;
      }
      case 'clarity':
        if (me.stats.maxMana > 0 && me.mana < me.stats.maxMana * 0.25) return void press(me.pos);
        break;
    }
  }
}
