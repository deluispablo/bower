import type { Locator, Page } from '@playwright/test';
import { serializeNote } from '../src/data/contracts/note-format';
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

const FOLDER = 'NSPL garden';
const PROJECT = `${FOLDER}/NSPL project.md`;
const PERSONAL = `${FOLDER}/NSPL personal.md`;
const BODY = [
  '## Goal', 'Grow mint.', '- A normal bullet.', '- [ ] Plan the bed.', '',
  '## Next steps', '- [ ] Plant mint.', '- [x] Choose seeds.', '',
  '## Notes', '- [ ] Buy a pot.', '- [x] Water mint.',
].join('\n');
const RAW = serializeNote({ template: 'project', byBower: true,
  summary: 'Alex grows mint.', tags: [], currentState: [], timeline: [],
  properties: [
    { key: 'type', label: 'Type', value: 'project' },
    { key: 'created', label: 'Created', value: '2026-10-10' },
    { key: 'updated', label: 'Updated', value: '2026-10-10' },
    { key: 'source', label: 'Source', value: 'Garden bulletin' },
    { key: 'related', label: 'Related', value: 'Gardening', link: 'Gardening' },
  ], body: BODY,
});

/** The served-module fixture used by c05-person-notes. Keep each original source's
 * shell/session; the two fixture notes use real DriveVault reads and writes over
 * FakeDrive. No task callback or Markdown renderer is replaced, and no region
 * parser or application hook is added. Both notes are read by id for byte checks.
 */
async function openFixture(page: Page, source: 'demo' | 'fake', width: number, personal = false): Promise<void> {
  await resize(page, { width, height: 900 });
  await page.route('**/src/data/choose.ts*', async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const renamed = original.replace(/\bbuildSources\b/g, 'nsplOriginalSources');
    expect(renamed).not.toBe(original);
    const body = `${renamed}\n
      export async function buildSources(...args) {
        const result = await nsplOriginalSources(...args);
        const [{ FakeDrive }, { DriveVault }] = await Promise.all([
          import('/src/data/drive/fake-drive.ts'), import('/src/data/vault/drive-vault.ts')
        ]);
        const drive = new FakeDrive({ clock: () => 0 });
        const root = (await drive.createFolder('root', 'Bower')).id;
        const folder = (await drive.createFolder(root, ${JSON.stringify(FOLDER)})).id;
        const paths = ${JSON.stringify([PROJECT, PERSONAL])};
        const texts = ${JSON.stringify([RAW, BODY])};
        const ids = new Map();
        for (const [i, path] of paths.entries()) ids.set(path, (await drive.createText(folder, path.split('/').at(-1), texts[i])).id);
        const fixture = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
        const base = result.sources;
        window.__nsplRead = (path) => drive.readText(ids.get(path));
        window.__nsplToggleIndexes = [];
        const methods = {
          tree: async () => [...await base.vault.tree(), ...await fixture.tree()],
          note: (path) => ids.has(path) ? fixture.note(path) : base.vault.note(path),
          toggleTask: (path, index) => {
            if (!ids.has(path)) return base.vault.toggleTask(path, index);
            window.__nsplToggleIndexes.push(index);
            return fixture.toggleTask(path, index);
          },
          markSeen: (path) => ids.has(path) ? fixture.markSeen(path) : base.vault.markSeen(path),
          subscribe: (callback) => {
            const stopBase = base.vault.subscribe(callback);
            const stopFixture = fixture.subscribe(callback);
            return () => { stopBase(); stopFixture(); };
          }
        };
        const vault = new Proxy(base.vault, { get: (target, key) => key in methods ? methods[key] :
          typeof target[key] === 'function' ? target[key].bind(target) : target[key] });
        return { ...result, sources: { ...base, vault } };
      }`;
    await route.fulfill({ response, body, contentType: 'text/javascript' });
  });
  const path = personal ? PERSONAL : PROJECT;
  await page.goto(`/note/${encodeURIComponent(path)}?source=${source}&scenario=empty&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: personal ? 'NSPL personal' : 'NSPL project', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('bower:demo:source'))).toBe(source);
  expect(await read(page, path)).toBe(personal ? BODY : RAW);
}

function read(page: Page, path = PROJECT): Promise<string> {
  return page.evaluate((path) => (window as unknown as {
    __nsplRead: (path: string) => Promise<string>;
  }).__nsplRead(path), path);
}

function toggleIndexes(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as { __nsplToggleIndexes: number[] }).__nsplToggleIndexes);
}

function article(page: Page): Locator {
  return page.getByRole('main').locator('article');
}

function item(page: Page, label: string): Locator {
  return article(page).getByRole('listitem').filter({ has: page.getByText(label, { exact: true }) });
}

for (const source of ['demo', 'fake'] as const) {
  for (const width of [375, 1440]) {
    const cell = `${source}, ${width}`;

    test(`NSPL a Bower project note with Next steps has plain bullets and muted struck done items (${cell})`, async ({ page }) => {
      await openFixture(page, source, width);
      // Positive control: an ordinary bullet and a working personal checkbox.
      const normal = item(page, 'A normal bullet.');
      await expect(normal).toBeVisible();
      const marker = await normal.evaluate((element) => getComputedStyle(element).listStyleType);
      expect(marker).not.toBe('none');
      await expect(article(page).getByRole('checkbox', { name: 'Buy a pot.', exact: true })).toBeEnabled();
      const mutedColor = await item(page, 'Water mint.').getByText('Water mint.', { exact: true })
        .evaluate((element) => getComputedStyle(element).color);
      for (const label of ['Plan the bed.', 'Plant mint.', 'Choose seeds.']) {
        const row = item(page, label);
        await expect(row).toHaveCount(1);
        await expect(row).toHaveText(label);
        await expect(row.locator('input, button, [role="checkbox"], [disabled], [aria-disabled]')).toHaveCount(0);
        await expect(row).toHaveCSS('list-style-type', marker);
        await expect(row.locator('..')).toHaveJSProperty('tagName', 'UL');
      }
      const doneText = item(page, 'Choose seeds.').getByText('Choose seeds.', { exact: true });
      await expect(doneText).toHaveCSS('text-decoration-line', 'line-through');
      await expect(doneText).toHaveCSS('color', mutedColor);
      const openText = item(page, 'Plant mint.').getByText('Plant mint.', { exact: true });
      await expect(openText).toHaveCSS('text-decoration-line', 'none');
      expect(await read(page)).toBe(RAW);
    });

    test(`NSPL the person task list in the same note keeps working checkboxes and isolated ticks (${cell})`, async ({ page }) => {
      await openFixture(page, source, width);
      const own = article(page).getByRole('checkbox', { name: 'Water mint.', exact: true });
      // Positive control: an existing done personal task can still be unticked.
      await expect(own).toBeEnabled();
      await expect(own).toBeChecked();
      await own.click();
      await expect.poll(() => read(page)).toBe(RAW.replace('- [x] Water mint.', '- [ ] Water mint.'));
      await expect(own).not.toBeChecked();
      await expect(article(page).getByRole('checkbox', { name: 'Buy a pot.', exact: true })).not.toBeChecked();
      expect(await toggleIndexes(page)).toEqual([4]);
      await expect(article(page).getByRole('checkbox')).toHaveCount(2);
      await expect(item(page, 'Plant mint.').getByRole('checkbox')).toHaveCount(0);
    });

    test(`NSPL a note with no Bower region stays as today (${cell})`, async ({ page }) => {
      await openFixture(page, source, width, true);
      // Positive control: the same headings and text are personal without ownership framing.
      await expect(item(page, 'A normal bullet.')).toBeVisible();
      await expect(article(page).getByRole('checkbox')).toHaveCount(5);
      await expect(article(page).getByRole('checkbox', { name: 'Choose seeds.', exact: true })).toBeChecked();
      const own = article(page).getByRole('checkbox', { name: 'Plant mint.', exact: true });
      await expect(own).toBeEnabled();
      await expect(own).not.toBeChecked();
      await own.click();
      await expect.poll(() => read(page, PERSONAL)).toBe(BODY.replace('- [ ] Plant mint.', '- [x] Plant mint.'));
      await expect(own).toBeChecked();
      expect(await toggleIndexes(page)).toEqual([1]);
    });

    test(`NSPL ticking the first person task changes only its line beside Bower Next steps (${cell})`, async ({ page }) => {
      await openFixture(page, source, width);
      const named = article(page).getByRole('checkbox', { name: 'Buy a pot.', exact: true });
      // Positive control: real screen ticks and unticks are checked against fetched raw bytes.
      await expect(named).not.toBeChecked();
      await named.click();
      await expect.poll(() => read(page)).toBe(RAW.replace('- [ ] Buy a pot.', '- [x] Buy a pot.'));
      await expect(named).toBeChecked();
      await named.click();
      await expect.poll(() => read(page)).toBe(RAW);
      await expect(named).not.toBeChecked();
      await article(page).getByRole('checkbox').first().click();
      await expect.poll(() => read(page)).toBe(RAW.replace('- [ ] Buy a pot.', '- [x] Buy a pot.'));
      await expect(named).toBeChecked();
      // Bower tasks occupy indexes 0–2; the first visible checkbox owns index 3.
      expect(await toggleIndexes(page)).toEqual([3, 3, 3]);
    });

    test(`NSPL project note passes axe WCAG 2.2 with plain list semantics (${cell})`, async ({ page }) => {
      await openFixture(page, source, width);
      await expect(item(page, 'Plant mint.')).toBeVisible();
      await expect(article(page).getByRole('checkbox', { name: 'Buy a pot.', exact: true })).toBeEnabled();
      await expect(article(page).getByRole('link', { name: FOLDER, exact: true })).toBeVisible();
      await expectAxeClean(page, { include: 'main article', wcag22: true });
      await expect(item(page, 'Plant mint.').getByRole('checkbox')).toHaveCount(0);
      await expect(item(page, 'Choose seeds.').getByRole('checkbox')).toHaveCount(0);
    });
  }
}
