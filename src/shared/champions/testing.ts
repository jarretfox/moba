import type { Champion } from './champion';

/** Test helper: give a champion rank 1 in every ability (fresh champions start with nothing learned). */
export function learnAll<C extends Champion>(c: C): C {
  for (const a of c.abilities) a.rank = Math.max(a.rank, 1);
  return c;
}
