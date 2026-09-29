/**
 * The motion helper (#735): with reduced motion switched off for this file,
 * the bird's loop can be paused and sampled at 0, 25, 50 and 75 percent, and
 * each sample lands where it was asked, without a single sleep.
 */

import { expect, test } from './demo.js';
import {
  MOTION_ON,
  SAMPLE_POINTS,
  pauseAnimations,
  seekAnimations,
} from './motion.js';

test.use({ ...MOTION_ON, introSeen: false });

test('the bird animates with motion on, and can be sampled at 0, 25, 50 and 75%', async ({
  page,
}) => {
  await page.goto('/welcome');
  const bird = page.locator('svg.b:visible').first();
  await expect(bird).toBeVisible();
  expect(
    await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  ).toBe(false);

  const running = await pauseAnimations(bird);
  expect(running).toBeGreaterThan(0);

  for (const percent of SAMPLE_POINTS) {
    const moved = await seekAnimations(bird, percent);
    expect(moved).toBe(running);
    const fractions = await bird.evaluate((root) =>
      root
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect instanceof KeyframeEffect)
        .map((animation) => {
          const timing = animation.effect?.getComputedTiming();
          const duration =
            typeof timing?.duration === 'number' ? timing.duration : 0;
          return duration === 0
            ? 0
            : (Number(animation.currentTime) - (timing?.delay ?? 0)) / duration;
        }),
    );
    for (const fraction of fractions) {
      expect(fraction).toBeCloseTo(percent / 100, 2);
    }
  }
});
