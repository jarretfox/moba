import type { PlayerTeam } from '../constants';
import { lanePath, type Lane } from '../map/mapData';
import type { ChudType } from '../protocol';
import { Chud } from './chud';
import type { World, WorldSystem } from './world';

// ─── Tuning ──────────────────────────────────────────────────────────────────

const FIRST_WAVE_AT = 20;
const WAVE_INTERVAL = 30;
/** Every Nth wave brings a Siege Chud. */
const SIEGE_EVERY = 3;
/** Seconds between Chuds crawling out of Da Base, so a wave walks out as a column instead of a clump. */
const SPAWN_STAGGER = 0.6;

/** Melee in front, then the siege Chud when there is one, ranged at the back. */
export function waveComposition(waveNumber: number): ChudType[] {
  const wave: ChudType[] = ['melee', 'melee', 'melee'];
  if (waveNumber % SIEGE_EVERY === 0) wave.push('siege');
  wave.push('ranged', 'ranged');
  return wave;
}

/** Sends a Chud wave down every lane for both teams on a fixed clock. */
export class WaveSpawner implements WorldSystem {
  nextWaveAt = FIRST_WAVE_AT;
  private waveNumber = 0;

  constructor(
    private readonly teams: PlayerTeam[] = [1, 2],
    private readonly lanes: Lane[] = ['top', 'bot'],
  ) {}

  update(world: World): void {
    if (world.time + 1e-9 < this.nextWaveAt) return;
    this.waveNumber++;
    this.nextWaveAt += WAVE_INTERVAL;
    const types = waveComposition(this.waveNumber);
    for (const team of this.teams) {
      for (const lane of this.lanes) {
        const route = lanePath(world.map, team, lane);
        types.forEach((type, i) => world.schedule(i * SPAWN_STAGGER, () => world.add(new Chud(world, team, type, lane, route))));
      }
    }
  }

  secondsUntilNextWave(world: World): number {
    return Math.max(0, this.nextWaveAt - world.time);
  }
}
