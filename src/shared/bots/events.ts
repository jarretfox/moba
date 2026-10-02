import { Champion } from '../champions/champion';
import { TEAM, type PlayerTeam } from '../constants';
import { add, dirTo, dist, scale, type Vec2 } from '../math';
import { activeEvent, LooseChud, STALL } from '../sim/events';
import type { Unit } from '../sim/unit';
import type { World } from '../sim/world';

// How a bot takes part in a map event (sim/events.ts): it goes when the event is on, close enough, and
// it's one of the two of its team nearest to it, so a team never empties both lanes for one. Fights with
// contesting champions, running home when hurt and Shootie safety are the bot's own business (bot.ts
// decides those first); this only says where to be and what to hit.

// ─── Tuning ──────────────────────────────────────────────────────────────────

/** Only an event this close is worth leaving the lane for. */
const JOIN_RANGE = 2600;
/** How many of a team's bots go to one event. */
const PER_TEAM = 2;
/** Don't start on an event below this share of health. */
const MIN_HP = 0.5;
/** Hit the boss from this close, and swat a Loose Chud that's on us. */
const BOSS_RANGE = 1300;
const ADD_RANGE = 350;

/** What a bot should do about the event right now, if anything: stand somewhere, or hit something. */
export type EventOrder = { kind: 'move'; to: Vec2 } | { kind: 'attack'; target: Unit };

export function eventOrderFor(world: World, me: Champion, hp: number): EventOrder | null {
  const ev = activeEvent(world);
  if (!ev || hp < MIN_HP || dist(me.pos, ev.pos) > JOIN_RANGE) return null;
  // The two nearest of the team go; the rest keep the lanes.
  const team = world
    .units()
    .filter((u): u is Champion => u instanceof Champion && u.team === me.team && !u.dead)
    .sort((a, b) => dist(a.pos, ev.pos) - dist(b.pos, ev.pos));
  if (team.indexOf(me) >= PER_TEAM) return null;
  // A spot of their own near the middle, so two bots don't stand in each other.
  const spread = { x: ((me.id % 3) - 1) * 90, y: me.id % 2 ? 70 : -70 };

  switch (ev.kind) {
    case 'boss': {
      const sees = (u: Unit) => u.isTargetable() && world.vision.canSee(me.team, u);
      const loose = world.units().find((u) => u instanceof LooseChud && sees(u) && dist(u.pos, me.pos) < ADD_RANGE);
      if (loose) return { kind: 'attack', target: loose };
      if (sees(ev.boss) && dist(ev.boss.pos, me.pos) < BOSS_RANGE) return { kind: 'attack', target: ev.boss };
      return { kind: 'move', to: add(ev.pos, spread) };
    }
    case 'escort': {
      // Beside the cart, on our side of it (so we're between it and home), and well inside the push range.
      const end = ev.end(me.team as PlayerTeam);
      const toward = dist(end, ev.pos) > 1 ? dirTo(ev.pos, end) : { x: me.team === TEAM.blue ? -1 : 1, y: 0 };
      return { kind: 'move', to: add(add(ev.pos, scale(toward, 140)), spread) };
    }
    case 'capture':
      return { kind: 'move', to: add(ev.pos, scale(spread, STALL.radius / 180)) };
  }
}
