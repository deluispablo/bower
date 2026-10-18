/**
 * v2-perched-bower (TL-P4-22): a perched Bower with the turn moves through the
 * motion engine only. While the engine runs, no CSS animation runs on any
 * bird part (jsdom runs no CSS, so this lives here). Phone and desktop.
 */
import { expectAxeClean } from './axe';
import { expect, test, withSource } from './fixtures';

test('no CSS animation runs on a bird part while the engine runs', async ({ page }) => {
  await page.goto(withSource('/?scenario=default&time=instant'));
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('heading', { level: 1, name: /Hello, Alex/ })).toBeVisible();

  // One perched bird holds the turn and its engine moves it (the head's transform changes over time).
  const engineBird = page.locator('[data-bird]:not(.posed) .bird-perch');
  await expect(engineBird).toHaveCount(1);
  const head = engineBird.locator('.b-head');
  const first = await head.getAttribute('transform');
  // A real tap goes through react('tap'); its pointer gaze drives the head after the reaction.
  await page.locator('[data-bird]:not(.posed)').click();
  await expect.poll(() => head.getAttribute('transform'), { timeout: 8000 }).not.toBe(first);

  const running = await page.evaluate(
    () =>
      document
        .getAnimations()
        .filter((a) => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          return !!target?.closest('[data-bird]') && !target.closest('.bower-spark');
        }).length,
  );
  expect(running).toBe(0);

  await expectAxeClean(page, { include: 'main' });
});

/**
 * d-v2-07: one bird moves per screen. Every bird's transforms are sampled until the bird with the
 * turn changes (3 s at most); exactly one bird changed, and no bird is left out of the count.
 */
test('only one bird changes transforms per screen', async ({ page }) => {
  await page.goto(withSource('/?scenario=default&time=instant'));
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  await expect(page.getByRole('heading', { level: 1, name: /Hello, Alex/ })).toBeVisible();

  const sample = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-bird]')].map((bird) =>
        [bird, ...bird.querySelectorAll('*')]
          .map((el) => `${el.getAttribute('transform') ?? ''}|${el instanceof HTMLElement ? el.style.transform : ''}`)
          .join(';'),
      ),
    );
  const first = await sample();
  expect(first.length).toBeGreaterThan(0);
  // A real tap goes through react('tap') before the poll (TL-P4-26 addenda 4 (b) and 5).
  await page.locator('[data-bird]:not(.posed)').click();
  let changed: number[] = [];
  await expect
    .poll(
      async () => {
        const now = await sample();
        expect(now).toHaveLength(first.length);
        changed = now.flatMap((s, i) => (s === first[i] ? [] : [i]));
        return changed.length;
      },
      { timeout: 3000 },
    )
    .toBeGreaterThan(0);
  expect(changed).toHaveLength(1);

  await expectAxeClean(page, { include: 'main' });
});

// The production tap entry, advanced through six synthetic frames rather than a timer.
test("a tap goes through react('tap') on Home", async ({ page }) => {
  await page.addInitScript(() => {
    const state = { now: 1000, next: 0, queue: new Map<number, FrameRequestCallback>() };
    window.requestAnimationFrame = (cb) => { state.queue.set(++state.next, cb); return state.next; };
    window.cancelAnimationFrame = (id) => { state.queue.delete(id); };
    Object.assign(window, { bowerFrames: (count: number) => {
      for (let i = 0; i < count; i++) {
        state.now += 1000 / 60;
        const callbacks = [...state.queue.values()]; state.queue.clear();
        callbacks.forEach((cb) => cb(state.now));
      }
    } });
  });
  await page.goto(withSource('/?scenario=default&time=instant'));
  await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
  const bird = page.locator('[data-bird]:not(.posed)');
  await expect(bird).toHaveCount(1);
  await page.evaluate(() => (window as unknown as { bowerFrames(n: number): void }).bowerFrames(60));
  await bird.dispatchEvent('pointerdown', { clientX: 50, clientY: 50 });
  const lowest = await page.evaluate(() => {
    let lowest = 0;
    for (let i = 0; i < 6; i++) {
      (window as unknown as { bowerFrames(n: number): void }).bowerFrames(1);
      const perch = document.querySelector<HTMLElement>('[data-bird]:not(.posed) .bird-perch');
      const y = perch ? new DOMMatrix(getComputedStyle(perch).transform).m42 : 0;
      lowest = Math.min(lowest, y);
    }
    return lowest;
  });
  expect(lowest).toBeLessThan(-1);
  await expectAxeClean(page, { include: 'main' });
});
