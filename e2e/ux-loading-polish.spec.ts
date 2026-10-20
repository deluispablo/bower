import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

// ux-loading-polish AC2: on a slow Drive (scenario=slow, every answer 1.5 s), a folder or a note opens in place. What
// the address already says stands where it will stay; still shapes hold the rest; nothing moves when the answer lands,
// and the page left behind never shows under the new one (web.dev/articles/optimize-cls).

type Box = { y: number; h: number } | null;
/** One frame of the page: the heading, where it is (the phone's Back or the desktop's crumbs), the view switch, what follows the header or the title, and the list's rows. */
interface Snap { h1: string | null; h1Box: Box; place: Box; view: Box; afterHead: Box; afterTitle: Box; bones: Box[]; rows: number; firstRow: Box }
interface Seen { snap: Snap | null; rowsAt: Box }

/** Installed before the page's scripts: once the test names a status, the first frame that shows it, and the first frame with list rows. */
async function record(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __snap: () => unknown; __watch: (label: string) => void; __seen: unknown };
    const box = (e: Element | null | undefined) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { y: Math.round(r.y), h: Math.round(r.height) };
    };
    const snap = () => {
      const main = document.querySelector('main');
      const h1 = main?.querySelector('h1');
      const desktop = matchMedia('(min-width: 900px)').matches;
      const status = main?.querySelector('[aria-label^="Opening"]');
      const rows = main?.querySelectorAll('ul li a') ?? [];
      return {
        h1: h1?.textContent ?? null,
        h1Box: box(h1),
        place: box(main?.querySelector(desktop ? 'p a' : 'button[aria-label="Back"]')),
        view: box(main?.querySelector('[role="radiogroup"][aria-label="View"]')),
        afterHead: box(main?.querySelector('header + *')),
        afterTitle: box(h1?.nextElementSibling),
        bones: [...(status?.children ?? [])].map(box),
        rows: rows.length,
        firstRow: box(rows[0]),
      };
    };
    w.__snap = snap;
    w.__watch = (label: string) => {
      const seen: { snap: unknown; rowsAt: unknown } = { snap: null, rowsAt: null };
      w.__seen = seen;
      new MutationObserver(() => {
        const main = document.querySelector('main');
        // By its name only: that it is a status is the unit tests' (AC1); here, where things stand.
        if (!seen.snap && main?.querySelector(`[aria-label="${label}"]`)) seen.snap = snap();
        const row = main?.querySelector('ul li a');
        if (seen.snap && !seen.rowsAt && row) seen.rowsAt = box(row);
      }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    };
  });
}
const now = (page: Page): Promise<Snap> => page.evaluate(() => (window as unknown as { __snap: () => Snap }).__snap());
const seen = (page: Page): Promise<Seen> => page.evaluate(() => (window as unknown as { __seen: Seen }).__seen);

test('AC2 folder_in_place: a slow folder opens with its name, place and view standing, and its list lands once', async ({ page }) => {
  test.setTimeout(90_000);
  await record(page);
  await page.goto('/note/Projects/Flat%20hunt/Flat%207%2C%20Cobble%20Row.md?scenario=slow&time=instant');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1, name: 'Flat 7, Cobble Row' })).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __watch: (l: string) => void }).__watch('Opening the folder'));
  await main.getByRole('link', { name: 'Projects / Flat hunt', exact: true }).click();
  await expect(main.getByRole('heading', { level: 1, name: 'Flat hunt' })).toBeVisible({ timeout: 30_000 });
  await expect(main.getByRole('status', { name: 'Opening the folder' })).toHaveCount(0, { timeout: 30_000 });
  // The folder's own note: its summary is the first thing under the header.
  await expect(main.locator('a[href="/note/Projects/Flat%20hunt/Flat%20hunt.md"]').first()).toBeVisible({ timeout: 30_000 });
  const end = await now(page);
  const { snap, rowsAt } = await seen(page);
  expect(snap, 'the folder showed "Opening the folder"').not.toBeNull();
  if (!snap) return;
  expect(snap.h1).toBe('Flat hunt');
  expect(snap.h1Box).toEqual(end.h1Box);
  expect(snap.place?.y).toBe(end.place?.y);
  expect(snap.view?.y).toBe(end.view?.y);
  expect(snap.afterHead?.y).toBe(end.afterHead?.y);
  // The note left behind is gone at once, and the list never moves once it shows.
  expect(snap.rows).toBe(0);
  expect(rowsAt?.y).toBe(end.firstRow?.y);
});

test('AC2 note_in_place: a slow note opens with its place standing and its title and first line held', async ({ page }) => {
  test.setTimeout(90_000);
  await record(page);
  await page.goto('/files/Projects/Flat%20hunt?scenario=slow&time=instant');
  const main = page.getByRole('main');
  const row = main.getByRole('link', { name: /^Flat 7, Cobble Row/ });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await page.evaluate(() => (window as unknown as { __watch: (l: string) => void }).__watch('Opening the note'));
  await row.click();
  await expect(main.getByRole('heading', { level: 1, name: 'Flat 7, Cobble Row' })).toBeVisible({ timeout: 30_000 });
  await expect(main.getByRole('status', { name: 'Opening the note' })).toHaveCount(0);
  const end = await now(page);
  const { snap } = await seen(page);
  expect(snap, 'the note showed "Opening the note"').not.toBeNull();
  if (!snap) return;
  // The folder left behind is gone at once: no heading or rows of it under the note's place.
  expect(snap.h1).toBeNull();
  expect(snap.rows).toBe(0);
  expect(snap.place).not.toBeNull();
  expect(snap.place?.y).toBe(end.place?.y);
  // The title's shape is the title's size (one line here), and the next shape starts where the note's first part does.
  expect(snap.bones[0]).toEqual(end.h1Box);
  expect(snap.bones[1]?.y).toBe(end.afterTitle?.y);
});
