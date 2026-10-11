import { resize } from './viewport';
import { animationsEnd, expectAxeClean } from './axe';
import { expect, test } from './fixtures';

test('folder table headers stay on one line and the table scrolls sideways', async ({ page }) => {
  for (const viewport of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
    await test.step(`${viewport.width}x${viewport.height}`, async () => {
      await resize(page, viewport);
      // Same folder entry and boot check as v2-targets; explicitly use the demo on both projects.
      await page.goto('/files/Projects/Flat%20hunt?source=demo&scenario=default&time=instant');
      await expect(page.locator('#boot')).toHaveCount(0, { timeout: 8000 });
      await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Table', exact: true }).click();

      const table = page.getByRole('main').getByRole('table');
      for (const label of ['Bedrooms', 'Commute']) {
        await expect(table.getByRole('columnheader', { name: label, exact: true })).toBeVisible();
      }
      await animationsEnd(page);
      await page.evaluate(() => document.fonts.ready.then(() => undefined));

      const heights = await table.locator('thead button').evaluateAll((buttons) =>
        buttons.map((button) => ({ label: button.textContent?.trim(), height: button.getBoundingClientRect().height })),
      );
      expect(heights.length).toBeGreaterThan(0);
      for (const { label, height } of heights) {
        expect(height, `${viewport.width}: ${label} header height`).toBeLessThanOrEqual(48);
      }

      for (const label of ['Bedrooms', 'Commute']) {
        const widths = await table.getByRole('columnheader', { name: label, exact: true }).evaluate((cell) => {
          const button = cell.querySelector('button');
          if (!button) throw new Error('Missing header button');
          // Measure an unwrapped copy of the label: a Range on wrapped text alone could hide the defect.
          const naturalLabel = document.createElement('span');
          const style = getComputedStyle(button);
          naturalLabel.textContent = button.textContent;
          Object.assign(naturalLabel.style, {
            font: style.font, letterSpacing: style.letterSpacing,
            whiteSpace: 'nowrap', position: 'fixed', visibility: 'hidden',
          });
          document.body.append(naturalLabel);
          try {
            const range = document.createRange();
            range.selectNodeContents(naturalLabel);
            return { cell: cell.getBoundingClientRect().width, label: range.getBoundingClientRect().width };
          } finally {
            naturalLabel.remove();
          }
        });
        expect(widths.label, `${label} natural width`).toBeGreaterThan(0);
        expect(widths.cell, `${viewport.width}: ${label} cell width`).toBeGreaterThanOrEqual(widths.label);
      }

      if (viewport.width === 375) {
        const wrap = await table.evaluate((element) => {
          const parent = element.parentElement;
          if (!parent) throw new Error('Missing table wrap');
          return { scroll: parent.scrollWidth, client: parent.clientWidth };
        });
        expect(wrap.scroll, '375: table wrap scrolls sideways').toBeGreaterThan(wrap.client);
      }
      await expectAxeClean(page, { include: 'main', wcag22: true });
    });
  }
});


// Real FolderScreen and DriveVault over an in-memory Drive; the browser fixture adds no app scenario or data port.
const b5OfferRow = { id: 'offer', match: ['job offer'], template: 'source', properties: {
  company: { type: 'text' }, salary: { type: 'money' }, location: { type: 'text' }, hours: { type: 'number' },
  skills: { type: 'list' }, posted: { type: 'date' }, status: { type: 'text' }, private_detail: { type: 'text' },
}, table: ['company', 'salary', 'location'] };
const b5CoverRow = { id: 'cover-letter', match: ['cover letter'], template: 'source',
  properties: { recipient: { type: 'text' } }, table: ['recipient'] };
const b5Offer = (name: string, salary = 48000) => ({ name, text: [
  '---', 'summary: Alex considers this offer.', 'type: offer', 'status: active', 'tags: [work]',
  'created: 2026-10-10', 'updated: 2026-10-11', 'source: Offer letter', 'related: Career',
  'private_detail: Alex keeps this extra fact.', 'company: Acorn Studio',
  `salary: {"amount":${salary},"currency":"EUR"}`, 'location: Remote', 'hours: 32',
  'skills: ["Writing","Design"]', 'posted: 2026-10-10', '---', 'Alex keeps personal notes.',
].join('\n') });
const b5Cover = { name: 'Cover letter', text: '---\nsummary: Alex writes a letter.\ntype: cover-letter\nrecipient: Willow Studio\ncompany: Must stay empty\n---\nAlex wrote this letter.' };
const b5States = [
  { name: 'one type', notes: [b5Offer('Offer 2'), b5Offer('Offer 10')], columns: ['Company', 'Salary', 'Location'] },
  { name: 'more than four properties', notes: [b5Offer('Offer')], columns: ['Company', 'Salary', 'Location', 'Hours'], declared: ['company', 'salary', 'location', 'hours'] },
  { name: 'declared status appears once', notes: [b5Offer('Offer')], columns: ['Company', 'Salary', 'Location'], declared: ['company', 'salary', 'location'] },
  { name: 'majority counts notes not folders', notes: [b5Offer('Offer 2'), b5Offer('Offer 10'), b5Cover], columns: ['Company', 'Salary', 'Location'], folders: 8 },
  { name: 'tie follows row order', notes: [b5Offer('Offer'), b5Cover], columns: ['Recipient'], coverFirst: true },
  { name: 'missing declaration fallback', notes: [{ name: 'Personal', text: '---\ntype: unknown\nsummary: Alex keeps facts.\nsource: Notes\nalpha: First\nbeta: Second\ngamma: Third\ndelta: Fourth\nepsilon: Retained\n---\nAlex wrote this.' }], columns: ['Alpha', 'Beta', 'Gamma', 'Delta'], absent: true },
  { name: 'unmatched row fallback', notes: [{ name: 'Personal', text: '---\ntype: unknown\nsource: Notes\nalpha: First\nbeta: Second\n---\nAlex wrote this.' }], columns: ['Alpha', 'Beta'] },
  { name: 'generic row fallback', notes: [{ name: 'Personal', text: '---\ntype: other-area-material\nsource: Notes\nalpha: First\nbeta: Second\n---\nAlex wrote this.' }], columns: ['Alpha', 'Beta'], generic: true },
  { name: 'money and numeric sorting', notes: [b5Offer('Offer 2', 48000), b5Offer('Offer 10', 9000), { name: 'Empty', text: '---\ntype: offer\ncompany: Birch Studio\n---\nAlex has no salary yet.' }], columns: ['Company', 'Salary', 'Location'] },
  { name: 'number sorting and empty last', notes: [b5Offer('Offer 2'), { ...b5Offer('Offer 10'), text: b5Offer('Offer 10').text.replace('hours: 32', 'hours: 9') }, { name: 'Empty', text: '---\ntype: offer\n---\nAlex has no hours yet.' }], columns: ['Hours'], declared: ['hours'] },
  { name: 'date sorting and empty last', notes: [{ ...b5Offer('Offer 2'), text: b5Offer('Offer 2').text.replace('posted: 2026-10-10', 'posted: 2026-01-01') }, { ...b5Offer('Offer 10'), text: b5Offer('Offer 10').text.replace('posted: 2026-10-10', 'posted: 2025-12-31') }, { name: 'Empty', text: '---\ntype: offer\n---\nAlex has no date yet.' }], columns: ['Posted'], declared: ['posted'] },
  { name: 'requested column fourth', notes: [b5Offer('Offer')], columns: ['Company', 'Salary', 'Location', 'Hours'], declared: ['company', 'salary', 'location', 'hours'] },
  { name: 'lists and dates', notes: [b5Offer('Offer')], columns: ['Skills', 'Posted', 'Hours'], declared: ['skills', 'posted', 'hours'] },
];
for (const source of ['demo', 'fake'] as const) for (const width of [375, 1440]) for (const state of b5States) {
  test(`b5-folder-table-approved-states: ${state.name} (${source}, ${width})`, async ({ page }) => {
    await resize(page, { width, height: 900 });
    const offer = { ...b5OfferRow, table: state.declared ?? b5OfferRow.table };
    const table = { v: 1, rows: state.generic ? [{ id: 'other-area-material', match: ['other area material'], template: 'source', properties: {}, table: [] }]
      : state.coverFirst ? [b5CoverRow, offer] : [offer, b5CoverRow] };
    await page.route('**/src/data/choose.ts*', async (route) => {
      const response = await route.fetch();
      const original = await response.text();
      const renamed = original.replace(/\bbuildSources\b/g, 'b5OriginalSources');
      expect(renamed).not.toBe(original);
      await route.fulfill({ response, contentType: 'text/javascript', body: `${renamed}
        export async function buildSources(...args) {
          const result = await b5OriginalSources(...args);
          const [{ FakeDrive }, { DriveVault }, { seedFakeDrive }] = await Promise.all([
            import('/src/data/drive/fake-drive.ts'), import('/src/data/vault/drive-vault.ts'), import('/src/data/fake/seed.ts')]);
          const drive = new FakeDrive({ clock: () => Date.UTC(2026, 9, 11) });
          const root = await seedFakeDrive(drive, 'empty', Date.UTC(2026, 9, 11));
          const files = await drive.listAll(root);
          const resources = files.find((f) => f.name === 'Resources' && f.parents[0] === root);
          const own = files.find((f) => f.name === '.bower' && f.parents[0] === root);
          const folder = await drive.createFolder(resources.id, 'Applications');
          for (const note of ${JSON.stringify(state.notes)}) await drive.createText(folder.id, note.name + '.md', note.text);
          for (let i = 0; i < ${state.folders ?? 0}; i++) await drive.createFolder(folder.id, 'Subfolder ' + i);
          if (${!state.absent}) await drive.createText(own.id, 'type-table.json', ${JSON.stringify(JSON.stringify(table))});
          const vault = new DriveVault({ drive, rootId: async () => root, runningPiles: () => new Set() });
          return { ...result, sources: { ...result.sources, vault } };
        }` });
    });
    await page.goto(`/files/Resources/Applications?source=${source}&scenario=empty&time=instant`);
    await expect(page.locator('#boot')).toHaveCount(0);
    await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Table', exact: true }).click();
    const tableView = page.getByRole('main').getByRole('table');
    // Positive controls use the existing header buttons and each note's real link.
    await expect(tableView.getByRole('columnheader', { name: 'Name', exact: true })).toBeVisible();
    await expect(tableView.getByRole('columnheader', { name: 'Changed', exact: true })).toBeVisible();
    for (const note of state.notes) await expect(tableView.getByRole('link', { name: note.name, exact: true })).toBeVisible();
    const status = state.notes.some((note) => /^status:/m.test(note.text));
    await expect(tableView.getByRole('columnheader', { name: 'Status', exact: true })).toHaveCount(status ? 1 : 0);
    await expect(tableView.getByRole('columnheader')).toHaveText(['Name', ...(status ? ['Status'] : []), ...state.columns, 'Changed']);
    if (status) await expect(tableView.locator('tbody tr').filter({ hasText: 'Offer' }).first().locator('td').nth(1).locator('span')).toHaveText('active');
    if (state.name === 'majority counts notes not folders') {
      const cells = tableView.getByRole('row').filter({ has: page.getByRole('link', { name: 'Cover letter', exact: true }) }).getByRole('cell');
      for (const i of [2, 3, 4]) await expect(cells.nth(i)).toHaveText('');
    }
    if (state.name === 'money and numeric sorting') {
      const salary = tableView.getByRole('columnheader', { name: 'Salary', exact: true });
      await expect(tableView.getByRole('cell', { name: '€48,000', exact: true })).toBeVisible();
      for (const cell of [salary, tableView.getByRole('cell', { name: '€48,000', exact: true })]) {
        expect(await cell.evaluate((element) => getComputedStyle(element).textAlign)).toBe('right');
        expect(await cell.evaluate((element) => getComputedStyle(element).fontVariantNumeric)).toContain('tabular-nums');
      }
      await salary.getByRole('button').click();
      await expect(tableView.locator('tbody tr td:first-child')).toHaveText(['Offer 10', 'Offer 2', 'Empty']);
      await salary.getByRole('button').click();
      await expect(tableView.locator('tbody tr td:first-child')).toHaveText(['Offer 2', 'Offer 10', 'Empty']);
      await tableView.getByRole('button', { name: 'Name', exact: true }).click();
      await expect(tableView.locator('tbody tr td:first-child')).toHaveText(['Empty', 'Offer 2', 'Offer 10']);
    }
    if (state.name === 'number sorting and empty last' || state.name === 'date sorting and empty last') {
      const heading = tableView.getByRole('columnheader', { name: state.name.startsWith('number') ? 'Hours' : 'Posted', exact: true });
      await heading.getByRole('button').click();
      await expect(tableView.locator('tbody tr td:first-child')).toHaveText(['Offer 10', 'Offer 2', 'Empty']);
      await heading.getByRole('button').click();
      await expect(tableView.locator('tbody tr td:first-child')).toHaveText(['Offer 2', 'Offer 10', 'Empty']);
    }
    if (state.name === 'lists and dates') {
      await expect(tableView.getByRole('cell', { name: 'Writing, Design', exact: true })).toBeVisible();
      await expect(tableView.getByRole('cell', { name: '10 Oct', exact: true })).toBeVisible();
      await expect(tableView.getByRole('cell', { name: '32', exact: true })).toBeVisible();
    }
    await tableView.getByRole('button', { name: 'Changed', exact: true }).click();
    await expect(tableView.getByRole('columnheader', { name: 'Changed', exact: true })).toHaveAttribute('aria-sort', 'ascending');
    if (width === 375 && state.columns.length >= 3) {
      expect(await tableView.evaluate((element) => (element.parentElement?.scrollWidth ?? 0) > (element.parentElement?.clientWidth ?? 0))).toBe(true);
    }
    await animationsEnd(page);
    await expectAxeClean(page, { include: 'main', wcag22: true });
    if (state.name === 'one type') {
      await tableView.getByRole('link', { name: 'Offer 2', exact: true }).click();
      await expect(page.getByRole('main').getByText('Alex keeps this extra fact.', { exact: true })).toBeVisible();
    }
  });
}
