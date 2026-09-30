import { TEAM } from '../constants';
import type { Vec2 } from '../math';
import { Unit, type Stats } from './unit';
import type { World } from './world';

const STATS: Stats = {
  maxHp: 1500, hpRegen: 0, maxMana: 0, manaRegen: 0,
  ad: 0, ap: 0, armor: 30, mr: 30,
  attackSpeed: 0, attackRange: 0, moveSpeed: 200,
};
/** Seconds without taking damage before a dummy snaps back to full health. */
const RESET_AFTER = 3;

/** Practice target. Can pace back and forth between two points so skillshots have something to lead. */
export class Dummy extends Unit {
  readonly kind = 'dummy';
  readonly immovable = true;
  private towardB = false;

  constructor(world: World, pos: Vec2, name: string, private readonly pace?: [Vec2, Vec2]) {
    super(world.newId(), TEAM.red, pos, 45, STATS, name);
  }

  protected think(world: World): void {
    if (world.time - this.lastDamagedAt > RESET_AFTER) this.hp = this.stats.maxHp;
    if (this.pace && this.path.length === 0) {
      this.towardB = !this.towardB;
      this.path = [{ ...this.pace[this.towardB ? 1 : 0] }];
    }
  }

  protected respawnDelay(): number {
    return 2;
  }
}
