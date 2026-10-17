import type { Page } from '@playwright/test';
import type { Pile, RunReport, RunState } from '../src/data/contracts/types';
import { expect, test } from './fixtures';
import { expectAxeClean } from './axe';
import { resize } from './viewport';

const PATH = 'Areas/Home/Allotment diary.md';
const WHY = "Bower didn't add the line: it found nothing about this note in what you added.";
const empty = (): RunReport => ({ filed: [], created: [], updated: [], setAside: [], questions: [] });

type Shape = 'instructions' | 'all' | 'empty' | 'filed-no-replay' | 'created' | 'all-left' | 'left-detail';

/** Same served source-port fixture technique as c05-person-notes; no app hooks or new source scenarios. */
async function openFixture(page: Page, source: 'demo' | 'fake', shape: Shape, piles: Pile[] = []): Promise<RunState> {
  const report: RunReport = empty();
  if (['instructions', 'all', 'all-left', 'left-detail'].includes(shape)) report.leftAsWritten = [{ name: PATH, fileId: 'allotment-note', why: WHY }];
  if (shape === 'created') report.created = [{ path: PATH, what: 'Made from 1 thing' }];
  if (shape === 'left-detail') report.yourChanges = 1;
  if (shape === 'all' || shape === 'filed-no-replay') report.filed = [{ name: 'Garden update.txt', title: 'Garden update', kind: 'other', to: 'Areas/Home' }];
  const run: RunState = { id: 'request-report-run', scope: shape === 'all' || shape === 'all-left' ? 'all' : 'instructions', phase: 'done',
    requestedAt: 1000, phaseAt: 2000, finishedAt: 2000, seen: false, report };
  await page.route('**/src/data/choose.ts*', async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const renamed = original.replace(/\bbuildSources\b/g, 'requestOriginalSources');
    expect(renamed).not.toBe(original);
    const body = `${renamed}\n
      export async function buildSources(...args) {
        const result = await requestOriginalSources(...args);
        const base = result.sources;
        let run = ${JSON.stringify(run)};
        const listeners = new Set();
        const notify = () => { for (const cb of listeners) cb(); };
        const methods = {
          piles: async () => ${JSON.stringify(piles)}, pilesListed: async () => null,
          changes: async () => [], questions: async () => [], suggestions: async () => [],
          subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }
        };
        const vault = new Proxy(base.vault, { get: (target, key) => key in methods ? methods[key] :
          typeof target[key] === 'function' ? target[key].bind(target) : target[key] });
        const runs = { ...base.runs, current: async () => run,
          markSeen: async () => { run = { ...run, seen: true }; notify(); },
          subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); }
        };
        return { ...result, sources: { ...base, vault, runs } };
      }`;
    await route.fulfill({ response, body, contentType: 'text/javascript' });
  });
  await page.goto(`/?source=${source}&scenario=empty&time=instant`);
  await expect(page.locator('#boot')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: /G'day, Alex/ })).toBeVisible();
  return run;
}

for (const source of ['demo', 'fake'] as const) {
  for (const width of [1440, 375]) {
    test(`request report: first press asks and the status bar reopens (${source}, ${width})`, async ({ page }) => {
      await resize(page, { width, height: 900 });
      const pile: Pile = { id: 'ready', path: 'Inbox/Ready', text: 'Ready to file', createdAt: 3000,
        items: [{ id: 'f', name: 'f.pdf', kind: 'pdf', origin: 'From this computer' }] };
      await openFixture(page, source, 'instructions', [pile]);
      await page.getByRole('main').getByRole('button', { name: 'Tidy up 1 thing', exact: true }).click();
      const ask = page.getByRole('dialog');
      await expect(ask).toHaveAccessibleName('Tidy up 1 thing?');
      await expect(ask.getByRole('button', { name: 'Tidy up 1 thing', exact: true })).toBeVisible();
      await expect(ask.getByRole('list', { name: 'Left as you wrote them' })).toHaveCount(0);
      await expect(ask.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
      await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
      await ask.getByRole('button', { name: 'Not now', exact: true }).click();
      await resize(page, { width: 1440, height: 900 });
      // design9-last-tidy: after a read of your changes the status line has no tidy-up time, only what waits.
      await page.getByRole('contentinfo').getByRole('button', { name: /waiting$/ }).click();
      await resize(page, { width, height: 900 });
      const report = page.getByRole('dialog', { name: 'Done. Bower read your changes.', exact: true });
      await expect(report).toBeVisible();
      await expect(report.getByRole('list', { name: 'Left as you wrote them' }).getByText(WHY, { exact: true })).toBeVisible();
      await expect(report.getByText('Everything has its place.', { exact: true })).toHaveCount(0);
      await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
    });
    for (const shape of ['instructions', 'all', 'empty', 'filed-no-replay', 'created', 'all-left', 'left-detail'] as const) {
      test(`request report: ${shape} stays reachable with WCAG 2.2 (${source}, ${width})`, async ({ page }) => {
        await resize(page, { width, height: 900 });
        const run = await openFixture(page, source, shape);
        const title = run.scope === 'instructions' ? 'Done. Bower read your changes.' : shape === 'all' ? 'Done. 1 thing filed.' : 'Done. 0 things filed.';
        const homeTitle = shape === 'all' ? '1 thing filed.' : title;
        const detail = shape === 'left-detail' ? '1 change of yours read.' : 'Everything has its place.';
        const hasLeft = !!run.report?.leftAsWritten?.length;
        const home = page.getByRole('main');
        const heading = home.getByRole('heading', { level: 2, name: homeTitle, exact: true });
        if (shape === 'empty') {
          await expect(heading).toHaveCount(0);
          await expect(home.getByRole('button', { name: 'Got it', exact: true })).toHaveCount(0);
        } else {
          await expect(heading).toBeVisible();
          const card = home.getByRole('region', { name: homeTitle, exact: true });
          if (shape === 'all') {
            await expect(card.getByText('Home got 1.', { exact: true })).toBeVisible();
            await expect(card.getByText(title, { exact: true })).toHaveCount(0);
            await expect(card.getByText(detail, { exact: true })).toHaveCount(0);
          } else if (hasLeft && detail === 'Everything has its place.') {
            await expect(card.getByText(detail, { exact: true })).toHaveCount(0);
          } else {
            await expect(card.getByText(detail, { exact: true })).toBeVisible();
            await expect(card.getByText('Home got 1.', { exact: true })).toHaveCount(0);
          }
          const rows = card.getByRole('list', { name: 'Left as you wrote them', exact: true });
          if (hasLeft) {
            await expect(rows.getByRole('listitem')).toHaveCount(1);
            await expect(rows.getByText(WHY, { exact: true })).toBeVisible();
            await expect(rows.getByRole('link', { name: 'Allotment diary' })).toHaveAttribute('href', '/note/Areas/Home/Allotment%20diary.md');
          } else {
            await expect(rows).toHaveCount(0);
          }
          await expect(home.getByRole('button', { name: 'Got it', exact: true })).toBeVisible();
          await expect(home.getByRole('button', { name: 'Watch what Bower did', exact: true })).toHaveCount(shape === 'all' ? 1 : 0);
        }
        await expectAxeClean(page, { include: 'main', wcag22: true });
        // The existing result action lives in the desktop status bar. Open there, then check the sheet at this width.
        await resize(page, { width: 1440, height: 900 });
        // design9-last-tidy: a read of your changes shows no tidy-up time; every shape ends with what waits.
        const status = page.getByRole('contentinfo').getByRole('button', { name: shape === 'all' ? /Watch what Bower did/ : /waiting$/ });
        await status.click();
        await resize(page, { width, height: 900 });
        if (shape === 'all') {
          await expect(page.getByRole('dialog', { name: 'What Bower did in the tidy-up' })).toBeVisible();
          await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
          return;
        }
        const sheet = page.getByRole('dialog');
        if (shape === 'empty') {
          await expect(sheet).toHaveAccessibleName('Nothing to tidy');
          await expect(sheet.getByRole('list', { name: 'Left as you wrote them' })).toHaveCount(0);
        } else {
          await expect(sheet).toHaveAccessibleName(title);
          if (hasLeft && detail === 'Everything has its place.') {
            await expect(sheet.getByText(detail, { exact: true })).toHaveCount(0);
          } else {
            await expect(sheet.getByText(detail, { exact: true })).toBeVisible();
          }
          await expect(sheet.getByText('Nothing to tidy', { exact: true })).toHaveCount(0);
          const rows = sheet.getByRole('list', { name: 'Left as you wrote them' });
          if (hasLeft) {
            await expect(rows.getByText(WHY, { exact: true })).toBeVisible();
            await expect(rows.getByRole('link', { name: 'Allotment diary' })).toHaveAttribute('href', '/note/Areas/Home/Allotment%20diary.md');
          } else {
            await expect(rows).toHaveCount(0);
          }
          await expect(sheet.getByRole('button', { name: 'Watch what Bower did', exact: true })).toHaveCount(0);
        }
        await expectAxeClean(page, { include: '[role="dialog"]', wcag22: true });
        if (shape !== 'empty') {
          await sheet.getByRole('button', { name: 'Done', exact: true }).click();
          await expect(heading).toHaveCount(0);
          await expect(home.getByRole('button', { name: 'Got it', exact: true })).toHaveCount(0);
        }
      });
    }
  }
}
