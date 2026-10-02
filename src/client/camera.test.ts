import { describe, expect, it } from 'vitest';
import { Camera, MAX_VIEW, MIN_VIEW_W, fitZoom } from './camera';

/** How much of the map a camera at this zoom shows on this screen. */
const shows = (zoom: number, w: number, h: number) => ({ w: w / zoom, h: h / zoom });

describe('the camera', () => {
  it('zooms out no further than about League shows, on any screen', () => {
    for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1440], [3440, 1440], [1280, 1024]]) {
      const cam = new Camera({ width: 12000, height: 7000 });
      for (let i = 0; i < 40; i++) cam.zoomBy(0.9);
      cam.update(0, null, null, w, h, false);
      const view = shows(cam.zoom, w, h);
      expect(view.w).toBeLessThanOrEqual(MAX_VIEW.w + 1e-6);
      expect(view.h).toBeLessThanOrEqual(MAX_VIEW.h + 1e-6);
      // On a 16:9 screen, exactly the limit: a big monitor shows the same patch, larger.
      if (w / h === 16 / 9) expect(view.w).toBeCloseTo(MAX_VIEW.w);
    }
  });

  it('zooms in as far as the closest view, and starts in between', () => {
    const cam = new Camera({ width: 12000, height: 7000 });
    cam.update(0, null, null, 1920, 1080, false);
    const start = shows(cam.zoom, 1920, 1080).w;
    expect(start).toBeGreaterThan(MIN_VIEW_W);
    expect(start).toBeLessThan(MAX_VIEW.w);
    for (let i = 0; i < 40; i++) cam.zoomBy(1.1);
    cam.update(0, null, null, 1920, 1080, false);
    expect(shows(cam.zoom, 1920, 1080).w).toBeCloseTo(MIN_VIEW_W);
    expect(fitZoom(MIN_VIEW_W, 1920, 1080)).toBeCloseTo(1920 / MIN_VIEW_W);
  });
});
