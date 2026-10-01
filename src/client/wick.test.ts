import { describe, expect, it } from 'vitest';
import { FAR, NEAR, WickMood, wickLine } from './wick';

describe('Old Wick', () => {
  it('says hello when you walk up and goodbye when you leave, without chattering at the edge', () => {
    const wick = new WickMood();
    expect(wick.update(NEAR + 100, false, 0)).toBe(null);
    expect(wick.update(NEAR - 10, false, 1)).toBe('greet');
    expect(wick.update(NEAR + 10, false, 2)).toBe(null); // between NEAR and FAR: still with him
    expect(wick.update(NEAR - 10, false, 3)).toBe(null);
    expect(wick.update(NEAR + 200, false, 5)).toBe(null); // well after he spoke, still in the gap: no goodbye
    expect(wick.update(FAR + 10, false, 6)).toBe('farewell');
    expect(wick.update(FAR + 10, false, 7)).toBe(null);
  });

  it('has something to say when you respawn beside him', () => {
    const wick = new WickMood();
    wick.update(5000, false, 0);
    expect(wick.update(5000, true, 1)).toBe(null);
    expect(wick.update(100, false, 9)).toBe('welcomeBack');
    expect(wick.update(100, false, 10)).toBe(null);
  });

  it('mutters now and then while you browse, but not right after a sale', () => {
    const wick = new WickMood();
    wick.update(100, false, 0);
    expect(wick.update(100, false, 10)).toBe(null);
    wick.heard(14);
    expect(wick.update(100, false, 15)).toBe(null);
    expect(wick.update(100, false, 29)).toBe('idle');
  });

  it('keeps quiet for a moment after speaking', () => {
    const wick = new WickMood();
    wick.heard(0);
    expect(wick.update(100, false, 1)).toBe(null); // just sold you something: no hello on top of it
    expect(wick.update(FAR + 10, false, 6)).toBe('farewell');
    expect(wick.update(100, false, 7)).toBe(null); // too soon after the goodbye
    wick.update(FAR + 10, false, 8);
    expect(wick.update(100, false, 10)).toBe('greet');
  });

  it('picks lines in turn, wrapping around', () => {
    expect(wickLine('buy', 0)).not.toBe(wickLine('buy', 1));
    expect(wickLine('buy', 5)).toBe(wickLine('buy', 0));
    expect(wickLine('broke', -1)).toBeTruthy();
  });
});
