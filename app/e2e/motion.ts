/**
 * Motion helper for the end-to-end tests (spec §7c item 2). The config runs
 * every test with `reducedMotion: 'reduce'`, so nothing loops and shots stay
 * steady. A test about motion opts out with `test.use(MOTION_ON)`, then
 * pauses the animations under a locator and seeks them to a fixed point of
 * their cycle through `getAnimations()`: no sleeps, no timing luck.
 */

import type { Locator } from '@playwright/test';

/** Spread into `test.use(...)` to turn reduced motion off for one file or describe. */
export const MOTION_ON = {
  contextOptions: { reducedMotion: 'no-preference' },
} as const;

/** The points of a cycle a test samples, as percentages. */
export const SAMPLE_POINTS: readonly number[] = [0, 25, 50, 75];

/**
 * Pauses every animation running on `scope` or inside it and seeks each to
 * `percent` (0 to 100) of one iteration. Returns how many it moved, so a
 * test can assert that something really was animating.
 */
export async function seekAnimations(
  scope: Locator,
  percent: number,
): Promise<number> {
  return scope.evaluate((root, at) => {
    const animations = root
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect instanceof KeyframeEffect);
    for (const animation of animations) {
      animation.pause();
      const timing = animation.effect?.getComputedTiming();
      const duration =
        typeof timing?.duration === 'number' ? timing.duration : 0;
      const delay = timing?.delay ?? 0;
      animation.currentTime = delay + (duration * at) / 100;
    }
    return animations.length;
  }, percent);
}

/** Pauses every animation under `scope` where it is; returns how many. */
export async function pauseAnimations(scope: Locator): Promise<number> {
  return scope.evaluate((root) => {
    const animations = root
      .getAnimations({ subtree: true })
      .filter((animation) => animation.effect instanceof KeyframeEffect);
    for (const animation of animations) animation.pause();
    return animations.length;
  });
}
