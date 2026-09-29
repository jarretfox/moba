import { Dummy } from '../shared/sim/dummy';
import type { World } from '../shared/sim/world';

/** M0 practice range: training dummies just through blue's back door into the jungle. */
export function setupPracticeRange(world: World): void {
  world.add(new Dummy(world, { x: 3250, y: 3150 }, 'Training Dummy'));
  world.add(new Dummy(world, { x: 3250, y: 3850 }, 'Training Dummy'));
  world.add(new Dummy(world, { x: 3650, y: 2950 }, 'Pacing Dummy', [{ x: 3650, y: 2950 }, { x: 3650, y: 4050 }]));
}
