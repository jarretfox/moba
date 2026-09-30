import { dist, lerpVec, segmentDistance, type Vec2 } from '../math';

/** How far along a route (from its start) the point nearest to `p` lies. */
export function progressAlong(route: Vec2[], p: Vec2): number {
  let bestD = Infinity;
  let bestProgress = 0;
  let travelled = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const len = dist(route[i], route[i + 1]);
    const { d, t } = segmentDistance(p, route[i], route[i + 1]);
    if (d < bestD) {
      bestD = d;
      bestProgress = travelled + t * len;
    }
    travelled += len;
  }
  return bestProgress;
}

/** The point `progress` units along a route, clamped to its ends. */
export function pointAlong(route: Vec2[], progress: number): Vec2 {
  if (progress <= 0) return { ...route[0] };
  let travelled = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const len = dist(route[i], route[i + 1]);
    if (progress <= travelled + len) return lerpVec(route[i], route[i + 1], (progress - travelled) / len);
    travelled += len;
  }
  return { ...route[route.length - 1] };
}
