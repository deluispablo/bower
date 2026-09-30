/**
 * Bower settles and naps (#786, D30, WCAG 2.2.2): a tap on the greeting's
 * bird pauses every animation, and a bird never takes a tap meant for a
 * control (rule 4: `pointer-events: none`, except the nap button).
 */

import { expect, openHome, test, visible } from './demo.js';
import { MOTION_ON } from './motion.js';

test.use({ ...MOTION_ON });

test('a tap on Bower makes him nap and pauses every animation', async ({
  page,
}) => {
  await openHome(page);
  const nap = visible(page.locator('.home-greeting').getByRole('button', { name: 'Bower' }));
  await expect(nap).toHaveAttribute('aria-pressed', 'false');
  const bird = nap.locator('svg.b');
  await nap.click();
  await expect(nap).toHaveAttribute('aria-pressed', 'true');
  // One cycle of Asleep plays, then he holds still.
  await expect(bird).toHaveClass(/settled/);
  const playing = await bird.evaluate(
    (root) =>
      root
        .getAnimations({ subtree: true })
        .filter((animation) => animation.playState === 'running').length,
  );
  expect(playing).toBe(0);
  // The next tap wakes him.
  await nap.click();
  await expect(nap).toHaveAttribute('aria-pressed', 'false');
  await expect(bird).not.toHaveClass(/settled/);
});

test('birds take no tap: the point over one hits the nap button or what is behind', async ({
  page,
}) => {
  await openHome(page);
  const nap = visible(page.locator('.home-greeting').getByRole('button', { name: 'Bower' }));
  await expect(nap).toBeVisible();
  const result = await page.evaluate(() => {
    const birds = [...document.querySelectorAll<SVGElement>('svg.b')];
    return birds.map((bird) => {
      const box = bird.getBoundingClientRect();
      const hit = document.elementFromPoint(
        box.x + box.width / 2,
        box.y + box.height / 2,
      );
      return {
        none: getComputedStyle(bird).pointerEvents === 'none',
        inside: hit !== null && bird.contains(hit),
        button: hit?.closest('button.bird-nap') !== null,
      };
    });
  });
  expect(result.length).toBeGreaterThan(0);
  for (const bird of result) {
    expect(bird.none).toBe(true);
    expect(bird.inside).toBe(false);
  }
  expect(result.some((bird) => bird.button)).toBe(true);
});
