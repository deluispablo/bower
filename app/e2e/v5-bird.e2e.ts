/**
 * Bower v9 (#748): the hop-turn of Looking never rests on a sliver, and a bird
 * never takes a tap that belongs to a control beside or under it (rule 4).
 * The bird's CSS is already on the intro page, so both tests put a bird of
 * their own into it, which keeps them independent of what a screen shows.
 */

import { expect, test } from './demo.js';
import { MOTION_ON } from './motion.js';

test.use({ ...MOTION_ON, introSeen: false });

const LOOKING_BIRD =
  '<svg class="b p-look" id="probe-bird" viewBox="0 0 100 100" width="80" height="80" ' +
  'style="position:fixed;left:40px;top:40px"><g class="rig"><g class="turn">' +
  '<rect x="10" y="10" width="60" height="60"/></g></g></svg>';

test('the hop-turn never has scaleX between -0.4 and 0.4 for longer than 0.12 s', async ({
  page,
}) => {
  await page.goto('/welcome');
  await page.evaluate((markup) => {
    document.body.insertAdjacentHTML('beforeend', markup);
  }, LOOKING_BIRD);

  const longest = await page.evaluate(() => {
    const turn = document.querySelector('#probe-bird .turn');
    if (turn === null) throw new Error('probe bird missing');
    const animation = turn
      .getAnimations()
      .find(
        (a) => a instanceof CSSAnimation && a.animationName === 'turnaround',
      );
    if (animation === undefined) throw new Error('turnaround is not running');
    animation.pause();
    const timing = animation.effect?.getComputedTiming();
    const duration =
      typeof timing?.duration === 'number' ? timing.duration : 11000;
    const step = 10; // ms
    let run = 0;
    let worst = 0;
    for (let at = 0; at <= duration; at += step) {
      animation.currentTime = at;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(turn).transform);
      // The turn group has no rotation, so `a` is its scaleX.
      if (Math.abs(matrix.a) < 0.4) run += step;
      else run = 0;
      worst = Math.max(worst, run);
    }
    return worst;
  });
  expect(longest).toBeLessThanOrEqual(120);
});

test('a bird does not take the tap of a control under it', async ({ page }) => {
  await page.goto('/welcome');
  await page.evaluate((markup) => {
    document.body.insertAdjacentHTML('beforeend', markup);
    const button = document.createElement('button');
    button.id = 'probe-control';
    button.textContent = 'Probe';
    button.style.cssText =
      'position:fixed;left:40px;top:40px;width:80px;height:80px;z-index:1';
    document.body.append(button);
    // The bird is drawn above the control, as a bird in a bar would be.
    const bird = document.querySelector<SVGElement>('#probe-bird');
    if (bird !== null) bird.style.zIndex = '2';
  }, LOOKING_BIRD);

  const hit = await page.evaluate(() => {
    const target = document.elementFromPoint(80, 80);
    return {
      id: target?.id ?? '',
      insideBird: target?.closest('svg.b') !== null,
    };
  });
  expect(hit).toEqual({ id: 'probe-control', insideBird: false });
  await page.locator('#probe-control').click();
});
