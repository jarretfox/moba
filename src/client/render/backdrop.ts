import { Container, type Application, type Ticker } from 'pixi.js';
import { TEAM } from '../../shared/constants';
import { MAP } from '../../shared/map/mapData';
import { Ambience } from './ambience';
import { Lighting, skyAt } from './lighting';
import { HEIGHT, buildMap, destroyMapLayer, elevate } from './mapView';
import { Water } from './water';

/** Where the camera drifts while there's no match to watch: a slow loop over the middle of the map. */
export function driftAt(seconds: number): { x: number; y: number } {
  return {
    x: MAP.width / 2 + Math.cos(seconds * 0.035) * MAP.width * 0.3,
    y: MAP.height / 2 + Math.sin(seconds * 0.05) * MAP.height * 0.25,
  };
}

/**
 * The map at dusk behind the menu: the camera drifts slowly over it while the river runs and the
 * fireflies come out. Torn down when the match screen takes over.
 */
export class MenuBackdrop {
  private readonly view = new Container();
  private readonly world = new Container();
  private readonly wallTops: Container;
  private readonly canopy: Container;
  private readonly ground: Container;
  private readonly water = new Water(MAP);
  private readonly ambience = new Ambience(MAP);
  private readonly lighting = new Lighting(MAP);
  private time = Math.random() * 200;
  private readonly tick = (t: Ticker) => this.frame(t.deltaMS / 1000);

  constructor(private readonly app: Application) {
    const layers = buildMap(MAP, TEAM.blue);
    this.wallTops = layers.wallTops;
    this.canopy = layers.canopy;
    this.ground = layers.ground;
    this.world.addChild(layers.ground, this.water.container, this.ambience.container, this.wallTops, this.canopy);
    this.view.addChild(this.world, this.lighting.sprite);
    this.ambience.setNight(0.8);
    app.stage.addChild(this.view);
    app.ticker.add(this.tick);
  }

  destroy(): void {
    this.app.ticker.remove(this.tick);
    this.ground.removeFromParent();
    destroyMapLayer(this.ground);
    this.view.destroy({ children: true });
  }

  private frame(dt: number): void {
    this.time += dt;
    const { width: w, height: h } = this.app.screen;
    const zoom = 0.6;
    const at = driftAt(this.time);
    this.world.scale.set(zoom);
    this.world.position.set(w / 2 - at.x * zoom, h / 2 - at.y * zoom);
    elevate(this.wallTops, HEIGHT.wall, at.x, at.y);
    elevate(this.canopy, HEIGHT.tree, at.x, at.y);
    this.water.update(dt, []);
    this.ambience.update(dt);
    this.lighting.update(this.app.renderer, this.world, w, h, dt, [], TEAM.blue, [], skyAt(420));
  }
}
