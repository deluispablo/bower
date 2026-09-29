import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  birdCount,
  overlayBirdCount,
  registerBird,
  resetBirdPresence,
  subscribeBirds,
} from '../src/bird-presence.js';

afterEach(() => {
  resetBirdPresence();
});

describe('bird presence', () => {
  it('counts registered birds and unregisters them', () => {
    const a = registerBird();
    const b = registerBird();
    expect(birdCount()).toBe(2);
    a();
    expect(birdCount()).toBe(1);
    b();
    expect(birdCount()).toBe(0);
  });

  it('never goes below 0, even when unregistered twice or after a reset', () => {
    const a = registerBird();
    a();
    a();
    expect(birdCount()).toBe(0);
    const b = registerBird();
    resetBirdPresence();
    b();
    expect(birdCount()).toBe(0);
  });

  it('tracks overlay birds apart', () => {
    const a = registerBird(true);
    registerBird();
    expect(overlayBirdCount()).toBe(1);
    a();
    expect(overlayBirdCount()).toBe(0);
    expect(birdCount()).toBe(1);
  });

  it('notifies subscribers until they unsubscribe', () => {
    const listener = vi.fn();
    const off = subscribeBirds(listener);
    const a = registerBird();
    a();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    registerBird();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('reset clears the count and the listeners', () => {
    const listener = vi.fn();
    subscribeBirds(listener);
    registerBird();
    resetBirdPresence();
    expect(birdCount()).toBe(0);
    registerBird();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
