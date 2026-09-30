import type { Graphics } from 'pixi.js';
import type { AbilityInfo } from '../../shared/champions/types';
import { add, angleOf, dirTo, dist, scale, type Vec2 } from '../../shared/math';

const FILL = { color: 0xffffff, alpha: 0.12 };
const EDGE = { width: 2, color: 0xffffff, alpha: 0.55 };

/** Shows where an ability will go while its key is held. */
export function drawIndicator(g: Graphics, info: AbilityInfo, from: Vec2, mouse: Vec2): void {
  g.clear();
  const t = info.targeting;
  const d = dist(from, mouse) > 1 ? dirTo(from, mouse) : { x: 1, y: 0 };
  switch (t.kind) {
    case 'direction': {
      const n = { x: -d.y * (t.width / 2), y: d.x * (t.width / 2) };
      const end = add(from, scale(d, t.range));
      g.poly([from.x + n.x, from.y + n.y, end.x + n.x, end.y + n.y, end.x - n.x, end.y - n.y, from.x - n.x, from.y - n.y])
        .fill(FILL)
        .stroke(EDGE);
      return;
    }
    case 'point': {
      g.circle(from.x, from.y, t.range).stroke({ ...EDGE, alpha: 0.3 });
      const p = dist(from, mouse) > t.range ? add(from, scale(d, t.range)) : mouse;
      g.circle(p.x, p.y, t.radius).fill(FILL).stroke(EDGE);
      return;
    }
    case 'cone': {
      const a = angleOf(d);
      const half = ((t.angle / 2) * Math.PI) / 180;
      g.moveTo(from.x, from.y).arc(from.x, from.y, t.range, a - half, a + half).closePath().fill(FILL).stroke(EDGE);
      return;
    }
    case 'self':
      if (t.radius) g.circle(from.x, from.y, t.radius).fill(FILL).stroke(EDGE);
      return;
  }
}
