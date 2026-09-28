/**
 * The loops of the "What is Bower" intro (#328): the sort strip on page 1,
 * the flying cards on page 2, the Drive curtain on page 4 and the case
 * animation on pages 5 to 8. With reduced motion (the config's default)
 * nothing moves and each animated page is screenshotted at rest, animations
 * left as they are; with motion the loops run and move transform and
 * opacity only.
 */

import type { Page } from '@playwright/test';

import { expect, test } from './demo.js';

/** The pages (1-based) the boards animate. */
const ANIMATED_PAGES = [1, 2, 4, 5, 6, 7, 8];

/** Every loop `intro.css` plays. */
const LOOPS = [
  'intro-all-tidy',
  'intro-carry',
  'intro-check-pop',
  'intro-curtain',
  'intro-curtain-back',
  'intro-fly',
  'intro-lit',
  'intro-scan',
  'intro-sort-card',
  'intro-tick',
  'intro-why',
];

interface Loop {
  name: string;
  properties: string[];
}

/**
 * The CSS animations running inside the intro, except the bird's own
 * (`styles/bird.css`, the bird's business): each with the properties its
 * keyframes change.
 */
async function introLoops(page: Page): Promise<Loop[]> {
  return page.evaluate(() => {
    const meta = new Set(['offset', 'computedOffset', 'easing', 'composite']);
    return document
      .getAnimations()
      .filter((animation): animation is CSSAnimation => {
        const effect = animation.effect;
        if (!(animation instanceof CSSAnimation)) return false;
        if (!(effect instanceof KeyframeEffect)) return false;
        const target = effect.target;
        return (
          target !== null &&
          target.closest('.intro') !== null &&
          target.closest('svg.b') === null
        );
      })
      .map((animation) => {
        const effect = animation.effect as KeyframeEffect;
        const properties = new Set<string>();
        for (const frame of effect.getKeyframes()) {
          for (const key of Object.keys(frame)) {
            if (!meta.has(key)) properties.add(key);
          }
        }
        return { name: animation.animationName, properties: [...properties] };
      });
  });
}

test.describe('the intro loops (#328)', () => {
  test.use({ introSeen: false });

  test('with reduced motion nothing moves; every animated page rests complete', async ({
    page,
  }, testInfo) => {
    await page.goto('/welcome');
    await expect(
      page.getByRole('heading', { name: /Bower files it/ }),
    ).toBeInViewport();
    expect(await introLoops(page)).toEqual([]);

    const next = page.getByRole('button', { name: 'Next', exact: true });
    const { testDir, name: project } = testInfo.project;
    for (let n = 1; n <= Math.max(...ANIMATED_PAGES); n += 1) {
      if (n > 1) await next.nth(n - 2).click();
      const panel = page.getByRole('region', {
        name: `What is Bower, ${n} of 9`,
      });
      await expect(panel).toBeInViewport({ ratio: 0.9 });
      if (!ANIMATED_PAGES.includes(n)) continue;
      // No `animations: 'disabled'`: the frame is what reduced motion shows.
      await page.screenshot({
        caret: 'hide',
        path: `${testDir}/screenshots/${project}/intro-rest-${n}.png`,
      });
    }
  });

  test('with motion the loops run, on transform and opacity only', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/welcome');
    await expect(
      page.getByRole('heading', { name: /Bower files it/ }),
    ).toBeInViewport();

    const loops = await introLoops(page);
    expect([...new Set(loops.map((loop) => loop.name))].sort()).toEqual(LOOPS);
    for (const loop of loops) {
      expect(
        loop.properties.every(
          (key) => key === 'transform' || key === 'opacity',
        ),
        `${loop.name} moves ${loop.properties.join(', ')}`,
      ).toBe(true);
    }
  });
});
