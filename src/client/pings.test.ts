import { describe, expect, it } from 'vitest';
import { pingFromDrag } from './pings';

describe('the ping wheel', () => {
  it('is "look here" for a plain click or a tiny wobble', () => {
    expect(pingFromDrag(0, 0)).toBe('look');
    expect(pingFromDrag(8, -6)).toBe('look');
  });

  it('picks by the direction you drag: up danger, right on my way, down missing, left help', () => {
    expect(pingFromDrag(5, -60)).toBe('danger');
    expect(pingFromDrag(70, 10)).toBe('omw');
    expect(pingFromDrag(-4, 50)).toBe('missing');
    expect(pingFromDrag(-80, -20)).toBe('assist');
  });
});
